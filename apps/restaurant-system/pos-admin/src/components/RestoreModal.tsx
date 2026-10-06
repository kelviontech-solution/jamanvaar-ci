import React, { useState } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { db, AuditRepository, TableSync } from '@jamanvaar/database';
import { Upload, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

interface RestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

export const RestoreModal: React.FC<RestoreModalProps> = ({
  isOpen,
  onClose,
  onRestored
}) => {
  const [parsedData, setParsedData] = useState<any>(null);
  const [fileName, setFileName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result as string;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') {
          setErrorMsg('Invalid backup file: Must be a valid JSON object.');
          return;
        }
        setParsedData(data);
      } catch (err: any) {
        setErrorMsg(`Failed to parse JSON file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyRestore = () => {
    if (!parsedData) return;

    try {
      if (parsedData.restaurant) db.restaurant = { ...db.restaurant, ...parsedData.restaurant };
      if (parsedData.outlet) db.outlet = { ...db.outlet, ...parsedData.outlet };
      if (Array.isArray(parsedData.menuItems)) db.menuItems = parsedData.menuItems;
      if (Array.isArray(parsedData.categories)) db.categories = parsedData.categories;
      if (Array.isArray(parsedData.tables)) {
        // A restore is a deliberate replacement of the floor: the tables it drops are deleted for every device (nothing else infers a deletion).
        const kept = new Set((parsedData.tables as Array<{ id: string }>).map((t) => t.id));
        db.tables.filter((t) => !kept.has(t.id)).forEach((t) => TableSync.recordDeletion(t.id));
        db.tables = parsedData.tables;
        db.floorPlanStartedEmpty = true;
      }
      if (Array.isArray(parsedData.orders)) db.orders = parsedData.orders;
      if (Array.isArray(parsedData.inventoryItems)) db.inventoryItems = parsedData.inventoryItems;
      if (Array.isArray(parsedData.stockMovements)) db.stockMovements = parsedData.stockMovements;
      if (Array.isArray(parsedData.recipes)) db.recipes = parsedData.recipes;
      if (Array.isArray(parsedData.customerAccounts)) db.customerAccounts = parsedData.customerAccounts;
      if (Array.isArray(parsedData.users)) db.users = parsedData.users;
      if (Array.isArray(parsedData.roles)) db.roles = parsedData.roles;
      if (Array.isArray(parsedData.configuredPrinters)) db.configuredPrinters = parsedData.configuredPrinters;
      if (parsedData.license) db.license = parsedData.license;
      if (Array.isArray(parsedData.shifts)) db.shifts = parsedData.shifts;
      if (Array.isArray(parsedData.cashMovements)) db.cashMovements = parsedData.cashMovements;
      if (Array.isArray(parsedData.kots)) db.kots = parsedData.kots;

      AuditRepository.log({
        action: 'DATABASE_RESTORE',
        category: 'SETTINGS',
        details: `Restored database snapshot from file "${fileName}"`,
        username: 'Manager'
      });

      db.notify();
      onRestored();
      onClose();
    } catch (err: any) {
      setErrorMsg(`Restore failed during state commit: ${err.message}`);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Restore Database from JSON Snapshot" maxWidth="lg">
      <div className="space-y-4 py-1">
        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed font-semibold">
            <strong>Warning:</strong> Restoring a backup snapshot will replace your active menu, orders, inventory, and table layout with the contents of the file. Please ensure you have a current export before proceeding.
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

        {/* Preview Summary */}
        {parsedData && (
          <div className="p-4 bg-white border border-jaman-border rounded-2xl space-y-2">
            <h4 className="font-bold text-xs text-jaman-navy flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Snapshot Contents Validated:</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Menu Dishes</span>
                <span className="tabular-nums font-bold text-jaman-navy">{parsedData.menuItems?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Categories</span>
                <span className="tabular-nums font-bold text-jaman-navy">{parsedData.categories?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Orders Ledger</span>
                <span className="tabular-nums font-bold text-jaman-navy">{parsedData.orders?.length || 0}</span>
              </div>
              <div className="p-2 bg-jaman-ivory rounded-lg">
                <span className="text-slate-500 block text-[11px]">Inventory Items</span>
                <span className="tabular-nums font-bold text-jaman-navy">{parsedData.inventoryItems?.length || 0}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <button
            disabled={!parsedData}
            onClick={handleApplyRestore}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            Apply & Restore Snapshot
          </button>
        </div>
      </div>
    </Modal>
  );
};
