import React, { useEffect, useState } from 'react';
import { db } from '@jamanvaar/database';
import { Download, Upload, AlertTriangle, CheckCircle2, CloudUpload, Cloud } from 'lucide-react';
import {
  isCloudConnected,
  isCloudLoggedIn,
  uploadCloudBackup,
  fetchCloudBackups,
  CloudApiError,
  type CloudBackupSummary
} from '../../cloud/cloudClient';

// Were one shared, unscoped key for both destinations: the reminder couldn't say whether the
// last protection was a verified cloud upload or just a file saved to this device's downloads
// folder, and carried no restaurant/outlet identity, so a reused browser profile could show a
// different restaurant's old reminder as if it were this one's (A06).
const LAST_LOCAL_EXPORT_KEY_PREFIX = 'jamanvaar_pos_admin_last_local_export_at:';
const LAST_CLOUD_BACKUP_KEY_PREFIX = 'jamanvaar_pos_admin_last_cloud_backup_at:';
const STALE_BACKUP_HOURS = 24;

/** Bump this if the exported shape changes incompatibly. RestoreModal checks a file against this. */
export const BACKUP_SCHEMA_VERSION = 'JAMANVAAR_POS_BACKUP_V1';

function backupScopeKey(): string {
  return `${db.restaurant?.id ?? 'unknown'}:${db.outlet?.id ?? 'unknown'}`;
}

function readTimestamp(prefix: string): Date | null {
  try {
    const raw = localStorage.getItem(prefix + backupScopeKey());
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

interface BackupRestoreModuleProps {
  onOpenRestoreModal: () => void;
  showToast: (msg: string) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

export const BackupRestoreModule: React.FC<BackupRestoreModuleProps> = ({
  onOpenRestoreModal,
  showToast,
  onRequestConfirm
}) => {
  const [lastLocalExportAt, setLastLocalExportAt] = useState<Date | null>(readTimestamp(LAST_LOCAL_EXPORT_KEY_PREFIX));
  const [lastCloudBackupAt, setLastCloudBackupAt] = useState<Date | null>(readTimestamp(LAST_CLOUD_BACKUP_KEY_PREFIX));
  const [cloudBackups, setCloudBackups] = useState<CloudBackupSummary[] | null>(null);
  const [cloudHistoryLoading, setCloudHistoryLoading] = useState(false);
  const [cloudHistoryError, setCloudHistoryError] = useState<string | null>(null);
  const [cloudUploading, setCloudUploading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState<string | null>(null);
  const cloudReady = isCloudConnected() && isCloudLoggedIn();

  // A failed history fetch used to be swallowed entirely: cloudBackups stayed `[]`, which the
  // render below treats identically to "cloud is connected and genuinely has zero backups" (A05).
  // `cloudBackups` now starts `null` (unknown) so loading/error/empty/populated are all distinct.
  const loadCloudHistory = React.useCallback(() => {
    if (!cloudReady) return;
    setCloudHistoryLoading(true);
    setCloudHistoryError(null);
    fetchCloudBackups()
      .then(setCloudBackups)
      .catch((err) => setCloudHistoryError(err instanceof CloudApiError ? err.message : 'Could not load backup history. Check your connection and retry.'))
      .finally(() => setCloudHistoryLoading(false));
  }, [cloudReady]);

  useEffect(() => {
    loadCloudHistory();
  }, [loadCloudHistory]);

  const markLocalExported = () => {
    const now = new Date();
    try {
      localStorage.setItem(LAST_LOCAL_EXPORT_KEY_PREFIX + backupScopeKey(), now.toISOString());
    } catch {
      // localStorage can be unavailable (private mode, quota) — the export
      // itself already succeeded, only the "last backup" reminder is lost.
    }
    setLastLocalExportAt(now);
  };

  const markCloudBackedUp = () => {
    const now = new Date();
    try {
      localStorage.setItem(LAST_CLOUD_BACKUP_KEY_PREFIX + backupScopeKey(), now.toISOString());
    } catch {
      // localStorage can be unavailable (private mode, quota) — the upload
      // itself already succeeded, only the "last backup" reminder is lost.
    }
    setLastCloudBackupAt(now);
  };

  const handleCloudBackup = async () => {
    setCloudBackupError(null);
    setCloudUploading(true);
    try {
      const summary = await uploadCloudBackup(db);
      setCloudBackups((prev) => [summary, ...(prev ?? [])]);
      markCloudBackedUp();
      showToast(`Backed up to JAMANVAAR Cloud (${(summary.sizeBytes / 1024).toFixed(0)} KB, compressed)`);
    } catch (err) {
      setCloudBackupError(
        err instanceof CloudApiError
          ? err.status === 503
            ? 'Cloud backup storage is not configured on the server yet — ask your platform administrator.'
            : err.message
          : 'Cloud backup failed — check your connection and try again.'
      );
    } finally {
      setCloudUploading(false);
    }
  };

  const handleExportJson = () => {
    // Wrapped with an identity/version marker so RestoreModal can actually validate a snapshot
    // (A01) and warn before restoring a different restaurant's backup (A03) — a raw `db` dump had
    // neither, so any JSON object that merely looked like it (or didn't look like it at all)
    // could be fed straight back into restore.
    const payload = {
      _backupSchema: BACKUP_SCHEMA_VERSION,
      _exportedAt: new Date().toISOString(),
      _restaurantId: db.restaurant?.id ?? null,
      _restaurantName: db.restaurant?.name ?? null,
      _outletId: db.outlet?.id ?? null,
      _outletName: db.outlet?.name ?? null,
      data: db
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `jamanvaar_db_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    markLocalExported();
    showToast('Database Backup JSON downloaded successfully!');
  };

  const hoursSinceLastLocalExport = lastLocalExportAt ? (Date.now() - lastLocalExportAt.getTime()) / (1000 * 60 * 60) : null;
  const hoursSinceLastCloudBackup = lastCloudBackupAt ? (Date.now() - lastCloudBackupAt.getTime()) / (1000 * 60 * 60) : null;
  const isBackupStale =
    (hoursSinceLastLocalExport === null || hoursSinceLastLocalExport > STALE_BACKUP_HOURS) &&
    (hoursSinceLastCloudBackup === null || hoursSinceLastCloudBackup > STALE_BACKUP_HOURS);

  const handleResetToSeed = () => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Reset Database to Seed State',
        message:
          'Are you sure you want to reset all data back to original factory demo seed? All custom orders and changes will be replaced.',
        confirmText: 'Reset Database',
        isDanger: true,
        onConfirm: () => {
          db.resetToDefaultSeed();
          showToast('Database reset to default demo seed!');
        }
      });
    } else {
      if (
        window.confirm(
          'Reset database to factory demo seed? This action will reset all active orders and items.'
        )
      ) {
        db.resetToDefaultSeed();
        showToast('Database reset to default demo seed!');
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy tracking-tight">
            Database Backup & Disaster Recovery
          </h1>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              cloudReady
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {cloudReady ? 'CLOUD BACKUP ENABLED' : 'LOCAL JSON — MANUAL EXPORT'}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
          {cloudReady
            ? "This restaurant is connected to JAMANVAAR Cloud — backups can be stored off-device, not just downloaded to this computer."
            : "Export this device's local database to a JSON file, restore from a previous export, or reset to factory demo seed. Connect to JAMANVAAR Cloud in Settings → Subscription Plan to enable real off-device backup."}
        </p>
      </div>

      <div
        className={`rounded-2xl p-4 border flex items-center gap-3 text-xs font-bold ${
          isBackupStale ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        {isBackupStale ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span className="flex flex-col gap-0.5">
          <span>
            {lastCloudBackupAt
              ? `Verified cloud backup: ${lastCloudBackupAt.toLocaleString()}`
              : 'No verified cloud backup for this restaurant/outlet yet.'}
          </span>
          <span className="font-normal text-[11px] opacity-80">
            {lastLocalExportAt
              ? `Downloaded local copy: ${lastLocalExportAt.toLocaleString()}`
              : 'No local JSON export downloaded yet.'}
            {isBackupStale ? ` — both over ${STALE_BACKUP_HOURS}h old, back up again` : ''}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* 0. Real off-device Cloud Backup */}
        <div
          className={`rounded-2xl p-5 sm:p-6 border shadow-2xs flex flex-col gap-4 ${
            cloudReady ? 'bg-white border-jaman-border' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-base text-jaman-navy">Cloud Backup (Off-Device)</h4>
                  {cloudReady && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cloudReady
                    ? 'Uploads a compressed snapshot to JAMANVAAR Cloud storage — survives this device failing entirely.'
                    : 'Requires a JAMANVAAR Cloud connection (Settings → Subscription Plan). Without it, backups only ever live on this one device.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleCloudBackup}
              disabled={!cloudReady || cloudUploading}
              className="min-h-11 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs shrink-0 cursor-pointer transition-colors"
            >
              <CloudUpload className="w-4 h-4" />
              <span>{cloudUploading ? 'Backing up…' : 'Backup to Cloud Now'}</span>
            </button>
          </div>

          {cloudBackupError && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {cloudBackupError}
            </div>
          )}

          {cloudReady && (
            <div className="border-t border-slate-100 pt-3">
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2">
                Recent cloud backups
              </div>
              {cloudHistoryLoading ? (
                <div className="text-xs text-slate-500">Loading backup history…</div>
              ) : cloudHistoryError ? (
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <span>{cloudHistoryError}</span>
                  <button type="button" className="underline shrink-0" onClick={loadCloudHistory}>Retry</button>
                </div>
              ) : cloudBackups && cloudBackups.length > 0 ? (
                <div className="space-y-1.5">
                  {cloudBackups.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-xs text-slate-600">
                      <span>{new Date(b.createdAt).toLocaleString()} · {b.method === 'AUTOMATIC' ? 'Automatic (device)' : 'Manual'}</span>
                      <span className="tabular-nums text-slate-500">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">No cloud backups recorded yet.</div>
              )}
            </div>
          )}
        </div>

        {/* 1. Export JSON */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-jaman-border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-jaman-navy flex items-center justify-center shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-base text-jaman-navy">Export Complete Database JSON</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Download a complete portable JSON snapshot containing all orders, menu items, BOM recipes, tables, customers, shifts, and settings.
              </p>
            </div>
          </div>
          <button
            onClick={handleExportJson}
            className="min-h-11 px-4 py-2.5 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs shrink-0 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download Backup JSON</span>
          </button>
        </div>

        {/* 2. Restore JSON */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-jaman-border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand/[0.07] text-brand flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-base text-jaman-navy">Restore Database Snapshot</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload and restore database state from a previously saved JAMANVAAR JSON snapshot file. Validates JSON schema before applying.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenRestoreModal}
            className="min-h-11 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-brand/25 shrink-0 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload & Restore</span>
          </button>
        </div>

        {/* 3. Factory Demo Reset -- only meaningful before a restaurant has real, cloud-synced data:
            it replaces the local menu/tables with a generic placeholder demo set, which used to look
            like it did nothing on a live restaurant (the very next sync pulled the real cloud menu
            straight back over it). Disabled once this console is actually connected to a restaurant's
            cloud account, rather than offering a button that either silently no-ops or, if "fixed" to
            push, would wipe real production data with placeholder dishes. */}
        <div className={`bg-white rounded-2xl p-5 sm:p-6 border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${cloudReady ? 'border-slate-200 opacity-60' : 'border-rose-200/80'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${cloudReady ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`font-bold text-base ${cloudReady ? 'text-slate-600' : 'text-rose-800'}`}>Factory Demo Seed Reset</h4>
                {!cloudReady && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                    Danger Zone
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {cloudReady
                  ? "Not available once connected to JAMANVAAR Cloud — this restaurant's real menu is shared with every device; replacing it locally with placeholder demo dishes would just be overwritten by the next sync anyway."
                  : 'Restores standard flagship dishes, tables, and categories. All current runtime orders, custom items, and shift records will be reset.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetToSeed}
            disabled={cloudReady}
            className="min-h-11 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 disabled:hover:bg-white border border-rose-300 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-rose-700 font-bold text-xs shrink-0 cursor-pointer transition-colors"
          >
            Reset Seed Data
          </button>
        </div>
      </div>
    </div>
  );
};
