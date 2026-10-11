import { invoke } from '@tauri-apps/api/core';

export interface DownloadAndInstallResponse {
  downloadId: number;
}

/**
 * Downloads an Android APK update through the system's own DownloadManager (a real, visible
 * download with its own progress notification) and hands the finished file to Android's
 * install prompt the moment it completes -- one tap to confirm, which is the most Android
 * allows any ordinary app to do; there is no silent-install path without Device Owner
 * enrollment. No-ops (rejects) outside Android -- callers should only invoke this on Android.
 */
export async function downloadAndInstall(url: string, sha256: string): Promise<DownloadAndInstallResponse> {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('This update has no verified checksum. Ask the administrator to republish its signed APK.');
  return invoke('plugin:apk-updater|download_and_install', { payload: { url, sha256 } });
}
