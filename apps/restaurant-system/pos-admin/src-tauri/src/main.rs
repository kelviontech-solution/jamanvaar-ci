// JAMANVAAR POS Admin — Tauri Main Entry Point
// Production Windows Desktop Application
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::UdpSocket;

fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

#[tauri::command]
fn get_machine_ip() -> String {
    get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_machine_ip])
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR POS Admin desktop application");
}
