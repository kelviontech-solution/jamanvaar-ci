// JAMANVAAR Kitchen Display System — Tauri Main Entry Point
// Production Windows Desktop Application
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kitchen Display System desktop application");
}
