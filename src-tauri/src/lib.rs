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

// v2 — extra columns/tables for the MyTasks, AssignedByMe, TeamActivity and
// Kanban widgets:
//   * `content_state` — OPEN/CLOSED/MERGED of the underlying Issue/PR. Lets
//     widgets drop closed items without relying on the project's Status field
//     being kept in sync.
//   * `status_option_id` — stable id of the Status option (`name` can be
//     renamed; the id can't). Used by Kanban to assign cards to columns.
//   * `project_status_options` — the columns of each project's Status field,
//     with their declared order. Needed by Kanban to render columns in the
//     same order the user sees on github.com.
const SCHEMA_V2: &str = "
ALTER TABLE project_items ADD COLUMN content_state TEXT;
ALTER TABLE project_items ADD COLUMN status_option_id TEXT;

CREATE TABLE project_status_options (
    project_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (project_id, option_id)
);
";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create project_items + project_sync_state",
            sql: SCHEMA_V1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add content_state, status_option_id, status options",
            sql: SCHEMA_V2,
            kind: MigrationKind::Up,
        },
    ];

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
