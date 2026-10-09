// JAMANVAAR POS — Tauri Mobile/Desktop Entry Point
// Machine 1: Hosts JAMANVAAR POS + Local Core SSE Server
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start LAN beacon so Kiosk machines can discover this POS machine (desktop only --
    // the sidecar/UDP-broadcast local-network pairing model doesn't apply to a phone/tablet).
    #[cfg(desktop)]
    start_lan_beacon(5178);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    // Auto-update: checked and applied from the frontend via tauri-plugin-updater's own
    // JS API -- no custom Rust command needed. Desktop-only; the plugin has no
    // Android/iOS support, so it's never registered on mobile.
    #[cfg(windows)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let builder = builder
        .invoke_handler(tauri::generate_handler![
            get_local_core_info,
            get_machine_ip,
            send_escpos_bytes,
            list_system_printers,
            scan_network_printers,
            list_serial_ports,
            print_raw_system,
            print_serial
        ]);

    #[cfg(desktop)]
    let builder = builder.setup(|app| {
        // Auto-launch the Local Core sidecar if present (desktop only -- there is no
        // Android/iOS build of the sidecar binary, and externalBin is not declared for
        // mobile targets at all, see tauri.android.conf.json).
        use tauri_plugin_shell::ShellExt;
        let shell = app.shell();
        let _ = shell
            .sidecar("JamanvaarLocalCore")
            .and_then(|cmd| cmd.spawn().map_err(Into::into));
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR POS application");
}
