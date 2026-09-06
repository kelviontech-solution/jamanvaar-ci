import React, { useEffect, useState } from 'react';
import { db } from '@jamanvaar/database';
import {
  Database,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileJson,
  CloudUpload,
  Cloud
} from 'lucide-react';
import {
  isCloudConnected,
  isCloudLoggedIn,
  uploadCloudBackup,
  fetchCloudBackups,
  CloudApiError,
  type CloudBackupSummary
} from '../../cloud/cloudClient';

const LAST_BACKUP_KEY = 'jamanvaar_pos_admin_last_backup_at';
const STALE_BACKUP_HOURS = 24;

function readLastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
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
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(readLastBackupAt());
  const [cloudBackups, setCloudBackups] = useState<CloudBackupSummary[]>([]);
  const [cloudUploading, setCloudUploading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState<string | null>(null);
  const cloudReady = isCloudConnected() && isCloudLoggedIn();

  useEffect(() => {
    if (cloudReady) {
      fetchCloudBackups().then(setCloudBackups).catch(() => {});
    }
  }, [cloudReady]);

  const markBackedUp = () => {
    const now = new Date();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
    } catch {
      // localStorage can be unavailable (private mode, quota) — the backup
      // itself already succeeded, only the "last backup" reminder is lost.
    }
    setLastBackupAt(now);
  };

  const handleCloudBackup = async () => {
    setCloudBackupError(null);
    setCloudUploading(true);
    try {
      const summary = await uploadCloudBackup(db);
      setCloudBackups((prev) => [summary, ...prev]);
      markBackedUp();
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
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `jamanvaar_db_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    markBackedUp();
    showToast('Database Backup JSON downloaded successfully!');
  };

  const hoursSinceLastBackup = lastBackupAt ? (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60) : null;
  const isBackupStale = hoursSinceLastBackup === null || hoursSinceLastBackup > STALE_BACKUP_HOURS;

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
          <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
            Database Backup & Disaster Recovery
          </h1>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
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
        <span>
          {lastBackupAt
            ? `Last backup on this device: ${lastBackupAt.toLocaleString()}${isBackupStale ? ` — over ${STALE_BACKUP_HOURS}h ago, back up again` : ''}`
            : 'No backup has been taken on this device yet.'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* 0. Real off-device Cloud Backup */}
        <div
          className={`rounded-2xl p-5 sm:p-6 border shadow-2xs flex flex-col gap-4 ${
            cloudReady ? 'bg-white border-[#EBE6DD]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-base text-[#0B253A]">Cloud Backup (Off-Device)</h4>
                  {cloudReady && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
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
              className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs shrink-0 cursor-pointer transition-colors"
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

          {cloudReady && cloudBackups.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Recent cloud backups
              </div>
              <div className="space-y-1.5">
                {cloudBackups.slice(0, 5).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{new Date(b.createdAt).toLocaleString()} · {b.method === 'AUTOMATIC' ? 'Automatic (device)' : 'Manual'}</span>
                    <span className="font-mono text-slate-400">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 1. Export JSON */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#0B253A] flex items-center justify-center shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-base text-[#0B253A]">Export Complete Database JSON</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
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
            className="px-4 py-2.5 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs shrink-0 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download Backup JSON</span>
          </button>
        </div>

        {/* 2. Restore JSON */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-extrabold text-base text-[#0B253A]">Restore Database Snapshot</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload and restore database state from a previously saved JAMANVAAR JSON snapshot file. Validates JSON schema before applying.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenRestoreModal}
            className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-[#E66817]/25 shrink-0 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload & Restore</span>
          </button>
        </div>

        {/* 3. Factory Demo Reset */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-rose-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-base text-rose-800">Factory Demo Seed Reset</h4>
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                  Danger Zone
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Restores standard flagship dishes, tables, and categories. All current runtime orders, custom items, and shift records will be reset.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetToSeed}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-bold text-xs shrink-0 cursor-pointer transition-colors"
          >
            Reset Seed Data
          </button>
        </div>
      </div>
    </div>
  );
};
