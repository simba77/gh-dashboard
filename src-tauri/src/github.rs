use serde_json::{json, Value};

use crate::auth::read_token;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
// GitHub requires a User-Agent on all API requests.
const USER_AGENT: &str = "gh-dashboard";
const RATE_LIMIT_HEADER: &str = "x-ratelimit-remaining";
const RATE_LIMIT_FLOOR: i64 = 100;

/// Sends a GraphQL request to GitHub with the stored token. The token is read
/// from the keyring here so it never crosses into the frontend. Remaining rate
/// limit is logged, with a warning once it drops below the floor.
#[tauri::command]
pub async fn graphql_request(query: String, variables: Value) -> Result<Value, String> {
    let token = read_token()?.ok_or("Not authenticated")?;

    let res = reqwest::Client::new()
        .post(GRAPHQL_URL)
        .bearer_auth(token)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(remaining) = res
        .headers()
        .get(RATE_LIMIT_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok())
    {
        if remaining < RATE_LIMIT_FLOOR {
            eprintln!("[rate-limit] WARNING: {remaining} requests remaining");
        } else {
            eprintln!("[rate-limit] {remaining} requests remaining");
        }
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
