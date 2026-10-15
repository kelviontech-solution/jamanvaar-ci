import { db } from '@jamanvaar/database';
import { AppUpdate, NATIVE_UPDATE_ATTEMPT_KEY } from '@jamanvaar/sync';

export interface NativeUpdateProgress {
  phase: 'checking' | 'downloading' | 'installing' | 'done' | 'up-to-date' | 'error' | 'not-supported';
  message: string;
  percent?: number;
}
const ATTEMPT_KEY = NATIVE_UPDATE_ATTEMPT_KEY;
let running = false;
const MAINTENANCE_KEY='jamanvaar_native_maintenance_v1';
type Maintenance={at:string;version:string;status:'SCHEDULED'|'WAITING'|'STARTED'|'FAILED';message?:string};
let maintenanceTimer:ReturnType<typeof setInterval>|null=null;
export function scheduledMaintenance():Maintenance|null {try{return JSON.parse(localStorage.getItem(MAINTENANCE_KEY)??'null');}catch{return null;}}
export function cancelScheduledMaintenance(){localStorage.removeItem(MAINTENANCE_KEY);window.dispatchEvent(new Event('jamanvaar-maintenance'));}
function saveMaintenance(value:Maintenance){localStorage.setItem(MAINTENANCE_KEY,JSON.stringify(value));window.dispatchEvent(new Event('jamanvaar-maintenance'));}
export function scheduleNativeMaintenance(at:string){const offer=AppUpdate.getVisible();if(!offer)throw new Error('No update is currently offered.');if(offer.mandatory)throw new Error('This release requires an immediate update and cannot be postponed.');if(!('__TAURI_INTERNALS__' in window))throw new Error('Schedule installation from the installed desktop or Android app.');if(!Number.isFinite(Date.parse(at))||Date.parse(at)<Date.now()+60000)throw new Error('Choose a maintenance time at least one minute ahead.');saveMaintenance({at,version:offer.latestVersion,status:'SCHEDULED'});startScheduledMaintenance();}
/** An explicitly scheduled update still uses the normal signature, persistence and installer checks. */
export function startScheduledMaintenance(){if(maintenanceTimer)return;maintenanceTimer=setInterval(()=>void runScheduledMaintenance(),15000);}
async function runScheduledMaintenance(){
 const job=scheduledMaintenance();
 if(!job||!['SCHEDULED','WAITING'].includes(job.status)||Date.parse(job.at)>Date.now()||running)return;
 const offer=AppUpdate.getVisible();
 if(!offer||offer.latestVersion!==job.version){saveMaintenance({...job,status:'FAILED',message:'The offered release changed. Review and schedule the current version.'});return;}
 if(Date.now()-Date.parse(job.at)>2*3600000){saveMaintenance({...job,status:'FAILED',message:'The two-hour maintenance window ended. Choose another time.'});return;}
 try{if([...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].length)throw new Error('Waiting for the current task to finish.');await persistBeforeInstall();}
 catch(e){saveMaintenance({...job,status:'WAITING',message:e instanceof Error?e.message:'Waiting for safe installation.'});return;}
 saveMaintenance({...job,status:'STARTED',message:'Starting verified update; reopen the app to confirm installation.'});
 try{await installNativeUpdate(()=>undefined,offer);}
 catch(e){saveMaintenance({...job,status:'FAILED',message:e instanceof Error?e.message:'Installation failed. Retry explicitly from this device.'});}
}

const operationalGuards = new Set<() => string | null>();
export function registerNativeUpdateGuard(guard: () => string | null): () => void {
  operationalGuards.add(guard);
  return () => { operationalGuards.delete(guard); };
}

export function recordUpdateAttempt(version: string): void {
  // Must persist before the Windows installer exits the current process.
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ version, status: 'AWAITING_RESTART', at: new Date().toISOString() }));
}

/** This runs after storage boot; download completion never means installation success. */
export async function verifyInstalledUpdate(): Promise<void> {
  startScheduledMaintenance();
  if (!('__TAURI_INTERNALS__' in window)) return;
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return;
    const attempt = JSON.parse(raw);
    if (attempt.status !== 'AWAITING_RESTART') return;
    if (/android/i.test(navigator.userAgent)) {
      const { getUpdateStatus } = await import('@jamanvaar/tauri-plugin-apk-updater');
      const status = await getUpdateStatus();
      if (['DOWNLOADING', 'READY_TO_INSTALL'].includes(status.phase)) return;
      if (['DOWNLOAD_FAILED', 'VERIFICATION_FAILED', 'INSTALL_FAILED'].includes(status.phase)) {
        localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ ...attempt, status: 'FAILED', message: 'Android could not complete the update. Please retry.' })); return;
      }
    }
    const { getVersion } = await import('@tauri-apps/api/app');
    const installedVersion = await getVersion();
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ ...attempt, installedVersion, status: installedVersion === attempt.version ? 'VERIFIED' : 'NOT_INSTALLED', checkedAt: new Date().toISOString() }));
    if (installedVersion === attempt.version) AppUpdate.apply(null);
  } catch { /* Do not prevent offline startup if diagnostics/storage are unavailable. */ }
}

async function persistBeforeInstall(): Promise<void> {
  for (const guard of operationalGuards) {
    const reason = guard();
    if (reason) throw new Error(reason);
  }
  const storage = (window as unknown as { __jamanvaarStorage?: { flush(): Promise<void> } }).__jamanvaarStorage;
  await storage?.flush();
  const health = db.getPersistenceHealth();
  if (!health.ok) throw new Error('Update postponed: local data could not be saved. Resolve the storage error first.');
  if(db.orders.some(order=>!['COMPLETED','SERVED','CANCELLED','REFUNDED','VOID','VOIDED'].includes(order.orderStatus)))throw new Error('Update postponed: finish active orders before installation.');
  if(db.syncEvents.some(event=>['PENDING','FAILED','PROCESSING'].includes(event.status))||db.orders.some(order=>order.syncStatus&&order.syncStatus!=='SYNCED'))throw new Error('Update postponed: synchronize pending local changes first.');
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
      const { downloadAndInstall, getUpdateStatus, installDownloaded } = await import('@jamanvaar/tauri-plugin-apk-updater');
      onProgress({ phase: 'downloading', message: 'Starting the verified APK download…' });
      await downloadAndInstall(offer.downloadUrl, offer.downloadSha256);
      recordUpdateAttempt(offer.latestVersion);
      const deadline = Date.now() + 600_000;
      while (true) {
        const status = await getUpdateStatus();
        if (status.phase === 'READY_TO_INSTALL') break;
        if (status.phase !== 'DOWNLOADING') throw new Error('Android could not download or verify the APK. Please retry.');
        if (Date.now() >= deadline) throw new Error('The APK download is taking too long. Retry when the connection improves; it will not install in the background.');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await persistBeforeInstall();
      onProgress({ phase: 'installing', message: 'Opening the Android installer. Confirm the update to keep this app and its data.' });
      await installDownloaded();
      onProgress({ phase: 'done', message: 'Android installer opened. Confirm installation, then reopen the app to verify the version.' });
      return;
    }
    onProgress({ phase: 'checking', message: 'Checking the signed update manifest…' });
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 30_000 });
    if (!update) { onProgress({ phase: 'up-to-date', message: 'No newer compatible update is available.' }); return; }
    try {
      if (offer && offer.latestVersion !== update.version) throw new Error('The release offer and signed updater manifest disagree. Refresh the update check.');
      const { getName } = await import('@tauri-apps/api/app');
      const product = await getName();
      const platforms = update.rawJson.platforms as Record<string, { signature?: string }> | undefined;
      const encoded = platforms?.['windows-x86_64']?.signature ?? update.rawJson.signature;
      const lines = typeof encoded === 'string' ? atob(encoded).split(/\r?\n/) : [];
      const signedFile = /(?:\t| )file:([^\t\r\n]+)/.exec(lines[2] ?? '')?.[1];
      if (signedFile !== `${product}_${update.version}_x64-setup.exe`) throw new Error('The signed updater metadata does not match this application, version and Windows target.');
      let total = 0, downloaded = 0;
      onProgress({ phase: 'downloading', message: `Downloading version ${update.version}…`, percent: 0 });
      // The plugin cryptographically verifies the artifact AND trusted comment on download.
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
    if (offer) {
      try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ version: offer.latestVersion, status: 'FAILED', message: 'Update could not complete; retry from this device.', at: new Date().toISOString() })); } catch { /* error remains visible even if storage failed */ }
    }
    onProgress({ phase: 'error', message: error instanceof Error ? error.message : 'Update failed. The existing application remains usable.' });
    throw error;
  } finally { running = false; }
}
