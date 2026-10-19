use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Probe only the loopback sidecar, with bounded time and response size. Opening a TCP socket
/// alone is not readiness: a different program may own the port.
pub fn probe(port: u16) -> Result<String, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let timeout = Duration::from_millis(500);
    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|_| "Local Core is not reachable".to_string())?;
    stream.set_read_timeout(Some(timeout)).map_err(|_| "Cannot probe Local Core".to_string())?;
    stream.set_write_timeout(Some(timeout)).map_err(|_| "Cannot probe Local Core".to_string())?;
    stream.write_all(b"GET /health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .map_err(|_| "Local Core health request failed".to_string())?;
    let mut response = Vec::new();
    stream.take(16385).read_to_end(&mut response)
        .map_err(|_| "Local Core health request timed out".to_string())?;
    if response.len() > 16384 { return Err("Local Core health response is too large".to_string()); }
    let text = String::from_utf8(response).map_err(|_| "Invalid Local Core health response".to_string())?;
    let (headers, body) = text.split_once("\r\n\r\n").ok_or("Invalid Local Core HTTP response")?;
    if !headers.lines().next().is_some_and(|line| line.starts_with("HTTP/1.") && line.split_whitespace().nth(1) == Some("200")) {
        return Err("Local Core reports an unhealthy HTTP status".to_string());
    }
    Ok(body.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn respond(response: Vec<u8>) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 512];
            let _ = socket.read(&mut request);
            socket.write_all(&response).unwrap();
        });
        port
    }
    #[test]
    fn returns_actual_health_body() {
        let port = respond(b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n{\"ok\":true}".to_vec());
        assert_eq!(probe(port).unwrap(), "{\"ok\":true}");
    }
    #[test]
    fn rejects_an_http_failure() {
        assert!(probe(respond(b"HTTP/1.1 503 Unavailable\r\n\r\n{}".to_vec())).is_err());
    }
    #[test]
    fn rejects_oversized_responses() {
        let mut response = b"HTTP/1.1 200 OK\r\n\r\n".to_vec();
        response.extend(vec![b'x'; 17000]);
        assert!(probe(respond(response)).is_err());
    }
    #[test]
    fn refuses_to_report_a_closed_port_as_running() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port(); drop(listener);
        assert!(probe(port).is_err());
    }
}
