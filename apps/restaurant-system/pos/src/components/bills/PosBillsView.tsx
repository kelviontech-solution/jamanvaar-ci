import React, { useState, useMemo } from 'react';
import { createRefund, CloudApiError } from '../../cloud/cloudClient';
import { usePosStore } from '../../store/posStore';
import { PosPrinterService } from '../../services/printerService';
import { PdfReportBuilder, ReportFullData } from '../../services/pdfReportBuilder';
import { db, OrderRepository, AuditRepository } from '@jamanvaar/database';
import { CentralReportingService, CentralDatePreset } from '@jamanvaar/business';
import { Order, OrderType, PaymentMethod, OrderStatus } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  Receipt,
  Search,
  Printer,
  RotateCcw,
  Ban,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Filter,
  Eye,
  Clock,
  User,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

type TimePeriod = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL' | 'CUSTOM';

export const PosBillsView: React.FC = () => {
  const {
    currentUser,
    setLastCompletedOrder,
    setIsReceiptOpen,
    requestManagerOverride
  } = usePosStore();

  // Period Navigation
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('TODAY');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedDateDrilldown, setSelectedDateDrilldown] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedOrderType, setSelectedOrderType] = useState<string>('ALL');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCashier, setSelectedCashier] = useState<string>('ALL');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Collapsed time blocks state (for Today view)
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});

  // Modals
  const [detailModalBill, setDetailModalBill] = useState<Order | null>(null);
  const [refundModalBill, setRefundModalBill] = useState<Order | null>(null);
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundReasonInput, setRefundReasonInput] = useState('Customer Request');
  const [reopenModalBill, setReopenModalBill] = useState<Order | null>(null);
  const [reopenReasonInput, setReopenReasonInput] = useState('Bill Modification Needed');

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Base list of settled/completed/historical orders
  // Date Boundaries Calculation using CentralReportingService
  const dateRange = useMemo(() => {
    const today = CentralReportingService.getBusinessDateRange('TODAY');
    const yesterday = CentralReportingService.getBusinessDateRange('YESTERDAY');
    const thisWeek = CentralReportingService.getBusinessDateRange('7_DAYS');
    const thisMonth = CentralReportingService.getBusinessDateRange('THIS_MONTH');
    const all = CentralReportingService.getBusinessDateRange('ALL');
    const custom = CentralReportingService.getBusinessDateRange('CUSTOM', customStartDate, customEndDate);

    return {
      TODAY: { start: today.startDate, end: today.endDate, label: today.label },
      YESTERDAY: { start: yesterday.startDate, end: yesterday.endDate, label: yesterday.label },
      THIS_WEEK: { start: thisWeek.startDate, end: thisWeek.endDate, label: thisWeek.label },
      THIS_MONTH: { start: thisMonth.startDate, end: thisMonth.endDate, label: thisMonth.label },
      ALL: { start: all.startDate, end: all.endDate, label: all.label },
      CUSTOM: { start: custom.startDate, end: custom.endDate, label: custom.label }
    };
  }, [customStartDate, customEndDate]);

  // Orders filtered by Selected Period using CentralReportingService
  const periodOrders = useMemo(() => {
    const presetMap: Record<TimePeriod, CentralDatePreset> = {
      TODAY: 'TODAY',
      YESTERDAY: 'YESTERDAY',
      THIS_WEEK: '7_DAYS',
      THIS_MONTH: 'THIS_MONTH',
      ALL: 'ALL',
      CUSTOM: 'CUSTOM'
    };
    const currentRange = CentralReportingService.getBusinessDateRange(
      presetMap[selectedPeriod],
      customStartDate,
      customEndDate
    );
    return CentralReportingService.getReportableOrders(db.orders, currentRange, {
      includeCancelled: true
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [db.orders.length, selectedPeriod, customStartDate, customEndDate]);

  // Compute Period Overview Card Metrics (for Today, Yesterday, Week, Month)
  const periodOverview = useMemo(() => {
    const todayRange = CentralReportingService.getBusinessDateRange('TODAY');
    const yestRange = CentralReportingService.getBusinessDateRange('YESTERDAY');
    const weekRange = CentralReportingService.getBusinessDateRange('7_DAYS');
    const monthRange = CentralReportingService.getBusinessDateRange('THIS_MONTH');

    const todayOrders = CentralReportingService.getReportableOrders(db.orders, todayRange);
    const yestOrders = CentralReportingService.getReportableOrders(db.orders, yestRange);
    const weekOrders = CentralReportingService.getReportableOrders(db.orders, weekRange);
    const monthOrders = CentralReportingService.getReportableOrders(db.orders, monthRange);

    const todaySummary = CentralReportingService.calculateFinancialSummary(todayOrders);
    const yestSummary = CentralReportingService.calculateFinancialSummary(yestOrders);
    const weekSummary = CentralReportingService.calculateFinancialSummary(weekOrders);
    const monthSummary = CentralReportingService.calculateFinancialSummary(monthOrders);

    return {
      today: { count: todaySummary.ordersCount, sales: todaySummary.netSales },
      yesterday: { count: yestSummary.ordersCount, sales: yestSummary.netSales },
      week: { count: weekSummary.ordersCount, sales: weekSummary.netSales },
      month: { count: monthSummary.ordersCount, sales: monthSummary.netSales }
    };
  }, [db.orders.length]);

  // Apply Search, Filters, and Optional Date Drilldown
  const finalFilteredBills = useMemo(() => {
    return periodOrders.filter((b) => {
      // Date Drilldown if active (e.g. clicking a specific day in This Week / Month)
      if (selectedDateDrilldown) {
        const orderDateStr = new Date(b.createdAt).toISOString().slice(0, 10);
        if (orderDateStr !== selectedDateDrilldown) return false;
      }

      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchInv = (b.orderNumber || '').toLowerCase().includes(q);
        const matchTok = (b.tokenNumber || '').includes(q);
        const matchCust = (b.customerName || '').toLowerCase().includes(q) || (b.customerPhone || '').includes(q);
        const matchCashier = (b.cashierName || '').toLowerCase().includes(q);
        const matchRef = (b.paymentTransactionId || '').toLowerCase().includes(q);
        if (!matchInv && !matchTok && !matchCust && !matchCashier && !matchRef) return false;
      }

      // Order Type
      if (selectedOrderType !== 'ALL' && b.orderType !== selectedOrderType) {
        return false;
      }

      // Payment Method
      if (selectedPaymentMethod !== 'ALL') {
        const pm = (b.paymentMethod || '').toUpperCase();
        if (selectedPaymentMethod === 'CASH' && pm !== 'CASH' && pm !== 'CASH_AT_COUNTER') return false;
        if (selectedPaymentMethod === 'UPI' && pm !== 'UPI' && pm !== 'UPI_QR') return false;
        if (selectedPaymentMethod === 'CARD' && pm !== 'CARD' && pm !== 'CARD_TERMINAL') return false;
        if (selectedPaymentMethod === 'SPLIT' && pm !== 'SPLIT') return false;
      }

      // Status
      if (selectedStatus !== 'ALL' && b.orderStatus !== selectedStatus) {
        return false;
      }

      // Cashier
      if (selectedCashier !== 'ALL' && b.cashierName !== selectedCashier) {
        return false;
      }

      return true;
    });
  }, [periodOrders, selectedDateDrilldown, search, selectedOrderType, selectedPaymentMethod, selectedStatus, selectedCashier]);

  // Live Period Financial Stats from CentralReportingService
  const periodStats = useMemo(() => {
    const summary = CentralReportingService.calculateFinancialSummary(finalFilteredBills);

    return {
      totalCount: finalFilteredBills.length,
      completedCount: summary.ordersCount,
      grossSales: summary.grossSales,
      netSales: summary.netSales,
      cashSales: summary.paymentBreakdown.cash,
      digitalSales: summary.paymentBreakdown.upi + summary.paymentBreakdown.card + summary.paymentBreakdown.split,
      upiSales: summary.paymentBreakdown.upi,
      cardSales: summary.paymentBreakdown.card,
      splitSales: summary.paymentBreakdown.split,
      discountTotal: summary.discountAmount,
      taxTotal: summary.totalTax,
      refundsTotal: summary.refundsAmount
    };
  }, [finalFilteredBills]);

  // Hourly Time Groups (for Today view)
  const hourlyGroupedBills = useMemo(() => {
    if (selectedPeriod !== 'TODAY') return null;

    const groups: Record<string, { label: string; bills: Order[]; totalAmount: number }> = {};

    finalFilteredBills.forEach((bill) => {
      const d = new Date(bill.createdAt);
      const hour = d.getHours();
      const nextHour = (hour + 1) % 24;

      const formatHour = (h: number) => {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        return `${displayH}:00 ${period}`;
      };

      const key = `hour-${hour}`;
      const label = `${formatHour(hour)} – ${formatHour(nextHour)}`;

      if (!groups[key]) {
        groups[key] = { label, bills: [], totalAmount: 0 };
      }
      groups[key].bills.push(bill);
      if (bill.orderStatus === 'COMPLETED') {
        groups[key].totalAmount += bill.totalAmount;
      }
    });

    return Object.entries(groups).sort((a, b) => {
      const hourA = Number(a[0].replace('hour-', ''));
      const hourB = Number(b[0].replace('hour-', ''));
      return hourB - hourA; // Latest hour first
    });
  }, [finalFilteredBills, selectedPeriod]);

  // Daily Date Breakdown (for Week and Month views)
  const dailyDateBreakdown = useMemo(() => {
    if (selectedPeriod !== 'THIS_WEEK' && selectedPeriod !== 'THIS_MONTH') return null;

    const map: Record<string, { dateStr: string; label: string; count: number; sales: number }> = {};

    periodOrders.forEach((o) => {
      const dateStr = new Date(o.createdAt).toISOString().slice(0, 10);
      const label = new Date(o.createdAt).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });

      if (!map[dateStr]) {
        map[dateStr] = { dateStr, label, count: 0, sales: 0 };
      }
      map[dateStr].count++;
      if (o.orderStatus === 'COMPLETED') {
        map[dateStr].sales += o.totalAmount;
      }
    });

    return Object.values(map).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [periodOrders, selectedPeriod]);

  // Unique cashiers for filter dropdown
  const uniqueCashiers = useMemo(() => {
    const set = new Set<string>();
    db.orders.forEach((o: Order) => {
      if (o.cashierName) set.add(o.cashierName);
    });
    return Array.from(set);
  }, [db.orders.length]);

  // Actions
  const handleReprint = (bill: Order) => {
    PosPrinterService.reprintReceipt(bill, 'Counter reprint request', currentUser?.fullName || 'Cashier');
    setLastCompletedOrder(bill);
    setIsReceiptOpen(true);
    showToast(`✓ Dispatched reprint for Invoice #${bill.orderNumber}`);
  };

  const handleOpenRefundModal = (bill: Order) => {
    setRefundModalBill(bill);
    setRefundAmountInput(String(bill.totalAmount));
  };

  const handleConfirmRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalBill) return;

    const amt = Number(refundAmountInput) || refundModalBill.totalAmount;
    const bill = refundModalBill;

    requestManagerOverride(
      'REFUND',
      `Process Refund on Invoice #${bill.orderNumber}`,
      `Refunding ₹${amt} on settled bill #${bill.orderNumber}`,
      async (mgr) => {
        // Only a real Cashfree UPI payment has a paymentTransactionId that
        // matches a cloud PaymentTransaction — a locally-generated cash
        // receipt id never does, so cash/card orders fall straight through
        // to the existing local-only refund, unchanged.
        if (bill.paymentMethod === 'UPI' && bill.paymentTransactionId) {
          try {
            await createRefund(bill.paymentTransactionId, Math.round(amt * 100), refundReasonInput);
          } catch (err) {
            const message = err instanceof CloudApiError ? err.message : 'Refund request failed';
            showToast(`✗ Refund failed for Invoice #${bill.orderNumber}: ${message}`);
            return; // never flip local status on a failed cloud refund
          }
        }

        try {
          OrderRepository.refundOrder(bill.id, amt, refundReasonInput, mgr);
        } catch (err: any) {
          showToast(`✗ Refund failed for Invoice #${bill.orderNumber}: ${err?.message || 'Unknown error'}`);
          return;
        }
        AuditRepository.log({
          action: 'REFUND_INVOICE',
          category: 'PAYMENT',
          details: `Refunded ₹${amt} on #${bill.orderNumber}. Reason: ${refundReasonInput}`,
          username: mgr
        });
        setRefundModalBill(null);
        showToast(`✓ Refund of ₹${amt} processed for Invoice #${bill.orderNumber}`);
      }
    );
  };

  const handleOpenReopenModal = (bill: Order) => {
    setReopenModalBill(bill);
  };

  const handleConfirmReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenModalBill) return;

    requestManagerOverride(
      'REOPEN_BILL',
      `Reopen Invoice #${reopenModalBill.orderNumber}`,
      `Reopening settled bill for Order #${reopenModalBill.orderNumber} (₹${reopenModalBill.totalAmount})`,
      (mgr) => {
        OrderRepository.updateOrderStatus(reopenModalBill.id, 'PREPARING', `Bill Reopened by ${mgr}`);
        AuditRepository.log({
          action: 'REOPEN_BILL',
          category: 'ORDER',
          details: `Bill #${reopenModalBill.orderNumber} reopened for modification. Reason: ${reopenReasonInput}`,
          username: mgr
        });
        setReopenModalBill(null);
        showToast(`✓ Invoice #${reopenModalBill.orderNumber} reopened and returned to active queue`);
      }
    );
  };

  const handleExportCsv = () => {
    const headers = [
      'Invoice #',
      'Order #',
      'Token #',
      'Date',
      'Time',
      'Order Type',
      'Customer Name',
      'Customer Phone',
      'Cashier',
      'Items Count',
      'Subtotal',
      'Discount',
      'CGST (2.5%)',
      'SGST (2.5%)',
      'Total Net',
      'Payment Method',
      'Transaction ID',
      'Status'
    ];

    const rows = finalFilteredBills.map((b) => [
      `"${b.orderNumber}"`,
      `"${b.id}"`,
      `"${b.tokenNumber}"`,
      `"${new Date(b.createdAt).toLocaleDateString('en-IN')}"`,
      `"${new Date(b.createdAt).toLocaleTimeString('en-IN')}"`,
      `"${b.orderType}"`,
      `"${b.customerName || 'Walk-in'}"`,
      `"${b.customerPhone || ''}"`,
      `"${b.cashierName || 'Staff'}"`,
      b.items.length,
      b.subtotal || b.totalAmount,
      b.discountAmount || 0,
      b.cgstAmount || Math.round(b.totalAmount * 0.0238),
      b.sgstAmount || Math.round(b.totalAmount * 0.0238),
      b.totalAmount,
      `"${b.paymentMethod}"`,
      `"${b.paymentTransactionId || ''}"`,
      `"${b.orderStatus}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `JAMANVAAR_Invoices_${selectedPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Exported invoices to CSV');
  };

  const handleDownloadPdf = () => {
    try {
      const fullData: ReportFullData = {
        title: `Bills & Invoices Ledger (${dateRange[selectedPeriod].label})`,
        periodLabel: dateRange[selectedPeriod].label,
        startDate: dateRange[selectedPeriod].start.toISOString(),
        endDate: dateRange[selectedPeriod].end.toISOString(),
        generatedAt: new Date().toLocaleString('en-IN'),
        generatedBy: currentUser?.fullName || 'Cashier',
        summary: {
          dateStr: new Date().toLocaleDateString('en-IN'),
          grossSales: periodStats.grossSales,
          discountAmount: periodStats.discountTotal,
          netSales: periodStats.netSales,
          cgstAmount: Math.round(periodStats.netSales * 0.0238),
          sgstAmount: Math.round(periodStats.netSales * 0.0238),
          totalTax: periodStats.taxTotal || Math.round(periodStats.netSales * 0.0476),
          totalCollected: periodStats.netSales,
          refundsCount: 0,
          refundsAmount: periodStats.refundsTotal,
          cancelledCount: 0,
          ordersCount: periodStats.completedCount,
          avgOrderValue: periodStats.completedCount > 0 ? Math.round(periodStats.netSales / periodStats.completedCount) : 0,
          paymentBreakdown: {
            cash: periodStats.cashSales,
            upi: periodStats.upiSales,
            card: periodStats.cardSales,
            wallet: 0,
            split: periodStats.splitSales,
            other: 0
          },
          orderTypeBreakdown: {
            dineIn: { count: periodStats.completedCount, total: periodStats.netSales },
            takeaway: { count: 0, total: 0 },
            delivery: { count: 0, total: 0 },
            token: { count: 0, total: 0 }
          }
        },
        topItems: [],
        cashiers: []
      };

      PdfReportBuilder.downloadPdfFile(fullData, `JAMANVAAR_Invoices_${selectedPeriod}.pdf`, 'CLASSIC');
      showToast('✓ Downloaded invoices PDF statement');
    } catch {
      showToast('⚠ Error creating PDF file');
    }
  };

  const toggleBlockCollapse = (key: string) => {
    setCollapsedBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF7F2] p-4 sm:p-6 overflow-hidden select-none space-y-4">
      
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[#E66817]" />
            <h1 className="text-xl sm:text-2xl font-black text-[#0B253A]">Bills & Invoices</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            View, search, reprint receipts, issue refunds and manage completed restaurant transactions.
          </p>
        </div>

        {/* Top-Right Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          {toastMessage && (
            <span className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
              {toastMessage}
            </span>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-3 py-2 bg-[#0B253A] hover:bg-[#1E3A4C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* 2. Primary Time Period Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
        {[
          { id: 'TODAY', label: 'Today' },
          { id: 'YESTERDAY', label: 'Yesterday' },
          { id: 'THIS_WEEK', label: 'This Week' },
          { id: 'THIS_MONTH', label: 'This Month' },
          { id: 'ALL', label: 'All Bills' },
          { id: 'CUSTOM', label: 'Custom Date' }
        ].map((tab) => {
          const isActive = selectedPeriod === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedPeriod(tab.id as TimePeriod);
                setSelectedDateDrilldown(null);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer whitespace-nowrap min-h-[44px] flex items-center gap-1.5 ${
                isActive
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#F5F0E8] border border-[#EBE6DD]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 opacity-80" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom Date Pickers if CUSTOM is selected */}
      {selectedPeriod === 'CUSTOM' && (
        <div className="p-3 bg-white border border-[#EBE6DD] rounded-2xl flex items-center gap-3 flex-wrap shrink-0 animate-in fade-in text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-1.5 font-mono font-bold text-[#0B253A]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-1.5 font-mono font-bold text-[#0B253A]"
            />
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            Showing filtered ledger between selected dates
          </span>
        </div>
      )}

      {/* 3. Dynamic Period Financial Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 text-xs">
        <div className="p-3.5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Invoices
          </span>
          <strong className="text-xl font-black font-mono text-[#0B253A] block mt-0.5">
            {periodStats.totalCount}
          </strong>
          <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
            {dateRange[selectedPeriod].label}
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Sales
          </span>
          <strong className="text-xl font-black font-mono text-emerald-700 block mt-0.5">
            {formatINR(periodStats.netSales)}
          </strong>
          <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
            Net billed revenue
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Cash Collection
          </span>
          <strong className="text-xl font-black font-mono text-amber-700 block mt-0.5">
            {formatINR(periodStats.cashSales)}
          </strong>
          <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
            Physical drawer cash
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-[#EBE6DD] shadow-2xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            UPI + Card POS
          </span>
          <strong className="text-xl font-black font-mono text-blue-700 block mt-0.5">
            {formatINR(periodStats.digitalSales)}
          </strong>
          <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">
            Digital settlements
          </span>
        </div>
      </div>

      {/* 4. Time Period Overview Navigation Cards (when in ALL or Overview mode) */}
      {selectedPeriod === 'ALL' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedPeriod('TODAY')}
            className="p-3 bg-white hover:bg-amber-50/60 border border-[#EBE6DD] rounded-2xl text-left transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
              <span>TODAY</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#E66817] group-hover:translate-x-1 transition-transform" />
            </div>
            <strong className="text-base font-black text-[#0B253A] block mt-1">
              {formatINR(periodOverview.today.sales)}
            </strong>
            <span className="text-[11px] text-slate-500">{periodOverview.today.count} Bills</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPeriod('YESTERDAY')}
            className="p-3 bg-white hover:bg-amber-50/60 border border-[#EBE6DD] rounded-2xl text-left transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
              <span>YESTERDAY</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#E66817] group-hover:translate-x-1 transition-transform" />
            </div>
            <strong className="text-base font-black text-[#0B253A] block mt-1">
              {formatINR(periodOverview.yesterday.sales)}
            </strong>
            <span className="text-[11px] text-slate-500">{periodOverview.yesterday.count} Bills</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPeriod('THIS_WEEK')}
            className="p-3 bg-white hover:bg-amber-50/60 border border-[#EBE6DD] rounded-2xl text-left transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
              <span>THIS WEEK</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#E66817] group-hover:translate-x-1 transition-transform" />
            </div>
            <strong className="text-base font-black text-[#0B253A] block mt-1">
              {formatINR(periodOverview.week.sales)}
            </strong>
            <span className="text-[11px] text-slate-500">{periodOverview.week.count} Bills</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPeriod('THIS_MONTH')}
            className="p-3 bg-white hover:bg-amber-50/60 border border-[#EBE6DD] rounded-2xl text-left transition-all shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
              <span>THIS MONTH</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#E66817] group-hover:translate-x-1 transition-transform" />
            </div>
            <strong className="text-base font-black text-[#0B253A] block mt-1">
              {formatINR(periodOverview.month.sales)}
            </strong>
            <span className="text-[11px] text-slate-500">{periodOverview.month.count} Bills</span>
          </button>
        </div>
      )}

      {/* Daily Breakdown Pills (for Week and Month views) */}
      {dailyDateBreakdown && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setSelectedDateDrilldown(null)}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              selectedDateDrilldown === null
                ? 'bg-[#0B253A] text-white'
                : 'bg-white border border-[#EBE6DD] text-slate-700'
            }`}
          >
            All Days ({dailyDateBreakdown.length})
          </button>
          {dailyDateBreakdown.map((d) => (
            <button
              key={d.dateStr}
              type="button"
              onClick={() => setSelectedDateDrilldown(d.dateStr)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                selectedDateDrilldown === d.dateStr
                  ? 'bg-[#E66817] text-white'
                  : 'bg-white border border-[#EBE6DD] text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{d.label}</span> • <span className="font-mono">{formatINR(d.sales)}</span> ({d.count})
            </button>
          ))}
        </div>
      )}

      {/* 5. Search Bar & Filter Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, token #, customer phone, cashier, transaction ID..."
            className="w-full bg-white border border-[#EBE6DD] rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817] shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button */}
        <button
          type="button"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`px-3.5 py-2.5 rounded-2xl border text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer ${
            isFilterOpen || selectedOrderType !== 'ALL' || selectedPaymentMethod !== 'ALL' || selectedStatus !== 'ALL' || selectedCashier !== 'ALL'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-white border-[#EBE6DD] text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {(selectedOrderType !== 'ALL' || selectedPaymentMethod !== 'ALL' || selectedStatus !== 'ALL' || selectedCashier !== 'ALL') && (
            <span className="w-2 h-2 rounded-full bg-[#E66817]" />
          )}
        </button>
      </div>

      {/* Expandable Filter Drawer */}
      {isFilterOpen && (
        <div className="p-3.5 bg-white border border-[#EBE6DD] rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0 animate-in fade-in text-xs">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Order Type
            </label>
            <select
              value={selectedOrderType}
              onChange={(e) => setSelectedOrderType(e.target.value)}
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-2.5 py-1.5 font-bold text-[#0B253A]"
            >
              <option value="ALL">All Types</option>
              <option value="DINE_IN">Dine-In</option>
              <option value="TAKEAWAY">Takeaway</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Payment Method
            </label>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-2.5 py-1.5 font-bold text-[#0B253A]"
            >
              <option value="ALL">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / Bharat QR</option>
              <option value="CARD">Card POS</option>
              <option value="SPLIT">Split Payment</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Invoice Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-2.5 py-1.5 font-bold text-[#0B253A]"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed (Paid)</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Voided / Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Cashier / Staff
            </label>
            <select
              value={selectedCashier}
              onChange={(e) => setSelectedCashier(e.target.value)}
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-2.5 py-1.5 font-bold text-[#0B253A]"
            >
              <option value="ALL">All Cashiers</option>
              {uniqueCashiers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 6. Invoice List & Time-Grouped Sections */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {/* If TODAY view: Render Hourly Grouped Time Blocks */}
        {selectedPeriod === 'TODAY' && hourlyGroupedBills && hourlyGroupedBills.length > 0 ? (
          hourlyGroupedBills.map(([groupKey, group]) => {
            const isCollapsed = !!collapsedBlocks[groupKey];

            return (
              <div key={groupKey} className="bg-white border border-[#EBE6DD] rounded-2xl overflow-hidden shadow-2xs">
                {/* Time Block Header */}
                <button
                  type="button"
                  onClick={() => toggleBlockCollapse(groupKey)}
                  className="w-full px-4 py-2.5 bg-[#FAF7F2] hover:bg-[#F5F0E8] border-b border-[#EBE6DD] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#E66817]" />
                    <span className="font-black text-xs text-[#0B253A]">{group.label}</span>
                    <span className="bg-white border border-[#EBE6DD] text-slate-600 text-[10px] font-bold px-2 py-0.2 rounded-full">
                      {group.bills.length} {group.bills.length === 1 ? 'bill' : 'bills'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <strong className="font-mono font-black text-xs text-[#0B253A]">
                      {formatINR(group.totalAmount)}
                    </strong>
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Invoices inside this time block */}
                {!isCollapsed && (
                  <div className="p-3 space-y-2.5">
                    {group.bills.map((bill) => (
                      <InvoiceCard
                        key={bill.id}
                        bill={bill}
                        onView={() => setDetailModalBill(bill)}
                        onReprint={() => handleReprint(bill)}
                        onReopen={() => handleOpenReopenModal(bill)}
                        onRefund={() => handleOpenRefundModal(bill)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Standard Cards Grid for other periods or filtered list */
          <div className="space-y-2.5">
            {finalFilteredBills.length > 0 ? (
              finalFilteredBills.map((bill) => (
                <InvoiceCard
                  key={bill.id}
                  bill={bill}
                  onView={() => setDetailModalBill(bill)}
                  onReprint={() => handleReprint(bill)}
                  onReopen={() => handleOpenReopenModal(bill)}
                  onRefund={() => handleOpenRefundModal(bill)}
                />
              ))
            ) : (
              <div className="p-12 text-center bg-white border border-[#EBE6DD] rounded-3xl space-y-3">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-black text-sm text-[#0B253A]">No invoices found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No billing transactions matched the selected period or filters.
                </p>
                {(search || selectedOrderType !== 'ALL' || selectedPaymentMethod !== 'ALL' || selectedStatus !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedOrderType('ALL');
                      setSelectedPaymentMethod('ALL');
                      setSelectedStatus('ALL');
                      setSelectedCashier('ALL');
                    }}
                    className="px-4 py-2 bg-[#FAF7F2] hover:bg-slate-100 border border-[#EBE6DD] text-xs font-bold text-[#0B253A] rounded-xl"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: VIEW INVOICE DETAIL MODAL */}
      {detailModalBill && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 bg-white border-b border-[#EBE6DD] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#E66817] to-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm text-[#0B253A]">
                      Invoice #{detailModalBill.orderNumber}
                    </h3>
                    <span className="font-mono text-[10px] font-black bg-[#0B253A] text-white px-2 py-0.2 rounded">
                      Token #{detailModalBill.tokenNumber}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(detailModalBill.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleReprint(detailModalBill)}
                  className="px-3 py-1.5 bg-[#FAF7F2] hover:bg-slate-100 border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Reprint</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalBill(null)}
                  className="p-1 text-slate-400 hover:text-[#0B253A] rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Order Meta Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3.5 rounded-2xl border border-[#EBE6DD]">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Order Type</span>
                  <strong className="text-[#0B253A] block">{detailModalBill.orderType}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Table / Guest</span>
                  <strong className="text-[#0B253A] block">{detailModalBill.tableNumber || detailModalBill.customerName || 'Walk-in'}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Payment Method</span>
                  <strong className="text-[#0B253A] block">{detailModalBill.paymentMethod}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Cashier</span>
                  <strong className="text-[#0B253A] block">{detailModalBill.cashierName || 'Cashier'}</strong>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden">
                <div className="p-3 bg-[#FAF7F2] border-b border-[#EBE6DD] font-black text-xs text-[#0B253A]">
                  Billed Items & Modifiers ({detailModalBill.items.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {detailModalBill.items.map((it, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-start">
                      <div>
                        <strong className="text-[#0B253A] block">{it.name}</strong>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {it.quantity} × {formatINR(it.unitPrice)}
                        </span>
                        {it.modifiers && it.modifiers.length > 0 && (
                          <span className="text-[10px] text-slate-500 block italic">
                            + {it.modifiers.map((m) => m.optionName || (m as any).name).join(', ')}
                          </span>
                        )}
                      </div>
                      <strong className="font-mono text-[#0B253A]">{formatINR(it.totalPrice)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <strong className="font-mono text-[#0B253A]">{formatINR(detailModalBill.subtotal || detailModalBill.totalAmount)}</strong>
                </div>
                {detailModalBill.discountAmount ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount Granted:</span>
                    <strong className="font-mono">- {formatINR(detailModalBill.discountAmount)}</strong>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>CGST (2.5%):</span>
                  <strong className="font-mono text-[#0B253A]">{formatINR(detailModalBill.cgstAmount || Math.round(detailModalBill.totalAmount * 0.0238))}</strong>
                </div>
                <div className="flex justify-between">
                  <span>SGST (2.5%):</span>
                  <strong className="font-mono text-[#0B253A]">{formatINR(detailModalBill.sgstAmount || Math.round(detailModalBill.totalAmount * 0.0238))}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-black text-[#0B253A]">
                  <span>Total Amount Paid:</span>
                  <span className="font-mono text-[#E66817]">{formatINR(detailModalBill.totalAmount)}</span>
                </div>
              </div>

              {/* Footer Actions inside Drawer */}
              <div className="flex items-center justify-end gap-2 pt-2">
                {detailModalBill.orderStatus === 'COMPLETED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailModalBill(null);
                        handleOpenReopenModal(detailModalBill);
                      }}
                      className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold"
                    >
                      Reopen Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailModalBill(null);
                        handleOpenRefundModal(detailModalBill);
                      }}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold"
                    >
                      Process Refund
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PROTECTED REFUND MODAL */}
      {refundModalBill && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-[#EBE6DD] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#0B253A]">Process Invoice Refund</h3>
                  <span className="text-[10px] text-slate-400">Invoice #{refundModalBill.orderNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundModalBill(null)}
                className="p-1 text-slate-400 hover:text-[#0B253A] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRefund} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-white rounded-2xl border border-[#EBE6DD] space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Billed Total:</span>
                  <strong className="font-mono text-[#0B253A]">{formatINR(refundModalBill.totalAmount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <strong className="text-[#0B253A]">{refundModalBill.paymentMethod}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-[#0B253A] mb-1">
                  Refund Amount (₹):
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={refundModalBill.totalAmount}
                  value={refundAmountInput}
                  onChange={(e) => setRefundAmountInput(e.target.value)}
                  className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-lg font-mono font-black text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B253A] mb-1">
                  Reason for Refund:
                </label>
                <select
                  value={refundReasonInput}
                  onChange={(e) => setRefundReasonInput(e.target.value)}
                  className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 font-bold text-[#0B253A]"
                >
                  <option value="Customer Request">Customer Request / Change of Mind</option>
                  <option value="Food Quality Issue">Food Quality Issue</option>
                  <option value="Wrong Item Billed">Wrong Item Billed</option>
                  <option value="Order Delayed Cancellation">Order Delayed Cancellation</option>
                  <option value="Manager Special Concession">Manager Special Concession</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundModalBill(null)}
                  className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black shadow-xs"
                >
                  Confirm Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REOPEN BILL MODAL */}
      {reopenModalBill && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="bg-[#FAF7F2] border border-[#EBE6DD] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-white border-b border-[#EBE6DD] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#0B253A]">Reopen Completed Invoice</h3>
                  <span className="text-[10px] text-slate-400">Invoice #{reopenModalBill.orderNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReopenModalBill(null)}
                className="p-1 text-slate-400 hover:text-[#0B253A] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReopen} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-1 text-amber-900">
                <strong className="block font-black">Important Notice:</strong>
                <p className="text-[11px]">
                  Reopening this bill will return the order to the active queue for dish additions or modifier edits.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B253A] mb-1">
                  Reason for Reopening:
                </label>
                <input
                  type="text"
                  required
                  value={reopenReasonInput}
                  onChange={(e) => setReopenReasonInput(e.target.value)}
                  placeholder="e.g. Guest added dessert after payment"
                  className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 font-bold text-[#0B253A] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReopenModalBill(null)}
                  className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B253A] hover:bg-[#1E3A4C] text-white rounded-xl font-black shadow-xs"
                >
                  Confirm Reopen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// 7. Reusable Touch-Friendly Invoice Card Component
interface InvoiceCardProps {
  bill: Order;
  onView: () => void;
  onReprint: () => void;
  onReopen: () => void;
  onRefund: () => void;
}

const InvoiceCard: React.FC<InvoiceCardProps> = ({
  bill,
  onView,
  onReprint,
  onReopen,
  onRefund
}) => {
  const isRefunded = bill.orderStatus === 'REFUNDED';
  const isCancelled = bill.orderStatus === 'CANCELLED';

  return (
    <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 hover:border-slate-400 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      {/* Left: Invoice Identity & Details */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-sm font-black text-[#0B253A]">
            #{bill.orderNumber}
          </strong>
          <span className="text-xs font-black bg-[#0B253A] text-white px-2 py-0.5 rounded-lg font-mono">
            Token #{bill.tokenNumber}
          </span>
          <span className="text-[10px] font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md uppercase">
            {bill.orderType}
          </span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${
            bill.paymentMethod === 'CASH' || bill.paymentMethod === 'CASH_AT_COUNTER'
              ? 'bg-amber-100 text-amber-900'
              : 'bg-blue-100 text-blue-900'
          }`}>
            {bill.paymentMethod}
          </span>
          {isRefunded && (
            <span className="text-[10px] font-black bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md uppercase">
              REFUNDED
            </span>
          )}
          {isCancelled && (
            <span className="text-[10px] font-black bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md uppercase">
              VOIDED
            </span>
          )}
        </div>

        <div className="text-slate-500 flex items-center gap-2 text-[11px] flex-wrap">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <span>•</span>
          <span>{bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}</span>
          <span>•</span>
          <span>{bill.customerName || (bill.tableNumber ? `Table ${bill.tableNumber}` : 'Walk-in Guest')}</span>
        </div>
      </div>

      {/* Right: Pricing & Actions */}
      <div className="flex items-center gap-4 self-end sm:self-center">
        <div className="text-right">
          <strong className="text-base font-black font-mono text-[#0B253A] block">
            {formatINR(bill.totalAmount)}
          </strong>
          <span className="text-[10px] text-slate-400 block font-mono">
            Tax: {formatINR(bill.taxAmount || Math.round(bill.totalAmount * 0.0476))}
          </span>
        </div>

        {/* Action Buttons Toolbar with 44px+ touch targets */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onView}
            className="px-3 py-2 bg-slate-100 hover:bg-[#0B253A] hover:text-white text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs min-h-[38px] flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>

          <button
            type="button"
            onClick={onReprint}
            className="px-3 py-2 bg-slate-100 hover:bg-[#FAF7F2] text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs min-h-[38px] flex items-center gap-1"
            title="Reprint Tax Receipt"
          >
            <Printer className="w-3.5 h-3.5 text-[#E66817]" />
            <span className="hidden md:inline">Reprint</span>
          </button>

          {!isRefunded && !isCancelled && (
            <>
              <button
                type="button"
                onClick={onReopen}
                className="p-2 bg-slate-100 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs min-h-[38px]"
                title="Reopen Bill for Modification"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onRefund}
                className="p-2 bg-slate-100 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs min-h-[38px]"
                title="Issue Manager Refund"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
