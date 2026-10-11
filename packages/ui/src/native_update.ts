import { db } from '@jamanvaar/database';
import { AppUpdate } from '@jamanvaar/sync';

export interface NativeUpdateProgress {
  phase: 'checking' | 'downloading' | 'installing' | 'done' | 'up-to-date' | 'error' | 'not-supported';
  message: string;
  percent?: number;
}
const ATTEMPT_KEY = 'jamanvaar_native_update_attempt_v1';
let running = false;

export function recordUpdateAttempt(version: string): void {
  // Must persist before the Windows installer exits the current process.
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ version, status: 'AWAITING_RESTART', at: new Date().toISOString() }));
}

/** This runs after storage boot; download completion never means installation success. */
export async function verifyInstalledUpdate(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return;
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return;
    const attempt = JSON.parse(raw);
    if (attempt.status !== 'AWAITING_RESTART') return;
    const { getVersion } = await import('@tauri-apps/api/app');
    const installedVersion = await getVersion();
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ ...attempt, installedVersion, status: installedVersion === attempt.version ? 'VERIFIED' : 'NOT_INSTALLED', checkedAt: new Date().toISOString() }));
    if (installedVersion === attempt.version) AppUpdate.apply(null);
  } catch { /* Do not prevent offline startup if diagnostics/storage are unavailable. */ }
}

async function persistBeforeInstall(): Promise<void> {
  const storage = (window as unknown as { __jamanvaarStorage?: { flush(): Promise<void> } }).__jamanvaarStorage;
  await storage?.flush();
  const health = db.getPersistenceHealth();
  if (!health.ok) throw new Error('Update postponed: local data could not be saved. Resolve the storage error first.');
  if (db.printJobs.some(job => String(job.status) === 'PRINTING' || String(job.status) === 'PROCESSING')) throw new Error('Finish the active print job before updating.');
}

/** Explicit staff action only. Official updater verifies its configured signature before install. */
export async function installNativeUpdate(onProgress: (p: NativeUpdateProgress) => void, offer = AppUpdate.getVisible()): Promise<void> {
  if (running) throw new Error('An update is already running.');
  if (!('__TAURI_INTERNALS__' in window)) {
    if (!offer?.downloadUrl) throw new Error('No downloadable release is available.');
    const url = new URL(offer.downloadUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid update download URL.');
    window.open(url.href, '_blank', 'noopener,noreferrer');
    onProgress({ phase: 'done', message: 'Download opened. Installation has not been verified.' }); return;
  }
  running = true;
  try {
    await persistBeforeInstall();
    if (/android/i.test(navigator.userAgent)) {
      if (!offer?.downloadUrl || !offer.downloadSha256) throw new Error('This Android release is missing its APK URL or checksum.');
      const { downloadAndInstall } = await import('@jamanvaar/tauri-plugin-apk-updater');
      onProgress({ phase: 'downloading', message: 'Starting the verified APK download…' });
      await downloadAndInstall(offer.downloadUrl, offer.downloadSha256);
      recordUpdateAttempt(offer.latestVersion);
      onProgress({ phase: 'done', message: 'Download requested. Confirm installation in Android, then reopen the app to verify the version.' });
      return;
    }
    onProgress({ phase: 'checking', message: 'Checking the signed update manifest…' });
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 30_000 });
    if (!update) { onProgress({ phase: 'up-to-date', message: 'No newer compatible update is available.' }); return; }
    try {
      if (offer && offer.latestVersion !== update.version) throw new Error('The release offer and signed updater manifest disagree. Refresh the update check.');
      let total = 0, downloaded = 0;
      onProgress({ phase: 'downloading', message: `Downloading version ${update.version}…`, percent: 0 });
      await update.download(event => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') downloaded += event.data.chunkLength;
        onProgress({ phase: 'downloading', message: `Downloading version ${update.version}…`, percent: total ? Math.min(100, Math.round(downloaded * 100 / total)) : undefined });
      }, { timeout: 120_000 });
      await persistBeforeInstall();
      recordUpdateAttempt(update.version);
      onProgress({ phase: 'installing', message: 'Handing off to the signed Windows installer. The next launch will verify the installed version.', percent: 100 });
      // Windows install exits this process and restarts via the supported installer.
      await update.install({ restartAfterInstall: true });
      onProgress({ phase: 'done', message: 'Installer started. Reopen the app to verify the installed version.' });
    } finally { await update.close().catch(() => undefined); }
  } catch (error) {
    onProgress({ phase: 'error', message: error instanceof Error ? error.message : 'Update failed. The existing application remains usable.' });
    throw error;
  } finally { running = false; }
}
