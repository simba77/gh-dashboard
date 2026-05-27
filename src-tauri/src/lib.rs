mod auth;
mod github;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
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
