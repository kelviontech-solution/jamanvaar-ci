import React from 'react';
import {
  Flame,
  Grid,
  AlertTriangle,
  Receipt,
  Percent,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';

interface OperationalSnapshotProps {
  pendingKotsCount: number;
  occupiedTablesCount: number;
  tablesTotalCount: number;
  lowStockCount: number;
  totalTax: number;
  cgstAmount: number;
  sgstAmount: number;
  discountAmount: number;
  onNavigateToKitchen: () => void;
  onNavigateToFloor: () => void;
  onNavigateToInventory: () => void;
}

export const OperationalSnapshot: React.FC<OperationalSnapshotProps> = ({
  pendingKotsCount,
  occupiedTablesCount,
  tablesTotalCount,
  lowStockCount,
  totalTax,
  cgstAmount,
  sgstAmount,
  discountAmount,
  onNavigateToKitchen,
  onNavigateToFloor,
  onNavigateToInventory
}) => {
  const occupancyPercent =
    tablesTotalCount > 0 ? Math.round((occupiedTablesCount / tablesTotalCount) * 100) : 0;

  return (
    <section aria-label="Operational Snapshot" className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-jaman-navy tracking-tight flex items-center gap-2">
            <span>Operational Snapshot</span>
          </h2>
          <p className="text-xs text-[#5A6878]">
            Real-time kitchen velocity, floor capacity, and operational health
          </p>
        </div>
      </div>

      {/* Grid: 3 Actionable Operational Cards + 2 Quieter Financial Accounting Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Live KOT Queue */}
        <div
          onClick={onNavigateToKitchen}
          className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between hover:border-brand cursor-pointer group transition-all"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Flame className={`w-3.5 h-3.5 ${pendingKotsCount > 0 ? 'text-brand' : 'text-slate-500'}`} />
                Live KOT Queue
              </span>
              {pendingKotsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-brand" />
              )}
            </div>

            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-jaman-navy tabular-nums group-hover:text-brand transition-colors">
                {pendingKotsCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {pendingKotsCount === 1 ? 'Ticket active' : 'Tickets active'}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500">In Kitchen</span>
            <span className="text-xs font-bold text-brand group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              Open Kitchen <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* 2. Dining Occupancy */}
        <div
          onClick={onNavigateToFloor}
          className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between hover:border-jaman-navy cursor-pointer group transition-all"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-blue-600" />
                Dining Occupancy
              </span>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {occupancyPercent}% load
              </span>
            </div>

            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-jaman-navy tabular-nums">
                {occupiedTablesCount} <span className="text-sm font-semibold text-slate-500">/ {tablesTotalCount}</span>
              </span>
              <span className="text-xs font-semibold text-slate-500">Tables</span>
            </div>

            {/* Micro Progress Bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  occupancyPercent > 80 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500">Floor status</span>
            <span className="text-xs font-bold text-jaman-navy group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              View Floor <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* 3. Low Stock Alert */}
        <div
          onClick={onNavigateToInventory}
          className={`dash-subtle-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer group transition-all ${
            lowStockCount > 0
              ? 'border-rose-200 bg-rose-50/30 hover:border-rose-400'
              : 'hover:border-slate-400'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <AlertTriangle className={`w-3.5 h-3.5 ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`} />
                Low Stock Alert
              </span>
              {lowStockCount > 0 ? (
                <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                  Needs PO
                </span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Healthy
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  lowStockCount > 0 ? 'text-rose-600' : 'text-jaman-navy'
                }`}
              >
                {lowStockCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {lowStockCount === 1 ? 'Item low' : 'Items low'}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500">Below threshold</span>
            <span className="text-xs font-bold text-jaman-navy group-hover:text-rose-700 group-hover:translate-x-0.5 transition-all flex items-center gap-1">
              Review Inventory <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* 4. GST Tax Collected (Quiet Financial Display) */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-500" />
                GST Tax Collected (5%)
              </span>
            </div>

            <div className="mt-2.5">
              <div className="text-2xl font-bold text-jaman-navy tabular-nums">
                {formatINR(totalTax)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>CGST ₹{cgstAmount}</span>
            <span>SGST ₹{sgstAmount}</span>
          </div>
        </div>

        {/* 5. Discounts Given (Quiet Financial Display) */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-slate-500" />
                Discounts Given
              </span>
            </div>

            <div className="mt-2.5">
              <div className="text-2xl font-bold text-rose-600 tabular-nums">
                -{formatINR(discountAmount)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Coupons & bill cuts</span>
            <span className="font-semibold text-slate-500">Promotions</span>
          </div>
        </div>
      </div>
    </section>
  );
};
