import React, { useState } from 'react';
import { BusinessDay } from '@jamanvaar/types';
import { BusinessDayAccountingService, BusinessDaySummary } from '@jamanvaar/database';
import { BusinessDayService } from '@jamanvaar/business';
import { lanMeshSync } from '@jamanvaar/sync';
import { usePosStore } from '../../store/posStore';
import { formatINR } from '@jamanvaar/utils';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  PlusCircle,
  FileText,
  CreditCard,
  Banknote,
  QrCode,
  Layers,
  ShieldCheck
} from 'lucide-react';

interface PosCloseDayModalProps {
  businessDay: BusinessDay;
  isOpen: boolean;
  onClose: () => void;
  onClosedSuccess: (closedDay: BusinessDay) => void;
  onStartNewOrder?: () => void;
  onViewEodReport?: (day: BusinessDay) => void;
}

export const PosCloseDayModal: React.FC<PosCloseDayModalProps> = ({
  businessDay,
  isOpen,
  onClose,
  onClosedSuccess,
  onStartNewOrder,
  onViewEodReport
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [closedResult, setClosedResult] = useState<{ closedDay: BusinessDay; newDay: BusinessDay } | null>(null);

  if (!isOpen) return null;

  // Single authoritative summary from BusinessDayAccountingService
  const summary: BusinessDaySummary = BusinessDayAccountingService.getBusinessDaySummary(businessDay.id);

  const expectedCash = summary.cash_expected;
  // The signed-in cashier closes the day — never a made-up name (BUG-103).
  const currentUser = usePosStore((s) => s.currentUser);
  const closedByName = currentUser?.fullName || 'Cashier';
  const actualCash = actualCashInput !== '' ? Number(actualCashInput) : expectedCash;
  const variance = actualCash - expectedCash;

  const handleFinalizeClose = () => {
    setIsProcessing(true);
    setErrorMsg(null);

    setTimeout(() => {
      try {
        const res = BusinessDayService.closeBusinessDay({
          businessDayId: summary.business_day_id,
          actualCash,
          closedBy: closedByName,
          varianceReason: variance !== 0 ? varianceReason : 'Drawer Balanced',
          forceCloseWithExceptions: true
        });

        // Broadcast day close and new day over LAN mesh cluster
        lanMeshSync.broadcast('BUSINESS_DAY_CLOSED', {
          closedDayId: res.closedDay.id,
          closedDate: res.closedDay.businessDate,
          newDayId: res.newDay.id,
          newDate: res.newDay.businessDate,
          closedBy: closedByName
        });

        setClosedResult({ closedDay: res.closedDay, newDay: res.newDay });
        setIsProcessing(false);
        setStep(6); // SUCCESS
        onClosedSuccess(res.closedDay);
      } catch (err: any) {
        console.error('Day Close Error:', err);
        setErrorMsg(err?.message || 'Failed to close business day. Please verify open orders.');
        setIsProcessing(false);
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
      <div className="bg-jaman-cream border border-jaman-border w-full max-w-xl rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-jaman-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-jaman-saffron">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-jaman-navy">
                End of Day Settlement — {summary.display_date}
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                {summary.business_day_id} • Step {step <= 5 ? `${step} of 5` : 'Completed'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-jaman-navy rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* STEP 1: DAY REVENUE & ORDER SUMMARY */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-jaman-navy">
                  Step 1: Business Day Performance Summary
                </span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Status: {summary.status}
                </span>
              </div>

              {/* Financial KPI Grid */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Gross Sales</span>
                  <strong className="text-sm sm:text-base font-black font-mono text-jaman-navy">{formatINR(summary.gross_sales)}</strong>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Discounts</span>
                  <strong className="text-sm sm:text-base font-black font-mono text-rose-600">- {formatINR(summary.discounts)}</strong>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">GST (5%)</span>
                  <strong className="text-sm sm:text-base font-black font-mono text-slate-700">{formatINR(summary.tax_amount)}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3.5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Net Restaurant Revenue</span>
                  <strong className="text-lg font-black font-mono text-emerald-700">{formatINR(summary.net_sales)}</strong>
                </div>
                <div className="p-3.5 bg-white rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Completed Orders</span>
                  <strong className="text-lg font-black font-mono text-jaman-navy">{summary.completed_orders} of {summary.total_orders}</strong>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border space-y-2 text-xs">
                <span className="font-bold text-jaman-navy block">Payment Collections Breakdown:</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">💵 Cash</span>
                    <strong className="font-mono text-xs font-black text-jaman-navy">{formatINR(summary.cash_sales)}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">📱 UPI / QR</span>
                    <strong className="font-mono text-xs font-black text-jaman-navy">{formatINR(summary.upi_sales)}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">💳 Card</span>
                    <strong className="font-mono text-xs font-black text-jaman-navy">{formatINR(summary.card_sales)}</strong>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>Step 2: Check Open Orders</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: OPEN ORDERS & BLOCKING ITEMS CHECK */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-jaman-navy">
                  Step 2: Open Items & Pre-Close Validation
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-jaman-border space-y-3">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-jaman-cream border border-jaman-border">
                    <span className="font-bold text-slate-700">Active Dining / In-Progress Orders:</span>
                    <span className={`font-black px-2.5 py-0.5 rounded-full ${
                      summary.active_orders === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {summary.active_orders} Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-jaman-cream border border-jaman-border">
                    <span className="font-bold text-slate-700">Unpaid / Pending Invoices:</span>
                    <span className={`font-black px-2.5 py-0.5 rounded-full ${
                      summary.unpaid_orders_count === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {summary.unpaid_orders_count} Unpaid
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-jaman-cream border border-jaman-border">
                    <span className="font-bold text-slate-700">Pending Kitchen KOT Tickets:</span>
                    <span className={`font-black px-2.5 py-0.5 rounded-full ${
                      summary.active_kots_count === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {summary.active_kots_count} in Kitchen
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-jaman-cream border border-jaman-border">
                    <span className="font-bold text-slate-700">Cart Sessions on Hold:</span>
                    <span className={`font-black px-2.5 py-0.5 rounded-full ${
                      summary.held_carts_count === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
                    }`}>
                      {summary.held_carts_count} Held
                    </span>
                  </div>
                </div>
              </div>

              {summary.has_blocking_items && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-black text-amber-950">Active Transactions Detected</strong>
                    {summary.blocking_reasons.join(' ')} You can still proceed if you are closing the day with authorized exceptions.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>Step 3: Cash Drawer Count</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CASH DRAWER RECONCILIATION */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-jaman-navy">
                  Step 3: Cash Drawer Reconciliation
                </span>
                <span className="text-[10px] font-mono text-slate-400">DRAWER MATH</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Opening Cash Float:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(summary.opening_cash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cash Sales Collected:</span>
                  <strong className="font-mono text-emerald-700">+ {formatINR(summary.cash_sales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cash Refunds Paid Out:</span>
                  <strong className="font-mono text-rose-600">- {formatINR(summary.refunds)}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 font-bold text-sm text-jaman-navy">
                  <span>Expected Cash in Drawer:</span>
                  <span className="font-mono text-base font-black text-jaman-navy">{formatINR(expectedCash)}</span>
                </div>
              </div>

              {/* Counted Cash Input */}
              <div className="bg-[#FFFDFB] p-4 rounded-2xl border-2 border-amber-500/40 space-y-2">
                <label className="block text-xs font-black text-jaman-navy">
                  Enter Counted Physical Cash in Drawer:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    placeholder={String(expectedCash)}
                    className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xl font-black font-mono text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                  />
                  <button
                    type="button"
                    onClick={() => setActualCashInput(String(expectedCash))}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl shrink-0 cursor-pointer"
                  >
                    Exact ({expectedCash})
                  </button>
                </div>

                {/* Variance Display */}
                <div className="flex items-center justify-between pt-2 text-xs">
                  <span className="font-bold text-slate-600">Calculated Cash Variance:</span>
                  <span className={`font-mono font-black text-sm ${
                    variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-blue-600' : 'text-rose-600'
                  }`}>
                    {variance === 0 ? '✓ Balanced (₹0)' : variance > 0 ? `+ ₹${variance} (Over)` : `- ₹${Math.abs(variance)} (Short)`}
                  </span>
                </div>

                {variance !== 0 && (
                  <div className="pt-2">
                    <input
                      type="text"
                      value={varianceReason}
                      onChange={(e) => setVarianceReason(e.target.value)}
                      placeholder="Reason for cash discrepancy (required for audit)..."
                      className="w-full bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>Step 4: Payment Reconciliation</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PAYMENT RECONCILIATION */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-jaman-navy">
                  Step 4: Digital & Non-Cash Settlement
                </span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-jaman-border space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold">Cash Drawer Settled:</span>
                  </div>
                  <strong className="font-mono font-black text-sm text-jaman-navy">{formatINR(actualCash)}</strong>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    <span className="font-bold">UPI / QR Collections:</span>
                  </div>
                  <strong className="font-mono font-black text-sm text-blue-700">{formatINR(summary.upi_sales)}</strong>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span className="font-bold">Credit / Debit Card Terminal:</span>
                  </div>
                  <strong className="font-mono font-black text-sm text-purple-700">{formatINR(summary.card_sales)}</strong>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#FFF4ED] border border-[#FDBA74] rounded-xl text-jaman-navy">
                  <span className="font-extrabold">Total Day Net Collections:</span>
                  <strong className="font-mono font-black text-base text-jaman-saffron">
                    {formatINR(summary.net_collected)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>Step 5: Final Confirmation & Lock</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: FINAL CONFIRMATION & ATOMIC LOCK */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-jaman-navy">
                  Step 5: Final Confirmation & Day Lock
                </span>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  IRREVERSIBLE
                </span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-jaman-border space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="font-black text-jaman-navy block">
                      Locking Business Day: {summary.display_date} ({summary.business_day_id})
                    </strong>
                    <p className="text-slate-500 leading-relaxed">
                      Once closed, this business day's transactions and financial records become permanently immutable and archived. The system will immediately initialize the next business day.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span>Authorized Cashier:</span>
                    <strong className="text-jaman-navy">{closedByName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Closing Total Billed (incl. GST):</span>
                    <strong className="text-jaman-navy">{formatINR(summary.net_sales)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Final Cash Counted:</span>
                    <strong className="text-jaman-navy">{formatINR(actualCash)}</strong>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeClose}
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>Confirm & Close Business Day</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: SUCCESS & NEXT DAY INITIALIZATION */}
          {step === 6 && closedResult && (
            <div className="p-6 text-center space-y-4 animate-in zoom-in-95">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              {/* 1. Closed Business Day Summary */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-jaman-navy text-xs font-black">
                  <span>✓ BUSINESS DAY CLOSED</span>
                </div>
                <h3 className="text-lg font-black text-jaman-navy">
                  {closedResult.closedDay.displayDate}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {closedResult.closedDay.id} • Finalized & Archived
                </p>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-jaman-border grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Final Sales</span>
                  <strong className="font-mono text-sm font-black text-jaman-navy">{formatINR(closedResult.closedDay.netSales)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Orders</span>
                  <strong className="font-mono text-sm font-black text-jaman-navy">{closedResult.closedDay.orderCount}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cash Variance</span>
                  <strong className={`font-mono text-sm font-black ${closedResult.closedDay.cashVariance === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatINR(closedResult.closedDay.cashVariance || 0)}
                  </strong>
                </div>
              </div>

              {/* 2. New Business Day Announcement */}
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-left space-y-1">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-black">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>✓ NEXT BUSINESS DAY ACTIVE — {closedResult.newDay.displayDate}</span>
                </div>
                <p className="text-[11px] text-emerald-700">
                  Business Day {closedResult.newDay.id} opened with ₹{closedResult.newDay.openingCash} float. Order counters reset for the new session while past day history is safely preserved.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onStartNewOrder) onStartNewOrder();
                  }}
                  className="py-2.5 bg-jaman-saffron hover:bg-[#d55e14] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Start New Order</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onViewEodReport) onViewEodReport(closedResult.closedDay);
                  }}
                  className="py-2.5 bg-jaman-navy hover:bg-[#123652] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>View EOD Report</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
