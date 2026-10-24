import React, { useEffect, useMemo, useState } from 'react';
import { Modal, sound, useConfirm } from '@jamanvaar/ui';
import { db } from '@jamanvaar/database';
import type { DiningTable } from '@jamanvaar/types';
import { holdLabel, tableHold } from '@jamanvaar/business';
import { LayoutGrid, Users } from 'lucide-react';
import { usePosStore } from '../../store/posStore';

/**
 * Table choosing for the billing screen. Tables come straight from `db.tables` (re-read on every
 * database change), so a table the admin adds, renames, moves to another zone or deactivates shows
 * up here without a reload.
 *
 *  - Free table    -> becomes the order's table (same call the Floor Plan uses).
 *  - Running table -> loads its open order so new dishes are added to it (same as "Add Dishes").
 *  - Reserved / billing / cleaning / blocked -> visible but not selectable, with the reason in words.
 */
const STATUS: Record<string, { label: string; tile: string; pill: string; selectable: boolean }> = {
  AVAILABLE: { label: 'Free', tile: 'border-emerald-300 hover:border-emerald-500 bg-white', pill: 'bg-emerald-100 text-emerald-800', selectable: true },
  OCCUPIED: { label: 'Running', tile: 'border-jaman-navy/40 hover:border-jaman-navy bg-white', pill: 'bg-jaman-navy text-white', selectable: true },
  BILL_REQUESTED: { label: 'Bill asked', tile: 'border-teal-300 bg-slate-50', pill: 'bg-teal-600 text-white', selectable: false },
  BILLING: { label: 'Billing', tile: 'border-violet-300 bg-slate-50', pill: 'bg-violet-600 text-white', selectable: false },
  RESERVED: { label: 'Reserved', tile: 'border-purple-300 bg-slate-50', pill: 'bg-purple-100 text-purple-800', selectable: false },
  CLEANING: { label: 'Cleaning', tile: 'border-amber-300 bg-slate-50', pill: 'bg-amber-100 text-amber-800', selectable: false },
  BLOCKED: { label: 'Blocked', tile: 'border-rose-300 bg-slate-50', pill: 'bg-rose-100 text-rose-800', selectable: false }
};

/** Zone filter + tile grid. Used by the popup and by the full-screen first step. */
export const PosTableGrid: React.FC<{ onChosen?: () => void; large?: boolean }> = ({ onChosen, large = false }) => {
  const { selectedTable, setSelectedTable, loadOrderFromTable } = usePosStore() as any;
  const { notify, confirmDialog } = useConfirm();
  const [, tick] = useState(0);
  const [zone, setZone] = useState('ALL');

  // Re-read the tables whenever the database changes.
  useEffect(() => db.subscribe(() => tick((n) => n + 1)), []);

  const tables: DiningTable[] = db.tables.filter((t) => t.isActive !== false);
  const zoneKey = tables.map((t) => t.zone).join('|');
  const zones = useMemo(
    () => Array.from(new Set(tables.map((t) => t.zone).filter(Boolean))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneKey]
  );
  const visible = tables
    .filter((t) => zone === 'ALL' || t.zone === zone)
    .sort((a, b) => String(a.zone).localeCompare(String(b.zone)) || a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));

  const choose = async (table: DiningTable) => {
    sound.play('click');
    if (table.status === 'OCCUPIED' && table.currentOrderId) {
      const result = loadOrderFromTable(table);
      if (!result.ok) { await notify({ title: 'Cannot open this table yet', message: result.reason }); return; }
    } else {
      setSelectedTable(table);
    }
    onChosen?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by zone">
        {['ALL', ...zones].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZone(z)}
            aria-pressed={zone === z}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold border transition-colors ${
              zone === z ? 'bg-jaman-saffron text-white border-jaman-saffron' : 'bg-white text-slate-700 border-jaman-border hover:border-slate-400'
            }`}
          >
            {z === 'ALL' ? 'All zones' : z}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-600 py-10 text-center">
          No tables yet. Tables added in Restaurant Admin appear here automatically.
        </p>
      ) : (
        <ul
          className={`grid gap-2.5 ${large ? 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]'}`}
          aria-label="Tables"
        >
          {visible.map((t) => {
            const hold = t.status === 'AVAILABLE' && !t.currentOrderId ? tableHold(db.reservations, t, new Date()) : undefined;
            const st = hold ? STATUS.RESERVED : STATUS[t.status] ?? STATUS.BLOCKED;
            const selected = selectedTable?.id === t.id;
            const label = hold ? holdLabel(hold) : st.label;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={!st.selectable}
                  onClick={() => choose(t)}
                  aria-pressed={selected}
                  aria-label={`Table ${t.tableNumber}, ${t.zone || 'Hall'}, ${t.capacity} seats, ${label}${selected ? ', selected' : ''}`}
                  className={`w-full ${large ? 'min-h-[120px]' : 'min-h-[92px]'} rounded-2xl border-2 p-3 text-left flex flex-col justify-between transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 ${st.tile} ${
                    selected ? 'ring-2 ring-jaman-saffron ring-offset-1' : ''
                  }`}
                >
                  <span className={`${large ? 'text-2xl' : 'text-xl'} font-black text-jaman-navy leading-none break-words`}>T-{t.tableNumber}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-600 font-semibold">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {t.capacity} seats
                    {t.currentGuests ? <span className="font-bold text-jaman-navy">· {t.currentGuests} guests</span> : null}
                  </span>
                  <span className={`self-start text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${st.pill}`}>
                    {selected ? 'Selected' : label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** "Change table" popup shown over the cart. */
export const PosTablePickerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { selectedTable, setSelectedTable, setActiveTab } = usePosStore() as any;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select table" maxWidth="3xl" bodyClassName="!p-4">
      <div className="space-y-3">
        <PosTableGrid onChosen={onClose} />
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => { onClose(); setActiveTab('TABLES'); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-jaman-navy hover:text-jaman-saffronText min-h-[36px]"
          >
            <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            Open full floor plan
          </button>
          {selectedTable && (
            <button
              type="button"
              onClick={() => { setSelectedTable(null); onClose(); }}
              className="text-xs font-bold text-rose-700 hover:underline min-h-[36px]"
            >
              Clear table
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
