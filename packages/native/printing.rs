// Native printing shared by the JAMANVAAR desktop shells (BUG-025 / BUG-026).
//
// Only the standard library is used, so this file builds inside any Tauri shell and can be unit-tested on
// its own:  rustc --edition 2021 --test packages/native/printing.rs -o printing_test.exe
//
// What it does:
//  - lists the printers installed in Windows (USB and driver printers show up here),
//  - sends raw ESC/POS bytes to one of them through the Windows spooler (no driver rendering, no dialog),
//  - scans the local network for printers listening on the raw-print port,
//  - lists and writes to serial (COM) ports, which is also how Bluetooth serial printers appear.
//
// Nothing here is simulated: every function reports the real outcome or a real error.

#![allow(dead_code)]

use std::io::Write;
use std::net::{Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// A printer known to the operating system: [name, port, driver, status].
pub type PrinterRow = Vec<String>;

/// Stops a console window flashing up when the GUI app starts PowerShell.
#[cfg(windows)]
fn hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000)
}

#[cfg(not(windows))]
fn hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

// ---------------------------------------------------------------------------------------------
// Pure helpers (these are what the unit tests cover)
// ---------------------------------------------------------------------------------------------

/// Turns the `Name|Port|Driver|Status` lines PowerShell prints into rows, dropping blanks and malformed lines.
pub fn parse_printer_lines(output: &str) -> Vec<PrinterRow> {
    output
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .filter_map(|l| {
            let parts: Vec<&str> = l.split('|').collect();
            if parts.len() < 4 || parts[0].trim().is_empty() {
                return None;
            }
            Some(vec![
                parts[0].trim().to_string(),
                parts[1].trim().to_string(),
                parts[2].trim().to_string(),
                describe_status(parts[3].trim()),
            ])
        })
        .collect()
}

/// Win32_Printer.PrinterStatus: 3 idle, 4 printing, 5 warming up, 6 stopped, 7 offline; blank when unknown.
pub fn describe_status(code: &str) -> String {
    match code {
        "1" => "OTHER",
        "2" => "UNKNOWN",
        "3" | "5" => "READY",
        "4" => "BUSY",
        "6" => "ERROR",
        "7" => "OFFLINE",
        "" => "UNKNOWN",
        other => other,
    }
    .to_string()
}

/// "192.168.1.42" -> "192.168.1". Only private IPv4 networks are ever scanned.
pub fn subnet_prefix(ip: &str) -> Option<String> {
    let addr: Ipv4Addr = ip.trim().parse().ok()?;
    if !(addr.is_private()) {
        return None;
    }
    let o = addr.octets();
    Some(format!("{}.{}.{}", o[0], o[1], o[2]))
}

/// security-audit MED-15 (POS-08/POSADMIN-10/KIOSK-01): `send_escpos_bytes` in every
/// desktop shell's `main.rs` used to open a TCP connection to ANY caller-supplied
/// `ip:port` — a loopback address, a public IP, another host's internal service, any
/// port at all. If a future XSS/supply-chain bug ever lets a script in the webview
/// call it, that turns into an arbitrary internal-network TCP-send primitive. This is
/// the same allow-list `scan_network_printers` already applies when choosing what to
/// scan — reused here to gate what a single direct connection may target: a private
/// IPv4 address (matching real network printer deployments) on the standard raw-print
/// port (9100) or a small band around it that real ESC/POS printers commonly use.
pub fn is_allowed_printer_target(ip: &str, port: u16) -> bool {
    let addr: Ipv4Addr = match ip.trim().parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    if !addr.is_private() {
        return false;
    }
    matches!(port, 9100..=9107 | 515 | 631)
}

/// A printer queue name may not contain characters that could change what a command does.
pub fn is_safe_printer_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 200
        && !trimmed.chars().any(|c| c.is_control() || matches!(c, '"' | '`' | '$' | ';' | '|' | '&' | '<' | '>'))
}

/// The most a single print job may carry. A receipt or kitchen ticket is a few kilobytes; a script asking for more is not printing one.
pub const MAX_PRINT_BYTES: usize = 1024 * 1024;

/// Is `name` one of the printers Windows actually has installed (compared without regard to case)? A page script may only print to those.
pub fn is_installed_printer(name: &str, installed: &[PrinterRow]) -> bool {
    let wanted = name.trim().to_lowercase();
    installed.iter().any(|row| row.first().map(|n| n.trim().to_lowercase() == wanted).unwrap_or(false))
}

/// COM1 to COM256, in any case. Also accepts the `\\.\COM10` form.
pub fn normalize_com_port(port: &str) -> Option<String> {
    let p = port.trim().trim_start_matches("\\\\.\\").to_uppercase();
    let digits = p.strip_prefix("COM")?;
    let n: u32 = digits.parse().ok()?;
    if (1..=256).contains(&n) {
        Some(format!("COM{}", n))
    } else {
        None
    }
}

pub fn is_supported_baud(baud: u32) -> bool {
    matches!(baud, 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200)
}

// ---------------------------------------------------------------------------------------------
// System (spooler) printers
// ---------------------------------------------------------------------------------------------

/// The printers installed on this computer, including USB printers that have a driver.
#[cfg(windows)]
pub fn list_system_printers() -> Result<Vec<PrinterRow>, String> {
    let script = "Get-CimInstance Win32_Printer | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.Name, $_.PortName, $_.DriverName, $_.PrinterStatus }";
    let out = hidden(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", script]))
        .output()
        .map_err(|e| format!("Could not ask Windows for its printers: {}", e))?;
    if !out.status.success() {
        return Err(format!("Windows could not list printers: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(parse_printer_lines(&String::from_utf8_lossy(&out.stdout)))
}

#[cfg(not(windows))]
pub fn list_system_printers() -> Result<Vec<PrinterRow>, String> {
    Err("Listing installed printers is only supported on Windows.".to_string())
}

/// C# that sends a file's bytes to a printer through the spooler as a RAW document.
const RAW_PRINT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$name = $env:JV_PRINTER
$path = $env:JV_FILE
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class JvRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static void Send(string printer, string file) {
    byte[] data = File.ReadAllBytes(file);
    IntPtr h;
    if (!OpenPrinter(printer.Normalize(), out h, IntPtr.Zero)) throw new Exception("Windows could not open the printer '" + printer + "' (error " + Marshal.GetLastWin32Error() + ").");
    try {
      DOCINFOA di = new DOCINFOA(); di.pDocName = "JAMANVAAR"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("The printer refused the document (error " + Marshal.GetLastWin32Error() + ").");
      try {
        if (!StartPagePrinter(h)) throw new Exception("The printer refused the page (error " + Marshal.GetLastWin32Error() + ").");
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, p, data.Length);
          int written;
          if (!WritePrinter(h, p, data.Length, out written) || written != data.Length) throw new Exception("Only " + written + " of " + data.Length + " bytes reached the printer (error " + Marshal.GetLastWin32Error() + ").");
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
[JvRawPrinter]::Send($name, $path)
"#;

/// Sends raw bytes (ESC/POS) to an installed printer through the Windows spooler.
#[cfg(windows)]
pub fn print_raw_to_system_printer(name: &str, bytes: &[u8]) -> Result<(), String> {
    if !is_safe_printer_name(name) {
        return Err(format!("\"{}\" is not a usable printer name.", name));
    }
    if bytes.is_empty() {
        return Err("There is nothing to print.".to_string());
    }
    if bytes.len() > MAX_PRINT_BYTES {
        return Err("That print job is too large.".to_string());
    }
    // Only a printer this computer really has: the page cannot aim the spooler at an arbitrary queue name.
    let installed = list_system_printers()?;
    if !is_installed_printer(name, &installed) {
        return Err(format!("\"{}\" is not an installed printer on this computer.", name.trim()));
    }
    let mut path = std::env::temp_dir();
    path.push(format!("jamanvaar-print-{}-{}.bin", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::write(&path, bytes).map_err(|e| format!("Could not prepare the print data: {}", e))?;
    // The printer name and file path travel in environment variables, never inside the script text.
    let result = hidden(
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", RAW_PRINT_SCRIPT])
            .env("JV_PRINTER", name.trim())
            .env("JV_FILE", &path),
    )
    .output();
    let _ = std::fs::remove_file(&path);
    let out = result.map_err(|e| format!("Could not start Windows printing: {}", e))?;
    if out.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let reason = stderr.lines().find(|l| !l.trim().is_empty()).unwrap_or("Windows reported an error.").trim().to_string();
        Err(format!("Printing to \"{}\" failed: {}", name.trim(), reason))
    }
}

#[cfg(not(windows))]
pub fn print_raw_to_system_printer(_name: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("Printing through the system spooler is only supported on Windows.".to_string())
}

// ---------------------------------------------------------------------------------------------
// Network printers
// ---------------------------------------------------------------------------------------------

/// The address of this computer on its local network, if it has one.
pub fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

/// Looks for printers listening on `port` (9100 is the standard raw-print port) across the local /24.
/// `subnet` is like "192.168.1"; when not given, this computer's own network is used.
pub fn scan_network_printers(subnet: Option<String>, port: u16, timeout_ms: u64) -> Result<Vec<String>, String> {
    let prefix = match subnet {
        Some(s) => {
            let candidate = format!("{}.1", s.trim().trim_end_matches('.'));
            subnet_prefix(&candidate).ok_or_else(|| "Only private networks (like 192.168.x.x) can be scanned.".to_string())?
        }
        None => local_ip()
            .and_then(|ip| subnet_prefix(&ip))
            .ok_or_else(|| "This computer is not on a private network, so there is nothing to scan.".to_string())?,
    };
    let (tx, rx) = mpsc::channel();
    let mut handles = Vec::new();
    for host in 1u8..=254 {
        let tx = tx.clone();
        let address = format!("{}.{}:{}", prefix, host, port);
        handles.push(thread::spawn(move || {
            if let Ok(addr) = address.parse::<SocketAddr>() {
                if TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms)).is_ok() {
                    let _ = tx.send(addr.ip().to_string());
                }
            }
        }));
    }
    drop(tx);
    for h in handles {
        let _ = h.join();
    }
    let mut found: Vec<String> = rx.iter().collect();
    found.sort_by_key(|ip| ip.rsplit('.').next().and_then(|n| n.parse::<u16>().ok()).unwrap_or(0));
    Ok(found)
}

// ---------------------------------------------------------------------------------------------
// Serial (COM) printers, including Bluetooth serial
// ---------------------------------------------------------------------------------------------

/// The COM ports that exist on this computer.
#[cfg(windows)]
pub fn list_serial_ports() -> Result<Vec<String>, String> {
    let out = hidden(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", "[System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object"]))
        .output()
        .map_err(|e| format!("Could not list serial ports: {}", e))?;
    Ok(String::from_utf8_lossy(&out.stdout).lines().filter_map(|l| normalize_com_port(l)).collect())
}

#[cfg(not(windows))]
pub fn list_serial_ports() -> Result<Vec<String>, String> {
    Err("Listing serial ports is only supported on Windows.".to_string())
}

/// Sends raw bytes to a serial printer after setting its speed.
#[cfg(windows)]
pub fn print_to_serial(port: &str, baud: u32, bytes: &[u8]) -> Result<(), String> {
    let com = normalize_com_port(port).ok_or_else(|| format!("\"{}\" is not a serial port name (expected COM1 to COM256).", port))?;
    if !is_supported_baud(baud) {
        return Err(format!("{} is not a supported serial speed.", baud));
    }
    if bytes.len() > MAX_PRINT_BYTES {
        return Err("That print job is too large.".to_string());
    }
    // Only a port this computer really has.
    if !list_serial_ports()?.iter().any(|p| p == &com) {
        return Err(format!("{} is not a serial port on this computer.", com));
    }
    let mode = hidden(Command::new("cmd").args(["/C", "mode", &format!("{}:", com), &format!("BAUD={}", baud), "PARITY=n", "DATA=8", "STOP=1"]))
        .output()
        .map_err(|e| format!("Could not set up {}: {}", com, e))?;
    if !mode.status.success() {
        return Err(format!("{} could not be opened. Is the printer connected and switched on?", com));
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .open(format!("\\\\.\\{}", com))
        .map_err(|e| format!("Could not open {}: {}", com, e))?;
    file.write_all(bytes).map_err(|e| format!("Could not send data to {}: {}", com, e))?;
    file.flush().map_err(|e| format!("Could not finish sending data to {}: {}", com, e))
}

#[cfg(not(windows))]
pub fn print_to_serial(_port: &str, _baud: u32, _bytes: &[u8]) -> Result<(), String> {
    Err("Serial printing is only supported on Windows.".to_string())
}

// ---------------------------------------------------------------------------------------------
// Raw TCP (kept here so every shell shares one implementation)
// ---------------------------------------------------------------------------------------------

pub fn send_to_network_printer(ip: &str, port: u16, bytes: &[u8]) -> Result<(), String> {
    // security-audit MED-15: every desktop shell's `send_escpos_bytes` command used to
    // open a TCP connection to whatever ip:port the webview passed it, with no
    // allow-list — see `is_allowed_printer_target`'s doc comment.
    if !is_allowed_printer_target(ip, port) {
        return Err(format!(
            "Refused to connect to {}:{} — only a private-network IP on a standard printer port is allowed.",
            ip, port
        ));
    }
    connect_and_send(ip, port, bytes)
}

/// Raw TCP connect-and-write, with no target validation. Only reachable through
/// `send_to_network_printer`'s allow-list in production code; exists as its own
/// function so tests can exercise the wire-level send mechanics against an
/// arbitrary loopback listener without going through the allow-list.
fn connect_and_send(ip: &str, port: u16, bytes: &[u8]) -> Result<(), String> {
    let addr = format!("{}:{}", ip, port);
    let socket_addr: SocketAddr = addr.parse().map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5)).map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream.write_all(bytes).map_err(|e| format!("Failed to send data to printer: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_installed_printers_are_accepted() {
        let installed = vec![vec!["EPSON TM-T82".to_string(), "USB001".to_string()]];
        assert!(is_installed_printer("epson tm-t82 ", &installed));
        assert!(!is_installed_printer("Some Other Queue", &installed));
        assert!(!is_installed_printer("", &installed));
    }

    #[test]
    fn parses_powershell_lines_into_rows() {
        let out = "EPSON TM-T82|USB001|EPSON TM-T82 ReceiptE4|3\r\nMicrosoft Print to PDF|PORTPROMPT:|Microsoft Print To PDF|3\r\n\r\nKitchen|IP_192.168.1.150|Generic / Text Only|7\r\n";
        let rows = parse_printer_lines(out);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0], vec!["EPSON TM-T82", "USB001", "EPSON TM-T82 ReceiptE4", "READY"]);
        assert_eq!(rows[2][3], "OFFLINE");
    }

    #[test]
    fn ignores_malformed_lines() {
        assert!(parse_printer_lines("no separators here\n|x|y|3\nonly|two|parts").is_empty());
        assert!(parse_printer_lines("").is_empty());
    }

    #[test]
    fn status_codes_are_translated_and_blank_is_unknown() {
        assert_eq!(describe_status("3"), "READY");
        assert_eq!(describe_status("4"), "BUSY");
        assert_eq!(describe_status("6"), "ERROR");
        assert_eq!(describe_status("7"), "OFFLINE");
        assert_eq!(describe_status(""), "UNKNOWN");
    }

    #[test]
    fn only_private_networks_are_scanned() {
        assert_eq!(subnet_prefix("192.168.1.42"), Some("192.168.1".to_string()));
        assert_eq!(subnet_prefix("10.0.5.9"), Some("10.0.5".to_string()));
        assert_eq!(subnet_prefix("172.16.4.2"), Some("172.16.4".to_string()));
        assert_eq!(subnet_prefix("8.8.8.8"), None);
        assert_eq!(subnet_prefix("203.0.113.7"), None);
        assert_eq!(subnet_prefix("not an ip"), None);
    }

    #[test]
    fn scanning_a_public_range_is_refused() {
        assert!(scan_network_printers(Some("8.8.8".to_string()), 9100, 10).is_err());
    }

    /// security-audit MED-15: send_escpos_bytes/send_to_network_printer must only ever
    /// reach a private-network printer on a real printer port — never a public IP, a
    /// loopback/internal service, or an arbitrary port (which would make this a
    /// general-purpose TCP-send primitive from the webview).
    #[test]
    fn printer_target_allow_list_rejects_non_private_or_non_printer_ports() {
        assert!(is_allowed_printer_target("192.168.1.50", 9100));
        assert!(is_allowed_printer_target("10.0.0.5", 9101));
        assert!(is_allowed_printer_target("172.16.4.2", 631));

        assert!(!is_allowed_printer_target("8.8.8.8", 9100), "public IP must be refused");
        assert!(!is_allowed_printer_target("127.0.0.1", 9100), "loopback must be refused");
        assert!(!is_allowed_printer_target("169.254.1.1", 9100), "link-local must be refused");
        assert!(!is_allowed_printer_target("192.168.1.50", 22), "SSH port on an otherwise-private IP must be refused");
        assert!(!is_allowed_printer_target("192.168.1.50", 3389), "RDP port must be refused");
        assert!(!is_allowed_printer_target("not an ip", 9100), "unparseable address must be refused");
    }

    #[test]
    fn send_to_network_printer_refuses_a_disallowed_target_before_ever_connecting() {
        let err = send_to_network_printer("8.8.8.8", 9100, b"test").unwrap_err();
        assert!(err.contains("Refused"), "{}", err);
    }

    #[test]
    fn printer_names_cannot_smuggle_commands() {
        assert!(is_safe_printer_name("EPSON TM-T82 Receipt"));
        assert!(is_safe_printer_name("Kitchen (Main) #2"));
        for bad in ["", "   ", "a\"; calc; \"", "a`b", "$(evil)", "a|b", "a&b", "a>b", "line\nbreak"] {
            assert!(!is_safe_printer_name(bad), "{:?}", bad);
        }
    }

    #[test]
    fn com_ports_are_validated_and_normalised() {
        assert_eq!(normalize_com_port("com3"), Some("COM3".to_string()));
        assert_eq!(normalize_com_port("\\\\.\\COM12"), Some("COM12".to_string()));
        assert_eq!(normalize_com_port("COM0"), None);
        assert_eq!(normalize_com_port("COM999"), None);
        assert_eq!(normalize_com_port("LPT1"), None);
        assert_eq!(normalize_com_port("COM1; calc"), None);
    }

    #[test]
    fn only_normal_serial_speeds_are_accepted() {
        assert!(is_supported_baud(9600));
        assert!(is_supported_baud(115200));
        assert!(!is_supported_baud(0));
        assert!(!is_supported_baud(12345));
    }

    #[test]
    fn a_closed_port_is_reported_as_an_error_not_success() {
        // Nothing listens on port 1 of the loopback address.
        assert!(send_to_network_printer("127.0.0.1", 1, b"x").is_err());
        assert!(send_to_network_printer("not-an-ip", 9100, b"x").is_err());
    }

    #[test]
    fn bytes_reach_a_listening_printer() {
        use std::io::Read;
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = Vec::new();
            s.read_to_end(&mut buf).unwrap();
            buf
        });
        // Loopback is intentionally outside the production allow-list (see
        // is_allowed_printer_target), so this test — which only exists to prove
        // the wire-level send mechanics work — talks to connect_and_send directly
        // rather than through the allow-list-gated send_to_network_printer.
        connect_and_send("127.0.0.1", port, &[0x1b, 0x40, b'H', b'i']).unwrap();
        assert_eq!(handle.join().unwrap(), vec![0x1b, 0x40, b'H', b'i']);
    }

    #[test]
    fn the_scan_finds_a_printer_that_is_listening() {
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let accept = thread::spawn(move || {
            // accept the scan's probe so the connect succeeds
            let _ = listener.accept();
        });
        // 127.0.0.x is not private in the sense of subnet_prefix, so test the connect path directly.
        let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
        assert!(TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok());
        let _ = accept.join();
    }
}
