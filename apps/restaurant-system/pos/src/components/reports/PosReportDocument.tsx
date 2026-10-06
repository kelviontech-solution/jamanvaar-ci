import React from 'react';
import { ReportFullData, ReportDesign } from '../../services/pdfReportBuilder';
import { db, ReceiptRepository } from '@jamanvaar/database';
import { formatINR, formatSplitTax } from '@jamanvaar/utils';
import {
  Building2,
  Calendar,
  Clock,
  TrendingUp,
  Receipt,
  Banknote,
  QrCode,
  CreditCard,
  ChefHat,
  Percent,
  CheckCircle2,
  Layers,
  Award,
  Sparkles, CalendarDays } from 'lucide-react';

interface PosReportDocumentProps {
  data: ReportFullData;
  design?: ReportDesign;
}

export const PosReportDocument: React.FC<PosReportDocumentProps> = ({
  data,
  design = 'CLASSIC'
}) => {
  const config = ReceiptRepository.getConfig();
  // This restaurant's own details only; anything it has not entered is left out.
  const restName = config.restaurantName || db.restaurant.name || '';
  const gstin = config.gstin || db.restaurant.gstin || '';
  const phone = config.phone || db.restaurant.phone || '';
  const address = config.address || db.outlet?.address || db.restaurant.address || '';
  const identityLine = [address, gstin && `GSTIN: ${gstin}`, phone && `Phone: ${phone}`].filter(Boolean).join(' • ');

  const s = data.summary;

  return (
    <div className={`w-full bg-white text-jaman-navy select-text font-sans ${
      design === 'COMPACT' ? 'p-4 text-xs' : 'p-6 sm:p-8 space-y-6 text-sm'
    }`}>
      {/* 1. HEADER BASED ON DESIGN */}
      {design === 'BRANDED' ? (
        <div className="bg-gradient-to-r from-jaman-navy via-[#123652] to-jaman-navy text-white p-6 rounded-3xl shadow-md border border-jaman-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-black text-xl tracking-tight text-white">{restName.toUpperCase()}</span>
              <span className="bg-jaman-saffron text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                AUTHENTIC DINING
              </span>
            </div>
            {identityLine && <p className="text-xs text-slate-300">{identityLine}</p>}
          </div>

          <div className="text-left sm:text-right border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
            <span className="text-[10px] font-black tracking-widest text-jaman-saffron uppercase block">
              OPERATIONAL AUDIT REPORT
            </span>
            <h2 className="text-lg font-black text-white">{data.title}</h2>
            <span className="text-xs text-slate-300 font-mono block mt-0.5">{data.periodLabel}</span>
          </div>
        </div>
      ) : design === 'MODERN' ? (
        <div className="bg-jaman-cream border-2 border-jaman-border p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black text-jaman-saffron uppercase tracking-wider block">
              EXECUTIVE MANAGEMENT REPORT
            </span>
            <h1 className="text-xl font-black text-jaman-navy">{data.title}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {restName} • {address}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs font-mono font-bold bg-white border border-jaman-border px-3 py-1 rounded-xl inline-block shadow-2xs">
              <CalendarDays className="w-3 h-3 inline -mt-0.5 mr-1" />{data.periodLabel}
            </span>
            <span className="text-[10px] text-slate-400 block mt-1">
              Generated: {data.generatedAt}
            </span>
          </div>
        </div>
      ) : design === 'COMPACT' ? (
        <div className="border-b-2 border-jaman-navy pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-black text-jaman-navy">{restName.toUpperCase()} — {data.title.toUpperCase()}</h1>
            <span className="text-[10px] text-slate-500">GSTIN: {gstin} • Period: {data.periodLabel}</span>
          </div>
          <div className="text-right text-[10px] text-slate-400 font-mono">
            {data.generatedAt}
          </div>
        </div>
      ) : (
        /* CLASSIC & STATEMENT */
        <div className="border-b border-jaman-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-jaman-navy">{restName.toUpperCase()}</h1>
            </div>
            {identityLine && <p className="text-xs text-slate-500 mt-0.5">{identityLine}</p>}
          </div>
          <div className="text-left sm:text-right">
            <h2 className="text-base font-black text-jaman-navy uppercase">{data.title}</h2>
            <span className="text-xs text-jaman-saffron font-bold block">{data.periodLabel}</span>
            <span className="text-[10px] text-slate-400 block">Generated: {data.generatedAt}</span>
          </div>
        </div>
      )}

      {/* 2. PRIMARY KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#FFFDFB] border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
            Total Billed (incl. GST)
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-jaman-navy">
            {formatINR(s.netSales)}
          </div>
          <span className="text-[10px] font-bold text-emerald-600 block">
            ● {s.ordersCount} Total Orders
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFDFB] border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
            Average Order Value
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-jaman-navy">
            {formatINR(s.avgOrderValue)}
          </div>
          <span className="text-[10px] text-slate-400 block">Per bill average</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFDFB] border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
            Cash Collections
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-700">
            {formatINR(s.paymentBreakdown.cash)}
          </div>
          <span className="text-[10px] text-slate-400 block">Drawer cash collected</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFDFB] border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
            GST & Taxes (5%)
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-700">
            {formatINR(s.totalTax)}
          </div>
          <span className="text-[10px] text-slate-400 block">CGST + SGST</span>
        </div>
      </div>

      {/* 3. FINANCIAL STATEMENT & PAYMENT MIX (2 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue Statement */}
        <div className="bg-jaman-cream border border-jaman-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <span className="font-black text-xs uppercase tracking-wider text-jaman-navy">
              Financial & Tax Breakdown
            </span>
            <span className="text-[10px] font-mono text-slate-400">AUDIT</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Gross Food & Beverage Sales:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.grossSales)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Discounts Granted:</span>
              <strong className="font-mono text-rose-600">- {formatINR(s.discountAmount)}</strong>
            </div>
            {/* B2-036: derived from the same total as "Total Tax Collected" below via
                formatSplitTax, so all three figures on this document always agree. */}
            <div className="flex justify-between text-slate-600">
              <span>CGST:</span>
              <strong className="font-mono text-slate-800">{formatSplitTax(s.totalTax, s.cgstAmount, s.sgstAmount).cgst}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SGST:</span>
              <strong className="font-mono text-slate-800">{formatSplitTax(s.totalTax, s.cgstAmount, s.sgstAmount).sgst}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Tax Collected:</span>
              <strong className="font-mono text-slate-800">{formatINR(s.totalTax)}</strong>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-jaman-navy">
              <span>Total Collected (incl. GST):</span>
              <span className="font-mono text-emerald-700">{formatINR(s.netSales)}</span>
            </div>
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="bg-jaman-cream border border-jaman-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <span className="font-black text-xs uppercase tracking-wider text-jaman-navy">
              Settlement Mix & Tender Allocation
            </span>
            <span className="text-[10px] font-mono text-slate-400">100% RECONCILED</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Cash at Counter:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.paymentBreakdown.cash)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>UPI / Bharat QR:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.paymentBreakdown.upi)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Credit / Debit Cards:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.paymentBreakdown.card)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Split Tender Payments:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.paymentBreakdown.split)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Digital Wallets / Other:</span>
              <strong className="font-mono text-jaman-navy">{formatINR(s.paymentBreakdown.wallet + s.paymentBreakdown.other)}</strong>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-jaman-navy">
              <span>Total Payment Reconciled:</span>
              <span className="font-mono text-jaman-navy">{formatINR(s.totalCollected)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TOP DISHES TABLE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-xs uppercase tracking-wider text-jaman-navy">
            Top Selling Dishes & Menu Velocity
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {data.topItems.length} items ranked
          </span>
        </div>

        <div className="border border-jaman-border rounded-2xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-jaman-cream text-slate-500 font-bold border-b border-jaman-border">
              <tr>
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3">Dish Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Qty Sold</th>
                <th className="py-2.5 px-3 text-right">Avg Rate</th>
                <th className="py-2.5 px-3 text-right">Gross Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topItems.slice(0, 10).map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-3 font-bold text-jaman-navy">{it.name}</td>
                  <td className="py-2 px-3 text-slate-500 text-[11px]">{it.categoryName || 'Main Course'}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-jaman-navy">{it.quantitySold}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">{formatINR(it.avgPrice)}</td>
                  <td className="py-2 px-3 text-right font-mono font-extrabold text-jaman-navy">{formatINR(it.grossRevenue)}</td>
                </tr>
              ))}
              {data.topItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No completed dish sales recorded for this business period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. CASHIER PERFORMANCE (If available) */}
      {data.cashiers && data.cashiers.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-wider text-jaman-navy">
            Cashier Shift & Counter Performance
          </h3>
          <div className="border border-jaman-border rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-jaman-cream text-slate-500 font-bold border-b border-jaman-border">
                <tr>
                  <th className="py-2 px-3">Cashier Name</th>
                  <th className="py-2 px-3 text-right">Orders</th>
                  <th className="py-2 px-3 text-right">Cash Tender</th>
                  <th className="py-2 px-3 text-right">UPI / QR</th>
                  <th className="py-2 px-3 text-right">Total Billed (incl. GST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cashiers.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-bold text-jaman-navy">{c.name}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.ordersCount}</td>
                    <td className="py-2 px-3 text-right font-mono">{formatINR(c.cash)}</td>
                    <td className="py-2 px-3 text-right font-mono">{formatINR(c.upi)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-jaman-navy">{formatINR(c.netSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. AUDIT FOOTER */}
      <div className="pt-4 border-t border-jaman-border flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
        <span>{restName} • JAMANVAAR POS Operational Audit System</span>
        <span>{config.footerMessage || 'Thank you for your valued patronage'}</span>
      </div>
    </div>
  );
};
