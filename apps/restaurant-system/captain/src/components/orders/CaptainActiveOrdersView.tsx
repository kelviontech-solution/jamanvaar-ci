import React, { useState } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { DiningTable, Order } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  ShoppingBag,
  Clock,
  Receipt,
  UtensilsCrossed,
  ArrowRight,
  Search,
  Flame,
  CheckCircle2,
  Users
} from 'lucide-react';

interface CaptainActiveOrdersViewProps {
  onOpenTableWorkspace: (tableNumber: string) => void;
}

export const CaptainActiveOrdersView: React.FC<CaptainActiveOrdersViewProps> = ({
  onOpenTableWorkspace
}) => {
  const { tables, kots, requestBill } = useCaptainStore();
  const [search, setSearch] = useState('');

  // Real per-table kitchen status, derived from this table's actual KOTs —
  // this used to be a single hardcoded "Order Active in Kitchen" string for
  // every table regardless of what was actually happening in the kitchen.
  function getServiceStatus(tableNumber: string): { label: string; tone: 'ready' | 'preparing' | 'served' | 'none' } {
    const tableKots = kots.filter((k) => k.tableNumber === tableNumber);
    if (tableKots.length === 0) return { label: 'No Active KOT', tone: 'none' };
    if (tableKots.some((k) => k.status === 'READY')) return { label: 'Food Ready — Serve Now', tone: 'ready' };
    if (tableKots.some((k) => k.status === 'PREPARING' || (k.status as string) === 'PENDING' || (k.status as string) === 'ACCEPTED' || (k.status as string) === 'COOKING')) {
      return { label: 'Preparing in Kitchen', tone: 'preparing' };
    }
    if (tableKots.every((k) => k.status === 'SERVED')) return { label: 'All Items Served', tone: 'served' };
    return { label: 'Order Active in Kitchen', tone: 'preparing' };
  }

  // Active occupied tables with orders
  const activeDiningTables = tables.filter((t) => {
    const isOccupied = t.status === 'OCCUPIED' || t.status === 'BILLING' || t.status === 'BILL_REQUESTED' || !!t.currentOrderId;
    if (!isOccupied) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.tableNumber.toLowerCase().includes(q) || ((t as any).section || t.zone || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-[#EBE6DD] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#E66817]" />
            <h2 className="text-xl font-black text-[#0B253A]">Active Dining Orders</h2>
            <span className="bg-[#FFF4ED] text-[#E66817] text-xs font-black px-2.5 py-0.5 rounded-full border border-[#FDBA74]">
              {activeDiningTables.length} Active Tables
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Track live table orders, preparation status, and send billing requests to counter.
          </p>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search active table..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl text-xs text-[#0B253A] outline-none focus:bg-white focus:border-[#E66817]"
          />
        </div>
      </div>

      {/* Orders List */}
      {activeDiningTables.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16 md:pb-6">
          {activeDiningTables.map((table) => {
            const isBillReq = table.status === 'BILL_REQUESTED';
            const serviceStatus = getServiceStatus(table.tableNumber);

            return (
              <div
                key={table.id}
                className={`bg-white rounded-3xl border-2 p-5 space-y-4 shadow-sm flex flex-col justify-between ${
                  isBillReq ? 'border-purple-500 bg-purple-50/15' : 'border-[#EBE6DD]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-2xl font-black text-[#0B253A]">TABLE {table.tableNumber}</span>
                      <span className="text-xs text-slate-500 font-bold block mt-0.5">
                        {(table as any).section || table.zone || 'Main Dining'} • {table.currentGuests || 2} Guests
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                        isBillReq
                          ? 'bg-purple-100 text-purple-800 border border-purple-300'
                          : 'bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74]'
                      }`}
                    >
                      {table.status}
                    </span>
                  </div>

                  <div className="mt-4 p-3 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Service Status:</span>
                      <span
                        className={`font-bold ${
                          serviceStatus.tone === 'ready'
                            ? 'text-emerald-700'
                            : serviceStatus.tone === 'none'
                            ? 'text-slate-400'
                            : 'text-[#0B253A]'
                        }`}
                      >
                        {serviceStatus.label}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Seated Guests:</span>
                      <span className="font-bold text-[#0B253A]">{table.currentGuests || 2} Diners</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={() => onOpenTableWorkspace(table.tableNumber)}
                    className="w-full py-3 px-4 rounded-2xl bg-[#0B253A] hover:bg-[#163E5E] text-white font-black text-xs shadow-sm transition-all active:scale-98 cursor-pointer flex items-center justify-between"
                  >
                    <span>Open Table Workspace</span>
                    <ArrowRight className="w-4 h-4 text-[#E66817]" />
                  </button>

                  {!isBillReq && (
                    <button
                      type="button"
                      onClick={() => requestBill(table.tableNumber)}
                      className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Request Bill from Counter POS</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-[#EBE6DD] space-y-3">
          <ShoppingBag className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-lg font-black text-[#0B253A]">No Active Table Orders</h3>
          <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
            All floor tables are currently clear. When you seat guests and send a KOT, active orders will show here.
          </p>
        </div>
      )}
    </div>
  );
};
