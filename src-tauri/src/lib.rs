mod auth;
mod github;

use tauri_plugin_sql::{Migration, MigrationKind};

// One row per item we've ever seen on a tracked ProjectV2 board. Fields are
// flattened from GraphQL so widgets can query directly without re-parsing the
// API shape. `assignees` is JSON because we never filter on individual logins
// in SQL — the team view does its own grouping in TS.
const SCHEMA_V1: &str = "
CREATE TABLE project_items (
    item_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    project_title TEXT NOT NULL,
    content_type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    number INTEGER,
    repository TEXT,
    author TEXT,
    assignees_json TEXT NOT NULL DEFAULT '[]',
    status TEXT,
    is_draft INTEGER NOT NULL DEFAULT 0,
    fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_project_items_project ON project_items(project_id);
CREATE INDEX idx_project_items_status ON project_items(status);
CREATE INDEX idx_project_items_author ON project_items(author);

CREATE TABLE project_sync_state (
    project_id TEXT PRIMARY KEY,
    last_full_sync INTEGER,
    last_tail_sync INTEGER
);
";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create project_items + project_sync_state",
        sql: SCHEMA_V1,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:devpulse.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            auth::start_device_flow,
            auth::poll_device_flow,
            auth::is_authenticated,
            auth::logout,
            github::graphql_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
