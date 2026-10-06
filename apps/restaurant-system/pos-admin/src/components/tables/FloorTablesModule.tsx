import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DiningTable, Order } from '@jamanvaar/types';
import { TableRepository } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import {
  Plus,
  Grid,
  Users,
  Edit2,
  Trash2,
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  Check
} from 'lucide-react';

type TableStatusValue = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';

const TABLE_STATUS_OPTIONS: { value: TableStatusValue; label: string; dot: string }[] = [
  { value: 'AVAILABLE', label: 'Available', dot: 'bg-emerald-500' },
  { value: 'OCCUPIED', label: 'Occupied', dot: 'bg-brand' },
  { value: 'RESERVED', label: 'Reserved', dot: 'bg-sky-500' },
  { value: 'CLEANING', label: 'Cleaning', dot: 'bg-amber-500' }
];

/** Styled replacement for the native status <select>, whose popup cannot be themed. Keyboard and screen-reader friendly. */
function TableStatusMenu({ value, label, onChange }: { value: string; label: string; onChange: (v: TableStatusValue) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = TABLE_STATUS_OPTIONS.find((o) => o.value === value) ?? TABLE_STATUS_OPTIONS[0];

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = TABLE_STATUS_OPTIONS.length * 36 + 12;
    const flip = window.innerHeight - r.bottom < menuH + 12 && r.top > menuH + 12;
    setPos({ left: r.left, width: Math.max(r.width, 168), ...(flip ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
    setActive(Math.max(0, TABLE_STATUS_OPTIONS.findIndex((o) => o.value === value)));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const choose = (v: TableStatusValue) => {
    setOpen(false);
    btnRef.current?.focus();
    if (v !== value) onChange(v);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const n = TABLE_STATUS_OPTIONS.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(TABLE_STATUS_OPTIONS[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
        }}
        className="flex-1 min-w-0 flex items-center gap-2 text-[11px] font-bold bg-jaman-cream hover:bg-[#F4EFE6] text-jaman-navy border border-jaman-border rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} aria-hidden="true" />
        <span className="flex-1 text-left truncate">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`tsm-${TABLE_STATUS_OPTIONS[active].value}`}
          onKeyDown={onListKey}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 1000 }}
          className="p-1.5 bg-white border border-jaman-border rounded-xl shadow-[0_12px_32px_-8px_rgba(31,41,55,0.25)] focus:outline-none animate-[tsmIn_140ms_ease-out]"
        >
          {TABLE_STATUS_OPTIONS.map((o, i) => (
            <li
              key={o.value}
              id={`tsm-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.value)}
              className={`flex items-center gap-2 h-9 px-2.5 rounded-lg text-[12px] cursor-pointer ${i === active ? 'bg-brand/10 text-brand' : 'text-jaman-navy'} ${o.value === value ? 'font-bold' : 'font-medium'}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${o.dot}`} aria-hidden="true" />
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body
      )}
      <style>{`@keyframes tsmIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){[role=listbox]{animation:none!important}}`}</style>
    </>
  );
}

interface FloorTablesModuleProps {
  tables: DiningTable[];
  orders: Order[];
  occupiedTablesCount: number;
  onOpenTableModal: (tbl?: DiningTable | null) => void;
  onSelectOrderDetail: (ord: Order) => void;
  onNavigateToQr?: (tableNumber?: string | number) => void;
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

export const FloorTablesModule: React.FC<FloorTablesModuleProps> = ({
  tables,
  orders,
  occupiedTablesCount,
  onOpenTableModal,
  onSelectOrderDetail,
  onNavigateToQr,
  showToast,
  onRequestConfirm
}) => {
  const [tableZoneFilter, setTableZoneFilter] = useState<string>('ALL');

  const handleDeleteTable = (tbl: DiningTable) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Table',
        message: `Are you sure you want to delete Table ${tbl.tableNumber}? Active orders may be affected.`,
        confirmText: 'Delete Table',
        isDanger: true,
        onConfirm: () => {
          TableRepository.deleteTable(tbl.id);
          showToast(`Deleted Table ${tbl.tableNumber}`);
        }
      });
    } else {
      if (window.confirm(`Delete Table ${tbl.tableNumber}?`)) {
        TableRepository.deleteTable(tbl.id);
        showToast(`Deleted Table ${tbl.tableNumber}`);
      }
    }
  };

  const filteredTables = tables.filter(
    (tbl) => tableZoneFilter === 'ALL' || (tbl.zone || 'Main Dining Hall') === tableZoneFilter
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy tracking-tight">
              Floor Plan & Table Layout
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/60">
              LIVE DINE-IN RADAR
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Live visual floor occupancy, dining sections, table capacities, and active guest orders.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {onNavigateToQr && (
            <button
              onClick={() => onNavigateToQr()}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy font-bold text-xs flex items-center gap-2 shadow-2xs cursor-pointer transition-colors"
            >
              <QrCode className="w-4 h-4 text-slate-500" />
              <span>Table QR Standees</span>
            </button>
          )}
          <button
            onClick={() => onOpenTableModal(null)}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dining Table</span>
          </button>
        </div>
      </div>

      {/* 4 Tables KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Tables</span>
          <div className="text-2xl font-bold text-jaman-navy tabular-nums">{tables.length} Tables</div>
          <span className="text-[11px] text-slate-500 font-bold block">Configured in Layout</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Seating Capacity</span>
          <div className="text-2xl font-bold text-blue-700 font-mono">
            {tables.reduce((acc, t) => acc + (t.capacity || 4), 0)} Guests
          </div>
          <span className="text-[11px] text-blue-600 font-bold block">Total Restaurant Seats</span>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-xs space-y-1 ${
            occupiedTablesCount > 0 ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-jaman-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Live Occupancy</span>
            {occupiedTablesCount > 0 && <span className="w-2 h-2 rounded-full bg-brand"></span>}
          </div>
          <div className="text-2xl font-bold text-brand font-mono">
            {occupiedTablesCount} Busy{' '}
            <span className="text-xs text-slate-500 font-normal">
              ({Math.round((occupiedTablesCount / (tables.length || 1)) * 100)}%)
            </span>
          </div>
          <span className="text-[11px] text-slate-600 font-bold block">
            {tables.filter((t) => t.status === 'OCCUPIED').reduce((acc, t) => acc + (t.capacity || 4), 0)} Seated Guests
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Vacant Tables</span>
          <div className="text-2xl font-bold text-emerald-700 font-mono">
            {tables.filter((t) => t.status === 'AVAILABLE').length} Vacant
          </div>
          <span className="text-[11px] text-emerald-600 font-bold block">Ready for Guest Seating</span>
        </div>
      </div>

      {/* Area / Zone Filter Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-white p-2 rounded-2xl border border-jaman-border shadow-2xs">
        {[
          { id: 'ALL', label: 'All Floor Sections' },
          ...TableRepository.getZones().map((zone) => ({ id: zone, label: zone }))
        ].map((z) => {
          const count = z.id === 'ALL' ? tables.length : tables.filter((t) => t.zone === z.id).length;
          return (
            <button
              key={z.id}
              onClick={() => setTableZoneFilter(z.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                tableZoneFilter === z.id
                  ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                  : 'text-[#4A5568] hover:bg-[#F8F6F0]'
              }`}
            >
              <span>{z.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-md ${
                  tableZoneFilter === z.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tables Matrix */}
      {filteredTables.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-jaman-border shadow-2xs space-y-3 max-w-lg mx-auto my-6">
          <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
            <Grid className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-jaman-navy">No Tables in this Floor Section</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            There are no tables assigned to the selected dining section. Click below to add a table:
          </p>
          <button
            onClick={() => onOpenTableModal(null)}
            className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
          >
            + Add Dining Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTables.map((tbl: DiningTable) => {
            const activeOrder = orders.find(
              (o) =>
                (o.tableNumber === tbl.tableNumber || o.tableId === tbl.id) &&
                o.orderStatus !== 'COMPLETED' &&
                o.orderStatus !== 'CANCELLED'
            );

            // Status Pill Config
            let statusBadge = {
              bg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
              dot: 'bg-emerald-500',
              label: 'Available'
            };
            if (tbl.status === 'OCCUPIED') {
              statusBadge = {
                bg: 'bg-orange-50 text-brand border-orange-200',
                dot: 'bg-brand',
                label: 'Occupied'
              };
            } else if (tbl.status === 'RESERVED') {
              statusBadge = {
                bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
                dot: 'bg-indigo-500',
                label: 'Reserved'
              };
            } else if (tbl.status === 'CLEANING') {
              statusBadge = {
                bg: 'bg-amber-50 text-amber-800 border-amber-200',
                dot: 'bg-amber-500',
                label: 'Cleaning'
              };
            }

            return (
              <div
                key={tbl.id}
                className={`bg-white rounded-2xl border transition-all flex flex-col justify-between space-y-3 p-4 select-none ${
                  tbl.status === 'OCCUPIED'
                    ? 'border-brand/30 shadow-xs'
                    : 'border-jaman-border hover:border-slate-300 shadow-2xs'
                }`}
              >
                {/* Table Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-jaman-navy text-white flex items-center justify-center font-mono font-bold text-sm shadow-2xs">
                      {/^\d/.test(tbl.tableNumber) ? `T${tbl.tableNumber}` : tbl.tableNumber}
                    </div>
                    <div>
                      <span className="font-bold text-sm text-jaman-navy block leading-tight">
                        Table {tbl.tableNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium block">
                        {tbl.zone || 'Main Dining Hall'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold border ${statusBadge.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                    <span>{statusBadge.label}</span>
                  </span>
                </div>

                {/* Capacity & Location */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 py-0.5">
                  <span className="flex items-center gap-1 font-medium">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>{tbl.capacity} Guests</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">Floor {tbl.floor || 1}</span>
                    {onNavigateToQr && (
                      <button
                        onClick={() => onNavigateToQr(tbl.tableNumber)}
                        title={`Generate / Print QR Standee for Table ${tbl.tableNumber}`}
                        className="p-1 hover:bg-brand/[0.07] text-brand rounded-md transition-colors cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Linked Active Order Box if Occupied */}
                {tbl.status === 'OCCUPIED' && activeOrder ? (
                  <div className="p-2.5 bg-[#FFF9F5] rounded-xl border border-orange-200/70 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-jaman-navy font-mono">#{activeOrder.orderNumber}</span>
                      <span className="font-bold text-emerald-800 font-mono">
                        {formatINR(activeOrder.totalAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{activeOrder.items.length} items</span>
                      <button
                        type="button"
                        onClick={() => onSelectOrderDetail(activeOrder)}
                        className="text-brand font-bold hover:underline cursor-pointer"
                      >
                        View Bill →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 px-2.5 rounded-xl bg-jaman-cream text-[11px] text-slate-500 font-medium">
                    {tbl.status === 'AVAILABLE' ? 'Ready for seating' : `Status: ${tbl.status}`}
                  </div>
                )}

                {/* Table Status Switcher & Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <TableStatusMenu
                    value={tbl.status}
                    label={`Status of table ${tbl.tableNumber}`}
                    onChange={(v) => {
                      TableRepository.updateTableStatus(tbl.id, v as any);
                      showToast(`Table ${tbl.tableNumber} status set to ${v}`);
                    }}
                  />

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onOpenTableModal(tbl)}
                      className="p-1.5 hover:bg-jaman-cream rounded-lg text-slate-500 hover:text-brand transition-colors cursor-pointer"
                      title="Edit Table Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTable(tbl)}
                      className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Delete Table"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
