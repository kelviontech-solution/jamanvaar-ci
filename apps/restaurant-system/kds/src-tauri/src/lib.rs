// JAMANVAAR Kitchen Display System — Tauri Mobile/Desktop Entry Point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kitchen Display System application");
}
