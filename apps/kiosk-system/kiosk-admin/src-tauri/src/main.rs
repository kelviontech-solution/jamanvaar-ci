#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            send_escpos_bytes,
            list_system_printers,
            scan_network_printers,
            list_serial_ports,
            print_raw_system,
            print_serial
        ])
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kiosk Admin desktop application");
}
