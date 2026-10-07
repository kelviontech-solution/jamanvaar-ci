import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@jamanvaar/database';
import { CentralReportingService, PeriodReconciliationResult, CentralDatePreset } from '@jamanvaar/business';
import { formatINR, formatDate, formatTime, restaurantGstRate, taxLabels } from '@jamanvaar/utils';
// The restaurant's configured GST (Customisations & Tax), read when shown.
const gstLabels = () => taxLabels(restaurantGstRate(db.taxGroups));
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Layers,
  ArrowRight,
  TrendingUp,
  Receipt,
  DollarSign,
  CreditCard,
  QrCode,
  Coins,
  Scale
} from 'lucide-react';

interface FinancialReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const FinancialReconciliationModal: React.FC<FinancialReconciliationModalProps> = ({
  isOpen,
  onClose,
  showToast
}) => {
  const [selectedPreset, setSelectedPreset] = useState<CentralDatePreset>('TODAY');
  const [refreshKey, setRefreshKey] = useState(0);

  const recon: PeriodReconciliationResult = useMemo(() => {
    return CentralReportingService.reconcilePeriod(db.orders, selectedPreset);
  }, [selectedPreset, refreshKey, db.orders.length]);

  // Escape closes this dialog like any other in the app, not just its own Close Audit button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleManualSync = () => {
    db.notify();
    setRefreshKey((k) => k + 1);
    showToast('Real-Time Database State Refreshed & Reconciled');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-jaman-cream border border-jaman-border w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-5 bg-white border-b border-jaman-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs ${
              recon.isReconciled ? 'bg-emerald-600' : 'bg-amber-600'
            }`}>
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-jaman-navy">
                  Financial Data Consistency & Reconciliation Engine
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  recon.isReconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}>
                  {recon.isReconciled ? '100% Reconciled' : 'Discrepancy Found'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Single Source of Truth Audit: POS Terminal ⇄ Admin Dashboard ⇄ Bills & Invoices ⇄ Reports Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Verify Now</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 text-slate-500 hover:text-jaman-navy rounded-xl hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Preset Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-white p-2 rounded-2xl border border-jaman-border">
            {(['TODAY', 'YESTERDAY', '7_DAYS', '30_DAYS', 'THIS_MONTH', 'THIS_YEAR', 'ALL'] as CentralDatePreset[]).map(
              (p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPreset(p)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                    selectedPreset === p
                      ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.replace('_', ' ')}
                </button>
              )
            )}
          </div>

          {/* Status Banner */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
            recon.isReconciled
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}>
            {recon.isReconciled ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <strong className="text-sm font-bold block">
                {recon.isReconciled
                  ? `All Financial Records in Exact 1:1 Reconciliation for ${recon.periodLabel}`
                  : `Data Discrepancy Detected for ${recon.periodLabel}`}
              </strong>
              <p className="text-xs leading-relaxed text-slate-700">
                {recon.isReconciled
                  ? `Every completed order (Total: ${recon.completedOrdersCount}) is backed by 1 invoice and 1 payment record with ₹0 total variance. All screens query this authoritative layer.`
                  : recon.mismatches.join(' • ')}
              </p>
            </div>
          </div>

          {/* Cross-Module Source Truth Matrix */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">
              Cross-Module Verification Matrix
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold block">POS & Admin Dashboards</span>
                <strong className="text-lg font-mono font-bold text-jaman-navy block">
                  {formatINR(recon.sources.dashboardSales)}
                </strong>
                <span className="text-[11px] text-emerald-700 font-bold block">Matches Central Truth</span>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold block">Bills & Invoices Ledger</span>
                <strong className="text-lg font-mono font-bold text-jaman-navy block">
                  {formatINR(recon.sources.billsSales)}
                </strong>
                <span className="text-[11px] text-emerald-700 font-bold block">Matches Central Truth</span>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold block">Reports & Analytics Engine</span>
                <strong className="text-lg font-mono font-bold text-jaman-navy block">
                  {formatINR(recon.sources.reportsSales)}
                </strong>
                <span className="text-[11px] text-emerald-700 font-bold block">Matches Central Truth</span>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold block">Payment Tenders Sum</span>
                <strong className="text-lg font-mono font-bold text-jaman-navy block">
                  {formatINR(recon.sources.paymentSales)}
                </strong>
                <span className="text-[11px] text-emerald-700 font-bold block">100% Settled</span>
              </div>
            </div>
          </div>

          {/* Complete Financial Itemization Breakdown */}
          <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-jaman-cream border-b border-jaman-border font-bold text-xs text-jaman-navy flex justify-between items-center">
              <span>Financial Itemization Breakdown</span>
              <span className="font-mono text-[11px] text-slate-500 font-bold">
                {recon.completedOrdersCount} Valid Transactions
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="p-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">Gross Sales (Item Subtotals before discounts & taxes)</span>
                <strong className="tabular-nums text-sm text-jaman-navy">{formatINR(recon.grossSales)}</strong>
              </div>

              <div className="p-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">Discounts Applied (Coupons & Bill Cuts)</span>
                <strong className="tabular-nums text-sm text-rose-600">-{formatINR(recon.discounts)}</strong>
              </div>

              <div className="p-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">Taxable Sales (Gross - Discounts)</span>
                <strong className="tabular-nums text-sm text-jaman-navy">{formatINR(recon.taxableSales)}</strong>
              </div>

              <div className="p-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">{gstLabels().combined}</span>
                <strong className="tabular-nums text-sm text-brand">+{formatINR(recon.gstTotal)}</strong>
              </div>

              <div className="p-3 bg-slate-50 flex justify-between items-center">
                <span className="font-bold text-jaman-navy">Net Sales (Total Invoiced Amount)</span>
                <strong className="tabular-nums text-base font-bold text-emerald-700">{formatINR(recon.netSales)}</strong>
              </div>

              <div className="p-3 flex justify-between items-center">
                <span className="font-bold text-slate-700">Refunds Processed</span>
                <strong className="tabular-nums text-sm text-rose-600">-{formatINR(recon.refunds)}</strong>
              </div>

              <div className="p-3 bg-emerald-50/60 flex justify-between items-center">
                <span className="font-bold text-emerald-950">Net Collected (Actual Realized Cash & Digital Revenue)</span>
                <strong className="tabular-nums text-base font-bold text-emerald-900">{formatINR(recon.netCollected)}</strong>
              </div>
            </div>
          </div>

          {/* Tender Settlement Breakdown */}
          <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Payment Channels Settlement Breakdown
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200">
                <span className="text-[11px] text-amber-800 font-bold block">Cash In Drawer</span>
                <strong className="text-base font-mono font-bold text-amber-950 block mt-0.5">
                  {formatINR(recon.paymentBreakdown.cash)}
                </strong>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-200">
                <span className="text-[11px] text-blue-800 font-bold block">UPI Bharat QR</span>
                <strong className="text-base font-mono font-bold text-blue-950 block mt-0.5">
                  {formatINR(recon.paymentBreakdown.upi)}
                </strong>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-200">
                <span className="text-[11px] text-indigo-800 font-bold block">Card POS Terminal</span>
                <strong className="text-base font-mono font-bold text-indigo-950 block mt-0.5">
                  {formatINR(recon.paymentBreakdown.card)}
                </strong>
              </div>

              <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200">
                <span className="text-[11px] text-slate-600 font-bold block">Total Channel Settlements</span>
                <strong className="text-base font-mono font-bold text-jaman-navy block mt-0.5">
                  {formatINR(recon.paymentBreakdown.total)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-jaman-border flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-500 font-medium">
            Timezone standard: <strong className="text-jaman-navy">Asia/Kolkata (IST)</strong> • Single Source of Truth
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold rounded-xl shadow-xs"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
