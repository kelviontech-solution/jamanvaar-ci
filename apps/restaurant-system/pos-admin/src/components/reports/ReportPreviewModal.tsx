import React, { useState } from 'react';
import { Order } from '@jamanvaar/types';
import { JAMANVAAR_LOGOS } from '@jamanvaar/ui';
import { formatDate, formatTime, formatINR } from '@jamanvaar/utils';
import {
  ReportDesignTheme,
  ReportSummaryMetrics,
  ReportDateRange,
  HourlySalesBucket,
  DishPerformanceRow,
  GstTaxBreakdownRow,
  DayRow
} from './reportDataEngine';
import { ReportExportService } from './reportExportService';
import {
  X,
  Printer,
  FileSpreadsheet,
  Palette,
  Monitor,
  FileText,
  Receipt,
  Download,
  Share2,
  Check,
  TrendingUp,
  Building2,
  Calendar,
  Clock,
  UserCheck
} from 'lucide-react';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTitle: string;
  dateRange: ReportDateRange;
  theme: ReportDesignTheme;
  onOpenDesignSelector: () => void;
  summary: ReportSummaryMetrics;
  hourly: HourlySalesBucket[];
  dishes: DishPerformanceRow[];
  gst: GstTaxBreakdownRow[];
  days: DayRow[];
  orders: Order[];
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  reportTitle,
  dateRange,
  theme,
  onOpenDesignSelector,
  summary,
  hourly,
  dishes,
  gst,
  days,
  orders
}) => {
  const [viewMode, setViewMode] = useState<'A4' | 'DESKTOP' | 'THERMAL'>('A4');
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const generatedTime = new Date();

  // Deterministic content fingerprint (DJB2-style hash) instead of
  // Math.random() — a document verification hash must actually change only
  // when the underlying report content changes, and reproduce the same
  // value on reprint of the same data.
  const computeContentHash = (input: string): string => {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(36).toUpperCase();
  };
  const systemHash = computeContentHash(
    `${reportTitle}|${dateRange.label}|${orders.length}|${summary.netSales.current}|${summary.ordersCount.current}`
  );

  // Print layout trigger
  const handlePrint = () => {
    window.print();
  };

  // CSV trigger
  const handleExportCsv = () => {
    ReportExportService.exportTransactionsCsv(orders, reportTitle);
  };

  // Style variations based on selected theme
  const getThemeStyles = () => {
    switch (theme) {
      case 'CLASSIC_ACCOUNTING':
        return {
          wrapper: 'bg-white text-slate-900 font-serif',
          headerBorder: 'border-b-2 border-black pb-4',
          card: 'border border-slate-400 bg-white p-3',
          kpiNum: 'font-mono font-black text-black text-lg',
          tableHead: 'bg-slate-100 border-y-2 border-black text-black font-bold uppercase text-[10px]',
          tableBorder: 'border-b border-slate-300',
          totalRow: 'border-t-2 border-b-4 border-black font-black bg-slate-50',
          accentText: 'text-black font-black'
        };

      case 'EXECUTIVE_DASHBOARD':
        return {
          wrapper: 'bg-slate-50 text-slate-900',
          headerBorder: 'border-b-2 border-blue-600 pb-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 -mx-8 -mt-8 mb-6 rounded-t-3xl',
          card: 'border border-blue-100 bg-white p-4 rounded-2xl shadow-sm',
          kpiNum: 'font-mono font-black text-blue-950 text-2xl',
          tableHead: 'bg-blue-900 text-white font-black uppercase text-[10px] rounded-t-xl',
          tableBorder: 'border-b border-slate-200',
          totalRow: 'bg-blue-50 border-t-2 border-blue-600 font-black text-blue-950',
          accentText: 'text-blue-700 font-extrabold'
        };

      case 'COMPACT_POS':
        return {
          wrapper: 'bg-white text-slate-900 text-[11px]',
          headerBorder: 'border-b border-slate-300 pb-2 mb-3',
          card: 'border border-slate-200 bg-slate-50/60 p-2 rounded-lg',
          kpiNum: 'font-mono font-black text-slate-900 text-base',
          tableHead: 'bg-slate-200 text-slate-800 font-bold uppercase text-[9px]',
          tableBorder: 'border-b border-slate-200',
          totalRow: 'bg-slate-100 border-t border-b-2 border-slate-900 font-black',
          accentText: 'text-jaman-saffron font-bold'
        };

      case 'PREMIUM_INSIGHTS':
        return {
          wrapper: 'bg-[#FCFAF7] text-slate-900',
          headerBorder: 'border-b-2 border-amber-500/80 pb-5 mb-5',
          card: 'border border-amber-200/60 bg-white p-4 rounded-2xl shadow-xs',
          kpiNum: 'font-mono font-black text-jaman-navy text-xl',
          tableHead: 'bg-jaman-navy text-amber-300 font-black uppercase text-[10px]',
          tableBorder: 'border-b border-amber-100',
          totalRow: 'bg-amber-50/80 border-t-2 border-amber-600 font-black text-jaman-navy',
          accentText: 'text-amber-800 font-bold'
        };

      case 'MODERN_RESTAURANT':
      default:
        return {
          wrapper: 'bg-jaman-ivory text-jaman-navy',
          headerBorder: 'border-b border-jaman-border pb-4 mb-4',
          card: 'border border-jaman-border bg-white p-4 rounded-2xl shadow-xs',
          kpiNum: 'font-mono font-black text-jaman-navy text-xl',
          tableHead: 'bg-jaman-cream border-y border-jaman-border text-slate-600 font-bold uppercase text-[10px]',
          tableBorder: 'border-b border-slate-100',
          totalRow: 'bg-[#FFF7ED] border-t-2 border-jaman-saffron font-black text-jaman-navy',
          accentText: 'text-jaman-saffron font-bold'
        };
    }
  };

  const st = getThemeStyles();

  return (
    <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-[#EFECE6] border border-[#D5CEC2] rounded-3xl max-w-6xl w-full h-[95vh] flex flex-col shadow-2xl overflow-hidden print:border-none print:shadow-none print:h-auto print:max-w-none print:bg-white">
        {/* Top Action Toolbar (Hidden in Print) */}
        <div className="p-3.5 bg-white border-b border-jaman-border flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-jaman-border hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>← Back</span>
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-extrabold text-jaman-navy uppercase tracking-wider">
              {reportTitle} • Document Preview
            </span>
          </div>

          {/* Center Viewport Selector */}
          <div className="flex items-center bg-jaman-cream border border-jaman-border rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode('A4')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'A4' ? 'bg-jaman-navy text-white shadow-xs' : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>A4 Document</span>
            </button>
            <button
              onClick={() => setViewMode('DESKTOP')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'DESKTOP' ? 'bg-jaman-navy text-white shadow-xs' : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Wide View</span>
            </button>
            <button
              onClick={() => setViewMode('THERMAL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'THERMAL' ? 'bg-jaman-navy text-white shadow-xs' : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>80mm Slip</span>
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenDesignSelector}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-jaman-saffron rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Change Design ({theme.replace('_', ' ')})</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#E6E1D8] print:p-0 print:bg-white print:overflow-visible">
          {/* Document Sheet */}
          <div
            className={`transition-all bg-white print:w-full print:max-w-none print:shadow-none print:border-none print:p-0 ${
              viewMode === 'A4'
                ? 'w-full max-w-[800px] p-8 sm:p-10 rounded-3xl shadow-xl border border-[#D5CEC2]'
                : viewMode === 'DESKTOP'
                ? 'w-full max-w-5xl p-8 sm:p-10 rounded-3xl shadow-xl border border-[#D5CEC2]'
                : 'w-full max-w-[380px] p-4 rounded-2xl shadow-xl border border-slate-300 font-mono'
            }`}
          >
            {/* DOCUMENT HEADER */}
            <div className={st.headerBorder}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <img
                      src={JAMANVAAR_LOGOS.horizontal}
                      alt="JAMANVAAR"
                      className="h-10 w-auto object-contain"
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    <p className="font-bold text-jaman-navy">Ahmedabad Flagship Store • Branch #01</p>
                    <p>Near Iscon Circle, SG Highway, Ahmedabad, Gujarat 380015</p>
                    <p className="font-mono text-[10px]">GSTIN: 24AABCJ1984K1Z5 • FSSAI: 10722026000412</p>
                  </div>
                </div>

                <div className="text-left sm:text-right space-y-1 text-xs">
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-jaman-navy text-white font-black text-[10px] uppercase tracking-wider">
                    OFFICIAL REPORT
                  </span>
                  <h2 className="text-lg font-black text-jaman-navy uppercase tracking-tight">{reportTitle}</h2>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <p className="flex items-center sm:justify-end gap-1 font-bold text-slate-700">
                      <Calendar className="w-3 h-3 text-jaman-saffron" />
                      <span>Period: {dateRange.label}</span>
                    </p>
                    <p className="flex items-center sm:justify-end gap-1 text-[10px]">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Generated: {formatDate(generatedTime)} at {formatTime(generatedTime)}</span>
                    </p>
                    <p className="flex items-center sm:justify-end gap-1 text-[10px]">
                      <UserCheck className="w-3 h-3 text-slate-400" />
                      <span>Verified by: Lead Cashier (Amit Dave)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* SUMMARY METRIC KPI CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
              <div className={st.card}>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Gross Sales</span>
                <div className={st.kpiNum}>{formatINR(summary.grossSales.current)}</div>
                <span className="text-[10px] text-slate-400 font-semibold">{summary.ordersCount.current} Total Orders</span>
              </div>

              <div className={st.card}>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Discounts</span>
                <div className="font-mono font-black text-rose-600 text-lg">
                  -{formatINR(summary.discountAmount.current)}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Promos & VIP</span>
              </div>

              <div className={st.card}>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">GST Tax (2.5%+2.5%)</span>
                <div className="font-mono font-black text-jaman-saffron text-lg">
                  {formatINR(summary.totalTax.current)}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">CGST + SGST (5%)</span>
              </div>

              <div className="border border-emerald-300 bg-emerald-50/80 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-emerald-900 uppercase block">Net Collected</span>
                <div className="font-mono font-black text-emerald-950 text-xl">
                  {formatINR(summary.netSales.current)}
                </div>
                <span className="text-[10px] text-emerald-700 font-bold">AOV: ₹{summary.avgOrderValue.current}</span>
              </div>
            </div>

            {/* PAYMENT TENDER SUMMARY */}
            <div className="bg-jaman-cream border border-jaman-border rounded-2xl p-4 my-5 space-y-2">
              <h4 className="font-extrabold text-xs text-jaman-navy uppercase tracking-wider">
                Payment Collection Breakdown (Tender Reconciliation)
              </h4>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">💵 Cash</span>
                  <span className="font-mono font-black text-sm text-jaman-navy">
                    {formatINR(summary.cashCollected.current)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">📱 UPI BharatQR</span>
                  <span className="font-mono font-black text-sm text-jaman-navy">
                    {formatINR(summary.upiCollected.current)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">💳 Card POS</span>
                  <span className="font-mono font-black text-sm text-jaman-navy">
                    {formatINR(summary.cardCollected.current)}
                  </span>
                </div>
              </div>
            </div>

            {/* HOURLY SALES BAR VISUALIZATION */}
            {hourly.length > 0 && (
              <div className="my-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-jaman-navy uppercase tracking-wider">
                    Hourly Sales Trend (Peak Rush Hours)
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">10 AM - 11 PM</span>
                </div>

                <div className="bg-jaman-cream border border-jaman-border rounded-2xl p-3.5">
                  <div className="flex items-end gap-1.5 h-24 pt-4 px-2">
                    {(() => {
                      const maxSales = Math.max(...hourly.map((h) => h.sales), 1);
                      return hourly.map((h) => {
                        const heightPct = Math.round((h.sales / maxSales) * 100);
                        return (
                          <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                            {h.sales > 0 && (
                              <span className="text-[8px] font-mono font-bold text-jaman-saffron absolute -top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                ₹{Math.round(h.sales / 1000)}k
                              </span>
                            )}
                            <div className="w-full bg-slate-200/80 rounded-t-md h-full flex items-end">
                              <div
                                style={{ height: `${Math.max(heightPct, 4)}%` }}
                                className={`w-full rounded-t-md transition-all ${
                                  h.sales > 0
                                    ? 'bg-jaman-saffron group-hover:bg-[#EA580C]'
                                    : 'bg-transparent'
                                }`}
                              />
                            </div>
                            <span className="text-[8px] font-mono text-slate-500 whitespace-nowrap">
                              {h.hour % 12 || 12}
                              {h.hour >= 12 ? 'p' : 'a'}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* TOP DISHES RANKING TABLE */}
            <div className="my-6 space-y-2">
              <h4 className="font-extrabold text-xs text-jaman-navy uppercase tracking-wider">
                Top Performing Menu Dishes
              </h4>

              <div className="rounded-2xl border border-jaman-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className={st.tableHead}>
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">Dish Name</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Qty Sold</th>
                      <th className="p-2.5 text-right">Gross Sales</th>
                      <th className="p-2.5 text-right">Revenue %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dishes.slice(0, 8).map((d, idx) => (
                      <tr key={d.id} className={st.tableBorder}>
                        <td className="p-2.5 font-mono font-bold text-jaman-saffron">#{idx + 1}</td>
                        <td className="p-2.5 font-bold text-jaman-navy">{d.name}</td>
                        <td className="p-2.5 text-slate-500">{d.categoryName}</td>
                        <td className="p-2.5 font-mono font-bold text-right">{d.quantitySold}</td>
                        <td className="p-2.5 font-mono font-black text-right text-emerald-800">{formatINR(d.grossRevenue)}</td>
                        <td className="p-2.5 font-mono font-bold text-right text-slate-600">{d.revenueSharePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={st.totalRow}>
                      <td colSpan={3} className="p-2.5 font-black uppercase">Top 8 Dishes Total</td>
                      <td className="p-2.5 font-mono font-black text-right">
                        {dishes.slice(0, 8).reduce((acc, d) => acc + d.quantitySold, 0)}
                      </td>
                      <td className="p-2.5 font-mono font-black text-right">
                        {formatINR(dishes.slice(0, 8).reduce((acc, d) => acc + d.grossRevenue, 0))}
                      </td>
                      <td className="p-2.5 font-mono font-black text-right">
                        {Math.round(dishes.slice(0, 8).reduce((acc, d) => acc + d.revenueSharePercent, 0))}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* GST STATUTORY AUDIT TABLE */}
            <div className="my-6 space-y-2">
              <h4 className="font-extrabold text-xs text-jaman-navy uppercase tracking-wider">
                Statutory GST Tax Summary (5% Standard Food GST)
              </h4>

              <div className="rounded-2xl border border-jaman-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className={st.tableHead}>
                    <tr>
                      <th className="p-2.5">GST Rate</th>
                      <th className="p-2.5">Invoices Count</th>
                      <th className="p-2.5 text-right">Taxable Turnover</th>
                      <th className="p-2.5 text-right">CGST (2.5%)</th>
                      <th className="p-2.5 text-right">SGST (2.5%)</th>
                      <th className="p-2.5 text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gst.map((g, i) => (
                      <tr key={i} className={st.tableBorder}>
                        <td className="p-2.5 font-bold text-jaman-navy">{g.taxRatePercent}% Food GST</td>
                        <td className="p-2.5 font-mono">{g.invoicesCount} Invoices</td>
                        <td className="p-2.5 font-mono font-bold text-right">{formatINR(g.taxableAmount)}</td>
                        <td className="p-2.5 font-mono text-right text-jaman-saffron">{formatINR(g.cgstAmount)}</td>
                        <td className="p-2.5 font-mono text-right text-jaman-saffron">{formatINR(g.sgstAmount)}</td>
                        <td className="p-2.5 font-mono font-black text-right text-slate-900">{formatINR(g.totalTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DOCUMENT FOOTER & SIGNATURES */}
            <div className="pt-8 mt-6 border-t border-dashed border-slate-300 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-center text-xs">
                <div className="space-y-4">
                  <div className="h-8 border-b border-slate-300" />
                  <span className="font-bold text-slate-600 block text-[10px] uppercase">Prepared By (Cashier)</span>
                </div>
                <div className="space-y-4">
                  <div className="h-8 border-b border-slate-300" />
                  <span className="font-bold text-slate-600 block text-[10px] uppercase">Verified By (Manager)</span>
                </div>
                <div className="space-y-4">
                  <div className="h-8 border-b border-slate-300" />
                  <span className="font-bold text-slate-600 block text-[10px] uppercase">Restaurant Seal & Signature</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-3">
                <span>JAMANVAAR POS Enterprise Edition • Software Brand by KELVIONTECH</span>
                <span>Page 1 of 1 • System Hash: {systemHash}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
