use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const KEYRING_SERVICE: &str = "devpulse";
const KEYRING_USER: &str = "github-token";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
// GitHub may ask us to back off; this is the increment it documents.
const SLOW_DOWN_INCREMENT_SECS: u64 = 5;

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

pub fn read_token() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
}

#[derive(Deserialize)]
struct AccessTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

/// Step 1 of device flow: ask GitHub for a device + user code. The user code
/// and verification URL are shown to the user; the device code is used to poll.
#[tauri::command]
pub async fn start_device_flow(client_id: String, scope: String) -> Result<DeviceCode, String> {
    let res = reqwest::Client::new()
        .post(DEVICE_CODE_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", scope.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("device code request failed: HTTP {}", res.status()));
    }

    let body: DeviceCodeResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(DeviceCode {
        device_code: body.device_code,
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        interval: body.interval,
    })
}

/// Step 2: poll until the user authorizes (or it expires). On success the token
/// is written to the OS keyring and never returned to the frontend.
#[tauri::command]
pub async fn poll_device_flow(
    client_id: String,
    device_code: String,
    interval: u64,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut wait = Duration::from_secs(interval.max(1));

    loop {
        tokio::time::sleep(wait).await;

        let res = client
            .post(ACCESS_TOKEN_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code.as_str()),
                ("grant_type", DEVICE_GRANT_TYPE),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let body: AccessTokenResponse = res.json().await.map_err(|e| e.to_string())?;

        if let Some(token) = body.access_token {
            keyring_entry()?
                .set_password(&token)
                .map_err(|e| e.to_string())?;
            return Ok(());
        }

        match body.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                wait += Duration::from_secs(SLOW_DOWN_INCREMENT_SECS);
                continue;
            }
            Some("expired_token") => return Err("Code expired, please try again".into()),
            Some("access_denied") => return Err("Authorization was denied".into()),
            Some(other) => return Err(format!("Authorization failed: {other}")),
            None => return Err("Unexpected empty response from GitHub".into()),
        }
    }
}

#[tauri::command]
pub fn is_authenticated() -> Result<bool, String> {
    Ok(read_token()?.is_some())
}

#[tauri::command]
pub fn logout() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
