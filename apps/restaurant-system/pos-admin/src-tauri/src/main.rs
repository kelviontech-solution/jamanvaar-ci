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

// ---- Real printing (BUG-025 / BUG-026): shared native module, see packages/native/printing.rs -------------
#[path = "../../../../../packages/native/printing.rs"]
mod printing;

/// Printers installed in Windows: rows of [name, port, driver, status].
#[tauri::command]
async fn list_system_printers() -> Result<Vec<Vec<String>>, String> {
    printing::list_system_printers()
}

/// Devices on the local network that accept raw printing (port 9100).
#[tauri::command]
async fn scan_network_printers(subnet: Option<String>) -> Result<Vec<String>, String> {
    printing::scan_network_printers(subnet, 9100, 300)
}

/// COM ports on this computer (Bluetooth serial printers appear here too).
#[tauri::command]
async fn list_serial_ports() -> Result<Vec<String>, String> {
    printing::list_serial_ports()
}

/// Raw ESC/POS bytes to an installed (USB or driver) printer through the Windows spooler.
#[tauri::command]
async fn print_raw_system(name: String, bytes: Vec<u8>) -> Result<(), String> {
    printing::print_raw_to_system_printer(&name, &bytes)
}

/// Raw ESC/POS bytes to a serial printer.
#[tauri::command]
async fn print_serial(port: String, baud: u32, bytes: Vec<u8>) -> Result<(), String> {
    printing::print_to_serial(&port, baud, &bytes)
}

/// Raw ESC/POS bytes to a network thermal printer (port 9100).
#[tauri::command]
async fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    printing::send_to_network_printer(&ip, port, &bytes)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_machine_ip,
            list_system_printers,
            scan_network_printers,
            list_serial_ports,
            print_raw_system,
            print_serial,
            send_escpos_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR POS Admin desktop application");
}
