// JAMANVAAR Captain — Tauri Mobile/Desktop Entry Point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // Auto-update: checked and applied from the frontend via tauri-plugin-updater's own
    // JS API -- no custom Rust command needed. Desktop-only; the plugin has no
    // Android/iOS support, so it's never registered on mobile.
    #[cfg(windows)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Android's own equivalent of the Windows updater above -- see packages/tauri-plugin-apk-updater.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_apk_updater::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Captain application");
}
