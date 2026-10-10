use serde::{Deserialize, Serialize};

// Both directions need both derives: `run_mobile_plugin` serializes the request to send to the
// Android side, then deserializes whatever JSON comes back as the response.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAndInstallRequest {
    /// Direct HTTPS URL of the .apk to download (the same one the update banner already shows).
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAndInstallResponse {
    /// Android's own DownloadManager request id, for whoever wants to show progress later.
    pub download_id: i64,
}
