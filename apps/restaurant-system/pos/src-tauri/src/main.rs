// JAMANVAAR POS — Tauri Main Entry Point
// Production Windows Desktop Application
// Machine 1: Hosts JAMANVAAR POS + Local Core SSE Server
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::UdpSocket;
use std::thread;
use std::time::Duration;

/// Broadcast JAMANVAAR_CORE beacon on LAN so Kiosk machines can auto-discover
fn start_lan_beacon(local_core_port: u16) {
    thread::spawn(move || {
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(_) => return,
        };
        let _ = socket.set_broadcast(true);

        // Get local IP from OS
        let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

        let beacon_msg = format!(
            "JAMANVAAR_CORE|{}|{}",
            local_ip, local_core_port
        );

        loop {
            let _ = socket.send_to(beacon_msg.as_bytes(), "255.255.255.255:45678");
            thread::sleep(Duration::from_secs(3));
        }
    });
}

/// Get the machine's local network IP address
fn get_local_ip() -> Option<String> {
    // Connect to a public IP (doesn't actually send data) to determine local interface
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

/// Tauri command: get local core status info for frontend display
#[tauri::command]
fn get_local_core_info() -> serde_json::Value {
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    serde_json::json!({
        "status": "RUNNING",
        "ip": local_ip,
        "port": 5178,
        "version": "1.0.0"
    })
}

/// Tauri command: get this machine's LAN IP for display in settings
#[tauri::command]
fn get_machine_ip() -> String {
    get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string())
}

/// Tauri command: send raw ESC/POS bytes to a network thermal printer over
/// TCP (port 9100 is the standard raw-print port most networked ESC/POS
/// printers support).
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let socket_addr = addr
        .parse()
        .map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream
        .write_all(&bytes)
        .map_err(|e| format!("Failed to send data to printer: {}", e))?;
    Ok(())
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

fn main() {
    // Start LAN beacon so Kiosk machines can discover this POS machine
    start_lan_beacon(5178);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_local_core_info,
            get_machine_ip,
            send_escpos_bytes,
            list_system_printers,
            scan_network_printers,
            list_serial_ports,
            print_raw_system,
            print_serial
        ])
        .setup(|app| {
            // Auto-launch the Local Core sidecar if present
            use tauri_plugin_shell::ShellExt;
            let shell = app.shell();
            let _ = shell
                .sidecar("JamanvaarLocalCore")
                .and_then(|cmd| cmd.spawn().map_err(Into::into));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR POS desktop application");
}
