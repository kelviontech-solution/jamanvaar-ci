import { useMemo, useState } from 'react';
import { db } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { ReportDataEngine, type ReportPeriodPreset } from '../reports/reportDataEngine';
import { ReportExportService } from '../reports/reportExportService';
import { LogOut, Wallet, Receipt, RotateCcw, Download } from 'lucide-react';

const PRESETS: Array<{ id: ReportPeriodPreset; label: string }> = [
  { id: 'TODAY', label: 'Today' },
  { id: 'YESTERDAY', label: 'Yesterday' },
  { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
  { id: 'THIS_MONTH', label: 'This Month' },
  { id: 'LAST_MONTH', label: 'Last Month' }
];

/**
 * #6: a read-only login for permitted staff -- collections, refunds, taxes and exports only.
 * Deliberately a separate, purpose-built screen rather than restricted access to the normal
 * console: every existing admin screen (Menu, Settings, Billing...) has write actions woven
 * through it, and auditing each one for role compliance would be easy to get wrong in one
 * spot. This component calls no Repository mutation method anywhere -- it is read-only by
 * construction, not by a permission check that could be bypassed or missed.
 */
export function AccountantView({ onLogout }: { onLogout: () => void }) {
  const [preset, setPreset] = useState<ReportPeriodPreset>('TODAY');
  const dateRange = useMemo(() => ReportDataEngine.getDateRange(preset), [preset]);
  const orders = useMemo(() => ReportDataEngine.getOrders(dateRange), [dateRange]);
  const summary = useMemo(() => ReportDataEngine.calculateSummary(orders), [orders]);
  const gst = useMemo(() => ReportDataEngine.getGstReport(orders), [orders]);
  const eod = useMemo(() => ReportDataEngine.getEodReconciliation(orders, dateRange), [orders, dateRange]);
  const refundedOrders = useMemo(
    () => orders.filter((o) => ['FULL_REFUND', 'PARTIAL_REFUND'].includes((o as unknown as { refundStatus?: string }).refundStatus ?? '')),
    [orders]
  );

  const card = 'rounded-2xl border border-jaman-border bg-white p-4 space-y-1';
  const label = 'text-[11px] font-bold text-slate-500 uppercase block';
  const value = 'text-lg font-mono font-bold text-jaman-navy';

  return (
    <div className="min-h-dvh bg-jaman-cream">
      <header className="bg-white border-b border-jaman-border p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-jaman-navy">{db.restaurant.name} — Accountant View</h1>
          <p className="text-xs text-slate-500">Read-only: collections, refunds, taxes and exports.</p>
        </div>
        <button type="button" onClick={onLogout} className="min-h-11 px-4 rounded-xl border border-jaman-border bg-white text-sm font-bold text-jaman-navy flex items-center gap-2">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                preset === p.id ? 'bg-brand/[0.09] text-brand border-brand/40' : 'bg-white text-jaman-navy border-jaman-border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{dateRange.label} · {orders.length} order(s)</p>

        <section className="space-y-2">
          <h2 className="font-bold text-sm text-jaman-navy flex items-center gap-2"><Wallet className="w-4 h-4" /> Collections</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className={card}><span className={label}>Cash</span><span className={value}>{formatINR(summary.cashCollected.current)}</span></div>
            <div className={card}><span className={label}>UPI</span><span className={value}>{formatINR(summary.upiCollected.current)}</span></div>
            <div className={card}><span className={label}>Card</span><span className={value}>{formatINR(summary.cardCollected.current)}</span></div>
            <div className={card}><span className={label}>Split</span><span className={value}>{formatINR(summary.splitCollected.current)}</span></div>
            <div className={`${card} bg-emerald-50/80 border-emerald-200`}><span className={label}>Net Collected</span><span className={value}>{formatINR(summary.netSales.current)}</span></div>
          </div>
          <div className="rounded-2xl border border-jaman-border bg-white p-4 text-xs text-slate-600 space-y-1">
            <p><b>Opening cash:</b> {formatINR(eod.openingCash)} · <b>Cash sales:</b> {formatINR(eod.cashSales)} · <b>Cash refunds:</b> {formatINR(eod.cashRefunds)}</p>
            <p><b>Expected cash in drawer:</b> {formatINR(eod.expectedCash)}{eod.actualCashCounted !== null && (
              <> · <b>Counted:</b> {formatINR(eod.actualCashCounted)} · <b className={eod.isBalanced ? 'text-emerald-700' : 'text-rose-700'}>{eod.isBalanced ? 'Balanced' : `Difference: ${formatINR(eod.cashDifference ?? 0)}`}</b></>
            )}{eod.actualCashCounted === null && <> · <span className="text-amber-700">No manager cash count recorded for this period yet.</span></>}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-sm text-jaman-navy flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Refunds</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className={card}><span className={label}>Refunded Orders</span><span className={value}>{summary.refundsCount.current}</span></div>
            <div className={`${card} border-rose-200`}><span className={label}>Refunded Amount</span><span className="text-lg font-mono font-bold text-rose-700">-{formatINR(summary.refundsAmount.current)}</span></div>
          </div>
          {refundedOrders.length > 0 && (
            <div className="rounded-2xl border border-jaman-border bg-white overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-jaman-cream text-slate-500 uppercase font-bold text-[11px]">
                  <tr><th className="p-2.5">Order</th><th className="p-2.5 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {refundedOrders.map((o) => (
                    <tr key={o.id}><td className="p-2.5 font-mono font-bold">{o.orderNumber}</td><td className="p-2.5 text-right font-mono">{formatINR(o.totalAmount || 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-sm text-jaman-navy flex items-center gap-2"><Receipt className="w-4 h-4" /> Taxes</h2>
          <div className="rounded-2xl border border-jaman-border bg-white overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-jaman-cream text-slate-500 uppercase font-bold text-[11px]">
                <tr><th className="p-2.5">Rate</th><th className="p-2.5 text-right">Taxable</th><th className="p-2.5 text-right">CGST</th><th className="p-2.5 text-right">SGST</th><th className="p-2.5 text-right">Total Tax</th><th className="p-2.5 text-right">Invoices</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gst.map((row) => (
                  <tr key={row.taxRatePercent}>
                    <td className="p-2.5 font-bold">{row.taxRatePercent}%</td>
                    <td className="p-2.5 text-right font-mono">{formatINR(row.taxableAmount)}</td>
                    <td className="p-2.5 text-right font-mono">{formatINR(row.cgstAmount)}</td>
                    <td className="p-2.5 text-right font-mono">{formatINR(row.sgstAmount)}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{formatINR(row.totalTax)}</td>
                    <td className="p-2.5 text-right">{row.invoicesCount}</td>
                  </tr>
                ))}
                {gst.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">No taxable orders in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-sm text-jaman-navy flex items-center gap-2"><Download className="w-4 h-4" /> Exports</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => ReportExportService.exportTransactionsCsv(orders, `Transactions - ${dateRange.label}`)} className="min-h-11 px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-xs font-bold">Export Transactions CSV</button>
            <button type="button" onClick={() => ReportExportService.exportGstCsv(gst)} className="min-h-11 px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-xs font-bold">Export GST CSV</button>
          </div>
        </section>
      </main>
    </div>
  );
}
