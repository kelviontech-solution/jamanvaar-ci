import React, { useState, useEffect} from 'react';
import { BusinessDay } from '@jamanvaar/types';
import { BusinessDayRepository, PrintQueueRepository } from '@jamanvaar/database';
import { PdfReportBuilder, ReportFullData } from '../../services/pdfReportBuilder';
import { PosPrinterService } from '../../services/printerService';
import { PosDayOrdersModal } from './PosDayOrdersModal';
import { formatINR, splitTax } from '@jamanvaar/utils';
import {
  X,
  Calendar,
  Clock,
  Download,
  Printer,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  Layers,
  Lock,
  Unlock,
  ChefHat,
  AlertTriangle,
  FileText,
  User,
  ShieldAlert
} from 'lucide-react';

interface PosBusinessDayDetailModalProps {
  businessDay: BusinessDay;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export const PosBusinessDayDetailModal: React.FC<PosBusinessDayDetailModalProps> = ({
  businessDay,
  isOpen,
  onClose,
  onRefresh
}) => {
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Escape closes this dialog like any other in the app, not just its own Close button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const orders = BusinessDayRepository.getOrdersForBusinessDay(businessDay.id);

  // Group top dishes
  const itemCounter: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach((o) => {
    if (o.orderStatus === 'CANCELLED') return;
    o.items.forEach((it) => {
      if (!itemCounter[it.name]) itemCounter[it.name] = { name: it.name, qty: 0, revenue: 0 };
      itemCounter[it.name].qty += it.quantity;
      itemCounter[it.name].revenue += it.totalPrice;
    });
  });
  const topItems = Object.values(itemCounter).sort((a, b) => b.qty - a.qty);

  const handleDownloadPdf = () => {
    setIsDownloadingPdf(true);
    setFeedback('Generating PDF report...');
    setTimeout(() => {
      try {
        const fullData: ReportFullData = {
          title: `Business Day Report (${businessDay.id})`,
          periodLabel: businessDay.displayDate,
          startDate: businessDay.openedAt,
          endDate: businessDay.closedAt || new Date().toISOString(),
          generatedAt: new Date().toLocaleString('en-IN'),
          generatedBy: businessDay.closedBy || businessDay.openedBy,
          summary: {
            dateStr: businessDay.displayDate,
            grossSales: businessDay.grossSales,
            discountAmount: businessDay.discounts,
            netSales: businessDay.netSales,
            cgstAmount: splitTax(businessDay.tax, 0).cgst,
            sgstAmount: splitTax(businessDay.tax, 0).sgst,
            totalTax: businessDay.tax,
            totalCollected: businessDay.totalCollected,
            refundsCount: businessDay.refundedOrderCount,
            refundsAmount: 0,
            cancelledCount: businessDay.cancelledOrderCount,
            ordersCount: businessDay.orderCount,
            avgOrderValue: businessDay.orderCount > 0 ? Math.round(businessDay.netSales / businessDay.orderCount) : 0,
            paymentBreakdown: {
              cash: businessDay.cashSales,
              upi: businessDay.upiSales,
              card: businessDay.cardSales,
              wallet: 0,
              split: businessDay.otherPayments,
              other: 0
            },
            orderTypeBreakdown: {
              dineIn: { count: businessDay.dineInCount, total: 0 },
              takeaway: { count: businessDay.takeawayCount, total: 0 },
              delivery: { count: businessDay.deliveryCount, total: 0 },
              token: { count: businessDay.tokenCount, total: 0 }
            }
          },
          topItems: topItems.map((it) => ({
            id: it.name,
            name: it.name,
            sku: '',
            categoryName: 'Main',
            quantitySold: it.qty,
            grossRevenue: it.revenue,
            avgPrice: Math.round(it.revenue / it.qty)
          })),
          cashiers: [
            {
              name: businessDay.openedBy,
              ordersCount: businessDay.orderCount,
              netSales: businessDay.netSales,
              cash: businessDay.cashSales,
              upi: businessDay.upiSales,
              card: businessDay.cardSales
            }
          ]
        };

        PdfReportBuilder.downloadPdfFile(fullData, `JAMANVAAR_Business_Day_${businessDay.businessDate}.pdf`, 'CLASSIC');
        setFeedback('✓ PDF Downloaded successfully!');
      } catch (err: any) {
        setFeedback('⚠ Could not generate PDF');
      } finally {
        setIsDownloadingPdf(false);
        setTimeout(() => setFeedback(''), 3500);
      }
    }, 200);
  };

  const handlePrintReport = () => {
    const printer = PosPrinterService.getPrinterForRole('REPORT');
    const rawPayload = `
========================================
             JAMANVAAR POS
     BUSINESS DAY FINANCIAL REPORT
----------------------------------------
DAY: ${businessDay.displayDate} (${businessDay.id})
STATUS: ${businessDay.status}
OPENED: ${new Date(businessDay.openedAt).toLocaleTimeString('en-IN')} by ${businessDay.openedBy}
${businessDay.closedAt ? `CLOSED: ${new Date(businessDay.closedAt).toLocaleTimeString('en-IN')} by ${businessDay.closedBy}` : ''}
----------------------------------------
GROSS SALES: Rs. ${businessDay.grossSales}
DISCOUNTS: Rs. ${businessDay.discounts}
NET SALES: Rs. ${businessDay.netSales}
GST TAX: Rs. ${businessDay.tax}
COLLECTED: Rs. ${businessDay.totalCollected}
----------------------------------------
CASH: Rs. ${businessDay.cashSales}
UPI: Rs. ${businessDay.upiSales}
CARD: Rs. ${businessDay.cardSales}
----------------------------------------
OPENING FLOAT: Rs. ${businessDay.openingCash}
EXPECTED CASH: Rs. ${businessDay.expectedCash || 0}
ACTUAL CASH: Rs. ${businessDay.closingCash || 0}
VARIANCE: Rs. ${businessDay.cashVariance || 0}
========================================
    `.trim();

    PrintQueueRepository.addJob({
      type: 'SHIFT_REPORT',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload,
      paperSize: printer.paperSize || '80mm'
    });

    setFeedback(`✓ Report dispatched to ${printer.name}`);
    setTimeout(() => setFeedback(''), 3500);
  };

  const handleReopenDay = () => {
    if (!reopenReason.trim()) return;
    BusinessDayRepository.reopenBusinessDay(businessDay.id, 'Restaurant Manager', reopenReason.trim());
    setReopenModalOpen(false);
    setFeedback('✓ Business Day reopened for corrections.');
    if (onRefresh) onRefresh();
    setTimeout(() => setFeedback(''), 3500);
  };

  const isClosed = businessDay.status === 'CLOSED';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
      <div className="bg-jaman-cream border border-jaman-border w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Top Action Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-jaman-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-jaman-navy flex items-center justify-center text-white">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-jaman-navy">
                  Business Day — {businessDay.displayDate}
                </h2>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isClosed
                    ? 'bg-slate-100 text-slate-700 border border-slate-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                }`}>
                  {isClosed ? '🔒 CLOSED (READ-ONLY)' : '🟢 ACTIVE DAY'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {businessDay.id} • Opened: {new Date(businessDay.openedAt).toLocaleTimeString('en-IN')} by {businessDay.openedBy}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {feedback && (
              <div className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
                {feedback}
              </div>
            )}

            {/* View All Orders */}
            <button
              type="button"
              onClick={() => setIsOrdersModalOpen(true)}
              className="px-3 py-1.5 bg-jaman-cream hover:bg-[#F0EBE1] border border-jaman-border text-jaman-navy rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-jaman-saffron" />
              <span>View Orders ({orders.length})</span>
            </button>

            {/* Download Day PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-jaman-saffron" />
              <span>Download PDF</span>
            </button>

            {/* Print Report */}
            <button
              type="button"
              onClick={handlePrintReport}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-jaman-navy" />
              <span>Print</span>
            </button>

            {/* Reopen Day Trigger (Admin) */}
            {isClosed && (
              <button
                type="button"
                onClick={() => setReopenModalOpen(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                title="Reopen day for audited corrections"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Reopen Day</span>
              </button>
            )}

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-jaman-navy rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Day Details */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* 1. Primary Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Total Billed (incl. GST)
              </span>
              <div className="text-2xl font-black font-mono text-jaman-navy mt-0.5">
                {formatINR(businessDay.netSales)}
              </div>
              <span className="text-[10px] text-emerald-600 font-bold mt-1 inline-block">
                ● {businessDay.orderCount} Orders Billed
              </span>
            </div>

            <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Cash Collections
              </span>
              <div className="text-2xl font-black font-mono text-amber-700 mt-0.5">
                {formatINR(businessDay.cashSales)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium mt-1 inline-block">
                Drawer cash collected
              </span>
            </div>

            <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                UPI / Dynamic QR
              </span>
              <div className="text-2xl font-black font-mono text-blue-700 mt-0.5">
                {formatINR(businessDay.upiSales)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium mt-1 inline-block">
                Direct digital settlement
              </span>
            </div>

            <div className="bg-white border border-jaman-border rounded-2xl p-4 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Total Tax (GST 5%)
              </span>
              <div className="text-2xl font-black font-mono text-purple-700 mt-0.5">
                {formatINR(businessDay.tax)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium mt-1 inline-block">
                CGST 2.5% + SGST 2.5%
              </span>
            </div>
          </div>

          {/* 2. Financial Breakdown & Cash Drawer Reconciliation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Financial Statement */}
            <div className="bg-white border border-jaman-border rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-jaman-navy">
                  Financial & Revenue Audit
                </h3>
                <span className="text-[10px] font-mono text-slate-400">STATEMENT</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Sales:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(businessDay.grossSales)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discounts Granted:</span>
                  <strong className="font-mono text-rose-600">- {formatINR(businessDay.discounts)}</strong>
                </div>
                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-100">
                  <span>Net Sales (excl. GST):</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(businessDay.grossSales - businessDay.discounts)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>CGST (2.5%):</span>
                  <strong className="font-mono text-slate-800">{formatINR(splitTax(businessDay.tax, 0).cgst)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST (2.5%):</span>
                  <strong className="font-mono text-slate-800">{formatINR(splitTax(businessDay.tax, 0).sgst)}</strong>
                </div>
                {Math.round((businessDay.netSales - (businessDay.grossSales - businessDay.discounts + businessDay.tax)) * 100) !== 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Round-off:</span>
                    <strong className="font-mono text-slate-800">{formatINR(Math.round((businessDay.netSales - (businessDay.grossSales - businessDay.discounts + businessDay.tax)) * 100) / 100)}</strong>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-100 font-black text-sm text-jaman-navy">
                  <span>Total Collected (incl. GST):</span>
                  <span className="font-mono text-emerald-700">{formatINR(businessDay.netSales)}</span>
                </div>
              </div>
            </div>

            {/* Cash Drawer Reconciliation */}
            <div className="bg-white border border-jaman-border rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-jaman-navy">
                  Cash Drawer & Variance Audit
                </h3>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  (businessDay.cashVariance || 0) === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}>
                  {(businessDay.cashVariance || 0) === 0 ? '✓ BALANCED' : `VARIANCE: ${formatINR(businessDay.cashVariance || 0)}`}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Opening Float:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(businessDay.openingCash)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cash Sales Added:</span>
                  <strong className="font-mono text-jaman-navy">+ {formatINR(businessDay.cashSales)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cash In / Paid In:</span>
                  <strong className="font-mono text-jaman-navy">+ {formatINR(businessDay.cashIn || 0)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cash Out / Paid Out:</span>
                  <strong className="font-mono text-jaman-navy">- {formatINR(businessDay.cashOut || 0)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Expected Drawer Cash:</span>
                  <strong className="font-mono text-jaman-navy">
                    {formatINR(businessDay.expectedCash || (businessDay.openingCash + businessDay.cashSales + (businessDay.cashIn || 0) - (businessDay.cashOut || 0)))}
                  </strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 font-black text-sm text-jaman-navy">
                  <span>Actual Closing Cash Count:</span>
                  <span className="font-mono text-jaman-saffron">
                    {businessDay.closingCash !== undefined ? formatINR(businessDay.closingCash) : 'Not Closed Yet'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Top Dishes Table */}
          <div className="bg-white border border-jaman-border rounded-2xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-jaman-navy">
                Top Selling Items ({topItems.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">RANKED BY QTY</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto text-xs">
              {topItems.slice(0, 8).map((it, idx) => (
                <div key={idx} className="flex justify-between items-center py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 w-5">{idx + 1}.</span>
                    <strong className="text-jaman-navy">{it.name}</strong>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-500 font-mono">{it.qty} sold</span>
                    <strong className="font-mono text-jaman-navy">{formatINR(it.revenue)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Orders Modal */}
      <PosDayOrdersModal
        businessDay={businessDay}
        isOpen={isOrdersModalOpen}
        onClose={() => setIsOrdersModalOpen(false)}
      />

      {/* Reopen Day Confirmation Modal */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-jaman-border p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-black text-sm">
              <ShieldAlert className="w-5 h-5" />
              <span>Admin Authorization — Reopen Day</span>
            </div>
            <p className="text-xs text-slate-600">
              Reopening Business Day <strong>{businessDay.id}</strong> allows additional orders or financial edits. An audit trail entry will be recorded.
            </p>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">
                Reason for Reopening:
              </label>
              <input
                type="text"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Settlement adjustment, missed late night bill"
                className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopenModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReopenDay}
                disabled={!reopenReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black"
              >
                Confirm Reopen Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
