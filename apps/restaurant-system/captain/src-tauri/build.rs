fn main() {
    if std::env::var("PROFILE").unwrap_or_default() == "release" && tauri_build::is_dev() {
        panic!("Release requires tauri/custom-protocol; use the Tauri build command. Development URLs must not ship.");
    }
    tauri_build::build()
}
