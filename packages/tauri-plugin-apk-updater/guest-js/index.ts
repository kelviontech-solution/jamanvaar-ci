import { invoke } from '@tauri-apps/api/core';

export interface DownloadAndInstallResponse {
  downloadId: number;
}

/**
 * Downloads an Android APK update through the system's own DownloadManager (a real, visible
 * download with its own progress notification). Use getUpdateStatus and installDownloaded
 * after local data is saved to open Android's install prompt -- one tap to confirm, which is the most Android
 * allows any ordinary app to do; there is no silent-install path without Device Owner
 * enrollment. No-ops (rejects) outside Android -- callers should only invoke this on Android.
 */
export async function downloadAndInstall(url: string, sha256: string): Promise<DownloadAndInstallResponse> {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('This update has no verified checksum. Ask the administrator to republish its signed APK.');
  return invoke('plugin:apk-updater|download_and_install', { payload: { url, sha256 } });
}

export async function getUpdateStatus(): Promise<{ phase: string; downloadId: number }> {
  return invoke('plugin:apk-updater|get_update_status');
}

export async function installDownloaded(): Promise<void> {
  await invoke('plugin:apk-updater|install_downloaded');
}
