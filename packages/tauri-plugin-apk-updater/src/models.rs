use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAndInstallRequest {
    /// Direct HTTPS URL of the .apk to download (the same one the update banner already shows).
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAndInstallResponse {
    /// Android's own DownloadManager request id, for whoever wants to show progress later.
    pub download_id: i64,
}
