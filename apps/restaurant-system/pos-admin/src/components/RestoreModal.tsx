import React, { useState, useRef } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import {
  db,
  AuditRepository,
  TableSync,
  MenuItemSync,
  CategorySync,
  ModifierGroupSync,
  TaxGroupSync,
  ComboSync
} from '@jamanvaar/database';
import { Upload, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { BACKUP_SCHEMA_VERSION } from './backup/BackupRestoreModule';
import { getCurrentAdminName } from '../currentAdminIdentity';

interface RestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

/** Every top-level key a real backup can carry, and the shape it must have if present. */
const KNOWN_FIELDS: Record<string, 'object' | 'array'> = {
  restaurant: 'object',
  outlet: 'object',
  menuItems: 'array',
  categories: 'array',
  tables: 'array',
  orders: 'array',
  inventoryItems: 'array',
  stockMovements: 'array',
  recipes: 'array',
  customerAccounts: 'array',
  users: 'array',
  roles: 'array',
  configuredPrinters: 'array',
  license: 'object',
  shifts: 'array',
  cashMovements: 'array',
  kots: 'array',
  taxGroups: 'array',
  modifierGroups: 'array',
  combos: 'array',
  receiptConfig: 'object',
  loyaltyTiers: 'array',
  loyaltyRewards: 'array',
  loyaltyProgramSettings: 'array'
};

type BackupMeta = {
  restaurantId: string | null;
  restaurantName: string | null;
  exportedAt: string | null;
  isLegacyFormat: boolean;
};

/**
 * Real validation (A01): a plain object that merely parses as JSON is not a backup. The current
 * export wraps its payload with `_backupSchema`; that's the strict path. A file exported before
 * this fix shipped has no wrapper, so it's still accepted if it has a real majority of the known
 * fields in the right shape — but flagged as legacy (no identity check possible) rather than
 * silently trusted the same as a current, wrapper-verified export. Anything else (including an
 * unrelated JSON object with none of these fields) is rejected outright.
 */
function validateBackupFile(parsed: unknown): { ok: true; data: Record<string, unknown>; meta: BackupMeta } | { ok: false; reason: string } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'Invalid backup file: must be a JSON object.' };
  }
  const obj = parsed as Record<string, unknown>;

  if (obj._backupSchema === BACKUP_SCHEMA_VERSION) {
    const data = obj.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, reason: 'This backup file is marked as a JAMANVAAR export but has no data section.' };
    }
    return {
      ok: true,
      data: data as Record<string, unknown>,
      meta: {
        restaurantId: typeof obj._restaurantId === 'string' ? obj._restaurantId : null,
        restaurantName: typeof obj._restaurantName === 'string' ? obj._restaurantName : null,
        exportedAt: typeof obj._exportedAt === 'string' ? obj._exportedAt : null,
        isLegacyFormat: false
      }
    };
  }

  if (obj._backupSchema !== undefined) {
    return { ok: false, reason: `This backup is schema "${String(obj._backupSchema)}", which this version of JAMANVAAR does not recognize.` };
  }

  // No wrapper at all — check it actually looks like a raw database dump before accepting it as
  // a legacy-format backup. `{"unrelated": "..."}` matches none of these and is rejected here.
  let matched = 0;
  for (const [key, kind] of Object.entries(KNOWN_FIELDS)) {
    const value = obj[key];
    if (value === undefined) continue;
    if (kind === 'array' ? Array.isArray(value) : typeof value === 'object' && value !== null && !Array.isArray(value)) matched++;
  }
  if (matched < 3) {
    return { ok: false, reason: "This doesn't look like a JAMANVAAR backup file — none of the expected sections (menu, tables, orders, restaurant…) were found." };
  }

  const restaurant = obj.restaurant as { id?: unknown; name?: unknown } | undefined;
  return {
    ok: true,
    data: obj,
    meta: {
      restaurantId: restaurant && typeof restaurant.id === 'string' ? restaurant.id : null,
      restaurantName: restaurant && typeof restaurant.name === 'string' ? restaurant.name : null,
      exportedAt: null,
      isLegacyFormat: true
    }
  };
}

/** How many records this restore will add vs. drop for a shared/synced collection, by id. */
function diffCounts(current: Array<{ id: string }>, incoming: unknown): { added: number; removed: number; kept: number } | null {
  if (!Array.isArray(incoming)) return null;
  const currentIds = new Set(current.map((r) => r.id));
  const incomingIds = new Set((incoming as Array<{ id: string }>).map((r) => r.id));
  let added = 0, kept = 0;
  for (const id of incomingIds) (currentIds.has(id) ? kept++ : added++);
  let removed = 0;
  for (const id of currentIds) if (!incomingIds.has(id)) removed++;
  return { added, removed, kept };
}

export const RestoreModal: React.FC<RestoreModalProps> = ({
  isOpen,
  onClose,
  onRestored
}) => {
  const [parsedData, setParsedData] = useState<Record<string, unknown> | null>(null);
  const [backupMeta, setBackupMeta] = useState<BackupMeta | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const applyingRef = useRef(false);

  const resetSelection = () => {
    setParsedData(null);
    setBackupMeta(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    if (applyingRef.current) return;
    resetSelection();
    setFileName('');
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clear everything from any previously selected file FIRST (A02): a bad replacement file used
    // to leave the earlier accepted file's data in place with Apply still enabled, because parsedData
    // was only ever touched on a *successful* parse.
    resetSelection();
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result as string;
        const parsed = JSON.parse(raw);
        const result = validateBackupFile(parsed);
        if (!result.ok) {
          setErrorMsg(result.reason);
          return;
        }
        setParsedData(result.data);
        setBackupMeta(result.meta);
      } catch (err: any) {
        setErrorMsg(`Failed to parse JSON file: ${err.message}`);
      }
    };
    reader.onerror = () => setErrorMsg('Could not read this file.');
    reader.readAsText(file);
  };

  const isForeignRestaurant = !!(backupMeta?.restaurantId && db.restaurant?.id && backupMeta.restaurantId !== db.restaurant.id);
  const canApply = !!parsedData && !isForeignRestaurant && !isApplying;

  const menuDiff = parsedData ? diffCounts(db.menuItems, parsedData.menuItems) : null;
  const categoryDiff = parsedData ? diffCounts(db.categories, parsedData.categories) : null;
  const tableDiff = parsedData ? diffCounts(db.tables, parsedData.tables) : null;

  const handleApplyRestore = async () => {
    if (!canApply || !parsedData || applyingRef.current) return;
    applyingRef.current = true; setIsApplying(true);
    try { await db.assertOperationalRestoreSafe(parsedData); }
    catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Restore safety checks failed; no data was changed.');
      applyingRef.current = false; setIsApplying(false); return;
    }

    // A best-effort local safety net (not a server backup): the state right before this restore,
    // so a mistaken restore can at least be inspected/recovered from this device's storage. Never
    // blocks the restore itself if storage is full or unavailable.
    try {
      const snapshot = JSON.stringify({ _backupSchema: BACKUP_SCHEMA_VERSION, _exportedAt: new Date().toISOString(), _preRestoreSafetySnapshot: true, data: db.exportOperationalSnapshot() });
      localStorage.setItem(`jamanvaar_pre_restore_snapshot:${db.restaurant?.id ?? 'unknown'}`, snapshot);
    } catch {
      // Quota or storage unavailable — proceed anyway; this is a best-effort safety net, not the only copy.
    }

    try {
      if (parsedData.restaurant) db.restaurant = { ...db.restaurant, ...(parsedData.restaurant as object) };
      if (parsedData.outlet) db.outlet = { ...db.outlet, ...(parsedData.outlet as object) };
      // A restore that just replaced the array looked like it did nothing on a cloud-connected
      // restaurant -- the sync engine only ever pushes content it can see changed on a record it still
      // has, so a dish the restore meant to remove silently reappeared on the very next pull (nothing
      // told the cloud it was deleted). Recording each dropped id's deletion first, exactly the way the
      // table restore just below already does, is what makes the sync engine actually propagate the
      // removal instead of only ever adding things back.
      if (Array.isArray(parsedData.menuItems)) {
        const kept = new Set((parsedData.menuItems as Array<{ id: string }>).map((m) => m.id));
        db.menuItems.filter((m) => !kept.has(m.id)).forEach((m) => MenuItemSync.recordDeletion(m.id));
        db.menuItems = parsedData.menuItems as typeof db.menuItems;
      }
      if (Array.isArray(parsedData.categories)) {
        const kept = new Set((parsedData.categories as Array<{ id: string }>).map((c) => c.id));
        db.categories.filter((c) => !kept.has(c.id)).forEach((c) => CategorySync.recordDeletion(c.id));
        db.categories = parsedData.categories as typeof db.categories;
      }
      if (Array.isArray(parsedData.tables)) {
        // A restore is a deliberate replacement of the floor: the tables it drops are deleted for every device (nothing else infers a deletion).
        const kept = new Set((parsedData.tables as Array<{ id: string }>).map((t) => t.id));
        db.tables.filter((t) => !kept.has(t.id)).forEach((t) => TableSync.recordDeletion(t.id));
        db.tables = parsedData.tables as typeof db.tables;
        db.floorPlanStartedEmpty = true;
      }
      if (Array.isArray(parsedData.modifierGroups)) {
        const kept = new Set((parsedData.modifierGroups as Array<{ id: string }>).map((m) => m.id));
        db.modifierGroups.filter((m) => !kept.has(m.id)).forEach((m) => ModifierGroupSync.recordDeletion(m.id));
        db.modifierGroups = parsedData.modifierGroups as typeof db.modifierGroups;
      }
      if (Array.isArray(parsedData.taxGroups)) {
        const kept = new Set((parsedData.taxGroups as Array<{ id: string }>).map((t) => t.id));
        db.taxGroups.filter((t) => !kept.has(t.id)).forEach((t) => TaxGroupSync.recordDeletion(t.id));
        db.taxGroups = parsedData.taxGroups as typeof db.taxGroups;
      }
      if (Array.isArray(parsedData.combos)) {
        const kept = new Set((parsedData.combos as Array<{ id: string }>).map((c) => c.id));
        db.combos.filter((c) => !kept.has(c.id)).forEach((c) => ComboSync.recordDeletion(c.id));
        db.combos = parsedData.combos as typeof db.combos;
      }
      if (parsedData.receiptConfig) db.receiptConfig = { ...db.receiptConfig, ...(parsedData.receiptConfig as object) };
      if (Array.isArray(parsedData.loyaltyTiers)) db.loyaltyTiers = parsedData.loyaltyTiers as typeof db.loyaltyTiers;
      if (Array.isArray(parsedData.loyaltyRewards)) db.loyaltyRewards = parsedData.loyaltyRewards as typeof db.loyaltyRewards;
      if (Array.isArray(parsedData.loyaltyProgramSettings)) db.loyaltyProgramSettings = parsedData.loyaltyProgramSettings as typeof db.loyaltyProgramSettings;
      if (Array.isArray(parsedData.orders)) db.orders = parsedData.orders as typeof db.orders;
      if (Array.isArray(parsedData.inventoryItems)) db.inventoryItems = parsedData.inventoryItems as typeof db.inventoryItems;
      if (Array.isArray(parsedData.stockMovements)) db.stockMovements = parsedData.stockMovements as typeof db.stockMovements;
      if (Array.isArray(parsedData.recipes)) db.recipes = parsedData.recipes as typeof db.recipes;
      if (Array.isArray(parsedData.customerAccounts)) db.customerAccounts = parsedData.customerAccounts as typeof db.customerAccounts;
      // Staff permissions and license authorization are not portable business
      // data. Keep the account's current authenticated configuration.
      if (Array.isArray(parsedData.configuredPrinters)) db.configuredPrinters = parsedData.configuredPrinters as typeof db.configuredPrinters;
      if (Array.isArray(parsedData.shifts)) db.shifts = parsedData.shifts as typeof db.shifts;
      if (Array.isArray(parsedData.cashMovements)) db.cashMovements = parsedData.cashMovements as typeof db.cashMovements;
      if (Array.isArray(parsedData.kots)) db.kots = parsedData.kots as typeof db.kots;

      AuditRepository.log({
        action: 'DATABASE_RESTORE',
        category: 'SETTINGS',
        details: `Restored database snapshot from file "${fileName}"${backupMeta?.exportedAt ? ` (exported ${new Date(backupMeta.exportedAt).toLocaleString()})` : ''}${isForeignRestaurant ? ' — WARNING: backup was from a different restaurant, restored with explicit operator confirmation' : ''}`,
        username: getCurrentAdminName()
      });

      db.notify();
      onRestored();
      applyingRef.current = false;
      handleClose();
    } catch (err: any) {
      setErrorMsg(`Restore failed during state commit: ${err.message}. Review the current state before retrying; the local safety snapshot is best-effort.`);
    } finally { applyingRef.current = false; setIsApplying(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Restore Database from JSON Snapshot" maxWidth="lg">
      <div className="space-y-4 py-1">
        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed font-semibold">
            <strong>Review before importing:</strong> Menu and table changes can reach other connected devices. This JSON importer cannot replace live financial history or SQLite replay history, change restaurant/branch ownership, or replace staff permissions and licensing. Complete device recovery uses an encrypted recovery file and an empty compatible target.
          </p>
        </div>

        {/* File Picker */}
        <div className="p-6 border-2 border-dashed border-slate-300 rounded-2xl text-center space-y-3 bg-jaman-ivory">
          <Upload className="w-8 h-8 text-slate-500 mx-auto" />
          <div>
            <label className="cursor-pointer px-4 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold rounded-xl shadow-xs inline-block transition-all">
              Choose JSON Backup File
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
            {fileName && (
              <span className="text-xs text-slate-600 block mt-2 font-mono">
                Selected: <strong>{fileName}</strong>
              </span>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-semibold">
            {errorMsg}
          </div>
        )}

        {isForeignRestaurant && (
          <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-2">
            <h4 className="font-bold text-xs text-rose-800 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>This backup is from a different restaurant</span>
            </h4>
            <p className="text-xs text-rose-700">
              This file was exported from <strong>{backupMeta?.restaurantName || backupMeta?.restaurantId}</strong>, not the restaurant
              currently open here (<strong>{db.restaurant?.name}</strong>). Restoring it will overwrite this restaurant's menu, orders and
              settings with that other restaurant's data.
            </p>
            <p className="text-xs font-bold text-rose-800">Choose a snapshot from this restaurant and branch. Changing ownership through a backup import is not supported.</p>
          </div>
        )}

        {backupMeta?.isLegacyFormat && parsedData && (
          <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl">
            This file was exported before identity-checked backups existed, so it cannot be confirmed as belonging to this restaurant.
            Proceed only if you made this file yourself.
          </div>
        )}

        {/* Preview Summary */}
        {parsedData && (
          <div className="p-4 bg-white border border-jaman-border rounded-2xl space-y-2">
            <h4 className="font-bold text-xs text-jaman-navy flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Snapshot contents{backupMeta?.exportedAt ? ` — exported ${new Date(backupMeta.exportedAt).toLocaleString()}` : ''}:</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Menu Dishes</span>
                <span className="tabular-nums font-bold text-jaman-navy">{(parsedData.menuItems as unknown[])?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Categories</span>
                <span className="tabular-nums font-bold text-jaman-navy">{(parsedData.categories as unknown[])?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Orders Ledger</span>
                <span className="tabular-nums font-bold text-jaman-navy">{(parsedData.orders as unknown[])?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Inventory Items</span>
                <span className="tabular-nums font-bold text-jaman-navy">{(parsedData.inventoryItems as unknown[])?.length || 0}</span>
              </div>
            </div>
            {(menuDiff || categoryDiff || tableDiff) && (
              <div className="pt-2 border-t border-jaman-border space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Compared to what's here now</div>
                {menuDiff && (
                  <div className="text-xs text-slate-700">
                    Dishes: <span className="font-bold text-emerald-700">+{menuDiff.added} new</span>,{' '}
                    <span className="font-bold text-rose-700">-{menuDiff.removed} removed</span>, {menuDiff.kept} unchanged
                  </div>
                )}
                {categoryDiff && (
                  <div className="text-xs text-slate-700">
                    Categories: <span className="font-bold text-emerald-700">+{categoryDiff.added} new</span>,{' '}
                    <span className="font-bold text-rose-700">-{categoryDiff.removed} removed</span>, {categoryDiff.kept} unchanged
                  </div>
                )}
                {tableDiff && (
                  <div className="text-xs text-slate-700">
                    Tables: <span className="font-bold text-emerald-700">+{tableDiff.added} new</span>,{' '}
                    <span className="font-bold text-rose-700">-{tableDiff.removed} removed</span>, {tableDiff.kept} unchanged
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <button
            disabled={!canApply}
            onClick={handleApplyRestore}
            className="min-h-11 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl shadow-xs transition-all active:scale-95"
          >
            Apply & Restore Snapshot
          </button>
        </div>
      </div>
    </Modal>
  );
};
