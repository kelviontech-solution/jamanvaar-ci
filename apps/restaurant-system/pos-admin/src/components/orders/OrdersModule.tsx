import React, { useState, useMemo } from 'react';
import { Order, OrderStatus } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';
import {
  DayOrdersService,
  DaySummary,
  DateFilterPreset
} from '@jamanvaar/business';
import { db, OrderRepository, AuditRepository, ReceiptRepository } from '@jamanvaar/database';
import {
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  FileSpreadsheet,
  Printer,
  DollarSign,
  ShoppingBag,
  Clock,
  Users,
  Utensils,
  Receipt,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  Phone,
  UserCheck,
  Flame,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react';
import { OrderDetailModal } from '../OrderDetailModal';
import { ThermalReceiptView, printThermalReceipt } from '@jamanvaar/ui';

interface OrdersModuleProps {
  orders: Order[];
  onOrderUpdated: () => void;
  showToast: (msg: string) => void;
}

export const OrdersModule: React.FC<OrdersModuleProps> = ({
  orders,
  onOrderUpdated,
  showToast
}) => {
  // Navigation & View Level: 'DAYS_LIST' | 'DAY_DRILLDOWN'
  const [viewLevel, setViewLevel] = useState<'DAYS_LIST' | 'DAY_DRILLDOWN'>('DAYS_LIST');
  const [selectedDayKey, setSelectedDayKey] = useState<string>('');

  // Date Filter Presets
  const [filterPreset, setFilterPreset] = useState<DateFilterPreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);

  // Search across Day Cards / Global Search in Days List
  const [daysSearchQuery, setDaysSearchQuery] = useState('');

  // Drill-down Table Search, Filter & Sort
  const [drillSearchQuery, setDrillSearchQuery] = useState('');
  const [drillTypeFilter, setDrillTypeFilter] = useState<string>('ALL');
  const [drillStatusFilter, setDrillStatusFilter] = useState<string>('ALL');
  const [drillPaymentFilter, setDrillPaymentFilter] = useState<string>('ALL');
  const [drillCashierFilter, setDrillCashierFilter] = useState<string>('ALL');
  const [drillSortOrder, setDrillSortOrder] = useState<'NEWEST' | 'OLDEST' | 'HIGHEST' | 'LOWEST'>('NEWEST');

  // Pagination for Daily Orders Table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Selected Order Detail Modal & Printable Bill Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Compute all Day Summaries based on current filter preset
  const daySummaries = useMemo(() => {
    const customStart = customStartDate ? new Date(customStartDate) : undefined;
    const customEnd = customEndDate ? new Date(customEndDate) : undefined;
    return DayOrdersService.getAllDaysSummaries(orders, filterPreset, customStart, customEnd, 6);
  }, [orders, orders.length, orders[0]?.id, filterPreset, customStartDate, customEndDate]);

  // Filter day cards by global search query
  const filteredDaySummaries = useMemo(() => {
    if (!daysSearchQuery.trim()) return daySummaries;
    const q = daysSearchQuery.toLowerCase();

    return daySummaries.filter((sum) => {
      const matchDate =
        sum.formattedDate.toLowerCase().includes(q) ||
        sum.dayOfWeek.toLowerCase().includes(q) ||
        sum.dateKey.includes(q);

      const matchOrders = sum.orders.some((o) => {
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          (o.tokenNumber && o.tokenNumber.includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.tableNumber && o.tableNumber.includes(q)) ||
          (o.cashierName && o.cashierName.toLowerCase().includes(q)) ||
          (o.items && o.items.some((it) => it.name.toLowerCase().includes(q)))
        );
      });

      return matchDate || matchOrders;
    });
  }, [daySummaries, daysSearchQuery]);

  // Compute selected day summary when in drill-down view
  const currentDaySummary = useMemo(() => {
    if (!selectedDayKey) return daySummaries[0] || null;
    return DayOrdersService.getDaySummary(orders, selectedDayKey, 6);
  }, [orders, orders.length, orders[0]?.id, selectedDayKey, daySummaries]);

  // Filtered & Sorted orders for the currently selected day
  const drillFilteredOrders = useMemo(() => {
    if (!currentDaySummary) return [];

    let list = [...currentDaySummary.orders];

    // Search filter
    if (drillSearchQuery.trim()) {
      const q = drillSearchQuery.toLowerCase();
      list = list.filter((o) => {
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          (o.tokenNumber && o.tokenNumber.includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.tableNumber && o.tableNumber.includes(q)) ||
          (o.cashierName && o.cashierName.toLowerCase().includes(q)) ||
          (o.captainName && o.captainName.toLowerCase().includes(q)) ||
          (o.items && o.items.some((it) => it.name.toLowerCase().includes(q)))
        );
      });
    }

    // Type filter
    if (drillTypeFilter !== 'ALL') {
      list = list.filter((o) => (o.orderType || '').toUpperCase().includes(drillTypeFilter));
    }

    // Status filter
    if (drillStatusFilter !== 'ALL') {
      list = list.filter((o) => o.orderStatus === drillStatusFilter);
    }

    // Payment filter
    if (drillPaymentFilter !== 'ALL') {
      list = list.filter((o) => (o.paymentMethod || '').toUpperCase().includes(drillPaymentFilter));
    }

    // Cashier filter
    if (drillCashierFilter !== 'ALL') {
      list = list.filter((o) => (o.cashierName || 'Amit Dave') === drillCashierFilter);
    }

    // Sorting
    list.sort((a, b) => {
      if (drillSortOrder === 'NEWEST') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (drillSortOrder === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (drillSortOrder === 'HIGHEST') {
        return b.totalAmount - a.totalAmount;
      }
      if (drillSortOrder === 'LOWEST') {
        return a.totalAmount - b.totalAmount;
      }
      return 0;
    });

    return list;
  }, [
    currentDaySummary,
    drillSearchQuery,
    drillTypeFilter,
    drillStatusFilter,
    drillPaymentFilter,
    drillCashierFilter,
    drillSortOrder
  ]);

  // Paginated slice
  const paginatedOrders = useMemo(() => {
    if (pageSize >= 1000) return drillFilteredOrders;
    const start = (currentPage - 1) * pageSize;
    return drillFilteredOrders.slice(start, start + pageSize);
  }, [drillFilteredOrders, currentPage, pageSize]);

  const totalPages = Math.ceil(drillFilteredOrders.length / pageSize) || 1;

  // Day Navigation handlers
  const handleSelectDay = (dateKey: string) => {
    setSelectedDayKey(dateKey);
    setViewLevel('DAY_DRILLDOWN');
    setCurrentPage(1);
    setDrillSearchQuery('');
  };

  const handlePrevDay = () => {
    if (!currentDaySummary) return;
    const currDate = new Date(currentDaySummary.date);
    currDate.setDate(currDate.getDate() - 1);
    const prevKey = DayOrdersService.getBusinessDateKey(currDate, 6);
    setSelectedDayKey(prevKey);
    setCurrentPage(1);
  };

  const handleNextDay = () => {
    if (!currentDaySummary) return;
    const currDate = new Date(currentDaySummary.date);
    currDate.setDate(currDate.getDate() + 1);
    const nextKey = DayOrdersService.getBusinessDateKey(currDate, 6);
    const todayKey = DayOrdersService.getBusinessDateKey(new Date(), 6);
    if (nextKey <= todayKey) {
      setSelectedDayKey(nextKey);
      setCurrentPage(1);
    }
  };

  // Export handlers
  const handleExportAllDaysCsv = () => {
    const csv = DayOrdersService.exportAllDaysCsv(daySummaries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jamanvaar_daily_sales_summary_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Daily Sales Summary CSV Exported!');
  };

  const handleExportDayOrdersCsv = () => {
    if (!currentDaySummary) return;
    const csv = DayOrdersService.exportDayOrdersCsv(currentDaySummary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jamanvaar_orders_${currentDaySummary.dateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast(`Orders for ${currentDaySummary.formattedDate} Exported!`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none">
      
      {/* ========================================================================= */}
      {/* LEVEL 1: MAIN DAY-WISE SUMMARY VIEW */}
      {/* ========================================================================= */}
      {viewLevel === 'DAYS_LIST' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Main Top Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-jaman-navy text-white flex items-center justify-center shadow-xs">
                  <ShoppingBag className="w-5 h-5 text-jaman-saffron" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
                    Orders & Order History
                  </h1>
                  <p className="text-xs text-[#4A5568] mt-0.5">
                    View daily sales, orders, payments and complete order history.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Export and Date Filter Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterPreset('TODAY');
                  setDaysSearchQuery('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] shadow-xs flex items-center gap-1.5 ${
                  filterPreset === 'TODAY'
                    ? 'bg-jaman-saffron text-white'
                    : 'bg-white border border-jaman-border text-jaman-navy hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Today</span>
              </button>

              <button
                type="button"
                onClick={handleExportAllDaysCsv}
                className="px-4 py-2 bg-white border border-jaman-border text-jaman-navy hover:bg-slate-50 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 min-h-[40px]"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 bg-white border border-jaman-border text-jaman-navy hover:bg-slate-50 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 min-h-[40px]"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>Print Report</span>
              </button>
            </div>
          </div>

          {/* Search Bar & Date Filter Presets Ribbon */}
          <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-3">
            {/* Search across Days */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={daysSearchQuery}
                onChange={(e) => setDaysSearchQuery(e.target.value)}
                placeholder="Search orders, bill no., token, customer, table, cashier, or dish name..."
                className="w-full bg-jaman-cream border border-jaman-border rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron min-h-[44px]"
              />
            </div>

            {/* Date Preset Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'TODAY', label: 'TODAY' },
                { id: 'YESTERDAY', label: 'YESTERDAY' },
                { id: '7_DAYS', label: 'LAST 7 DAYS' },
                { id: '30_DAYS', label: 'LAST 30 DAYS' },
                { id: 'THIS_MONTH', label: 'THIS MONTH' },
                { id: 'THIS_YEAR', label: 'THIS YEAR' },
                { id: 'CUSTOM', label: 'CUSTOM RANGE' }
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setFilterPreset(preset.id as DateFilterPreset);
                    if (preset.id === 'CUSTOM') {
                      setIsCustomDateOpen(true);
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 min-h-[38px] ${
                    filterPreset === preset.id
                      ? 'bg-jaman-navy text-white shadow-xs'
                      : 'bg-jaman-cream text-slate-600 hover:bg-slate-200 border border-jaman-border'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers Drawer */}
            {isCustomDateOpen && filterPreset === 'CUSTOM' && (
              <div className="p-3 bg-jaman-cream border border-jaman-border rounded-2xl flex flex-wrap items-center gap-3 text-xs font-bold text-jaman-navy">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold"
                  />
                </div>
                <button
                  onClick={() => setIsCustomDateOpen(false)}
                  className="px-3 py-1.5 bg-jaman-navy text-white rounded-xl text-xs font-bold"
                >
                  Apply Range
                </button>
              </div>
            )}
          </div>

          {/* Premium Day-Wise Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDaySummaries.map((day) => (
              <div
                key={day.dateKey}
                onClick={() => handleSelectDay(day.dateKey)}
                className={`bg-white rounded-3xl border-2 transition-all p-5 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between space-y-4 group ${
                  day.isToday
                    ? 'border-jaman-saffron ring-2 ring-jaman-saffron/15 bg-gradient-to-b from-orange-50/20 to-white'
                    : 'border-jaman-border hover:border-jaman-navy'
                }`}
              >
                {/* Card Top: Date, Day of Week & Status */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-black text-sm text-jaman-navy uppercase tracking-wide">
                      {day.formattedDate}
                    </h3>
                    <span className="text-xs text-slate-500 font-semibold">{day.dayOfWeek}</span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      day.isToday
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 animate-pulse'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {day.isToday ? '● LIVE TODAY' : '✓ COMPLETED'}
                  </span>
                </div>

                {/* Main Sales & Order KPI */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    TOTAL SALES
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-jaman-navy font-mono tracking-tight">
                    {formatINR(day.totalSales)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600 font-bold pt-1">
                    <span className="flex items-center gap-1 text-jaman-navy">
                      <ShoppingBag className="w-3.5 h-3.5 text-jaman-saffron" />
                      <span>{day.orderCount} Orders</span>
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">
                      {formatINR(day.avgOrderValue)} AOV
                    </span>
                  </div>
                </div>

                {/* Payment Breakdown Chips */}
                <div className="p-3 bg-jaman-cream rounded-2xl border border-jaman-border space-y-1.5 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    PAYMENT ALLOCATION:
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                    <span className="bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-200">
                      💵 {formatINR(day.paymentBreakdown.cash)}
                    </span>
                    <span className="bg-blue-50 text-blue-900 px-2 py-0.5 rounded-md border border-blue-200">
                      📱 UPI {formatINR(day.paymentBreakdown.upi)}
                    </span>
                    <span className="bg-purple-50 text-purple-900 px-2 py-0.5 rounded-md border border-purple-200">
                      💳 Card {formatINR(day.paymentBreakdown.card)}
                    </span>
                  </div>
                </div>

                {/* Order Type Breakdown */}
                <div className="text-[11px] text-slate-500 font-bold flex items-center justify-between">
                  <span>Dine-In: {day.orderTypeBreakdown.dineIn}</span>
                  <span>•</span>
                  <span>Takeaway: {day.orderTypeBreakdown.takeaway}</span>
                  <span>•</span>
                  <span>Delivery: {day.orderTypeBreakdown.delivery}</span>
                  <span>•</span>
                  <span>Token: {day.orderTypeBreakdown.token}</span>
                </div>

                {/* Bottom Primary Action Button */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectDay(day.dateKey);
                    }}
                    className={`w-full py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs min-h-[44px] ${
                      day.isToday
                        ? 'bg-jaman-saffron hover:bg-[#EA580C] text-white'
                        : 'bg-jaman-navy hover:bg-jaman-darkBorder text-white'
                    }`}
                  >
                    <span>VIEW {day.orderCount} ORDERS →</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredDaySummaries.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-jaman-border shadow-2xs space-y-4 max-w-xl mx-auto my-6 p-6">
              <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron mx-auto flex items-center justify-center border border-[#FDBA74]/40 shadow-xs">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-base text-jaman-navy">No Orders Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  There are no customer orders matching the selected date period or search query.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilterPreset('TODAY');
                    setDaysSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold transition-all shadow-xs"
                >
                  View Today's Orders
                </button>
                {daysSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setDaysSearchQuery('')}
                    className="px-4 py-2 rounded-xl bg-white border border-jaman-border text-slate-700 hover:bg-jaman-cream text-xs font-bold transition-all shadow-xs"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 2: SELECTED DAY ORDERS DRILL-DOWN VIEW */}
      {/* ========================================================================= */}
      {viewLevel === 'DAY_DRILLDOWN' && currentDaySummary && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Top Drill-Down Header & Navigation */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-jaman-border shadow-xs">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setViewLevel('DAYS_LIST')}
                className="inline-flex items-center gap-1.5 text-xs font-black text-jaman-saffron hover:underline mb-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Order History (All Days)</span>
              </button>

              <div className="flex items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-black text-jaman-navy uppercase tracking-tight">
                  {currentDaySummary.formattedDate}
                </h2>
                <span className="text-xs font-bold text-slate-500">({currentDaySummary.dayOfWeek})</span>
                {currentDaySummary.isToday && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                    ● TODAY LIVE
                  </span>
                )}
              </div>
            </div>

            {/* Quick Day Switcher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevDay}
                className="px-3 py-2 bg-jaman-cream hover:bg-slate-200 border border-jaman-border rounded-xl text-xs font-bold flex items-center gap-1 min-h-[40px]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous Day</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const todayKey = DayOrdersService.getBusinessDateKey(new Date(), 6);
                  setSelectedDayKey(todayKey);
                }}
                className="px-3.5 py-2 bg-jaman-navy text-white rounded-xl text-xs font-bold min-h-[40px]"
              >
                Today
              </button>

              <button
                type="button"
                onClick={handleNextDay}
                disabled={currentDaySummary.isToday}
                className="px-3 py-2 bg-jaman-cream hover:bg-slate-200 disabled:opacity-40 border border-jaman-border rounded-xl text-xs font-bold flex items-center gap-1 min-h-[40px]"
              >
                <span>Next Day</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleExportDayOrdersCsv}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[40px] shadow-xs ml-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Day CSV</span>
              </button>
            </div>
          </div>

          {/* Daily Reconciled Financials & Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-400 block">GROSS SALES</span>
              <span className="text-xl font-black font-mono text-jaman-navy">
                {formatINR(currentDaySummary.grossSales)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs">
              <span className="text-[10px] font-black uppercase text-rose-500 block">DISCOUNTS GIVEN</span>
              <span className="text-xl font-black font-mono text-rose-600">
                -{formatINR(currentDaySummary.discounts)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs">
              <span className="text-[10px] font-black uppercase text-amber-500 block">REFUNDS ISSUED</span>
              <span className="text-xl font-black font-mono text-amber-600">
                -{formatINR(currentDaySummary.refunds)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-emerald-800 block">NET TOTAL SALES</span>
              <span className="text-xl font-black font-mono text-emerald-950">
                {formatINR(currentDaySummary.netSales)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase text-jaman-saffron block">GST TAX (5%)</span>
              <span className="text-xl font-black font-mono text-jaman-saffron">
                {formatINR(currentDaySummary.tax)}
              </span>
            </div>
          </div>

          {/* Daily Secondary Performance Breakdown Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* 1. Top Selling Items for this Day */}
            <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-jaman-navy flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-jaman-saffron" />
                <span>Top Selling Dishes ({currentDaySummary.topItems.length})</span>
              </span>
              <div className="space-y-1.5 text-xs">
                {currentDaySummary.topItems.slice(0, 4).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-jaman-cream font-bold">
                    <span className="text-jaman-navy truncate">{idx + 1}. {it.name}</span>
                    <span className="font-mono text-slate-600 shrink-0">{it.quantity} sold ({formatINR(it.revenue)})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Cashier Performance */}
            <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-jaman-navy flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Cashier Performance</span>
              </span>
              <div className="space-y-1.5 text-xs">
                {currentDaySummary.cashierBreakdown.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-jaman-cream font-bold">
                    <span className="text-jaman-navy">{c.name}</span>
                    <span className="font-mono text-slate-600">{c.ordersCount} orders • {formatINR(c.sales)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Captain Performance & Tables */}
            <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-jaman-navy flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-purple-600" />
                <span>Captain & Floor Floor Activity</span>
              </span>
              <div className="space-y-1.5 text-xs">
                {currentDaySummary.captainBreakdown.map((capt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-jaman-cream font-bold">
                    <span className="text-jaman-navy">{capt.name}</span>
                    <span className="font-mono text-slate-600">{capt.ordersCount} orders • {formatINR(capt.sales)}</span>
                  </div>
                ))}
                {currentDaySummary.captainBreakdown.length === 0 && (
                  <div className="text-slate-400 text-center py-2 text-xs">All counter orders</div>
                )}
              </div>
            </div>

          </div>

          {/* Search, Multi-Filters & Sorting Bar for this Day */}
          <div className="bg-white p-4 rounded-3xl border border-jaman-border shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={drillSearchQuery}
                  onChange={(e) => setDrillSearchQuery(e.target.value)}
                  placeholder={`Search ${currentDaySummary.orderCount} orders on this day...`}
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron min-h-[40px]"
                />
              </div>

              {/* Filters & Sorting Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={drillTypeFilter}
                  onChange={(e) => setDrillTypeFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy"
                >
                  <option value="ALL">All Types</option>
                  <option value="DINE">Dine-In</option>
                  <option value="TAKEAWAY">Takeaway</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="TOKEN">Token</option>
                </select>

                <select
                  value={drillStatusFilter}
                  onChange={(e) => setDrillStatusFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PREPARING">Preparing</option>
                  <option value="READY">Ready</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUNDED">Refunded</option>
                </select>

                <select
                  value={drillPaymentFilter}
                  onChange={(e) => setDrillPaymentFilter(e.target.value)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy"
                >
                  <option value="ALL">All Payments</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI QR</option>
                  <option value="CARD">Card / EDC</option>
                  <option value="SPLIT">Split</option>
                </select>

                <select
                  value={drillSortOrder}
                  onChange={(e) => setDrillSortOrder(e.target.value as any)}
                  className="bg-jaman-cream border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold text-jaman-navy"
                >
                  <option value="NEWEST">Newest First</option>
                  <option value="OLDEST">Oldest First</option>
                  <option value="HIGHEST">Highest Value</option>
                  <option value="LOWEST">Lowest Value</option>
                </select>
              </div>
            </div>
          </div>

          {/* Daily Orders Table (Full Desktop Table) */}
          <div className="bg-white rounded-3xl border border-jaman-border overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-black">
                  <tr>
                    <th className="p-3.5">Order #</th>
                    <th className="p-3.5">Token</th>
                    <th className="p-3.5">Time</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Table</th>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Items</th>
                    <th className="p-3.5">Total Amount</th>
                    <th className="p-3.5">Payment</th>
                    <th className="p-3.5">Cashier</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-jaman-navy">{ord.orderNumber}</td>
                      <td className="p-3.5">
                        <span className="bg-[#FFF4ED] text-jaman-saffron font-black text-xs px-2 py-0.5 rounded font-mono">
                          #{ord.tokenNumber}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-500 font-mono">
                        {formatTime(ord.createdAt)}
                      </td>
                      <td className="p-3.5 font-bold">{ord.orderType}</td>
                      <td className="p-3.5 font-bold text-slate-700">
                        {ord.tableNumber ? `Table ${ord.tableNumber}` : '—'}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-jaman-navy block">{ord.customerName || 'Walk-in'}</span>
                        {ord.customerPhone && (
                          <span className="text-[10px] text-slate-400 font-mono">{ord.customerPhone}</span>
                        )}
                      </td>
                      <td className="p-3.5 font-semibold text-slate-600">{ord.items.length} items</td>
                      <td className="p-3.5 font-mono font-black text-jaman-navy text-sm">
                        {formatINR(ord.totalAmount)}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-700">
                          {ord.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 font-semibold">{ord.cashierName || 'Amit Dave'}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded font-black text-[9px] uppercase ${
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
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="px-3 py-1.5 bg-jaman-cream border border-slate-300 hover:bg-jaman-navy hover:text-white text-jaman-navy font-bold rounded-lg text-xs transition-all min-h-[32px]"
                          >
                            VIEW
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptOrder(ord);
                              setIsReceiptModalOpen(true);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs"
                            title="Print Thermal Bill"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {paginatedOrders.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-slate-400 font-medium text-xs">
                        No orders match the selected filters for this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Toolbar */}
            <div className="p-4 bg-[#F8F6F0] border-t border-jaman-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-600 font-bold">
                Showing {paginatedOrders.length} of {drillFilteredOrders.length} orders
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-jaman-border rounded-lg px-2 py-1 font-bold text-xs"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={1000}>All</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded bg-white border border-jaman-border disabled:opacity-40 font-bold text-xs"
                  >
                    Prev
                  </button>
                  <span className="px-2 font-mono font-bold">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded bg-white border border-jaman-border disabled:opacity-40 font-bold text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 3: ORDER DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOrderUpdated={() => {
            onOrderUpdated();
            setSelectedOrder(null);
            showToast('Order record updated!');
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* THERMAL BILL PRINT MODAL */}
      {/* ========================================================================= */}
      {isReceiptModalOpen && receiptOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-jaman-navy">Print Thermal Bill</h3>
              <button onClick={() => setIsReceiptModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="py-2 flex justify-center">
              <ThermalReceiptView order={receiptOrder} paperSize="80mm" />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold min-h-[44px]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printThermalReceipt(receiptOrder, '80mm', ReceiptRepository.getConfig())}
                className="flex-1 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span>Print Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
