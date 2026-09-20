import React, { useState, useMemo } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ShiftRepository, PrintQueueRepository, AuditRepository } from '@jamanvaar/database';
import { ShiftRecord, CashMovement } from '@jamanvaar/types';
import { CentralReportingService } from '@jamanvaar/business';
import { PosPrinterService } from '../../services/printerService';
import { PdfReportBuilder, ReportFullData } from '../../services/pdfReportBuilder';
import { formatINR } from '@jamanvaar/utils';
import { EmptyState } from '@jamanvaar/ui';
import {
  Clock,
  CircleDollarSign,
  PlusCircle,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  Download,
  Calendar,
  User,
  CreditCard,
  Banknote,
  QrCode,
  DollarSign,
  Search,
  Filter,
  FileText,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  Layers,
  Receipt,
  X
} from 'lucide-react';

export const PosShiftAndCashView: React.FC = () => {
  const {
    currentUser,
    posTerminalId,
    setActiveTab,
    setIsPrintQueueOpen
  } = usePosStore();

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedHistoryFilter, setSelectedHistoryFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState(false);
  const [selectedHistoricalShift, setSelectedHistoricalShift] = useState<ShiftRecord | null>(null);

  // Form states
  const [openingFloatInput, setOpeningFloatInput] = useState('2000');
  const [openingNotesInput, setOpeningNotesInput] = useState('');
  
  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('Petty Cash Expense');
  const [movementNotes, setMovementNotes] = useState('');

  // Close shift denominations
  const [denom2000, setDenom2000] = useState(0);
  const [denom500, setDenom500] = useState(0);
  const [denom200, setDenom200] = useState(0);
  const [denom100, setDenom100] = useState(0);
  const [denom50, setDenom50] = useState(0);
  const [denom20, setDenom20] = useState(0);
  const [denom10, setDenom10] = useState(0);
  const [denomCoins, setDenomCoins] = useState(0);
  const [closeShiftNotes, setCloseShiftNotes] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const activeShift = useMemo(() => {
    return ShiftRepository.getActiveShift();
  }, [refreshKey, db.shifts.length, db.orders.length]);

  const allShifts = useMemo(() => {
    return ShiftRepository.getAllShifts();
  }, [refreshKey, db.shifts.length]);

  const activeMovements = useMemo(() => {
    return activeShift ? ShiftRepository.getCashMovements(activeShift.id) : [];
  }, [activeShift, refreshKey, db.cashMovements.length]);

  // Cash movement calculations
  const totalCashIn = activeMovements.filter((m) => m.type === 'CASH_IN').reduce((sum, m) => sum + m.amount, 0);
  const totalCashOut = activeMovements.filter((m) => m.type === 'CASH_OUT').reduce((sum, m) => sum + m.amount, 0);

  // Orders during active shift using authoritative ShiftRepository & CentralReportingService
  const shiftOrders = useMemo(() => {
    if (!activeShift) return [];
    return ShiftRepository.getShiftOrders(activeShift, db.orders);
  }, [activeShift, db.orders]);

  const shiftSummary = useMemo(() => {
    return CentralReportingService.calculateFinancialSummary(
      shiftOrders,
      activeShift ? `Shift #${activeShift.id.slice(-2)}` : 'Active Shift'
    );
  }, [shiftOrders, activeShift]);

  const completedShiftOrders = useMemo(() => {
    return shiftOrders.filter((o) => o.orderStatus === 'COMPLETED');
  }, [shiftOrders]);

  const totalShiftSales = shiftSummary.netSales;
  const shiftCashSales = shiftSummary.paymentBreakdown.cash;
  const shiftUpiSales = shiftSummary.paymentBreakdown.upi;
  const shiftCardSales = shiftSummary.paymentBreakdown.card;
  const shiftDiscounts = shiftSummary.discountAmount;

  const expectedDrawerCash = activeShift
    ? activeShift.openingCash + shiftCashSales + totalCashIn - totalCashOut
    : 0;

  // Denomination counted total
  const countedCash =
    denom2000 * 2000 +
    denom500 * 500 +
    denom200 * 200 +
    denom100 * 100 +
    denom50 * 50 +
    denom20 * 20 +
    denom10 * 10 +
    denomCoins;

  const cashVariance = countedCash - expectedDrawerCash;

  // Historical shift filtering
  const filteredHistoricalShifts = useMemo(() => {
    return allShifts.filter((s) => {
      if (s.status === 'OPEN') return false; // Show in current shift card

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = s.id.toLowerCase().includes(q);
        const matchesCashier = s.cashierName.toLowerCase().includes(q);
        if (!matchesId && !matchesCashier) return false;
      }

      if (selectedHistoryFilter === 'TODAY') {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (!s.openedAt.startsWith(todayStr)) return false;
      } else if (selectedHistoryFilter === 'YESTERDAY') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().slice(0, 10);
        if (!s.openedAt.startsWith(yStr)) return false;
      } else if (selectedHistoryFilter === '7_DAYS') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (new Date(s.openedAt) < cutoff) return false;
      } else if (selectedHistoryFilter === '30_DAYS') {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (new Date(s.openedAt) < cutoff) return false;
      }

      return true;
    });
  }, [allShifts, searchQuery, selectedHistoryFilter]);

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 3500);
  };

  // Handlers
  const handleOpenShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const openingVal = Number(openingFloatInput) || 0;
    const cashierName = currentUser?.fullName || 'Cashier';
    const cashierId = currentUser?.id || 'cashier';

    ShiftRepository.openShift(cashierId, cashierName, openingVal, posTerminalId, openingNotesInput.trim());
    setOpenShiftModalOpen(false);
    setOpeningNotesInput('');
    setRefreshKey((k) => k + 1);
    showToast(`✓ Shift opened with opening float of ₹${openingVal}`);
  };

  const handleCashMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    const amountVal = Number(movementAmount);
    if (!amountVal || amountVal <= 0) return;

    const cashierName = currentUser?.fullName || activeShift.cashierName;
    ShiftRepository.addCashMovement(
      activeShift.id,
      movementType,
      amountVal,
      movementReason,
      cashierName,
      movementNotes.trim() || undefined
    );

    setCashMovementModalOpen(false);
    setMovementAmount('');
    setMovementNotes('');
    setRefreshKey((k) => k + 1);
    showToast(`✓ Recorded ${movementType === 'CASH_IN' ? 'Cash In' : 'Cash Out'} of ₹${amountVal}`);
  };

  const handleCloseShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    const closed = ShiftRepository.closeShift(
      activeShift.id,
      countedCash,
      cashVariance !== 0 ? `Variance ₹${cashVariance}. ${closeShiftNotes}` : closeShiftNotes
    );

    // Spool Shift Closing Summary to Report Printer
    const printer = PosPrinterService.getPrinterForRole('REPORT');
    const rawPayload = `
========================================
             JAMANVAAR POS
         CASHIER SHIFT SUMMARY
----------------------------------------
SHIFT ID: ${closed?.id}
CASHIER:  ${closed?.cashierName}
TERMINAL: ${closed?.posId}
OPENED:   ${new Date(closed?.openedAt || '').toLocaleTimeString('en-IN')}
CLOSED:   ${new Date(closed?.closedAt || '').toLocaleTimeString('en-IN')}
----------------------------------------
OPENING FLOAT:     Rs. ${closed?.openingCash}
CASH SALES:        Rs. ${shiftCashSales}
CASH IN (PAID IN): Rs. ${totalCashIn}
CASH OUT:          Rs. ${totalCashOut}
----------------------------------------
EXPECTED CASH:     Rs. ${expectedDrawerCash}
COUNTED CASH:      Rs. ${countedCash}
CASH VARIANCE:     Rs. ${cashVariance}
----------------------------------------
TOTAL SHIFT SALES: Rs. ${totalShiftSales}
ORDERS COMPLETED:  ${completedShiftOrders.length}
UPI SALES:         Rs. ${shiftUpiSales}
CARD SALES:        Rs. ${shiftCardSales}
========================================
    `.trim();

    PrintQueueRepository.addJob({
      type: 'SHIFT_REPORT',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload,
      paperSize: printer.paperSize || '80mm'
    });

    setCloseShiftModalOpen(false);
    setRefreshKey((k) => k + 1);
    showToast(`✓ Shift closed successfully. Closing report sent to ${printer.name}`);
  };

  const handlePrintShiftTicket = (shift: ShiftRecord) => {
    const printer = PosPrinterService.getPrinterForRole('REPORT');
    const rawPayload = `
========================================
             JAMANVAAR POS
         HISTORICAL SHIFT AUDIT
----------------------------------------
SHIFT:    ${shift.id}
CASHIER:  ${shift.cashierName}
STATUS:   ${shift.status}
OPENED:   ${new Date(shift.openedAt).toLocaleString('en-IN')}
CLOSED:   ${shift.closedAt ? new Date(shift.closedAt).toLocaleString('en-IN') : 'N/A'}
----------------------------------------
TOTAL SALES:   Rs. ${shift.totalSales}
ORDERS:        ${shift.totalOrders}
CASH SALES:    Rs. ${shift.totalCashSales}
UPI SALES:     Rs. ${shift.totalUpiSales}
CARD SALES:    Rs. ${shift.totalCardSales}
----------------------------------------
OPENING FLOAT: Rs. ${shift.openingCash}
EXPECTED CASH: Rs. ${shift.expectedCash}
ACTUAL CASH:   Rs. ${shift.closingCash || shift.actualCash || 0}
VARIANCE:      Rs. ${shift.cashVariance || 0}
========================================
    `.trim();

    PrintQueueRepository.addJob({
      type: 'SHIFT_REPORT',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload,
      paperSize: printer.paperSize || '80mm'
    });

    showToast(`✓ Dispatched shift audit ticket to ${printer.name}`);
  };

  const handleDownloadShiftPdf = (shift: ShiftRecord) => {
    try {
      // Tax comes from the shift's own bills, never from a share of sales.
      const shiftTax = CentralReportingService.calculateFinancialSummary(
        db.orders.filter((o) => o.shiftId === shift.id && o.paymentStatus === 'SUCCESS'),
        `Shift ${shift.id}`
      );
      const fullData: ReportFullData = {
        title: `Cashier Shift Statement (${shift.id})`,
        periodLabel: `Shift by ${shift.cashierName}`,
        startDate: shift.openedAt,
        endDate: shift.closedAt || new Date().toISOString(),
        generatedAt: new Date().toLocaleString('en-IN'),
        generatedBy: currentUser?.fullName || shift.cashierName,
        summary: {
          dateStr: new Date(shift.openedAt).toLocaleDateString('en-IN'),
          grossSales: shift.totalSales + (shift.totalDiscounts || 0),
          discountAmount: shift.totalDiscounts || 0,
          netSales: shift.totalSales,
          cgstAmount: shiftTax.cgstAmount,
          sgstAmount: shiftTax.sgstAmount,
          totalTax: shiftTax.totalTax,
          totalCollected: shift.totalSales,
          refundsCount: 0,
          refundsAmount: 0,
          cancelledCount: 0,
          ordersCount: shift.totalOrders,
          avgOrderValue: shift.totalOrders > 0 ? Math.round(shift.totalSales / shift.totalOrders) : 0,
          paymentBreakdown: {
            cash: shift.totalCashSales,
            upi: shift.totalUpiSales,
            card: shift.totalCardSales,
            wallet: 0,
            split: 0,
            other: 0
          },
          orderTypeBreakdown: {
            dineIn: { count: shift.totalOrders, total: shift.totalSales },
            takeaway: { count: 0, total: 0 },
            delivery: { count: 0, total: 0 },
            token: { count: 0, total: 0 }
          }
        },
        topItems: [],
        cashiers: [
          {
            name: shift.cashierName,
            ordersCount: shift.totalOrders,
            netSales: shift.totalSales,
            cash: shift.totalCashSales,
            upi: shift.totalUpiSales,
            card: shift.totalCardSales
          }
        ]
      };

      PdfReportBuilder.downloadPdfFile(fullData, `JAMANVAAR_Shift_${shift.id}.pdf`, 'STATEMENT');
      showToast('✓ Shift PDF Report downloaded');
    } catch {
      showToast('⚠ Could not generate PDF');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-y-auto select-none space-y-6">
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-6 h-6 text-jaman-saffron" />
            <h1 className="text-xl sm:text-2xl font-black text-jaman-navy">Shift & Cash Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage cashier shifts, cash drawer movements, float reconciliation and settlements.
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {feedbackMessage && (
            <span className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
              {feedbackMessage}
            </span>
          )}

          {activeShift ? (
            <>
              <button
                type="button"
                onClick={() => setCashMovementModalOpen(true)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-jaman-navy border border-jaman-border rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <CircleDollarSign className="w-4 h-4 text-amber-600" />
                <span>+ Cash Movement</span>
              </button>

              <button
                type="button"
                onClick={() => setCloseShiftModalOpen(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-rose-600/25 transition-all active:scale-95 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Close Shift</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOpenShiftModalOpen(true)}
              className="px-5 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/25 transition-all active:scale-95 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>+ Open New Shift</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Active Shift Hero Card */}
      {activeShift ? (
        <div className="bg-white border-2 border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
          {/* Card Top: Shift Title & Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-jaman-saffron flex items-center justify-center font-black">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-jaman-navy">
                    Active Shift #{activeShift.id.slice(-2) || '01'}
                  </h2>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    ● SHIFT OPEN
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                  <span>Cashier: <strong className="text-jaman-navy">{activeShift.cashierName}</strong></span>
                  <span>•</span>
                  <span>Terminal: <strong className="font-mono text-jaman-navy">{activeShift.posId}</strong></span>
                  <span>•</span>
                  <span>Opened: {new Date(activeShift.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>

            {/* Quick Summary Pill */}
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Expected Drawer Cash
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy">
                {formatINR(expectedDrawerCash)}
              </span>
            </div>
          </div>

          {/* Row 1: Primary Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 bg-jaman-cream rounded-2xl border border-jaman-border">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Total Shift Sales
              </span>
              <strong className="text-xl font-black font-mono text-jaman-navy block mt-0.5">
                {formatINR(totalShiftSales)}
              </strong>
              <span className="text-[10px] text-emerald-600 font-bold mt-1 inline-block">
                ● {completedShiftOrders.length} Completed Orders
              </span>
            </div>

            <div className="p-3.5 bg-jaman-cream rounded-2xl border border-jaman-border">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Cash Sales Added
              </span>
              <strong className="text-xl font-black font-mono text-amber-700 block mt-0.5">
                {formatINR(shiftCashSales)}
              </strong>
              <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
                Counter cash receipts
              </span>
            </div>

            <div className="p-3.5 bg-jaman-cream rounded-2xl border border-jaman-border">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                UPI / Digital QR
              </span>
              <strong className="text-xl font-black font-mono text-blue-700 block mt-0.5">
                {formatINR(shiftUpiSales)}
              </strong>
              <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
                Direct bank settlement
              </span>
            </div>

            <div className="p-3.5 bg-jaman-cream rounded-2xl border border-jaman-border">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Opening Cash Float
              </span>
              <strong className="text-xl font-black font-mono text-purple-700 block mt-0.5">
                {formatINR(activeShift.openingCash)}
              </strong>
              <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
                Starting drawer balance
              </span>
            </div>
          </div>

          {/* Row 2: Cash Drawer Math Formula & Payment Mix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Left: Cash Drawer Exact Formula */}
            <div className="bg-jaman-cream p-4 rounded-2xl border border-jaman-border space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h3 className="font-black uppercase tracking-wider text-xs text-jaman-navy">
                  Cash Drawer Mathematical Reconciliation
                </h3>
                <span className="text-[10px] font-mono text-slate-400">REAL-TIME MATH</span>
              </div>

              <div className="space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(activeShift.openingCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>+ Cash Sales:</span>
                  <strong className="font-mono text-emerald-700">+ {formatINR(shiftCashSales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>+ Cash In (Paid In):</span>
                  <strong className="font-mono text-emerald-700">+ {formatINR(totalCashIn)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>- Cash Out (Paid Out):</span>
                  <strong className="font-mono text-rose-600">- {formatINR(totalCashOut)}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200/80 font-black text-sm text-jaman-navy">
                  <span>= Current Expected Cash in Drawer:</span>
                  <span className="font-mono text-jaman-saffron">{formatINR(expectedDrawerCash)}</span>
                </div>
              </div>
            </div>

            {/* Right: Payment Settlement Tender Mix */}
            <div className="bg-jaman-cream p-4 rounded-2xl border border-jaman-border space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h3 className="font-black uppercase tracking-wider text-xs text-jaman-navy">
                  Shift Payment Channel Breakdown
                </h3>
                <span className="text-[10px] font-mono text-slate-400">TENDER SETTLEMENT</span>
              </div>

              <div className="space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Cash Collections:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(shiftCashSales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>UPI / Bharat QR:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(shiftUpiSales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Card POS Terminal:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(shiftCardSales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Discounts Granted:</span>
                  <strong className="font-mono text-rose-600">- {formatINR(shiftDiscounts)}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200/80 font-black text-sm text-jaman-navy">
                  <span>Total Billed (incl. GST):</span>
                  <span className="font-mono text-jaman-navy">{formatINR(totalShiftSales)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Cash Movements Log for Active Shift */}
          <div className="bg-white border border-jaman-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 text-jaman-saffron" />
                <h3 className="font-black text-xs uppercase tracking-wider text-jaman-navy">
                  Cash Movements in this Shift ({activeMovements.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCashMovementModalOpen(true)}
                className="text-xs font-bold text-jaman-saffron hover:underline"
              >
                + Record Movement
              </button>
            </div>

            {activeMovements.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {activeMovements.map((mov) => (
                  <div key={mov.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                        mov.type === 'CASH_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {mov.type === 'CASH_IN' ? '↓ CASH IN' : '↑ CASH OUT'}
                      </span>
                      <div>
                        <strong className="text-jaman-navy block">{mov.reason}</strong>
                        <span className="text-[10px] text-slate-400">
                          By {mov.cashierName} • {new Date(mov.timestamp).toLocaleTimeString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <strong className={`font-mono text-sm ${
                      mov.type === 'CASH_IN' ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      {mov.type === 'CASH_IN' ? '+' : '-'} {formatINR(mov.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                No cash in/out float adjustments recorded during this shift.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty State: No Active Shift */
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-10 text-center space-y-4 shadow-2xs">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-jaman-saffron mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8 opacity-60" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black text-jaman-navy">No Active Cashier Shift</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Open a new shift with a starting drawer float to begin accepting counter billing and tracking cash reconciliation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpenShiftModalOpen(true)}
            className="px-6 py-3 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-2xl font-black text-xs inline-flex items-center gap-2 shadow-md shadow-jaman-saffron/25 transition-all cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>Open Cashier Shift Now</span>
          </button>
        </div>
      )}

      {/* 3. Historical Shifts Section */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-jaman-border shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-base text-jaman-navy">Historical Shift Archives</h3>
            <p className="text-xs text-slate-500">Permanent cashier shift records, actual counts, and variance audits.</p>
          </div>

          {/* Filter presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL', label: 'All Shifts' },
              { id: 'TODAY', label: 'Today' },
              { id: 'YESTERDAY', label: 'Yesterday' },
              { id: '7_DAYS', label: 'Last 7 Days' },
              { id: '30_DAYS', label: 'Last 30 Days' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedHistoryFilter(f.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedHistoryFilter === f.id
                    ? 'bg-jaman-navy text-white'
                    : 'bg-jaman-cream text-slate-700 hover:bg-slate-100 border border-jaman-border'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shift Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHistoricalShifts.map((shift) => {
            const hasVariance = (shift.cashVariance || 0) !== 0;

            return (
              <div
                key={shift.id}
                className="bg-jaman-cream border border-jaman-border rounded-2xl p-4 hover:border-slate-400 hover:shadow-sm transition-all space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2 border-b border-jaman-border/60 pb-2">
                    <div>
                      <h4 className="font-black text-sm text-jaman-navy">{shift.id}</h4>
                      <span className="text-[11px] text-slate-500 font-bold block">{shift.cashierName}</span>
                    </div>

                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                      !hasVariance
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}>
                      {!hasVariance ? '✓ BALANCED' : `VARIANCE: ${formatINR(shift.cashVariance || 0)}`}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Total Sales:</span>
                      <strong className="font-mono text-jaman-navy">{formatINR(shift.totalSales)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Orders Handled:</span>
                      <strong className="font-mono text-jaman-navy">{shift.totalOrders}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Cash Collected:</span>
                      <strong className="font-mono text-amber-700">{formatINR(shift.totalCashSales)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Counted Cash:</span>
                      <strong className="font-mono text-jaman-navy">{formatINR(shift.closingCash || shift.actualCash || 0)}</strong>
                    </div>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-jaman-border/60">
                      {new Date(shift.openedAt).toLocaleDateString('en-IN')} • {new Date(shift.openedAt).toLocaleTimeString('en-IN')} → {shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString('en-IN') : 'Closed'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-jaman-border/60 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoricalShift(shift)}
                    className="flex-1 py-1.5 bg-white hover:bg-slate-50 text-jaman-navy border border-jaman-border rounded-xl text-xs font-bold transition-all shadow-2xs"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintShiftTicket(shift)}
                    className="p-1.5 bg-white hover:bg-slate-50 text-jaman-navy border border-jaman-border rounded-xl transition-all shadow-2xs"
                    title="Print Shift Ticket"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadShiftPdf(shift)}
                    className="p-1.5 bg-white hover:bg-slate-50 text-jaman-navy border border-jaman-border rounded-xl transition-all shadow-2xs"
                    title="Download Shift PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredHistoricalShifts.length === 0 && (
            <div className="col-span-full">
              <EmptyState description="No historical shifts found for the selected filter." />
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: OPEN SHIFT MODAL */}
      {openShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-jaman-cream border border-jaman-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-jaman-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-jaman-saffron flex items-center justify-center font-bold">
                  <Unlock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-jaman-navy">Start New Cashier Shift</h3>
                  <span className="text-[10px] text-slate-400">POS Terminal: {posTerminalId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenShiftModalOpen(false)}
                className="p-1 text-slate-400 hover:text-jaman-navy rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOpenShiftSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-white rounded-2xl border border-jaman-border text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Assigned Cashier:</span>
                  <strong className="text-jaman-navy">{currentUser?.fullName || '—'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Opening Date & Time:</span>
                  <strong className="text-jaman-navy">{new Date().toLocaleString('en-IN')}</strong>
                </div>
              </div>

              {/* Opening Float Input & Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-jaman-navy">
                  Opening Cash Float in Drawer (₹):
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={openingFloatInput}
                  onChange={(e) => setOpeningFloatInput(e.target.value)}
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xl font-mono font-black text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                  {[100, 500, 1000, 2000, 5000, 10000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setOpeningFloatInput(String(amt))}
                      className="py-1 bg-white hover:bg-slate-100 border border-jaman-border rounded-lg text-[11px] font-bold text-jaman-navy"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">
                  Opening Note (Optional):
                </label>
                <input
                  type="text"
                  value={openingNotesInput}
                  onChange={(e) => setOpeningNotesInput(e.target.value)}
                  placeholder="e.g. Starting drawer for morning shift"
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenShiftModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black shadow-sm shadow-jaman-saffron/25"
                >
                  Start Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD CASH MOVEMENT MODAL */}
      {cashMovementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-jaman-cream border border-jaman-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-jaman-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <CircleDollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-jaman-navy">Record Cash Movement</h3>
                  <span className="text-[10px] text-slate-400">Shift #{activeShift?.id?.slice(-2)} Drawer</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCashMovementModalOpen(false)}
                className="p-1 text-slate-400 hover:text-jaman-navy rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCashMovementSubmit} className="p-5 space-y-4">
              {/* Movement Type Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovementType('CASH_IN')}
                  className={`py-2 rounded-xl text-xs font-black transition-all ${
                    movementType === 'CASH_IN'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-jaman-border text-slate-700'
                  }`}
                >
                  ↓ Cash In (Paid In)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('CASH_OUT')}
                  className={`py-2 rounded-xl text-xs font-black transition-all ${
                    movementType === 'CASH_OUT'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white border border-jaman-border text-slate-700'
                  }`}
                >
                  ↑ Cash Out (Paid Out)
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-black text-jaman-navy mb-1">
                  Amount (₹):
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-lg font-mono font-black text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
              </div>

              {/* Reason Preset */}
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">
                  Reason / Purpose:
                </label>
                <select
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none"
                >
                  <option value="Petty Cash Expense">Petty Cash Expense (Daily Dairy, Ice, Vegetables)</option>
                  <option value="Bank Float Top-up">Bank Float Top-up (Added Change)</option>
                  <option value="Safe Drop">Safe Drop (Excess Cash Removal to Safe)</option>
                  <option value="Owner Withdrawal">Owner Withdrawal / Handover</option>
                  <option value="Cashier Change Correction">Cashier Change Correction</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">
                  Optional Details:
                </label>
                <input
                  type="text"
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  placeholder="e.g. Receipt #104, Vendor Milk delivery"
                  className="w-full bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCashMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white rounded-xl text-xs font-black shadow-xs"
                >
                  Confirm Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CLOSE SHIFT WITH DENOMINATIONS MODAL */}
      {closeShiftModalOpen && activeShift && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-jaman-cream border border-jaman-border w-full max-w-xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-jaman-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-jaman-navy">Close Cashier Shift & Settle Drawer</h3>
                  <span className="text-[10px] text-slate-400">Shift #{activeShift.id.slice(-2)} • {activeShift.cashierName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCloseShiftModalOpen(false)}
                className="p-1 text-slate-400 hover:text-jaman-navy rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloseShiftSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Expected Summary Box */}
              <div className="bg-white p-3.5 rounded-2xl border border-jaman-border space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(activeShift.openingCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cash Sales Collected:</span>
                  <strong className="font-mono text-jaman-navy">+ {formatINR(shiftCashSales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Net Cash Movements:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(totalCashIn - totalCashOut)}</strong>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100 font-bold text-sm text-jaman-navy">
                  <span>Expected Drawer Cash:</span>
                  <span className="font-mono text-jaman-saffron">{formatINR(expectedDrawerCash)}</span>
                </div>
              </div>

              {/* Denomination Counter Grid */}
              <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <strong className="text-xs uppercase tracking-wider text-jaman-navy">
                    Cash Drawer Denomination Count
                  </strong>
                  <span className="text-[10px] text-slate-400 font-mono">CURRENCY CALCULATOR</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '₹2,000', val: denom2000, set: setDenom2000 },
                    { label: '₹500', val: denom500, set: setDenom500 },
                    { label: '₹200', val: denom200, set: setDenom200 },
                    { label: '₹100', val: denom100, set: setDenom100 },
                    { label: '₹50', val: denom50, set: setDenom50 },
                    { label: '₹20', val: denom20, set: setDenom20 },
                    { label: '₹10', val: denom10, set: setDenom10 }
                  ].map((d, idx) => (
                    <div key={idx} className="p-2 rounded-xl bg-jaman-cream border border-jaman-border space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 block">{d.label}</span>
                      <input
                        type="number"
                        min="0"
                        value={d.val === 0 ? '' : d.val}
                        onChange={(e) => d.set(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full bg-white border border-jaman-border rounded-lg px-2 py-1 text-center font-mono font-bold text-xs"
                      />
                    </div>
                  ))}

                  <div className="p-2 rounded-xl bg-jaman-cream border border-jaman-border space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">Coins (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={denomCoins === 0 ? '' : denomCoins}
                      onChange={(e) => setDenomCoins(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-white border border-jaman-border rounded-lg px-2 py-1 text-center font-mono font-bold text-xs"
                    />
                  </div>
                </div>

                {/* Live Counted Cash & Variance */}
                <div className="p-3 bg-[#FFFDFB] rounded-xl border border-amber-300 space-y-1 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700">Counted Cash:</span>
                    <span className="font-mono font-black text-base text-jaman-navy">{formatINR(countedCash)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-amber-200">
                    <span className="font-bold text-slate-700">Calculated Variance:</span>
                    <span className={`font-mono font-black text-xs ${
                      cashVariance === 0 ? 'text-emerald-700' : cashVariance > 0 ? 'text-blue-700' : 'text-rose-700'
                    }`}>
                      {cashVariance === 0 ? '✓ MATCHED (₹0)' : cashVariance > 0 ? `+ ₹${cashVariance} (OVER)` : `- ₹${Math.abs(cashVariance)} (SHORT)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Variance Notes if discrepancy */}
              {cashVariance !== 0 && (
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    Explanation for Cash Discrepancy (Required):
                  </label>
                  <input
                    type="text"
                    required
                    value={closeShiftNotes}
                    onChange={(e) => setCloseShiftNotes(e.target.value)}
                    placeholder="e.g. Customer change rounding, coin shortage"
                    className="w-full bg-white border border-rose-300 rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloseShiftModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashVariance !== 0 && !closeShiftNotes.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/25"
                >
                  Finalize & Close Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: HISTORICAL SHIFT DETAIL INSPECTOR */}
      {selectedHistoricalShift && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-jaman-cream border border-jaman-border w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-jaman-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-jaman-navy text-white flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-jaman-navy">Shift Statement — {selectedHistoricalShift.id}</h3>
                  <span className="text-[10px] text-slate-400">Cashier: {selectedHistoricalShift.cashierName} • {selectedHistoricalShift.posId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintShiftTicket(selectedHistoricalShift)}
                  className="px-3 py-1.5 bg-jaman-cream hover:bg-slate-100 border border-jaman-border rounded-xl text-xs font-bold flex items-center gap-1.5 text-jaman-navy"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadShiftPdf(selectedHistoricalShift)}
                  className="px-3 py-1.5 bg-jaman-cream hover:bg-slate-100 border border-jaman-border rounded-xl text-xs font-bold flex items-center gap-1.5 text-jaman-navy"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalShift(null)}
                  className="p-1 text-slate-400 hover:text-jaman-navy rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white p-3 rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Sales</span>
                  <strong className="font-mono text-base font-black text-jaman-navy">{formatINR(selectedHistoricalShift.totalSales)}</strong>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Orders</span>
                  <strong className="font-mono text-base font-black text-jaman-navy">{selectedHistoricalShift.totalOrders}</strong>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Cash Sales</span>
                  <strong className="font-mono text-base font-black text-amber-700">{formatINR(selectedHistoricalShift.totalCashSales)}</strong>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-jaman-border">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Counted Cash</span>
                  <strong className="font-mono text-base font-black text-jaman-navy">{formatINR(selectedHistoricalShift.closingCash || selectedHistoricalShift.actualCash || 0)}</strong>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-jaman-border space-y-2 text-slate-600">
                <span className="font-black uppercase tracking-wider text-xs text-jaman-navy block border-b border-slate-100 pb-1.5">
                  Shift Timing & Reconciliation
                </span>
                <div className="flex justify-between">
                  <span>Opened At:</span>
                  <strong>{new Date(selectedHistoricalShift.openedAt).toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Closed At:</span>
                  <strong>{selectedHistoricalShift.closedAt ? new Date(selectedHistoricalShift.closedAt).toLocaleString('en-IN') : 'N/A'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(selectedHistoricalShift.openingCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Expected Drawer:</span>
                  <strong className="font-mono text-jaman-navy">{formatINR(selectedHistoricalShift.expectedCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Closing Variance:</span>
                  <strong className={`font-mono ${
                    (selectedHistoricalShift.cashVariance || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {formatINR(selectedHistoricalShift.cashVariance || 0)}
                  </strong>
                </div>
                {selectedHistoricalShift.notes && (
                  <div className="pt-2 border-t border-slate-100 text-[11px] italic text-slate-500">
                    Notes: {selectedHistoricalShift.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
