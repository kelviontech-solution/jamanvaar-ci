// JAMANVAAR Kiosk — Tauri Main Entry Point
// Production Windows Desktop Application
// Machine 2: Self-ordering Kiosk that connects to POS machine via LAN
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// Result of LAN discovery for a JAMANVAAR Local Core
#[derive(serde::Serialize, Clone)]
struct DiscoveredCore {
    ip: String,
    port: u16,
    hostname: String,
}

/// Shared state for discovered cores
type DiscoveredCores = Arc<Mutex<Vec<DiscoveredCore>>>;

/// Tauri command: Start LAN discovery, returns discovered JAMANVAAR core if found
#[tauri::command]
fn discover_local_core(timeout_secs: u64) -> Vec<DiscoveredCore> {
    let discovered: DiscoveredCores = Arc::new(Mutex::new(Vec::new()));
    let discovered_clone = Arc::clone(&discovered);

    // Listen on UDP port 45678 for beacons from POS machine
    let listener_thread = thread::spawn(move || {
        let socket = match UdpSocket::bind("0.0.0.0:45678") {
            Ok(s) => s,
            Err(_) => return,
        };
        let timeout = Duration::from_secs(timeout_secs.min(30));
        let _ = socket.set_read_timeout(Some(timeout));

        let mut buf = [0u8; 256];
        loop {
            match socket.recv_from(&mut buf) {
                Ok((len, src_addr)) => {
                    if let Ok(msg) = std::str::from_utf8(&buf[..len]) {
                        // Format: JAMANVAAR_CORE|<ip>|<port>
                        if msg.starts_with("JAMANVAAR_CORE|") {
                            let parts: Vec<&str> = msg.split('|').collect();
                            if parts.len() >= 3 {
                                let ip = parts[1].to_string();
                                let port: u16 = parts[2].parse().unwrap_or(5178);
                                let mut cores = discovered_clone.lock().unwrap();
                                // Avoid duplicates
                                if !cores.iter().any(|c: &DiscoveredCore| c.ip == ip) {
                                    cores.push(DiscoveredCore {
                                        ip: ip.clone(),
                                        port,
                                        hostname: format!("JAMANVAAR-POS-{}", &ip[ip.rfind('.').map(|i| i + 1).unwrap_or(0)..]),
                                    });
                                }
                            }
                        }
                    }
                }
                Err(_) => break, // Timeout reached
            }
        }
    });

    let _ = listener_thread.join();

    let cores = discovered.lock().unwrap();
    cores.clone()
}

/// Tauri command: Test connectivity to a discovered core
#[tauri::command]
fn test_core_connection(ip: String, port: u16) -> bool {
    use std::net::TcpStream;
    TcpStream::connect_timeout(
        &format!("{}:{}", ip, port).parse().unwrap_or("127.0.0.1:5178".parse().unwrap()),
        Duration::from_secs(5),
    ).is_ok()
}

/// Tauri command: Get machine's own IP
#[tauri::command]
fn get_machine_ip() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0").ok();
    if let Some(s) = socket {
        let _ = s.connect("8.8.8.8:80");
        if let Ok(addr) = s.local_addr() {
            return addr.ip().to_string();
        }
    }
    "127.0.0.1".to_string()
}

/// Tauri command: send raw ESC/POS bytes to a network thermal printer over
/// TCP (port 9100 is the standard raw-print port most networked ESC/POS
/// printers support).
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    // security-audit MED-15: delegates to the shared, allow-list-checked
    // implementation — see printing::send_to_network_printer / is_allowed_printer_target.
    printing::send_to_network_printer(&ip, port, &bytes)
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            discover_local_core,
            test_core_connection,
            get_machine_ip,
            send_escpos_bytes,
            list_system_printers,
            scan_network_printers,
            list_serial_ports,
            print_raw_system,
            print_serial
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kiosk desktop application");
}
