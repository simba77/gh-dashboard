use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::auth::read_token;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
// GitHub requires a User-Agent on all API requests.
const USER_AGENT: &str = "devpulse";
const REMAINING_HEADER: &str = "x-ratelimit-remaining";
const RESET_HEADER: &str = "x-ratelimit-reset";
const RATE_LIMIT_FLOOR: i64 = 100;
const RATE_LIMIT_EVENT: &str = "rate-limit";

#[derive(Serialize, Clone)]
struct RateLimitPayload {
    remaining: i64,
    // Unix epoch seconds; the frontend converts to a Date.
    reset_at: i64,
}

/// Sends a GraphQL request to GitHub with the stored token. The token is read
/// from the keyring here so it never crosses into the frontend. After every
/// response we emit the current rate-limit state so the frontend can pause
/// polling once we drop below the floor.
#[tauri::command]
pub async fn graphql_request(
    app: AppHandle,
    query: String,
    variables: Value,
) -> Result<Value, String> {
    let token = read_token()?.ok_or("Not authenticated")?;

    let res = reqwest::Client::new()
        .post(GRAPHQL_URL)
        .bearer_auth(token)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let remaining = res
        .headers()
        .get(REMAINING_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());
    let reset_at = res
        .headers()
        .get(RESET_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    if let Some(remaining) = remaining {
        if remaining < RATE_LIMIT_FLOOR {
            eprintln!("[rate-limit] WARNING: {remaining} requests remaining");
        } else {
            eprintln!("[rate-limit] {remaining} requests remaining");
        }
        // Best-effort: a failed emit shouldn't break the actual request path.
        let _ = app.emit(
            RATE_LIMIT_EVENT,
            RateLimitPayload {
                remaining,
                reset_at,
            },
        );
    }

    let status = res.status();
    if !status.is_success() {
        return Err(format!("GraphQL request failed: HTTP {status}"));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(errors) = body.get("errors") {
        return Err(format!("GraphQL errors: {errors}"));
    }

    body.get("data")
        .cloned()
        .ok_or_else(|| "GraphQL response missing data".into())
}
