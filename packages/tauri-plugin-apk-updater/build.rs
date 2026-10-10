const COMMANDS: &[&str] = &["download_and_install"];

fn main() {
    let result = tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build();

    // Mirrors the official plugins' own build.rs: docs.rs mounts sources read-only, so the
    // Android-targeted doc build always reports an error here that has nothing to do with
    // whether this actually builds for a real Android target.
    if !(std::env::var_os("DOCS_RS").is_some()
        && std::env::var("TARGET").unwrap().contains("android"))
    {
        result.unwrap();
    }
}
