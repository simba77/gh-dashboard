use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::HeaderMap;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::auth::read_token;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
// GitHub requires a User-Agent on all API requests.
const USER_AGENT: &str = "devpulse";
const REMAINING_HEADER: &str = "x-ratelimit-remaining";
const RESET_HEADER: &str = "x-ratelimit-reset";
const RETRY_AFTER_HEADER: &str = "retry-after";
const RATE_LIMIT_EVENT: &str = "rate-limit";
// Fallback pause for GraphQL `RATE_LIMITED` errors that arrive without a usable
// reset timestamp — long enough to actually unblock, short enough that we don't
// keep the user staring at a paused dashboard if GitHub recovers faster.
const GRAPHQL_FALLBACK_PAUSE_SECS: i64 = 60;

#[derive(Serialize, Clone)]
struct RateLimitPause {
    // "primary" — REST/GraphQL point budget exhausted (remaining == 0).
    // "secondary" — abuse/rate-protection 403/429 with Retry-After.
    // "graphql" — body-level RATE_LIMITED error on a 200 OK response.
    kind: &'static str,
    // Unix epoch seconds; the frontend uses this for both the banner countdown
    // and to schedule a wake-up when polling can resume.
    until: i64,
}

#[derive(Serialize, Clone, Default)]
struct RateLimitPayload {
    // Latest header value if GitHub sent one. Kept separate from `pause` so the
    // banner can show "N requests remaining" between paused states.
    remaining: Option<i64>,
    reset_at: Option<i64>,
    // Present only while we're actually blocked. The frontend treats this as
    // the single source of truth for whether to pause polling.
    pause: Option<RateLimitPause>,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn header_i64(headers: &HeaderMap, name: &str) -> Option<i64> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok())
}

fn emit_rate_limit(app: &AppHandle, payload: RateLimitPayload) {
    if let Err(e) = app.emit(RATE_LIMIT_EVENT, payload) {
        log::warn!("rate-limit: failed to emit event: {e}");
    }
}

/// Sends a GraphQL request to GitHub with the stored token. The token is read
/// from the keyring here so it never crosses into the frontend. Every response
/// produces a `rate-limit` event so the frontend can keep the banner fresh and
/// pause polling when GitHub actually blocks us — primary exhaustion (HTTP 200
/// with remaining=0 or HTTP 403 with remaining=0), secondary/abuse limit (403
/// or 429 with `Retry-After`), or a body-level GraphQL `RATE_LIMITED` error.
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

    let status = res.status();
    let headers = res.headers().clone();
    let remaining = header_i64(&headers, REMAINING_HEADER);
    let reset_at = header_i64(&headers, RESET_HEADER);
    let retry_after = header_i64(&headers, RETRY_AFTER_HEADER);

    // 429 / 403 — the two HTTP-level rate-limit signals. We classify primary vs
    // secondary by whichever signal we got: a zeroed `remaining` means the
    // point budget is gone (primary); a `Retry-After` with budget left is the
    // abuse/secondary path.
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || (status == reqwest::StatusCode::FORBIDDEN
            && (remaining == Some(0) || retry_after.is_some()))
    {
        let primary = remaining == Some(0);
        let until = if primary {
            reset_at.unwrap_or_else(|| now_secs() + GRAPHQL_FALLBACK_PAUSE_SECS)
        } else {
            now_secs() + retry_after.unwrap_or(GRAPHQL_FALLBACK_PAUSE_SECS)
        };
        let kind = if primary { "primary" } else { "secondary" };
        log::warn!("rate-limit: {kind} pause until unix {until}");
        emit_rate_limit(
            &app,
            RateLimitPayload {
                remaining,
                reset_at,
                pause: Some(RateLimitPause { kind, until }),
            },
        );
        return Err(format!("Rate limited ({kind}). Resumes at unix {until}."));
    }

    if !status.is_success() {
        // Still publish whatever rate-limit headers we got so the banner stays
        // accurate even when the failure was something else (auth, 5xx).
        emit_rate_limit(
            &app,
            RateLimitPayload {
                remaining,
                reset_at,
                pause: None,
            },
        );
        return Err(format!("GraphQL request failed: HTTP {status}"));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;

    // Body-level rate-limit error: a 200 OK with `errors[].type == RATE_LIMITED`.
    // GitHub uses this for the GraphQL point budget when a single query asks
    // for more than is left. No reliable reset header in this case — pause for
    // a short fixed window and let the next attempt re-check.
    if let Some(errors) = body.get("errors").and_then(Value::as_array) {
        let is_rate_limited = errors
            .iter()
            .any(|e| e.get("type").and_then(Value::as_str) == Some("RATE_LIMITED"));
        if is_rate_limited {
            let until = reset_at.unwrap_or_else(|| now_secs() + GRAPHQL_FALLBACK_PAUSE_SECS);
            log::warn!("rate-limit: graphql pause until unix {until}");
            emit_rate_limit(
                &app,
                RateLimitPayload {
                    remaining,
                    reset_at,
                    pause: Some(RateLimitPause {
                        kind: "graphql",
                        until,
                    }),
                },
            );
            return Err(format!("GraphQL rate limit. Resumes at unix {until}."));
        }
        return Err(format!("GraphQL errors: {errors:?}"));
    }

    // Success path. If `remaining` has just hit zero we still treat it as a
    // primary pause so the next call doesn't have to fail to surface the
    // block. Otherwise it's a plain informational update for the banner.
    let pause = if remaining == Some(0) {
        let until = reset_at.unwrap_or_else(|| now_secs() + GRAPHQL_FALLBACK_PAUSE_SECS);
        log::warn!("rate-limit: primary pause until unix {until} (remaining=0 on success)");
        Some(RateLimitPause {
            kind: "primary",
            until,
        })
    } else {
        if let Some(r) = remaining {
            log::debug!("rate-limit: {r} remaining");
        }
        None
    };
    emit_rate_limit(
        &app,
        RateLimitPayload {
            remaining,
            reset_at,
            pause,
        },
    );

    body.get("data")
        .cloned()
        .ok_or_else(|| "GraphQL response missing data".into())
}
