import React, { useState, useMemo } from 'react';
import { printElement } from '@jamanvaar/ui';
import { EodReport } from '@jamanvaar/types';
import { formatINR, formatDate, formatTime, formatSplitTax, restaurantGstRate, taxLabels } from '@jamanvaar/utils';
// The restaurant's configured GST (Customisations & Tax), read when shown.
const gstLabels = () => taxLabels(restaurantGstRate(db.taxGroups));
import { db } from '@jamanvaar/database';
import { EodReportService, DayOrdersService } from '@jamanvaar/business';
import {
  Printer,
  FileText,
  Lock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Calendar,
  Clock,
  User,
  Users,
  DollarSign,
  CreditCard,
  Building,
  Phone,
  Mail,
  ShieldCheck,
  Percent,
  Layers,
  Flame,
  Award,
  ChevronDown,
  Sparkles,
  Download
} from 'lucide-react';

interface EodZReportDocumentProps {
  initialReport?: EodReport;
  onClose?: () => void;
  showToast?: (msg: string) => void;
}

export const EodZReportDocument: React.FC<EodZReportDocumentProps> = ({
  initialReport,
  onClose,
  showToast
}) => {
  const [printPaperSize, setPrintPaperSize] = useState<'A4' | '80MM'>('A4');
  const [managerNotes, setManagerNotes] = useState(
    initialReport?.managerNotes || ''
  );
  
  // Default to current business day
  const defaultDateKey = useMemo(() => {
    return initialReport?.businessDate || DayOrdersService.getBusinessDateKey(new Date(), 6);
  }, [initialReport]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultDateKey);
  const [isLocked, setIsLocked] = useState(initialReport?.status === 'LOCKED');

  // Discover available business dates from database orders
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    db.orders.forEach((o) => {
      dates.add(DayOrdersService.getBusinessDateKey(o.createdAt, 6));
    });
    dates.add(DayOrdersService.getBusinessDateKey(new Date(), 6));
    return Array.from(dates).sort((a, b) => b.localeCompare(a)).slice(0, 6);
  }, []);

  // Generate / Recalculate official EOD report
  const report: EodReport = useMemo(() => {
    return EodReportService.generateEodReport(selectedDate, undefined, managerNotes);
  }, [selectedDate, managerNotes]);

  const handlePrint = () => {
    printElement('[data-print-doc="eod-z-report"]', {
      title: `Z-Report ${report.displayDate}`,
      pageSize: printPaperSize === 'A4' ? 'A4 portrait' : '80mm auto',
      margin: printPaperSize === 'A4' ? '10mm' : '2mm'
    });
  };

  const handleLockAndClose = () => {
    EodReportService.saveEodReport({ ...report, managerNotes, status: 'LOCKED' });
    setIsLocked(true);
    if (showToast) showToast(`Business Day ${report.displayDate} Locked & Saved!`);
  };

  return (
    <div className="space-y-6 select-none max-w-5xl mx-auto pb-12">
      
      {/* ========================================================================= */}
      {/* SCREEN ACTION BAR & CONTROLS (Hidden during print) */}
      {/* ========================================================================= */}
      <div className="no-print bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-jaman-navy text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-lg text-jaman-navy">
                  End of Day (EOD) Z-Report Statement
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    isLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isLocked ? 'LOCKED RECORD' : '● ACTIVE DRAFT'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Official daily closing statement • Audit & tax accounting document
              </p>
            </div>
          </div>

          {/* Paper Mode & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Format Switcher */}
            <div className="bg-jaman-cream p-1 rounded-2xl border border-jaman-border flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPrintPaperSize('A4')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  printPaperSize === 'A4'
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                A4 (2 Pages)
              </button>
              <button
                type="button"
                onClick={() => setPrintPaperSize('80MM')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  printPaperSize === '80MM'
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                80mm Thermal Slip
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-brand hover:bg-[#EA580C] text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 min-h-[40px]"
            >
              <Printer className="w-4 h-4" />
              <span>Print {printPaperSize} Statement</span>
            </button>

            {!isLocked && (
              <button
                type="button"
                onClick={handleLockAndClose}
                className="px-4 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 min-h-[40px]"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Lock & Close Day</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl min-h-[40px]"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Date Selection Bar */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-slate-400 font-bold text-[11px] uppercase mr-1">Select Day:</span>
            {availableDates.map((dateKey, idx) => (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  selectedDate === dateKey
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'bg-jaman-cream text-slate-700 hover:bg-slate-200 border border-jaman-border'
                }`}
              >
                {idx === 0 ? 'Today' : idx === 1 ? 'Yesterday' : dateKey}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold text-[11px]">Custom Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold font-mono text-jaman-navy"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. OFFICIAL A4 PAPER AUDIT DOCUMENT (CLEAN 2-PAGE PAGINATION) */}
      {/* ========================================================================= */}
      {printPaperSize === 'A4' && (
        <div data-print-doc="eod-z-report" className="bg-white p-6 sm:p-10 rounded-3xl border border-slate-300 shadow-sm print:border-none print:p-0 print:shadow-none font-sans text-slate-900 leading-normal text-xs space-y-5 eod-a4-document">
          
          {/* ================= PAGE 1 ================= */}
          <div className="space-y-4 print-avoid-break">
            
            {/* Section 1: REPORT HEADER (Source from Settings) */}
            <div className="border-b-2 border-jaman-navy pb-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-left">
                {report.branding.logoUrl && (
                  <img
                    src={report.branding.logoUrl}
                    alt="Logo"
                    className="w-14 h-14 object-contain rounded-xl border border-slate-200 p-0.5 bg-white"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <h1 className="text-xl font-black text-jaman-navy tracking-tight uppercase">
                    {report.branding.restaurantName}
                  </h1>
                  <span className="text-[11px] font-bold text-slate-600 block">
                    {report.branding.legalName}
                  </span>
                  <span className="text-[10px] text-slate-500 block italic">
                    {report.branding.tagline}
                  </span>
                </div>
              </div>

              {/* Legal Tax & Contact Credentials */}
              <div className="text-right text-[10px] text-slate-600 space-y-0.5 font-mono">
                {/* Only what the restaurant has actually filled in Restaurant Settings is printed; nothing is left as an empty label. */}
                {[report.branding.address, report.branding.city, [report.branding.state, report.branding.pincode].filter(Boolean).join(' ')].filter(Boolean).length > 0 && (
                  <div><strong>{[report.branding.address, report.branding.city, [report.branding.state, report.branding.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</strong></div>
                )}
                {(report.branding.gstin || report.branding.fssaiNumber) && (
                  <div>
                    {report.branding.gstin && <>GSTIN: <strong className="text-jaman-navy">{report.branding.gstin}</strong></>}
                    {report.branding.gstin && report.branding.fssaiNumber && ' • '}
                    {report.branding.fssaiNumber && <>FSSAI: <strong className="text-jaman-navy">{report.branding.fssaiNumber}</strong></>}
                  </div>
                )}
                {report.branding.msmeNumber && <div>MSME: <strong>{report.branding.msmeNumber}</strong></div>}
                {(report.branding.phone || report.branding.email) && (
                  <div>
                    {report.branding.phone && <>Phone: {report.branding.phone}</>}
                    {report.branding.phone && report.branding.email && ' • '}
                    {report.branding.email && <>Email: {report.branding.email}</>}
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: REPORT TITLE & META STRIP */}
            <div className="text-center py-1.5 border-b border-slate-200 space-y-0.5">
              <h2 className="text-base font-black text-jaman-navy tracking-wider uppercase underline underline-offset-4">
                END OF DAY (EOD) Z-REPORT
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-bold text-slate-700 pt-0.5">
                <span>Business Date: <strong className="text-brand font-mono">{report.displayDate}</strong></span>
                <span>•</span>
                <span>Shift: <strong>{report.shiftName}</strong></span>
                <span>•</span>
                <span>Report ID: <strong className="font-mono">{report.id}</strong></span>
                <span>•</span>
                <span>Generated: <strong className="font-mono">{report.generatedAtFormatted}</strong></span>
              </div>
            </div>

            {/* Section 3: SHIFT INFORMATION CARD */}
            <div className="bg-jaman-cream p-3 rounded-2xl border border-slate-300 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Cashier</span>
                <strong className="text-jaman-navy truncate block">{report.cashierName}</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">POS Terminal</span>
                <strong className="font-mono text-jaman-navy block">{report.terminalId}</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Opening Float</span>
                <strong className="font-mono text-jaman-navy block">{formatINR(report.openingFloat)}</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Closing Float</span>
                <strong className="font-mono text-emerald-800 block">{formatINR(report.closingFloat)}</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Shift Duration</span>
                <strong className="font-mono text-slate-700 text-[10px] block">{report.shiftDuration}</strong>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Orders Settled</span>
                <strong className="font-mono text-brand text-sm block">{report.ordersSettled}</strong>
              </div>
            </div>

            {/* Section 4: DAILY SUMMARY KPI CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
              <div className="p-2.5 bg-white border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">GROSS REVENUE</span>
                <span className="text-sm font-black font-mono text-jaman-navy block mt-0.5">
                  {formatINR(report.grossRevenue)}
                </span>
              </div>

              <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-emerald-900 block">NET REVENUE</span>
                <span className="text-sm font-black font-mono text-emerald-950 block mt-0.5">
                  {formatINR(report.netRevenue)}
                </span>
              </div>

              <div className="p-2.5 bg-white border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">ORDERS</span>
                <span className="text-sm font-black font-mono text-jaman-navy block mt-0.5">
                  {report.ordersSettled}
                </span>
              </div>

              <div className="p-2.5 bg-white border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">AVERAGE BILL</span>
                <span className="text-sm font-black font-mono text-jaman-navy block mt-0.5">
                  {formatINR(report.avgBillValue)}
                </span>
              </div>

              <div className="p-2.5 bg-white border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">GUESTS SERVED</span>
                <span className="text-sm font-black font-mono text-jaman-navy block mt-0.5">
                  {report.customersServed}
                </span>
              </div>

              <div className="p-2.5 bg-white border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">TABLES SERVED</span>
                <span className="text-sm font-black font-mono text-jaman-navy block mt-0.5">
                  {report.tablesServed}
                </span>
              </div>
            </div>

            {/* Section 5 & 6: SALES BREAKDOWN & DISCOUNTS / REFUNDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Sales Breakdown */}
              <div className="border border-slate-300 rounded-xl overflow-hidden print-avoid-break">
                <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                  5. Department Sales Breakdown
                </div>
                <div className="p-2.5 divide-y divide-slate-100 text-xs space-y-1">
                  <div className="flex justify-between py-0.5 font-semibold">
                    <span>Food Sales (Curries, Breads, Tandoor)</span>
                    <span className="font-mono font-bold">{formatINR(report.salesBreakdown.foodSales)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold">
                    <span>Beverages & Drinks</span>
                    <span className="font-mono font-bold">{formatINR(report.salesBreakdown.beverageSales)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold">
                    <span>Desserts & Sweets</span>
                    <span className="font-mono font-bold">{formatINR(report.salesBreakdown.dessertSales)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold">
                    <span>Other Delicacies</span>
                    <span className="font-mono font-bold">{formatINR(report.salesBreakdown.otherSales)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-300 font-black text-jaman-navy">
                    <span>Total Gross Sales</span>
                    <span className="font-mono">{formatINR(report.salesBreakdown.grossSales)}</span>
                  </div>
                </div>
              </div>

              {/* Discounts & Refunds */}
              <div className="border border-slate-300 rounded-xl overflow-hidden print-avoid-break">
                <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                  6. Discounts & Refunds Statement
                </div>
                <div className="p-2.5 divide-y divide-slate-100 text-xs space-y-1">
                  <div className="flex justify-between py-0.5 font-semibold text-slate-700">
                    <span>Manual Counter Discount</span>
                    <span className="font-mono">-{formatINR(report.discountsAndRefunds.manualDiscount)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold text-slate-700">
                    <span>Loyalty & VIP Discount</span>
                    <span className="font-mono">-{formatINR(report.discountsAndRefunds.loyaltyDiscount)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold text-slate-700">
                    <span>Promo / Coupon Discount</span>
                    <span className="font-mono">-{formatINR(report.discountsAndRefunds.couponDiscount)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-bold text-rose-600 bg-rose-50/50 px-1 rounded">
                    <span>Customer Refunds / Voids</span>
                    <span className="font-mono">-{formatINR(report.discountsAndRefunds.refundsAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-300 font-black text-rose-700">
                    <span>Total Net Deductions</span>
                    <span className="font-mono">-{formatINR(report.discountsAndRefunds.netDiscount)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Section 7: GST TAX SUMMARY TABLE */}
            <div className="border border-slate-300 rounded-xl overflow-hidden print-avoid-break">
              <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>7. Statutory GST Tax Accounting Summary</span>
                <span className="text-[9px] font-mono text-amber-300">{gstLabels().combined}</span>
              </div>
              <div className="p-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs text-center">
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-200">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Taxable Value</span>
                  <span className="font-mono font-black text-jaman-navy text-xs block mt-0.5">
                    {formatINR(report.gstSummary.taxableValue)}
                  </span>
                </div>
                {/* B2-036: derived from the same total as "Total GST" below via formatSplitTax. */}
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-200">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">{gstLabels().cgst}</span>
                  <span className="font-mono font-bold text-slate-800 text-xs block mt-0.5">
                    {formatSplitTax(report.gstSummary.totalTax, report.gstSummary.cgstAmount, report.gstSummary.sgstAmount).cgst}
                  </span>
                </div>
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-200">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">{gstLabels().sgst}</span>
                  <span className="font-mono font-bold text-slate-800 text-xs block mt-0.5">
                    {formatSplitTax(report.gstSummary.totalTax, report.gstSummary.cgstAmount, report.gstSummary.sgstAmount).sgst}
                  </span>
                </div>
                <div className="p-1.5 bg-orange-50 rounded-lg border border-orange-200">
                  <span className="text-[9px] text-brand font-bold block uppercase">Total {gstLabels().total}</span>
                  <span className="font-mono font-black text-brand text-xs block mt-0.5">
                    {formatINR(report.gstSummary.totalTax)}
                  </span>
                </div>
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-200">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Round Off</span>
                  <span className="font-mono font-bold text-slate-700 text-xs block mt-0.5">
                    {formatINR(report.gstSummary.roundOff)}
                  </span>
                </div>
                <div className="p-1.5 bg-emerald-100 rounded-lg border border-emerald-300">
                  <span className="text-[9px] text-emerald-900 font-black block uppercase">Final Collection</span>
                  <span className="font-mono font-black text-emerald-950 text-xs block mt-0.5">
                    {formatINR(report.gstSummary.finalCollection)}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 8 & 9: PAYMENT SETTLEMENT & SPLIT PAYMENT BREAKDOWN */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print-avoid-break">
              
              {/* Payment Settlement Table */}
              <div className="sm:col-span-2 border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                  8. Payment Settlement by Tender Type
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-slate-200 font-black text-slate-600">
                    <tr>
                      <th className="p-2">Method</th>
                      <th className="p-2 text-center">Orders</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    <tr>
                      <td className="p-1.5 font-bold">Cash</td>
                      <td className="p-1.5 text-center font-mono">{report.paymentSettlement.cash.count}</td>
                      <td className="p-1.5 text-right font-mono font-bold">{formatINR(report.paymentSettlement.cash.amount)}</td>
                    </tr>
                    <tr>
                      <td className="p-1.5 font-bold">UPI / QR</td>
                      <td className="p-1.5 text-center font-mono">{report.paymentSettlement.upi.count}</td>
                      <td className="p-1.5 text-right font-mono font-bold">{formatINR(report.paymentSettlement.upi.amount)}</td>
                    </tr>
                    <tr>
                      <td className="p-1.5 font-bold">Card (EDC)</td>
                      <td className="p-1.5 text-center font-mono">{report.paymentSettlement.card.count}</td>
                      <td className="p-1.5 text-right font-mono font-bold">{formatINR(report.paymentSettlement.card.amount)}</td>
                    </tr>
                    <tr>
                      <td className="p-1.5 font-bold">Wallet / House</td>
                      <td className="p-1.5 text-center font-mono">{report.paymentSettlement.wallet.count + report.paymentSettlement.houseAccount.count}</td>
                      <td className="p-1.5 text-right font-mono font-bold">{formatINR(report.paymentSettlement.wallet.amount + report.paymentSettlement.houseAccount.amount)}</td>
                    </tr>
                    <tr className="bg-jaman-cream font-black text-jaman-navy">
                      <td className="p-1.5">TOTAL SETTLED</td>
                      <td className="p-1.5 text-center font-mono">{report.ordersSettled}</td>
                      <td className="p-1.5 text-right font-mono text-emerald-800 text-sm">
                        {formatINR(report.paymentSettlement.totalCollection)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Split Payment Distribution */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                  9. Split Payment Matrix
                </div>
                <div className="p-2 space-y-1 text-xs">
                  <div className="p-1.5 bg-jaman-cream rounded-lg flex items-center justify-between font-bold">
                    <span>Cash + UPI</span>
                    <span className="font-mono text-slate-700">{report.splitSummary.cashUpiCount} Bills</span>
                  </div>
                  <div className="p-1.5 bg-jaman-cream rounded-lg flex items-center justify-between font-bold">
                    <span>Cash + Card</span>
                    <span className="font-mono text-slate-700">{report.splitSummary.cashCardCount} Bills</span>
                  </div>
                  <div className="p-1.5 bg-jaman-cream rounded-lg flex items-center justify-between font-bold">
                    <span>UPI + Card</span>
                    <span className="font-mono text-slate-700">{report.splitSummary.upiCardCount} Bills</span>
                  </div>
                  <div className="p-1.5 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between font-black text-purple-950">
                    <span>Total Split</span>
                    <span className="font-mono">{report.splitSummary.totalSplitBills}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Section 10: CASH DRAWER RECONCILIATION */}
            <div className="border border-slate-400 rounded-xl overflow-hidden print-avoid-break">
              <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>10. Cash Drawer Accounting Reconciliation</span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-black ${
                    report.cashDrawer.isBalanced ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {report.cashDrawer.isBalanced ? 'BALANCED' : 'VARIANCE DETECTED'}
                </span>
              </div>
              <div className="p-2.5 grid grid-cols-2 sm:grid-cols-7 gap-2 text-xs text-center font-mono">
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-200">
                  <span className="text-[8px] text-slate-500 font-bold block uppercase">Float</span>
                  <span className="font-bold text-jaman-navy block mt-0.5">{formatINR(report.cashDrawer.openingFloat)}</span>
                </div>
                <div className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-[8px] text-emerald-800 font-bold block uppercase">+ Sales</span>
                  <span className="font-bold text-emerald-950 block mt-0.5">{formatINR(report.cashDrawer.cashSales)}</span>
                </div>
                <div className="p-1.5 bg-rose-50 rounded-lg border border-rose-200">
                  <span className="text-[8px] text-rose-800 font-bold block uppercase">- Refund</span>
                  <span className="font-bold text-rose-950 block mt-0.5">-{formatINR(report.cashDrawer.cashRefund)}</span>
                </div>
                <div className="p-1.5 bg-rose-50 rounded-lg border border-rose-200">
                  <span className="text-[8px] text-rose-800 font-bold block uppercase">- Paid Out</span>
                  <span className="font-bold text-rose-950 block mt-0.5">-{formatINR(report.cashDrawer.cashPaidOut)}</span>
                </div>
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-300">
                  <span className="text-[8px] text-slate-600 font-bold block uppercase">= Expected</span>
                  <span className="font-black text-jaman-navy block mt-0.5">{formatINR(report.cashDrawer.expectedDrawer)}</span>
                </div>
                <div className="p-1.5 bg-jaman-cream rounded-lg border border-slate-300">
                  <span className="text-[8px] text-slate-600 font-bold block uppercase">Actual</span>
                  <span className="font-black text-jaman-navy block mt-0.5">{formatINR(report.cashDrawer.actualDrawer)}</span>
                </div>
                <div className={`p-1.5 rounded-lg border ${report.cashDrawer.isBalanced ? 'bg-emerald-100 border-emerald-300 text-emerald-950' : 'bg-rose-100 border-rose-300 text-rose-950'}`}>
                  <span className="text-[8px] font-black block uppercase">Diff</span>
                  <span className="font-black block mt-0.5">{formatINR(report.cashDrawer.difference)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* ================= PAGE 2 (WITH PAGE BREAK) ================= */}
          <div className="space-y-4 print-page-break-before pt-6 print:pt-0">
            
            {/* Running Header for Page 2 */}
            <div className="border-b border-slate-200 pb-2 flex items-center justify-between text-[10px] font-bold text-slate-500 font-mono">
              <span>{report.branding.restaurantName} • EOD Z-REPORT (Page 2 of 2)</span>
              <span>Date: {report.displayDate} • Shift: {report.shiftName}</span>
            </div>

            {/* Section 11: ORDER TYPE SUMMARY */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center print-avoid-break">
              <div className="p-2 bg-jaman-cream border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Dine-In Orders</span>
                <span className="text-base font-black font-mono text-jaman-navy block mt-0.5">
                  {report.orderTypeSummary.dineIn}
                </span>
              </div>
              <div className="p-2 bg-jaman-cream border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Takeaway Orders</span>
                <span className="text-base font-black font-mono text-jaman-navy block mt-0.5">
                  {report.orderTypeSummary.takeaway}
                </span>
              </div>
              <div className="p-2 bg-jaman-cream border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Delivery Orders</span>
                <span className="text-base font-black font-mono text-jaman-navy block mt-0.5">
                  {report.orderTypeSummary.delivery}
                </span>
              </div>
              <div className="p-2 bg-jaman-cream border border-slate-300 rounded-xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Token Orders</span>
                <span className="text-base font-black font-mono text-jaman-navy block mt-0.5">
                  {report.orderTypeSummary.token}
                </span>
              </div>
            </div>

            {/* Section 12 & 13: TOP SELLING ITEMS & TOP CATEGORIES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print-avoid-break">
              
              {/* Top 10 Selling Dishes */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                  12. Top 10 Selling Dishes Today
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="p-1.5 text-center w-6">#</th>
                      <th className="p-1.5">Dish Name</th>
                      <th className="p-1.5 text-center">Qty</th>
                      <th className="p-1.5 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {report.topSellingItems.map((it) => (
                      <tr key={it.rank} className="hover:bg-slate-50">
                        <td className="p-1.5 text-center font-bold text-slate-400">{it.rank}</td>
                        <td className="p-1.5 font-bold text-jaman-navy">{it.name}</td>
                        <td className="p-1.5 text-center font-mono font-bold">{it.quantity}</td>
                        <td className="p-1.5 text-right font-mono font-bold">{formatINR(it.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Top Categories & Staff Performance */}
              <div className="space-y-3">
                
                {/* Categories */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                    13. Menu Category Sales Contribution
                  </div>
                  <div className="p-2 space-y-1 text-xs">
                    {report.topCategories.map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between p-1 rounded bg-jaman-cream font-bold">
                        <span className="text-jaman-navy">{c.name}</span>
                        <span className="font-mono text-slate-700">{formatINR(c.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Captain & Cashier Performance */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <div className="bg-jaman-navy text-white px-3 py-1.5 font-black text-[11px] uppercase tracking-wider">
                    14 & 15. Staff Performance Summary
                  </div>
                  <div className="p-2 space-y-1.5 text-xs">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Floor Captains:</span>
                      <div className="space-y-0.5">
                        {report.captainPerformance.map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between font-bold text-slate-700">
                            <span>{c.name}</span>
                            <span className="font-mono">{c.orders} orders • {formatINR(c.sales)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-200">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Cashier Settled:</span>
                      <div className="space-y-0.5">
                        {report.cashierPerformance.map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between font-bold text-slate-700">
                            <span>{c.name}</span>
                            <span className="font-mono">{c.bills} bills • {formatINR(c.collection)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Section 16 & 17: TABLE UTILIZATION & INVENTORY ALERTS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print-avoid-break">
              <div className="border border-slate-300 rounded-xl p-2.5 space-y-1.5">
                <span className="font-black text-[11px] uppercase tracking-wider text-jaman-navy block">
                  16. Table Utilization & Turnover
                </span>
                <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                  {report.tableUtilization.topTables.map((tbl, idx) => (
                    <span key={idx} className="bg-jaman-cream border border-slate-200 px-2 py-0.5 rounded font-bold text-[11px]">
                      {tbl.tableNumber}: {formatINR(tbl.revenue)}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Average Table Turnaround: <strong>{report.tableUtilization.avgDiningTimeMinutes > 0 ? `${report.tableUtilization.avgDiningTimeMinutes} Minutes` : '—'}</strong>
                </span>
              </div>

              <div className="border border-slate-300 rounded-xl p-2.5 space-y-1.5 bg-amber-50/40 border-amber-200">
                <span className="font-black text-[11px] uppercase tracking-wider text-amber-900 block">
                  17. Kitchen Inventory Alerts (Low Stock)
                </span>
                <div className="space-y-0.5 text-xs font-bold text-amber-950">
                  {report.lowStockInventory.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span>• {item.name}</span>
                      <span className="font-mono font-black">{item.currentStock} {item.unit} remaining</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 18: MANAGER CLOSING NOTES */}
            <div className="border border-slate-300 rounded-xl p-3 space-y-1.5 print-avoid-break">
              <span className="font-black text-[11px] uppercase tracking-wider text-jaman-navy block">
                18. Manager Operational Notes & End of Day Observations
              </span>
              <div className="no-print">
                <textarea
                  value={managerNotes}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  disabled={isLocked}
                  placeholder="Enter shift notes, discrepancies, or maintenance remarks..."
                  rows={2}
                  className="w-full bg-jaman-cream border border-slate-300 rounded-xl p-2 text-xs font-semibold focus:outline-none"
                />
              </div>
              {managerNotes.trim() && (
                <p className="hidden print:block text-xs font-medium text-slate-800 bg-jaman-cream p-2 rounded-lg border border-slate-200 italic">
                  "{managerNotes}"
                </p>
              )}
            </div>

            {/* Section 19: OFFICIAL SIGNATURES SECTION */}
            <div className="pt-4 border-t-2 border-slate-300 print-avoid-break">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-6">
                19. Official Verification & Authentication Signatures
              </span>
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="space-y-1">
                  <div className="border-b border-slate-400 pb-1 font-mono text-[10px] text-slate-400">
                    ____________________
                  </div>
                  <strong className="block text-jaman-navy text-[11px]">Cashier Signature</strong>
                  <span className="text-[9px] text-slate-500 block truncate">{report.cashierName}</span>
                </div>

                <div className="space-y-1">
                  <div className="border-b border-slate-400 pb-1 font-mono text-[10px] text-slate-400">
                    ____________________
                  </div>
                  <strong className="block text-jaman-navy text-[11px]">Manager Signature</strong>
                  <span className="text-[9px] text-slate-500 block truncate">{report.branding.managerName || ''}</span>
                </div>

                <div className="space-y-1">
                  <div className="border-b border-slate-400 pb-1 font-mono text-[10px] text-slate-400">
                    ____________________
                  </div>
                  <strong className="block text-jaman-navy text-[11px]">Owner Signature</strong>
                  <span className="text-[9px] text-slate-500 block truncate">{report.branding.ownerName || ''}</span>
                </div>

                <div className="space-y-1">
                  <div className="border-b border-slate-400 pb-1 font-mono text-[10px] text-slate-400">
                    ____________________
                  </div>
                  <strong className="block text-jaman-navy text-[11px]">Closing Date & Stamp</strong>
                  <span className="text-[9px] text-slate-500 font-mono block">{report.displayDate}</span>
                </div>
              </div>
            </div>

            {/* Section 20: LEGAL & SYSTEM FOOTER */}
            <div className="border-t border-slate-200 pt-2 text-center text-[9px] text-slate-500 space-y-0.5 print-avoid-break">
              <p className="font-bold text-slate-700">{report.branding.footerText}</p>
              <p>
                Generated automatically from Local Database • Immutable Audit Statement #{report.id}
              </p>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 80MM THERMAL RECEIPT SLIP MODE */}
      {/* ========================================================================= */}
      {printPaperSize === '80MM' && (
        <div data-print-doc="eod-z-report" className="bg-white p-4 max-w-[320px] mx-auto rounded-2xl border border-slate-300 shadow-md font-mono text-[11px] leading-tight text-slate-900 space-y-3 print:p-0 print:border-none print:shadow-none eod-80mm-document">
          
          {/* Header */}
          <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-400">
            <h2 className="font-black text-sm uppercase">{report.branding.restaurantName}</h2>
            <p className="text-[10px]">{report.branding.address}</p>
            <p className="text-[10px]">GSTIN: {report.branding.gstin}</p>
            <p className="text-[10px]">FSSAI: {report.branding.fssaiNumber}</p>
            <p className="text-[10px]">Phone: {report.branding.phone}</p>
            <div className="pt-1 font-black text-xs uppercase tracking-wider">
              END OF DAY Z-REPORT
            </div>
            <p className="text-[9px] text-slate-600">
              {report.displayDate} • {report.generatedAtFormatted}
            </p>
          </div>

          {/* High level figures */}
          <div className="space-y-1 py-1 border-b border-dashed border-slate-400 text-[10px]">
            <div className="flex justify-between font-bold">
              <span>Gross Sales:</span>
              <span>{formatINR(report.grossRevenue)}</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span>Discounts & Refunds:</span>
              <span>-{formatINR(report.discountsAndRefunds.netDiscount)}</span>
            </div>
            <div className="flex justify-between font-black text-xs pt-1 border-t border-dotted border-slate-300">
              <span>NET SALES:</span>
              <span>{formatINR(report.netRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>Orders Settled:</span>
              <span>{report.ordersSettled}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Bill (AOV):</span>
              <span>{formatINR(report.avgBillValue)}</span>
            </div>
          </div>

          {/* GST */}
          <div className="space-y-0.5 py-1 border-b border-dashed border-slate-400 text-[10px]">
            <div className="flex justify-between">
              <span>Taxable Value:</span>
              <span>{formatINR(report.gstSummary.taxableValue)}</span>
            </div>
            {/* B2-036: derived from the same total as "Total GST" below via formatSplitTax. */}
            <div className="flex justify-between">
              <span>{gstLabels().cgst}:</span>
              <span>{formatSplitTax(report.gstSummary.totalTax, report.gstSummary.cgstAmount, report.gstSummary.sgstAmount).cgst}</span>
            </div>
            <div className="flex justify-between">
              <span>{gstLabels().sgst}:</span>
              <span>{formatSplitTax(report.gstSummary.totalTax, report.gstSummary.cgstAmount, report.gstSummary.sgstAmount).sgst}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total GST:</span>
              <span>{formatINR(report.gstSummary.totalTax)}</span>
            </div>
          </div>

          {/* Payments */}
          <div className="space-y-0.5 py-1 border-b border-dashed border-slate-400 text-[10px]">
            <div className="font-bold uppercase text-[9px] text-slate-500">Payments:</div>
            <div className="flex justify-between">
              <span>Cash ({report.paymentSettlement.cash.count}):</span>
              <span>{formatINR(report.paymentSettlement.cash.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>UPI ({report.paymentSettlement.upi.count}):</span>
              <span>{formatINR(report.paymentSettlement.upi.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Card ({report.paymentSettlement.card.count}):</span>
              <span>{formatINR(report.paymentSettlement.card.amount)}</span>
            </div>
            <div className="flex justify-between font-black pt-1 border-t border-dotted border-slate-300">
              <span>TOTAL COLLECTED:</span>
              <span>{formatINR(report.paymentSettlement.totalCollection)}</span>
            </div>
          </div>

          {/* Cash Drawer */}
          <div className="space-y-0.5 py-1 border-b border-dashed border-slate-400 text-[10px]">
            <div className="font-bold uppercase text-[9px] text-slate-500">Cash Drawer:</div>
            <div className="flex justify-between">
              <span>Opening Float:</span>
              <span>{formatINR(report.cashDrawer.openingFloat)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash Sales:</span>
              <span>{formatINR(report.cashDrawer.cashSales)}</span>
            </div>
            <div className="flex justify-between font-black">
              <span>Actual Drawer:</span>
              <span>{formatINR(report.cashDrawer.actualDrawer)}</span>
            </div>
          </div>

          {/* Top 5 Items */}
          <div className="space-y-0.5 py-1 border-b border-dashed border-slate-400 text-[10px]">
            <div className="font-bold uppercase text-[9px] text-slate-500">Top 5 Dishes:</div>
            {report.topSellingItems.slice(0, 5).map((it) => (
              <div key={it.rank} className="flex justify-between">
                <span className="truncate max-w-[180px]">{it.rank}. {it.name}</span>
                <span>{it.quantity}x</span>
              </div>
            ))}
          </div>

          {/* Signature Line */}
          <div className="pt-4 text-center text-[10px] space-y-4">
            <div className="flex justify-between text-[9px] pt-4">
              <div>
                <div>_______________</div>
                <span>Cashier</span>
              </div>
              <div>
                <div>_______________</div>
                <span>Manager</span>
              </div>
            </div>
            <p className="text-[9px] text-slate-500 italic">
              Official Closing Statement • JAMANVAAR
            </p>
          </div>

        </div>
      )}

    </div>
  );
};
