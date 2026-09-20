import React, { useState, useMemo } from 'react';
import { Order, PaymentMethod, OrderType, OrderStatus } from '@jamanvaar/types';
import { formatINR, formatDate, formatTime } from '@jamanvaar/utils';
import { db, AuditRepository, OrderRepository, ReceiptRepository } from '@jamanvaar/database';
import { DayOrdersService, ReportGeneratorService, CentralReportingService } from '@jamanvaar/business';
import { printThermalReceipt, EmptyState, printElement } from '@jamanvaar/ui';
import {
  DollarSign,
  CreditCard,
  QrCode,
  Coins,
  Receipt,
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  X,
  Eye,
  RotateCcw,
  Ban,
  CheckCircle2,
  Clock,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShoppingBag,
  Utensils,
  Share2,
  MessageSquare,
  FileText,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

interface BillingInvoicesModuleProps {
  orders: Order[];
  onOrderUpdated: () => void;
  showToast: (msg: string) => void;
}

export type DateFilterPreset =
  | 'TODAY'
  | 'YESTERDAY'
  | '7_DAYS'
  | '30_DAYS'
  | 'THIS_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM';

export const BillingInvoicesModule: React.FC<BillingInvoicesModuleProps> = ({
  orders,
  onOrderUpdated,
  showToast
}) => {
  // Date Filters
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Clickable Summary Filters
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL'); // 'ALL' | 'CASH' | 'UPI_QR' | 'CARD_TERMINAL' | 'SPLIT'
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('ALL'); // 'ALL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'TOKEN'
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // 'ALL' | 'COMPLETED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'CANCELLED' | 'REFUNDED'
  const [refundOnlyFilter, setRefundOnlyFilter] = useState<boolean>(false);

  // Secondary Dropdowns
  const [cashierFilter, setCashierFilter] = useState<string>('ALL');
  const [captainFilter, setCaptainFilter] = useState<string>('ALL');
  const [posTerminalFilter, setPosTerminalFilter] = useState<string>('ALL');

  // Search
  const [searchQuery, setSearchQuery] = useState<string>('');

  // View Mode: Flat vs Day-Grouped
  const [viewMode, setViewMode] = useState<'FLAT' | 'DAY_GROUPED'>('FLAT');

  // Pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal / Detail state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('Customer Satisfaction / Return');
  const [cancelReason, setCancelReason] = useState('Customer Cancelled / Wrong Entry');

  // 1. Date Range Boundaries using CentralReportingService
  const { dateFilteredOrders, dateLabel } = useMemo(() => {
    const range = CentralReportingService.getBusinessDateRange(
      datePreset as any,
      customStartDate,
      customEndDate
    );
    const filtered = CentralReportingService.getReportableOrders(orders, range, {
      includeCancelled: true
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { dateFilteredOrders: filtered, dateLabel: range.label };
  }, [orders, orders.length, orders[0]?.id, datePreset, customStartDate, customEndDate]);

  // 2. Summary Metrics for the Selected Date Range from CentralReportingService
  const summaryMetrics = useMemo(() => {
    const summary = CentralReportingService.calculateFinancialSummary(dateFilteredOrders, dateLabel);

    let cashCount = 0;
    let upiCount = 0;
    let cardCount = 0;
    let splitCount = 0;

    dateFilteredOrders.forEach((ord) => {
      if (ord.orderStatus !== 'CANCELLED') {
        const pm = (ord.paymentMethod || '').toUpperCase();
        if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') cashCount++;
        else if (pm === 'UPI' || pm === 'UPI_QR' || pm === 'BHARAT_QR') upiCount++;
        else if (pm === 'CARD' || pm === 'CARD_TERMINAL' || pm === 'POS_CARD') cardCount++;
        else if (pm === 'SPLIT') splitCount++;
      }
    });

    return {
      totalOrders: dateFilteredOrders.length,
      grossSales: summary.grossSales,
      netSales: summary.netSales,
      discountTotal: summary.discountAmount,
      gstTotal: summary.totalTax,
      cashSales: summary.paymentBreakdown.cash,
      cashCount,
      upiSales: summary.paymentBreakdown.upi,
      upiCount,
      cardSales: summary.paymentBreakdown.card,
      cardCount,
      splitSales: summary.paymentBreakdown.split,
      splitCount,
      refundAmount: summary.refundsAmount,
      refundCount: summary.refundsCount,
      dineInSales: summary.orderTypeBreakdown.dineIn.total,
      dineInCount: summary.orderTypeBreakdown.dineIn.count,
      takeawaySales: summary.orderTypeBreakdown.takeaway.total,
      takeawayCount: summary.orderTypeBreakdown.takeaway.count,
      deliverySales: summary.orderTypeBreakdown.delivery.total,
      deliveryCount: summary.orderTypeBreakdown.delivery.count,
      tokenSales: summary.orderTypeBreakdown.token.total,
      tokenCount: summary.orderTypeBreakdown.token.count,
      avgOrderValue: summary.avgOrderValue
    };
  }, [dateFilteredOrders, dateLabel]);

  // 3. Complete Filtering Pipeline (Combines date, card filters, dropdowns & debounced search)
  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((ord) => {
      // Payment Method Filter
      if (paymentFilter !== 'ALL' && ord.paymentMethod !== paymentFilter) {
        return false;
      }

      // Order Type Filter
      if (orderTypeFilter !== 'ALL' && ord.orderType !== orderTypeFilter) {
        return false;
      }

      // Status Filter
      if (statusFilter !== 'ALL' && ord.orderStatus !== statusFilter) {
        return false;
      }

      // Refund Card Filter
      if (refundOnlyFilter && ord.orderStatus !== 'REFUNDED') {
        return false;
      }

      // Cashier Filter
      if (cashierFilter !== 'ALL' && ord.cashierName !== cashierFilter) {
        return false;
      }

      // Captain Filter
      if (captainFilter !== 'ALL' && ord.captainName !== captainFilter) {
        return false;
      }

      // POS Terminal Filter
      if (posTerminalFilter !== 'ALL' && (ord as any).terminalId !== posTerminalFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOrderNum = ord.orderNumber?.toLowerCase().includes(q);
        const matchInvoiceNum = (ord as any).invoiceNumber?.toLowerCase().includes(q);
        const matchToken = ord.tokenNumber?.toLowerCase().includes(q);
        const matchCust = ord.customerName?.toLowerCase().includes(q);
        const matchPhone = ord.customerPhone?.toLowerCase().includes(q);
        const matchTable = ord.tableNumber?.toLowerCase().includes(q);
        const matchCashier = ord.cashierName?.toLowerCase().includes(q);
        const matchCaptain = ord.captainName?.toLowerCase().includes(q);
        const matchItem = ord.items.some((it) => it.name?.toLowerCase().includes(q));

        if (
          !matchOrderNum &&
          !matchInvoiceNum &&
          !matchToken &&
          !matchCust &&
          !matchPhone &&
          !matchTable &&
          !matchCashier &&
          !matchCaptain &&
          !matchItem
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    dateFilteredOrders,
    paymentFilter,
    orderTypeFilter,
    statusFilter,
    refundOnlyFilter,
    cashierFilter,
    captainFilter,
    posTerminalFilter,
    searchQuery
  ]);

  // 4. Day-Wise Grouping of Filtered Orders (for Day Grouped view)
  const dayGroupedLedger = useMemo(() => {
    const map = new Map<string, Order[]>();
    filteredOrders.forEach((o) => {
      const key = DayOrdersService.getBusinessDateKey(o.createdAt, 6);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });

    return Array.from(map.entries()).map(([dateKey, dayOrds]) => {
      const daySummary = DayOrdersService.getDaySummary(dayOrds, dateKey, 6);
      return {
        dateKey,
        displayDate: daySummary.formattedDate,
        summary: daySummary,
        orders: dayOrds
      };
    });
  }, [filteredOrders]);

  // 5. Pagination calculation
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Unique Lists for Dropdown Filters
  const uniqueCashiers = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => {
      if (o.cashierName) s.add(o.cashierName);
    });
    return Array.from(s);
  }, [orders]);

  const uniqueCaptains = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => {
      if (o.captainName) s.add(o.captainName);
    });
    return Array.from(s);
  }, [orders]);

  // Handler: Reset all filters
  const handleClearAllFilters = () => {
    setPaymentFilter('ALL');
    setOrderTypeFilter('ALL');
    setStatusFilter('ALL');
    setRefundOnlyFilter(false);
    setCashierFilter('ALL');
    setCaptainFilter('ALL');
    setPosTerminalFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
    showToast('Filters Cleared — Showing All Records');
  };

  // Handler: Export CSV
  const handleExportCsv = () => {
    const csv = ReportGeneratorService.exportTransactionsCsv(filteredOrders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jamanvaar_invoices_${datePreset}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast(`Exported ${filteredOrders.length} Invoices to CSV!`);
  };

  // Handler: Export JSON
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(filteredOrders, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jamanvaar_invoices_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported Invoices to JSON!');
  };

  // Handler: Export PDF
  const handleExportPdf = () => {
    if (!printElement('[data-print-doc="invoice-statement"]', { title: 'Invoice statement', pageSize: 'A4 landscape' })) {
      showToast('There are no invoices to print.');
      return;
    }
    showToast(`Invoice statement ready (${filteredOrders.length} records). Choose Save as PDF to download it.`);
  };

  // Handler: Print Thermal Bill
  const handlePrintBill = (ord: Order) => {
    setSelectedOrder(ord);
    showToast(`Printing Bill for #${ord.orderNumber}...`);
    printThermalReceipt(ord, '80mm', ReceiptRepository.getConfig());
  };

  // Handler: Process Refund
  const handleProcessRefund = () => {
    if (!selectedOrder) return;
    selectedOrder.orderStatus = 'REFUNDED';
    AuditRepository.log({
      action: 'ORDER_REFUNDED',
      category: 'ORDER',
      details: `Refunded Order #${selectedOrder.orderNumber} (₹${selectedOrder.totalAmount}) - Reason: ${refundReason}`,
      username: 'Floor Manager'
    });
    db.notify();
    onOrderUpdated();
    setIsRefundModalOpen(false);
    showToast(`Order #${selectedOrder.orderNumber} Refunded Successfully!`);
  };

  // Handler: Void / Cancel
  const handleVoidOrder = () => {
    if (!selectedOrder) return;
    selectedOrder.orderStatus = 'CANCELLED';
    AuditRepository.log({
      action: 'ORDER_CANCELLED',
      category: 'ORDER',
      details: `Voided Order #${selectedOrder.orderNumber} - Reason: ${cancelReason}`,
      username: 'Floor Manager'
    });
    db.notify();
    onOrderUpdated();
    setIsCancelModalOpen(false);
    showToast(`Order #${selectedOrder.orderNumber} Voided / Cancelled!`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none pb-12">
      
      {/* 1. TOP HEADER & EXPORT ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
              Billing & Invoices
            </h1>
            <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              ● REAL-TIME DB
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage sales, payments, invoices, and financial reconciliation.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="bg-white p-1 rounded-xl border border-jaman-border flex items-center shadow-2xs">
            <button
              onClick={() => setViewMode('FLAT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'FLAT'
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'text-slate-600 hover:bg-jaman-cream'
              }`}
            >
              📄 Flat Ledger
            </button>
            <button
              onClick={() => setViewMode('DAY_GROUPED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'DAY_GROUPED'
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'text-slate-600 hover:bg-jaman-cream'
              }`}
            >
              🗓️ Day-by-Day
            </button>
          </div>

          <button
            onClick={handleExportPdf}
            className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
            title="Download / Print Invoices Ledger as PDF"
          >
            <FileText className="w-3.5 h-3.5 text-white" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border hover:bg-jaman-cream text-jaman-navy text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3.5 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all"
          >
            <Download className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* 2. DATE SELECTOR BAR */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Date Scope:</span>
          {[
            { id: 'TODAY', label: 'Today' },
            { id: 'YESTERDAY', label: 'Yesterday' },
            { id: '7_DAYS', label: 'Last 7 Days' },
            { id: '30_DAYS', label: 'Last 30 Days' },
            { id: 'THIS_MONTH', label: 'This Month' },
            { id: 'THIS_YEAR', label: 'This Year' },
            { id: 'CUSTOM', label: 'Custom Date' }
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setDatePreset(preset.id as DateFilterPreset);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                datePreset === preset.id
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'bg-jaman-cream hover:bg-[#F4EFE6] text-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {datePreset === 'CUSTOM' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy"
            />
          </div>
        )}

        <div className="text-[11px] font-bold text-slate-500">
          Showing: <strong className="text-jaman-navy font-mono">{dateLabel}</strong> ({summaryMetrics.totalOrders} Invoices)
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FINANCIAL SUMMARY SECTION (DOMINANT TOTAL + TENDER MIX) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-3.5">
        
        {/* Dominant Hero Card: Total Net Sales (Span 2 on lg) */}
        <div
          onClick={() => {
            setPaymentFilter('ALL');
            setRefundOnlyFilter(false);
            setCurrentPage(1);
          }}
          className={`lg:col-span-2 card-metric-premium flex flex-col justify-between cursor-pointer group select-none relative overflow-hidden ${
            paymentFilter === 'ALL' && !refundOnlyFilter
              ? 'ring-2 ring-jaman-navy/20 bg-[#FFFBF8]'
              : 'hover:border-jaman-navy/40'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-jaman-saffron via-[#F59E0B] to-jaman-saffron/40" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">TOTAL NET SALES</span>
              <div className="w-8 h-8 rounded-xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center border border-[#FDBA74]/30">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-jaman-navy font-mono mt-2">
              {formatINR(summaryMetrics.netSales)}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500 font-medium">
            <span>{summaryMetrics.totalOrders} Invoices recorded</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
              Tax: {formatINR(summaryMetrics.gstTotal)}
            </span>
          </div>
        </div>

        {/* 4 Cards: Tender Mix Breakdown (Span 4 on lg) */}
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* CASH */}
          <div
            onClick={() => {
              setPaymentFilter('CASH');
              setRefundOnlyFilter(false);
              setCurrentPage(1);
            }}
            className={`card-summary-premium flex flex-col justify-between cursor-pointer transition-all ${
              paymentFilter === 'CASH'
                ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/40'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500">💵 CASH</span>
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-lg font-black text-emerald-950 font-mono my-1">
              {formatINR(summaryMetrics.cashSales)}
            </div>
            <div className="text-[10px] font-bold text-slate-500">
              {summaryMetrics.cashCount} orders
            </div>
          </div>

          {/* UPI / QR */}
          <div
            onClick={() => {
              setPaymentFilter('UPI_QR');
              setRefundOnlyFilter(false);
              setCurrentPage(1);
            }}
            className={`card-summary-premium flex flex-col justify-between cursor-pointer transition-all ${
              paymentFilter === 'UPI_QR'
                ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500">📱 UPI / QR</span>
              <QrCode className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-lg font-black text-blue-950 font-mono my-1">
              {formatINR(summaryMetrics.upiSales)}
            </div>
            <div className="text-[10px] font-bold text-slate-500">
              {summaryMetrics.upiCount} orders
            </div>
          </div>

          {/* CARD */}
          <div
            onClick={() => {
              setPaymentFilter('CARD_TERMINAL');
              setRefundOnlyFilter(false);
              setCurrentPage(1);
            }}
            className={`card-summary-premium flex flex-col justify-between cursor-pointer transition-all ${
              paymentFilter === 'CARD_TERMINAL'
                ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/40'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500">💳 CARD</span>
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-lg font-black text-indigo-950 font-mono my-1">
              {formatINR(summaryMetrics.cardSales)}
            </div>
            <div className="text-[10px] font-bold text-slate-500">
              {summaryMetrics.cardCount} orders
            </div>
          </div>

          {/* REFUNDS */}
          <div
            onClick={() => {
              setRefundOnlyFilter(!refundOnlyFilter);
              setCurrentPage(1);
            }}
            className={`card-summary-premium flex flex-col justify-between cursor-pointer transition-all ${
              refundOnlyFilter
                ? 'border-rose-600 ring-2 ring-rose-500/20 bg-rose-50/40'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-rose-700">↩️ REFUNDS</span>
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-lg font-black text-rose-700 font-mono my-1">
              -{formatINR(summaryMetrics.refundAmount)}
            </div>
            <div className="text-[10px] font-bold text-rose-600">
              {summaryMetrics.refundCount} refunds
            </div>
          </div>
        </div>

      </div>

      {/* Order Type Mix Quick Strip */}
      <div className="bg-white p-3 rounded-2xl border border-jaman-border shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold overflow-x-auto">
          <span className="uppercase text-[10px] text-slate-400">Order Mix:</span>
          <button
            onClick={() => {
              setOrderTypeFilter(orderTypeFilter === 'DINE_IN' ? 'ALL' : 'DINE_IN');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              orderTypeFilter === 'DINE_IN' ? 'bg-jaman-navy text-white font-black' : 'bg-jaman-cream hover:bg-slate-100 text-slate-700'
            }`}
          >
            🍽️ Dine-in: <span className="font-mono">{formatINR(summaryMetrics.dineInSales)}</span> ({summaryMetrics.dineInCount})
          </button>
          <button
            onClick={() => {
              setOrderTypeFilter(orderTypeFilter === 'TAKEAWAY' ? 'ALL' : 'TAKEAWAY');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              orderTypeFilter === 'TAKEAWAY' ? 'bg-jaman-navy text-white font-black' : 'bg-jaman-cream hover:bg-slate-100 text-slate-700'
            }`}
          >
            🛍️ Takeaway: <span className="font-mono">{formatINR(summaryMetrics.takeawaySales)}</span> ({summaryMetrics.takeawayCount})
          </button>
          <button
            onClick={() => {
              setOrderTypeFilter(orderTypeFilter === 'DELIVERY' ? 'ALL' : 'DELIVERY');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              orderTypeFilter === 'DELIVERY' ? 'bg-jaman-navy text-white font-black' : 'bg-jaman-cream hover:bg-slate-100 text-slate-700'
            }`}
          >
            🛵 Delivery: <span className="font-mono">{formatINR(summaryMetrics.deliverySales)}</span> ({summaryMetrics.deliveryCount})
          </button>
          <button
            onClick={() => {
              setOrderTypeFilter(orderTypeFilter === 'TOKEN' ? 'ALL' : 'TOKEN');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              orderTypeFilter === 'TOKEN' ? 'bg-jaman-navy text-white font-black' : 'bg-jaman-cream hover:bg-slate-100 text-slate-700'
            }`}
          >
            ⚡ Quick Token: <span className="font-mono">{formatINR(summaryMetrics.tokenSales)}</span> ({summaryMetrics.tokenCount})
          </button>
        </div>

        {(orderTypeFilter !== 'ALL' || paymentFilter !== 'ALL' || refundOnlyFilter) && (
          <button
            onClick={() => {
              setOrderTypeFilter('ALL');
              setPaymentFilter('ALL');
              setRefundOnlyFilter(false);
              setCurrentPage(1);
            }}
            className="text-[11px] font-bold text-jaman-saffron hover:underline"
          >
            Clear Segment Filters ×
          </button>
        )}
      </div>

      {/* 5. SEARCH & SECONDARY DROPDOWN FILTERS */}
      <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          
          {/* Primary Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search invoice, order, token, customer, phone, cashier, captain, table..."
              className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Secondary Dropdown Selectors */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto text-xs">
            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-jaman-navy"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="CANCELLED">Voided / Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>

            {/* Cashier Dropdown */}
            <select
              value={cashierFilter}
              onChange={(e) => {
                setCashierFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-jaman-navy"
            >
              <option value="ALL">All Cashiers</option>
              {uniqueCashiers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Captain Dropdown */}
            <select
              value={captainFilter}
              onChange={(e) => {
                setCaptainFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 font-bold text-jaman-navy"
            >
              <option value="ALL">All Captains</option>
              {uniqueCaptains.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(paymentFilter !== 'ALL' ||
          orderTypeFilter !== 'ALL' ||
          statusFilter !== 'ALL' ||
          refundOnlyFilter ||
          cashierFilter !== 'ALL' ||
          captainFilter !== 'ALL' ||
          searchQuery.trim() !== '') && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Active Filters:</span>
            
            {paymentFilter !== 'ALL' && (
              <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Tender: {paymentFilter}
                <X onClick={() => setPaymentFilter('ALL')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {orderTypeFilter !== 'ALL' && (
              <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Type: {orderTypeFilter}
                <X onClick={() => setOrderTypeFilter('ALL')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {statusFilter !== 'ALL' && (
              <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Status: {statusFilter}
                <X onClick={() => setStatusFilter('ALL')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {refundOnlyFilter && (
              <span className="bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Refunds Only
                <X onClick={() => setRefundOnlyFilter(false)} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {cashierFilter !== 'ALL' && (
              <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Cashier: {cashierFilter}
                <X onClick={() => setCashierFilter('ALL')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {captainFilter !== 'ALL' && (
              <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                Captain: {captainFilter}
                <X onClick={() => setCaptainFilter('ALL')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            {searchQuery && (
              <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                "{searchQuery}"
                <X onClick={() => setSearchQuery('')} className="w-3 h-3 cursor-pointer hover:text-rose-600" />
              </span>
            )}

            <button
              onClick={handleClearAllFilters}
              className="text-jaman-saffron font-black hover:underline text-[11px] ml-2"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. COMPLETE ORDER LEDGER TABLE / DAY GROUPED VIEW */}
      {/* ========================================================================= */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-8 h-8" />}
          title="No Invoices or Orders Found"
          description="No transaction records matched the selected date scope, tender filters, or search criteria."
          actionText="Clear Filters & Show All Records"
          onAction={handleClearAllFilters}
        />
      ) : viewMode === 'DAY_GROUPED' ? (
        /* DAY GROUPED LEDGER VIEW */
        <div data-print-doc="invoice-statement" className="space-y-4">
          {dayGroupedLedger.map((grp) => (
            <div key={grp.dateKey} className="bg-white rounded-3xl border border-jaman-border overflow-hidden shadow-xs">
              <div className="p-4 bg-jaman-cream border-b border-jaman-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-base text-jaman-navy uppercase">{grp.displayDate}</h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {grp.orders.length} Orders • Gross: {formatINR(grp.summary.grossSales)} • Tax: {formatINR(grp.summary.tax)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Net Collected</span>
                    <span className="text-lg font-mono font-black text-emerald-700">{formatINR(grp.summary.netSales)}</span>
                  </div>
                </div>
              </div>

              {/* Day Orders Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-bold">
                    <tr>
                      <th className="p-3">Order / Token</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Type / Table</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Items</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3">Tender</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grp.orders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-3 font-bold font-mono text-jaman-navy">
                          <div>#{ord.orderNumber}</div>
                          <span className="text-[10px] font-bold text-jaman-saffron">Token #{ord.tokenNumber}</span>
                        </td>
                        <td className="p-3 text-slate-500 font-mono">{formatTime(ord.createdAt)}</td>
                        <td className="p-3">
                          <span className="font-bold block">{ord.orderType}</span>
                          {ord.tableNumber && <span className="text-[10px] text-slate-400">Table {ord.tableNumber}</span>}
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-jaman-navy block">{ord.customerName || 'Walk-in'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{ord.customerPhone}</span>
                        </td>
                        <td className="p-3 text-slate-600 font-semibold">{ord.items.length} items</td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                          {formatINR(ord.totalAmount)}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-700">
                            {ord.paymentMethod === 'UPI_QR' ? 'UPI QR' : ord.paymentMethod}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                            ord.orderStatus === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.orderStatus === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : ord.orderStatus === 'REFUNDED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {ord.orderStatus}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedOrder(ord)}
                            className="px-2.5 py-1 bg-jaman-ivory border border-slate-300 hover:bg-[#FFF4ED] hover:border-jaman-saffron text-jaman-navy font-bold rounded-lg text-xs"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* FLAT COMPLETE INVOICE LEDGER TABLE */
        <div data-print-doc="invoice-statement" className="bg-white rounded-3xl border border-jaman-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3.5">Invoice #</th>
                  <th className="p-3.5">Token</th>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Type / Table</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Staff</th>
                  <th className="p-3.5">Items</th>
                  <th className="p-3.5">Subtotal</th>
                  <th className="p-3.5">GST</th>
                  <th className="p-3.5">Total Amount</th>
                  <th className="p-3.5">Tender / Split</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((ord: Order) => (
                  <tr
                    key={ord.id}
                    className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    onClick={() => setSelectedOrder(ord)}
                  >
                    <td className="p-3.5 font-bold font-mono text-jaman-navy">
                      <div>#{ord.orderNumber}</div>
                      <span className="text-[10px] text-slate-400">INV-{(ord as any).invoiceNumber || ord.orderNumber}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="bg-[#FFF4ED] text-jaman-saffron font-black text-xs px-2 py-0.5 rounded font-mono">
                        #{ord.tokenNumber}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 font-mono">
                      <div>{formatDate(ord.createdAt)}</div>
                      <div className="text-[10px] text-slate-400">{formatTime(ord.createdAt)}</div>
                    </td>
                    <td className="p-3.5 font-bold">
                      <div>{ord.orderType}</div>
                      {ord.tableNumber && (
                        <span className="text-[10px] font-mono text-jaman-saffron">Table {ord.tableNumber}</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold text-jaman-navy block">{ord.customerName || 'Walk-in'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{ord.customerPhone}</span>
                    </td>
                    <td className="p-3.5 text-[11px] text-slate-600">
                      <div>Cashier: <strong>{ord.cashierName || 'Counter'}</strong></div>
                      {ord.captainName && <div className="text-slate-400">Capt: {ord.captainName}</div>}
                    </td>
                    <td className="p-3.5 font-semibold text-slate-600">
                      {ord.items.length} dishes
                    </td>
                    <td className="p-3.5 font-mono">₹{ord.subtotal}</td>
                    <td className="p-3.5 font-mono text-jaman-saffron">₹{ord.taxAmount}</td>
                    <td className="p-3.5 font-mono font-black text-emerald-700 text-sm">
                      {formatINR(ord.totalAmount)}
                    </td>
                    <td className="p-3.5">
                      {ord.paymentMethod === 'SPLIT' ? (
                        <div className="space-y-0.5 font-mono text-[10px]">
                          <span className="px-1.5 py-0.2 rounded font-black bg-orange-100 text-jaman-saffron block">
                            🔀 SPLIT PAYMENT
                          </span>
                          <span className="text-slate-500 block">Cash + UPI</span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-700">
                          {ord.paymentMethod === 'UPI_QR' ? 'UPI QR' : ord.paymentMethod}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full font-black text-[10px] uppercase tracking-wider ${
                          ord.orderStatus === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.orderStatus === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800'
                            : ord.orderStatus === 'REFUNDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {ord.orderStatus}
                      </span>
                    </td>
                    <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePrintBill(ord)}
                          title="Print Receipt"
                          className="p-1.5 bg-jaman-cream hover:bg-[#FFF4ED] border border-slate-300 text-jaman-navy rounded-lg"
                        >
                          <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
                        </button>
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="px-2.5 py-1 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold rounded-lg text-xs"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 bg-jaman-cream border-t border-jaman-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 font-bold">
              Showing <strong className="text-jaman-navy">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> of <strong className="text-jaman-navy">{filteredOrders.length}</strong> invoices
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold">Per Page:</span>
                {[25, 50, 100].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setPageSize(sz);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold font-mono ${
                      pageSize === sz
                        ? 'bg-jaman-navy text-white'
                        : 'bg-white border border-jaman-border text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-white border border-jaman-border rounded-lg font-bold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2 font-mono font-bold">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 bg-white border border-jaman-border rounded-lg font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. DETAILED ORDER & INVOICE INSPECTOR MODAL */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-jaman-navy text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-jaman-saffron" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg">Invoice #{selectedOrder.orderNumber}</h3>
                    <span className="bg-jaman-saffron text-white font-mono font-black text-xs px-2 py-0.5 rounded">
                      Token #{selectedOrder.tokenNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {formatDate(selectedOrder.createdAt)} at {formatTime(selectedOrder.createdAt)} • {selectedOrder.orderType}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              
              {/* Order Meta Strip */}
              <div className="bg-jaman-cream p-3.5 rounded-2xl border border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Customer</span>
                  <strong className="text-jaman-navy block">{selectedOrder.customerName || 'Walk-in Guest'}</strong>
                  <span className="font-mono text-[10px] text-slate-500">{selectedOrder.customerPhone || 'Counter'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Dining Section</span>
                  <strong className="text-jaman-navy block">
                    {selectedOrder.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'Quick Takeaway'}
                  </strong>
                  <span className="text-[10px] text-slate-500">{selectedOrder.orderType}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Staff</span>
                  <strong className="text-jaman-navy block">Cashier: {selectedOrder.cashierName || 'Amit Dave'}</strong>
                  <span className="text-[10px] text-slate-500">Captain: {selectedOrder.captainName || 'Rahul Sharma'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Current Status</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded font-black text-[10px] uppercase mt-0.5 ${
                    selectedOrder.orderStatus === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedOrder.orderStatus === 'CANCELLED'
                      ? 'bg-rose-100 text-rose-800'
                      : selectedOrder.orderStatus === 'REFUNDED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedOrder.orderStatus}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-300 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-slate-300 font-black text-slate-600">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Tax (5%)</th>
                      <th className="p-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {selectedOrder.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5">
                          <strong className="text-jaman-navy block">{it.name}</strong>
                          {it.specialInstructions && (
                            <span className="text-[10px] text-rose-700 italic">Note: {it.specialInstructions}</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold">{it.quantity}</td>
                        <td className="p-2.5 text-right font-mono">₹{it.unitPrice}</td>
                        <td className="p-2.5 text-right font-mono text-jaman-saffron">₹{Math.round((it.totalPrice || it.unitPrice * it.quantity) * 0.05)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-jaman-navy">
                          ₹{it.totalPrice || it.unitPrice * it.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Left: Split Payment & Settlement Allocation */}
                <div className="bg-jaman-cream p-4 rounded-2xl border border-slate-300 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                    PAYMENT SETTLEMENT BREAKDOWN:
                  </span>
                  
                  {selectedOrder.paymentMethod === 'SPLIT' ? (
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between p-1.5 bg-white rounded border border-slate-200">
                        <span>💵 Cash Tender:</span>
                        <strong className="text-emerald-700">₹{Math.floor(selectedOrder.totalAmount / 2)}</strong>
                      </div>
                      <div className="flex justify-between p-1.5 bg-white rounded border border-slate-200">
                        <span>📱 UPI Bharat QR:</span>
                        <strong className="text-blue-700">₹{Math.ceil(selectedOrder.totalAmount / 2)}</strong>
                      </div>
                      <div className="flex justify-between font-bold text-slate-600 pt-1">
                        <span>Remaining Balance:</span>
                        <span className="text-emerald-800">₹0.00 (Settled)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                        <span>Tender Method:</span>
                        <strong>{selectedOrder.paymentMethod}</strong>
                      </div>
                      <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                        <span>Amount Paid:</span>
                        <strong className="text-emerald-700">{formatINR(selectedOrder.totalAmount)}</strong>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 text-[10px] text-slate-500 font-bold">
                    Payment Status: <span className="text-emerald-700">● FULLY SETTLED</span>
                  </div>
                </div>

                {/* Right: Statutory Total Breakdown */}
                <div className="bg-jaman-cream p-4 rounded-2xl border border-slate-300 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between font-semibold">
                    <span>Subtotal (Net Items):</span>
                    <span>₹{selectedOrder.subtotal}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-rose-600">
                    <span>Discount:</span>
                    <span>-₹{selectedOrder.discountAmount || 0}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-600">
                    <span>CGST (2.5%):</span>
                    <span>₹{Math.round((selectedOrder.taxAmount || 0) / 2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-600">
                    <span>SGST (2.5%):</span>
                    <span>₹{Math.round((selectedOrder.taxAmount || 0) / 2)}</span>
                  </div>
                  <div className="flex justify-between font-black text-jaman-navy text-sm pt-2 border-t border-slate-300">
                    <span>GRAND TOTAL:</span>
                    <span className="text-emerald-800">{formatINR(selectedOrder.totalAmount)}</span>
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-jaman-cream border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {selectedOrder.orderStatus !== 'REFUNDED' && (
                  <button
                    onClick={() => setIsRefundModalOpen(true)}
                    className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl transition-colors"
                  >
                    ↩️ Refund Bill
                  </button>
                )}

                {selectedOrder.orderStatus !== 'CANCELLED' && (
                  <button
                    onClick={() => setIsCancelModalOpen(true)}
                    className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs rounded-xl transition-colors"
                  >
                    ❌ Void / Cancel
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    showToast(`Reprinting Receipt for #${selectedOrder.orderNumber}...`);
                    printThermalReceipt(selectedOrder, '80mm', ReceiptRepository.getConfig());
                  }}
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-jaman-navy font-bold text-xs rounded-xl flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Reprint Receipt</span>
                </button>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs rounded-xl"
                >
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 8. REFUND CONFIRMATION MODAL */}
      {isRefundModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-black text-base text-jaman-navy">Process Invoice Refund</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to refund Invoice <strong>#{selectedOrder.orderNumber}</strong> for total amount of <strong className="text-emerald-700">{formatINR(selectedOrder.totalAmount)}</strong>?
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Refund:</label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full bg-jaman-cream border border-slate-300 rounded-xl p-2.5 text-xs font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRefund}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl"
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. VOID / CANCEL CONFIRMATION MODAL */}
      {isCancelModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <Ban className="w-6 h-6" />
              <h3 className="font-black text-base text-jaman-navy">Void / Cancel Order</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to void Order <strong>#{selectedOrder.orderNumber}</strong>? This action will mark the bill cancelled and record an audit log.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cancellation Reason:</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-jaman-cream border border-slate-300 rounded-xl p-2.5 text-xs font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidOrder}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. STATUTORY PRINTABLE PDF STATEMENT (VISIBLE ONLY IN PRINT / PDF EXPORT) */}
      {/* ========================================================================= */}
      <div className="hidden print:block font-sans text-black p-4 space-y-4">
        {/* Letterhead */}
        <div className="border-b-2 border-black pb-3 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide">
              {db.restaurant?.name || ''}
            </h1>
            <p className="text-xs text-gray-700">
              {db.outlet?.address || db.restaurant?.address || ''}
            </p>
            <div className="text-[11px] text-gray-600 font-mono mt-1">
              {[db.restaurant?.gstin && `GSTIN: ${db.restaurant.gstin}`, db.restaurant?.fssaiNumber && `FSSAI: ${db.restaurant.fssaiNumber}`, db.restaurant?.phone && `Phone: ${db.restaurant.phone}`].filter(Boolean).join(' • ')}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black uppercase border border-black px-2 py-0.5 inline-block">
              STATUTORY INVOICE LEDGER
            </span>
            <div className="text-[10px] text-gray-500 font-mono mt-1">
              Generated: {formatDate(new Date())} {formatTime(new Date())}
            </div>
            <div className="text-[11px] font-bold text-black mt-0.5">
              Scope: {dateLabel}
            </div>
          </div>
        </div>

        {/* Financial Summary Strip */}
        <div className="grid grid-cols-4 gap-2 text-xs border border-gray-300 p-2 bg-gray-50">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Total Invoices</span>
            <strong className="text-sm font-mono">{filteredOrders.length} Orders</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Gross Sales</span>
            <strong className="text-sm font-mono">{formatINR(summaryMetrics.grossSales)}</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-bold block uppercase">GST Tax (5%)</span>
            <strong className="text-sm font-mono">{formatINR(summaryMetrics.gstTotal)}</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Net Collected</span>
            <strong className="text-sm font-mono">{formatINR(summaryMetrics.netSales)}</strong>
          </div>
        </div>

        {/* Tender Allocation Strip */}
        <div className="grid grid-cols-5 gap-2 text-[11px] border border-gray-200 p-2 text-center">
          <div>Cash: <strong>{formatINR(summaryMetrics.cashSales)}</strong></div>
          <div>UPI / QR: <strong>{formatINR(summaryMetrics.upiSales)}</strong></div>
          <div>Card: <strong>{formatINR(summaryMetrics.cardSales)}</strong></div>
          <div>Split: <strong>{formatINR(summaryMetrics.splitSales)}</strong></div>
          <div>Refunds: <strong className="text-red-700">-{formatINR(summaryMetrics.refundAmount)}</strong></div>
        </div>

        {/* Ledger Table */}
        <table className="w-full text-left text-[11px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300 uppercase text-[10px] font-bold">
              <th className="p-1.5 border border-gray-300">Inv #</th>
              <th className="p-1.5 border border-gray-300">Token</th>
              <th className="p-1.5 border border-gray-300">Date & Time</th>
              <th className="p-1.5 border border-gray-300">Type / Table</th>
              <th className="p-1.5 border border-gray-300">Customer</th>
              <th className="p-1.5 border border-gray-300">Items</th>
              <th className="p-1.5 border border-gray-300 text-right">Tax</th>
              <th className="p-1.5 border border-gray-300 text-right">Total</th>
              <th className="p-1.5 border border-gray-300">Tender</th>
              <th className="p-1.5 border border-gray-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((o) => (
              <tr key={o.id} className="border-b border-gray-200">
                <td className="p-1.5 font-mono font-bold border border-gray-200">#{o.orderNumber}</td>
                <td className="p-1.5 font-mono border border-gray-200">#{o.tokenNumber}</td>
                <td className="p-1.5 font-mono text-[10px] border border-gray-200">{formatDate(o.createdAt)} {formatTime(o.createdAt)}</td>
                <td className="p-1.5 border border-gray-200">{o.orderType} {o.tableNumber ? `(T-${o.tableNumber})` : ''}</td>
                <td className="p-1.5 border border-gray-200">{o.customerName || 'Walk-in'}</td>
                <td className="p-1.5 border border-gray-200">{o.items.length} items</td>
                <td className="p-1.5 text-right font-mono border border-gray-200">₹{o.taxAmount}</td>
                <td className="p-1.5 text-right font-mono font-bold border border-gray-200">₹{o.totalAmount}</td>
                <td className="p-1.5 font-mono text-[10px] border border-gray-200">{o.paymentMethod}</td>
                <td className="p-1.5 font-bold text-[10px] border border-gray-200">{o.orderStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Document Footer Sign-off */}
        <div className="pt-6 flex justify-between text-xs text-gray-500 border-t border-gray-300">
          <div>Report generated via JAMANVAAR Restaurant Management System.</div>
          <div>Authorized Signatory: _________________________</div>
        </div>
      </div>

    </div>
  );
};
