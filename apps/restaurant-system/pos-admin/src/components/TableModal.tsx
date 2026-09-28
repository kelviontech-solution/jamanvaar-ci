import React, { useState, useEffect } from 'react';
import { DiningTable, TableStatus } from '@jamanvaar/types';
import { Modal, Button } from '@jamanvaar/ui';
import { TableRepository, planBulkTables } from '@jamanvaar/database';

interface TableModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableToEdit: DiningTable | null;
  /** `message` says what happened when it is more than one table (for the toast). */
  onSaved: (message?: string) => void;
}

export const TableModal: React.FC<TableModalProps> = ({
  isOpen,
  onClose,
  tableToEdit,
  onSaved
}) => {
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const zones = TableRepository.getZones();
  const defaultZone = zones[0] || 'Main Hall';
  const [zone, setZone] = useState(defaultZone);
  // The zone list is the restaurant's own (BUG-116); "New zone" lets it add one.
  const [addingZone, setAddingZone] = useState(false);
  const [floor, setFloor] = useState('1');
  const [status, setStatus] = useState<TableStatus>('AVAILABLE');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  // Several tables at once: a first number, how many, and an optional prefix.
  const [bulk, setBulk] = useState(false);
  const [bulkCount, setBulkCount] = useState('10');
  const [bulkPrefix, setBulkPrefix] = useState('');

  useEffect(() => {
    if (tableToEdit) {
      setTableNumber(tableToEdit.tableNumber);
      setCapacity(tableToEdit.capacity.toString());
      setZone(tableToEdit.zone || defaultZone);
      setAddingZone(false);
      setFloor((tableToEdit.floor || 1).toString());
      setStatus(tableToEdit.status);
      setIsActive(tableToEdit.isActive ?? true);
    } else {
      setBulk(false);
      setBulkCount('10');
      setBulkPrefix('');
      setTableNumber('');
      setCapacity('4');
      setZone(defaultZone);
      setAddingZone(zones.length === 0);
      setFloor('1');
      setStatus('AVAILABLE');
      setIsActive(true);
    }
  }, [tableToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const trimmedNumber = tableNumber.trim();
    if (!zone.trim()) {
      setFormError('Choose a zone, or enter a name for a new one.');
      return;
    }
    if (!trimmedNumber) {
      setFormError('Table number is required.');
      return;
    }
    // B2-016/B2-028: a table number carrying `<b>x</b>` propagated verbatim to POS/Captain/KDS
    // tickets, QR codes and printed receipts, none of which render through React's own escaping.
    if (/[<>]/.test(trimmedNumber)) {
      setFormError('Table number cannot contain < or > characters.');
      return;
    }
    if (bulk && !tableToEdit) {
      const plan = planBulkTables(trimmedNumber, Number(bulkCount), bulkPrefix, (n) => TableRepository.isTableNumberTaken(n));
      if (plan.error) {
        setFormError(plan.error);
        return;
      }
      plan.create.forEach((number) => TableRepository.createTable({ tableNumber: number, capacity: Number(capacity) || 4, zone, floor: Number(floor) || 1, status, isActive }));
      onSaved(`${plan.create.length} tables created${plan.skipped.length ? `, ${plan.skipped.length} skipped because they already exist (${plan.skipped.slice(0, 5).join(', ')}${plan.skipped.length > 5 ? '…' : ''})` : ''}`);
      onClose();
      return;
    }
    if (TableRepository.isTableNumberTaken(trimmedNumber, tableToEdit?.id)) {
      setFormError(`Table ${trimmedNumber} already exists. Choose a different number.`);
      return;
    }

    if (tableToEdit) {
      TableRepository.updateTable(tableToEdit.id, {
        tableNumber: trimmedNumber,
        capacity: Number(capacity) || 4,
        zone,
        floor: Number(floor) || 1,
        status,
        isActive
      });
    } else {
      TableRepository.createTable({
        tableNumber: trimmedNumber,
        capacity: Number(capacity) || 4,
        zone,
        floor: Number(floor) || 1,
        status,
        isActive
      });
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tableToEdit ? `Edit Table: T-${tableToEdit.tableNumber}` : 'Add New Dining Table'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{bulk && !tableToEdit ? 'First Table Number *' : 'Table Number *'}</label>
            <input
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 15"
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Seating Capacity (Guests)</label>
            <input
              type="number"
              min="1"
              max="30"
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        {!tableToEdit && (
          <div className="rounded-xl border border-jaman-border bg-jaman-ivory p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} className="rounded accent-jaman-saffron" />
              <span>Add several tables at once</span>
            </label>
            {bulk && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">How many</label>
                  <input type="number" min="1" max="50" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Prefix (optional)</label>
                  <input type="text" maxLength={6} value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="e.g. T" className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-jaman-saffron" />
                </div>
                <p className="col-span-2 text-[11px] text-slate-500">
                  Creates {bulkPrefix.trim()}{tableNumber.trim() || '1'}, {bulkPrefix.trim()}{(Number.parseInt(tableNumber.trim() || '1', 10) || 0) + 1}, … with the same seats, zone and floor. Numbers that already exist are skipped.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dining Zone / Section</label>
            {addingZone ? (
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="e.g. Garden Terrace"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
              />
            ) : (
              <select
                value={zones.includes(zone) ? zone : '__new__'}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setAddingZone(true);
                    setZone('');
                  } else {
                    setZone(e.target.value);
                  }
                }}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
              >
                {zones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
                <option value="__new__">＋ New zone…</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Floor Level</label>
            <select
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
            >
              <option value="1">Floor 1 (Ground)</option>
              <option value="2">Floor 2 (First)</option>
              <option value="3">Rooftop</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Initial Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TableStatus)}
            className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          >
            <option value="AVAILABLE">🟢 AVAILABLE (Vacant)</option>
            <option value="OCCUPIED">🟠 OCCUPIED (Seated)</option>
            <option value="RESERVED">🔵 RESERVED</option>
            <option value="CLEANING">🟡 CLEANING / RESET</option>
          </select>
        </div>

        {formError && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <button
            type="submit"
            className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95"
          >
            {tableToEdit ? 'Save Changes' : bulk ? `Create ${Number(bulkCount) > 0 ? bulkCount : ''} Tables`.replace('  ', ' ') : 'Create Table'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
