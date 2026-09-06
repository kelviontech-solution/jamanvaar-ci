import React from 'react';
import { DiningTable, Order } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  Users,
  Flame,
  Receipt,
  Plus,
  Clock,
  CheckCircle2,
  ChefHat,
  ShoppingBag,
  ArrowRight,
  UtensilsCrossed
} from 'lucide-react';

interface CaptainTableCardProps {
  table: DiningTable;
  activeOrder?: Order | null;
  foodReadyCount: number;
  captainName?: string;
  onOpenTableModal: (table: DiningTable) => void;
  onOpenWorkspace: (table: DiningTable) => void;
  onDeliverFood: (table: DiningTable) => void;
  onRequestBill: (tableNumber: string) => void;
}

export const CaptainTableCard: React.FC<CaptainTableCardProps> = ({
  table,
  activeOrder,
  foodReadyCount,
  captainName = 'Rahul Sharma',
  onOpenTableModal,
  onOpenWorkspace,
  onDeliverFood,
  onRequestBill
}) => {
  const isFoodReady = foodReadyCount > 0;
  const isBillReq = table.status === 'BILL_REQUESTED';
  const isOccupied = table.status === 'OCCUPIED' || table.status === 'BILLING' || !!activeOrder;
  const isAvailable = table.status === 'AVAILABLE' && !activeOrder;

  // Calculate elapsed time
  let elapsedMinutes = 0;
  if (activeOrder && activeOrder.createdAt) {
    elapsedMinutes = Math.max(1, Math.round((Date.now() - new Date(activeOrder.createdAt).getTime()) / 60000));
  }

  // Items preview
  const itemsSummary = activeOrder?.items && activeOrder.items.length > 0
    ? activeOrder.items.map((it) => `${it.name} ×${it.quantity}`).join(', ')
    : null;

  return (
    <div
      className={`rounded-3xl border-2 p-4 sm:p-5 bg-white transition-all shadow-xs flex flex-col justify-between space-y-3.5 hover:shadow-md ${
        isFoodReady
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/15'
          : isBillReq
          ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/15'
          : isOccupied
          ? 'border-[#E66817] bg-[#FFFBF7]'
          : 'border-[#EBE6DD] hover:border-slate-300'
      }`}
    >
      {/* ── 1. Card Top: Table Number, Section & Status Pill ── */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-black text-[#0B253A] tracking-tight">
              TABLE {table.tableNumber}
            </span>
            {isFoodReady && (
              <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse shadow-xs shrink-0">
                <Flame className="w-3 h-3 fill-white" />
                <span>{foodReadyCount} READY</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mt-0.5">
            <span>{(table as any).section || table.zone || 'Main Dining'}</span>
            <span className="text-slate-300">•</span>
            <span>{table.capacity || 4} Seats</span>
          </div>
        </div>

        {/* Status Pill */}
        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${
            isBillReq
              ? 'bg-purple-100 text-purple-800 border border-purple-300'
              : isFoodReady
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : isOccupied
              ? 'bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74]'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {isFoodReady ? 'FOOD READY' : table.status}
        </span>
      </div>

      {/* ── 2. Card Middle: Order Details, Guests & Financials ── */}
      <div className="p-3 rounded-2xl bg-white border border-[#EBE6DD] space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Users className="w-4 h-4 text-slate-400" />
            <span>{table.currentGuests || 2} Guests</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase block font-bold">Order Value</span>
            <span className="text-sm font-black font-mono text-[#0B253A]">
              {activeOrder ? formatINR(activeOrder.totalAmount) : '—'}
            </span>
          </div>
        </div>

        {/* Order Meta / Elapsed Timer */}
        {activeOrder ? (
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-500">
            <div className="flex items-center gap-1 font-mono font-bold text-[#0B253A]">
              <span>#{activeOrder.orderNumber?.slice(-4) || '—'}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-600 font-sans">{captainName}</span>
            </div>
            <div className="flex items-center gap-1 font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              <Clock className="w-3 h-3 text-amber-600" />
              <span>{elapsedMinutes}m</span>
            </div>
          </div>
        ) : (
          <div className="pt-1.5 border-t border-slate-100 text-[11px] text-emerald-700 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Table ready for seating</span>
          </div>
        )}

        {/* Live Items Summary snippet */}
        {itemsSummary && (
          <div className="pt-1 text-[11px] text-slate-600 truncate font-medium">
            <span className="font-bold text-slate-700">Dishes: </span>
            <span>{itemsSummary}</span>
          </div>
        )}
      </div>

      {/* ── 3. Card Bottom: State-Adaptive Action Buttons ── */}
      <div className="pt-0.5">
        {isAvailable ? (
          <button
            type="button"
            onClick={() => onOpenTableModal(table)}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>OPEN TABLE</span>
          </button>
        ) : isFoodReady ? (
          <button
            type="button"
            onClick={() => onDeliverFood(table)}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 animate-bounce"
          >
            <Flame className="w-4 h-4 fill-white" />
            <span>DELIVER FOOD ({foodReadyCount})</span>
          </button>
        ) : isBillReq ? (
          <button
            type="button"
            onClick={() => onOpenWorkspace(table)}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm shadow-md shadow-purple-700/25 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <Receipt className="w-4 h-4" />
            <span>VIEW BILL STATUS</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenWorkspace(table)}
              className="min-h-[44px] py-2 px-2.5 rounded-2xl bg-[#0B253A] hover:bg-[#163E5E] text-white font-black text-xs shadow-sm transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 truncate"
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-[#E66817]" />
              <span className="truncate">{activeOrder ? 'VIEW ORDER' : 'TAKE ORDER'}</span>
            </button>
            <button
              type="button"
              onClick={() => onRequestBill(table.tableNumber)}
              className="min-h-[44px] py-2 px-2.5 rounded-2xl bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 hover:border-purple-400 font-black text-xs shadow-2xs transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1 truncate"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span className="truncate">REQUEST BILL</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
