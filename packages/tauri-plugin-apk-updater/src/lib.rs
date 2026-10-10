//! Downloads an Android APK update and hands it to the system's own install prompt.
//!
//! Android gives no ordinary app silent-install permission, so this does the next best thing:
//! a real, visible download through `DownloadManager` (so the download itself is never a
//! mystery to whoever is running the terminal), followed automatically by the system's
//! "tap to install" flow the moment it finishes -- one tap, not a manual hunt through the
//! Downloads app for a file nobody told you arrived.
#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

mod error;
mod models;

pub use error::{Error, Result};
pub use models::{DownloadAndInstallRequest, DownloadAndInstallResponse};

const PLUGIN_IDENTIFIER: &str = "com.jamanvaar.apkupdater";

pub struct ApkUpdater<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ApkUpdater<R> {
    pub fn download_and_install(
        &self,
        payload: DownloadAndInstallRequest,
    ) -> Result<DownloadAndInstallResponse> {
        self.0
            .run_mobile_plugin("downloadAndInstall", payload)
            .map_err(Into::into)
    }
}

pub trait ApkUpdaterExt<R: Runtime> {
    fn apk_updater(&self) -> &ApkUpdater<R>;
}

impl<R: Runtime, T: Manager<R>> ApkUpdaterExt<R> for T {
    fn apk_updater(&self) -> &ApkUpdater<R> {
        self.state::<ApkUpdater<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apk-updater")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ApkUpdaterPlugin")?;
            app.manage(ApkUpdater(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![download_and_install])
        .build()
}

#[tauri::command]
fn download_and_install<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: DownloadAndInstallRequest,
) -> Result<DownloadAndInstallResponse> {
    app.apk_updater().download_and_install(payload)
}
