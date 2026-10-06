import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Package,
  Grid,
  Scale,
  Coins,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';

interface NeedsAttentionSectionProps {
  pendingKotsCount: number;
  lowStockCount: number;
  occupiedTablesCount: number;
  tablesTotalCount: number;
  reconciled: boolean;
  varianceAmount: number;
  activeShift?: {
    cashierName?: string;
    openingCash?: number;
    status?: string;
    cashVariance?: number;
  };
  onNavigateToKitchen: () => void;
  onNavigateToInventory: () => void;
  onNavigateToFloor: () => void;
  onNavigateToShifts: () => void;
  onOpenReconciliation: () => void;
}

export const NeedsAttentionSection: React.FC<NeedsAttentionSectionProps> = ({
  pendingKotsCount,
  lowStockCount,
  occupiedTablesCount,
  tablesTotalCount,
  reconciled,
  varianceAmount,
  activeShift,
  onNavigateToKitchen,
  onNavigateToInventory,
  onNavigateToFloor,
  onNavigateToShifts,
  onOpenReconciliation
}) => {
  return (
    <section aria-label="Operational Needs Attention" className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-jaman-navy tracking-tight flex items-center gap-2">
            <span>Needs Attention & Quick Triage</span>
          </h2>
          <p className="text-xs text-[#5A6878]">
            Direct operational shortcuts and alerts requiring manager intervention
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. KOT Kitchen Attention */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-slate-500" />
                Kitchen Line
              </span>
              {pendingKotsCount > 0 ? (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  Action Required
                </span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  All Clear
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <h4 className="font-bold text-sm text-jaman-navy">
                {pendingKotsCount > 0 ? `${pendingKotsCount} Tickets In Preparation` : 'Kitchen Queue Idle'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {pendingKotsCount > 0
                  ? 'Active orders being cooked on KDS display.'
                  : 'No tickets waiting for preparation.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToKitchen}
            className="mt-3.5 pt-2.5 border-t border-slate-100 w-full flex items-center justify-between text-xs font-bold text-brand hover:text-[#C5530E] cursor-pointer group"
          >
            <span>Open Kitchen KDS</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* 2. Low Stock Attention */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-rose-600" />
                Raw Materials
              </span>
              {lowStockCount > 0 ? (
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-full">
                  Restock Now
                </span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  Optimal
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <h4 className="font-bold text-sm text-jaman-navy">
                {lowStockCount > 0 ? `${lowStockCount} Items Below Threshold` : 'Inventory Well Stocked'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {lowStockCount > 0
                  ? 'Ingredients have breached minimum safe buffers.'
                  : 'All recipes and inventory items are within safe levels.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToInventory}
            className="mt-3.5 pt-2.5 border-t border-slate-100 w-full flex items-center justify-between text-xs font-bold text-jaman-navy hover:text-rose-700 cursor-pointer group"
          >
            <span>Review Inventory</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* 3. Floor Tables Management */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-blue-600" />
                Dining Floor
              </span>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full">
                {occupiedTablesCount} / {tablesTotalCount} Occupied
              </span>
            </div>

            <div className="mt-2.5">
              <h4 className="font-bold text-sm text-jaman-navy">
                {tablesTotalCount - occupiedTablesCount} Tables Available
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {occupiedTablesCount > 0
                  ? 'Guests currently dining. Tap to manage bills and transfers.'
                  : 'Floor ready for seating walk-ins and reservations.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToFloor}
            className="mt-3.5 pt-2.5 border-t border-slate-100 w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer group"
          >
            <span>Manage Floor & Tables</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* 4. Shift & Financial Reconciliation */}
        <div className="dash-subtle-card rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-700" />
                Shift Drawer
              </span>
              {!activeShift ? (
                <span className="text-[11px] font-bold text-slate-600">No shift recorded</span>
              ) : activeShift.status !== 'CLOSED' ? (
                <span className="text-[11px] font-bold text-amber-700">Open · Not yet counted</span>
              ) : activeShift.cashVariance === undefined ? (
                <span className="text-[11px] font-bold text-amber-700">Closing count missing</span>
              ) : activeShift.cashVariance === 0 ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  100% Reconciled
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  Variance {formatINR(activeShift.cashVariance)}
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <h4 className="font-bold text-sm text-jaman-navy">
                {activeShift ? `${activeShift.cashierName || 'Cashier'} · Float ${formatINR(activeShift.openingCash ?? 0)}` : 'No cashier shift'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {activeShift?.status === 'CLOSED' ? 'Closed register. Review the recorded count and variance.' : 'Reconciliation requires a recorded closing cash count.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenReconciliation}
            className="mt-3.5 pt-2.5 border-t border-slate-100 w-full flex items-center justify-between text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer group"
          >
            <span>Run Financial Audit</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
};
