import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@jamanvaar/database';
import { Order } from '@jamanvaar/types';
import { formatDate, formatTime, formatINR, formatSplitTax } from '@jamanvaar/utils';
import {
  ReportDataEngine,
  ReportPeriodPreset,
  ComparePeriodPreset,
  ReportCategoryKey,
  ReportDesignTheme,
  ReportFilterOptions,
  ReportDateRange
} from './reportDataEngine';
import { ReportExportService } from './reportExportService';
import { ReportDesignSelectorModal } from './ReportDesignSelectorModal';
import { ReportPreviewModal } from './ReportPreviewModal';
import {
  Search,
  Calendar,
  Filter,
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  Star,
  RotateCcw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Layers,
  ShoppingBag,
  DollarSign,
  Utensils,
  Clock,
  Users,
  Package,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Palette,
  X,
  SlidersHorizontal,
  ChevronRight,
  Eye,
  BarChart3,
  PieChart,
  HelpCircle
} from 'lucide-react';

interface ReportsDashboardProps {
  showToast: (msg: string) => void;
}

interface ReportDefinition {
  id: string;
  category: ReportCategoryKey;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  badge?: string;
  isPopular?: boolean;
}

const ALL_REPORTS: ReportDefinition[] = [
  // 1. SALES
  { id: 'DAILY_SALES', category: 'SALES', title: 'Daily Sales', subtitle: 'Today’s itemized sales, discounts, and net collection', icon: DollarSign, isPopular: true },
  { id: 'SALES_SUMMARY', category: 'SALES', title: 'Sales Summary', subtitle: 'High-level aggregated sales KPI comparison', icon: BarChart3 },
  { id: 'DAY_BY_DAY', category: 'SALES', title: 'Day-by-Day Sales', subtitle: 'Consecutive daily sales ledger and day-over-day tracking', icon: Calendar, isPopular: true },
  { id: 'MONTHLY_SALES', category: 'SALES', title: 'Monthly Sales', subtitle: 'Month-over-month revenue analysis and seasonal trends', icon: Calendar },
  { id: 'YEARLY_SALES', category: 'SALES', title: 'Yearly Sales', subtitle: 'Annual fiscal revenue statement and tax totals', icon: TrendingUp },
  { id: 'HOURLY_SALES', category: 'SALES', title: 'Hourly Sales', subtitle: 'Peak dining rush hours and hourly revenue distribution', icon: Clock, isPopular: true },
  { id: 'SALES_BY_ORDER_TYPE', category: 'SALES', title: 'Sales by Order Type', subtitle: 'Dine-In, Takeaway, Delivery, and Token breakdown', icon: ShoppingBag },
  { id: 'SALES_BY_PAYMENT', category: 'SALES', title: 'Sales by Payment Method', subtitle: 'Cash, UPI BharatQR, and Card POS breakdown', icon: DollarSign },
  { id: 'SALES_BY_TABLE', category: 'SALES', title: 'Sales by Table', subtitle: 'Table-wise revenue and occupancy performance', icon: Utensils },
  { id: 'SALES_BY_CAPTAIN', category: 'SALES', title: 'Sales by Captain', subtitle: 'Captain order volume and revenue generation', icon: Users },
  { id: 'SALES_BY_CASHIER', category: 'SALES', title: 'Sales by Cashier', subtitle: 'Cashier-wise billing transactions and cash drawer intake', icon: Users },

  // 2. MENU & PRODUCT
  { id: 'TOP_SELLING_DISHES', category: 'MENU', title: 'Top Selling Dishes', subtitle: 'Highest volume & revenue ranking menu items', icon: Utensils, isPopular: true },
  { id: 'SLOW_MOVING_DISHES', category: 'MENU', title: 'Slow Moving Dishes', subtitle: 'Low volume items requiring promotion or menu re-engineering', icon: Utensils },
  { id: 'CATEGORY_SALES', category: 'MENU', title: 'Category Sales', subtitle: 'Starters, Main Course, Breads, and Beverage share', icon: Layers, isPopular: true },
  { id: 'DISH_REVENUE', category: 'MENU', title: 'Dish Revenue', subtitle: 'Gross revenue contributions by individual recipe', icon: DollarSign },
  { id: 'DISH_QUANTITY', category: 'MENU', title: 'Dish Quantity', subtitle: 'Portions prepared and sold across stations', icon: Package },
  { id: 'AVG_SELLING_PRICE', category: 'MENU', title: 'Average Selling Price', subtitle: 'Yield per item and menu pricing analysis', icon: TrendingUp },
  { id: 'MODIFIER_PERFORMANCE', category: 'MENU', title: 'Modifier Performance', subtitle: 'Spice levels, extra cheese, and addon uptake', icon: SlidersHorizontal },
  { id: 'COMBO_PERFORMANCE', category: 'MENU', title: 'Combo Performance', subtitle: 'Meal bundle sales and promotional uptake', icon: Sparkles },

  // 3. FINANCIAL
  { id: 'GROSS_SALES', category: 'FINANCIAL', title: 'Gross Sales', subtitle: 'Unadjusted food sales before discounts and taxes', icon: DollarSign },
  { id: 'DISCOUNTS_REPORT', category: 'FINANCIAL', title: 'Discounts & Offers', subtitle: 'Promotional markdowns, manager waivers, and coupons', icon: TrendingDown },
  { id: 'TAXES_GST', category: 'FINANCIAL', title: 'Taxes / GST Report', subtitle: 'CGST 2.5% and SGST 2.5% filing figures', icon: FileText, isPopular: true },
  { id: 'NET_SALES', category: 'FINANCIAL', title: 'Total Billed (incl. GST)', subtitle: 'Everything billed, tax included; matches what was collected', icon: DollarSign },
  { id: 'PAYMENT_COLLECTION', category: 'FINANCIAL', title: 'Payment Collection', subtitle: 'Channel-wise settlement verification', icon: DollarSign, isPopular: true },
  { id: 'CASH_REPORT', category: 'FINANCIAL', title: 'Cash Report', subtitle: 'Cash drawer inflows, payouts, and safe drops', icon: DollarSign },
  { id: 'UPI_REPORT', category: 'FINANCIAL', title: 'UPI / BharatQR Report', subtitle: 'Instant QR soundbox and digital payment ledger', icon: DollarSign },
  { id: 'CARD_REPORT', category: 'FINANCIAL', title: 'Card Report', subtitle: 'Credit/Debit swipe machine transactions', icon: DollarSign },
  { id: 'SPLIT_PAYMENT_REPORT', category: 'FINANCIAL', title: 'Split Payment Report', subtitle: 'Orders settled across multiple tender types', icon: Layers },
  { id: 'REFUND_REPORT', category: 'FINANCIAL', title: 'Refund Report', subtitle: 'Returned bills and payment reversals', icon: TrendingDown },
  { id: 'CANCELLED_ORDERS', category: 'FINANCIAL', title: 'Void / Cancelled Orders', subtitle: 'Cancelled KOTs and waste audit tracking', icon: AlertTriangle },
  { id: 'EOD_SETTLEMENT', category: 'FINANCIAL', title: 'EOD Settlement (Z-Report)', subtitle: 'Official shift closing & cash drawer audit statement', icon: CheckCircle2, isPopular: true },

  // 4. OPERATIONS
  { id: 'ORDER_VOLUME', category: 'OPERATIONS', title: 'Order Volume', subtitle: 'Total bills served across time slots', icon: ShoppingBag },
  { id: 'AOV_REPORT', category: 'OPERATIONS', title: 'Average Order Value (AOV)', subtitle: 'Average spend per table and ticket size', icon: TrendingUp },
  { id: 'TABLE_UTILIZATION', category: 'OPERATIONS', title: 'Table Utilization', subtitle: 'Seat occupancy and dining duration', icon: Utensils },
  { id: 'TABLE_TURNOVER', category: 'OPERATIONS', title: 'Table Turnover', subtitle: 'Seating cycles per table during rush hour', icon: RotateCcw },
  { id: 'KOT_PERFORMANCE', category: 'OPERATIONS', title: 'KOT Performance', subtitle: 'Kitchen ticket transmission and completion stats', icon: Clock },
  { id: 'KITCHEN_PREP_TIME', category: 'OPERATIONS', title: 'Kitchen Prep Time', subtitle: 'Average cook latency across food stations', icon: Clock, isPopular: true },
  { id: 'DELAYED_KOTS', category: 'OPERATIONS', title: 'Delayed KOTs', subtitle: 'Tickets exceeding 20 minutes preparation time', icon: AlertTriangle },
  { id: 'STATION_PERFORMANCE', category: 'OPERATIONS', title: 'Station Performance', subtitle: 'Main Kitchen, Tandoor, Curry, Beverage stats', icon: Layers },
  { id: 'CAPTAIN_PERFORMANCE', category: 'OPERATIONS', title: 'Captain Performance', subtitle: 'Table speed, upsell rate, and guest feedback', icon: Users },
  { id: 'CASHIER_PERFORMANCE', category: 'OPERATIONS', title: 'Cashier Performance', subtitle: 'Checkout speed and cash drawer accuracy', icon: Users },
  { id: 'SHIFT_PERFORMANCE', category: 'OPERATIONS', title: 'Shift Performance', subtitle: 'Lunch vs Dinner shift financial comparison', icon: Clock },

  // 5. CUSTOMERS
  { id: 'CUSTOMER_SALES', category: 'CUSTOMERS', title: 'Customer Sales', subtitle: 'VIP vs General guest sales breakdown', icon: Users },
  { id: 'NEW_CUSTOMERS', category: 'CUSTOMERS', title: 'New Customers', subtitle: 'First-time diner acquisition rate', icon: Users },
  { id: 'RETURNING_CUSTOMERS', category: 'CUSTOMERS', title: 'Returning Customers', subtitle: 'Diner retention and frequency metrics', icon: RotateCcw, isPopular: true },
  { id: 'REPEAT_VISIT_RATE', category: 'CUSTOMERS', title: 'Repeat Visit Rate', subtitle: 'Percentage of patrons visiting >2 times per month', icon: TrendingUp },
  { id: 'CUSTOMER_LIFETIME_VALUE', category: 'CUSTOMERS', title: 'Customer Lifetime Value (LTV)', subtitle: 'Cumulative lifetime restaurant spend', icon: Sparkles },
  { id: 'AVG_CUSTOMER_SPEND', category: 'CUSTOMERS', title: 'Average Customer Spend', subtitle: 'Spend per guest head (PPH)', icon: DollarSign },
  { id: 'LOYALTY_POINTS', category: 'CUSTOMERS', title: 'Loyalty Points', subtitle: 'Points issued, redeemed, and outstanding balances', icon: Sparkles },

  // 6. INVENTORY
  { id: 'STOCK_MOVEMENT', category: 'INVENTORY', title: 'Stock Movement', subtitle: 'Daily raw material issues and stock deductions', icon: Package },
  { id: 'LOW_STOCK', category: 'INVENTORY', title: 'Low Stock Report', subtitle: 'Ingredients below minimum reorder threshold', icon: AlertTriangle, isPopular: true },
  { id: 'INGREDIENT_USAGE', category: 'INVENTORY', title: 'Ingredient Usage', subtitle: 'Paneer, Butter, Ghee, Dairy & Spices consumed', icon: Package },
  { id: 'WASTE_REPORT', category: 'INVENTORY', title: 'Waste & Spoilage', subtitle: 'Expired or damaged inventory write-offs', icon: AlertTriangle },
  { id: 'PURCHASE_VS_CONSUMPTION', category: 'INVENTORY', title: 'Purchase vs Consumption', subtitle: 'Vendor purchase orders vs actual plate yield', icon: TrendingUp },
  { id: 'MENU_FOOD_COST', category: 'INVENTORY', title: 'Menu Food Cost %', subtitle: 'Theoretical ingredient cost vs menu price', icon: DollarSign, isPopular: true },
  { id: 'ESTIMATED_GROSS_MARGIN', category: 'INVENTORY', title: 'Estimated Gross Margin', subtitle: 'Gross margin after raw material deductions (65-72%)', icon: Sparkles }
];

export const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ showToast }) => {
  // Navigation & Selection State
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey>('SALES');
  const [activeReportId, setActiveReportId] = useState<string>('DAILY_SALES');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Date Range State
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Comparison Mode State
  const [comparePreset, setComparePreset] = useState<ComparePeriodPreset>('PREVIOUS_PERIOD');
  const [isCompareEnabled, setIsCompareEnabled] = useState<boolean>(true);

  // Advanced Filters Drawer State
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [filters, setFilters] = useState<ReportFilterOptions>({
    orderType: 'ALL',
    paymentMethod: 'ALL',
    categoryId: 'ALL',
    station: 'ALL',
    tableNumber: 'ALL'
  });

  // Report Design Theme State (persisted in localStorage)
  const [currentTheme, setCurrentTheme] = useState<ReportDesignTheme>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('jamanvaar_report_design') as ReportDesignTheme;
      if (saved) return saved;
    }
    return 'MODERN_RESTAURANT';
  });

  // Modals State
  const [isDesignModalOpen, setIsDesignModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Favorite Reports State
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('jamanvaar_favorite_reports');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return ['DAILY_SALES', 'TOP_SELLING_DISHES', 'TAXES_GST', 'EOD_SETTLEMENT', 'KITCHEN_PREP_TIME'];
  });

  // Recently Viewed State
  const [recentIds, setRecentIds] = useState<string[]>(['DAILY_SALES', 'TOP_SELLING_DISHES', 'EOD_SETTLEMENT']);

  const handleSelectReport = (id: string) => {
    setActiveReportId(id);
    setRecentIds((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 6));
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('jamanvaar_favorite_reports', JSON.stringify(next));
      }
      showToast(next.includes(id) ? 'Added to Favorite Reports ★' : 'Removed from Favorites');
      return next;
    });
  };

  const handleSelectTheme = (theme: ReportDesignTheme) => {
    setCurrentTheme(theme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('jamanvaar_report_design', theme);
    }
    showToast(`Report Design changed to "${theme.replace('_', ' ')}"`);
  };

  // Resolved Date Ranges
  const dateRange: ReportDateRange = useMemo(() => {
    return ReportDataEngine.getDateRange(periodPreset, customStartDate, customEndDate);
  }, [periodPreset, customStartDate, customEndDate]);

  const compareDateRange = useMemo(() => {
    if (!isCompareEnabled) return null;
    return ReportDataEngine.getCompareDateRange(dateRange, comparePreset);
  }, [dateRange, comparePreset, isCompareEnabled]);

  // Current & Compare Orders
  const currentOrders = useMemo(() => {
    return ReportDataEngine.getOrders(dateRange, filters);
  }, [dateRange, filters]);

  const compareOrders = useMemo(() => {
    if (!compareDateRange) return undefined;
    return ReportDataEngine.getOrders(compareDateRange, filters);
  }, [compareDateRange, filters]);

  // Aggregated Data
  const summary = useMemo(() => {
    return ReportDataEngine.calculateSummary(currentOrders, compareOrders);
  }, [currentOrders, compareOrders]);

  const hourly = useMemo(() => {
    return ReportDataEngine.getHourlySales(currentOrders);
  }, [currentOrders]);

  const dayByDay = useMemo(() => {
    return ReportDataEngine.getDayByDayRows(currentOrders);
  }, [currentOrders]);

  const dishes = useMemo(() => {
    return ReportDataEngine.getDishPerformance(currentOrders);
  }, [currentOrders]);

  const categories = useMemo(() => {
    return ReportDataEngine.getCategoryPerformance(currentOrders);
  }, [currentOrders]);

  const tables = useMemo(() => {
    return ReportDataEngine.getTablePerformance(currentOrders);
  }, [currentOrders]);

  const staff = useMemo(() => {
    return ReportDataEngine.getStaffPerformance(currentOrders);
  }, [currentOrders]);

  const stations = useMemo(() => {
    return ReportDataEngine.getStationPerformance(currentOrders);
  }, [currentOrders]);

  const gst = useMemo(() => {
    return ReportDataEngine.getGstReport(currentOrders);
  }, [currentOrders]);

  const eod = useMemo(() => {
    return ReportDataEngine.getEodReconciliation(currentOrders, dateRange);
  }, [currentOrders, dateRange]);

  // Active Report Details
  const activeReport = useMemo(() => {
    return ALL_REPORTS.find((r) => r.id === activeReportId) || ALL_REPORTS[0];
  }, [activeReportId]);

  // Filtered Reports in current category or search
  const displayedReports = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return ALL_REPORTS.filter((r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    return ALL_REPORTS.filter((r) => r.category === selectedCategory);
  }, [selectedCategory, searchQuery]);

  // Active Filter Count
  const activeFilterCount = Object.entries(filters).filter(([_, v]) => v && v !== 'ALL').length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* 1. TOP HEADER & ACTION BAR */}
      <div className="bg-white border border-jaman-border rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
                Reports & Analytics
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                ● LIVE RECONCILED
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Understand sales, operations, payments, customers and restaurant performance.
            </p>
          </div>

          {/* Top Functional Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsDesignModalOpen(true)}
              className="px-3.5 py-2 bg-[#FFF4ED] hover:bg-[#FFE8DA] border border-[#FDBA74] text-jaman-saffron rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Report Design</span>
            </button>

            <button
              onClick={() => setIsPreviewModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <Eye className="w-3.5 h-3.5 text-jaman-saffron" />
              <span>Preview Report</span>
            </button>

            <button
              onClick={() => setIsPreviewModalOpen(true)}
              className="px-3.5 py-2 bg-jaman-navy hover:bg-jaman-darkBorder text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>

            <button
              onClick={() => setIsPreviewModalOpen(true)}
              className="px-3.5 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={() => {
                ReportExportService.exportTransactionsCsv(currentOrders, activeReport.title);
                showToast('Exported CSV with filtered data!');
              }}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 2. DATE RANGE & COMPARISON CONTROLS */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'TODAY', label: 'Today' },
              { id: 'YESTERDAY', label: 'Yesterday' },
              { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
              { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_MONTH', label: 'Last Month' },
              { id: 'THIS_YEAR', label: 'This Year' },
              { id: 'CUSTOM', label: 'Custom Range' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodPreset(p.id as ReportPeriodPreset)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  periodPreset === p.id
                    ? 'bg-jaman-navy text-white shadow-2xs'
                    : 'bg-jaman-cream text-slate-600 hover:bg-[#F2EFE9]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs if CUSTOM is active */}
          {periodPreset === 'CUSTOM' && (
            <div className="flex items-center gap-2 bg-jaman-cream p-1.5 rounded-xl border border-jaman-border">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white border border-jaman-border rounded-lg px-2 py-1 text-xs font-bold text-jaman-navy"
              />
              <span className="text-slate-400 font-bold">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white border border-jaman-border rounded-lg px-2 py-1 text-xs font-bold text-jaman-navy"
              />
            </div>
          )}

          {/* Comparison Mode Toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCompareEnabled}
                onChange={(e) => setIsCompareEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-jaman-saffron focus:ring-jaman-saffron"
              />
              <span>Compare With:</span>
            </label>

            {isCompareEnabled && (
              <select
                value={comparePreset}
                onChange={(e) => setComparePreset(e.target.value as ComparePeriodPreset)}
                className="bg-jaman-cream border border-jaman-border rounded-xl px-2.5 py-1 text-xs font-bold text-jaman-navy"
              >
                <option value="PREVIOUS_PERIOD">Previous Period</option>
                <option value="PREVIOUS_DAY">Previous Day</option>
                <option value="PREVIOUS_WEEK">Previous Week</option>
                <option value="PREVIOUS_MONTH">Previous Month</option>
                <option value="PREVIOUS_YEAR">Previous Year</option>
              </select>
            )}

            {/* Filter Drawer Trigger */}
            <button
              onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeFilterCount > 0
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Active Filters Display */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-slate-400 font-bold text-[11px]">Active Filters:</span>
            {filters.orderType !== 'ALL' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-jaman-saffron font-bold flex items-center gap-1">
                Order: {filters.orderType}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, orderType: 'ALL' })} />
              </span>
            )}
            {filters.paymentMethod !== 'ALL' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-jaman-saffron font-bold flex items-center gap-1">
                Payment: {filters.paymentMethod}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, paymentMethod: 'ALL' })} />
              </span>
            )}
            {filters.tableNumber !== 'ALL' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-jaman-saffron font-bold flex items-center gap-1">
                Table: {filters.tableNumber}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, tableNumber: 'ALL' })} />
              </span>
            )}
            <button
              onClick={() => setFilters({ orderType: 'ALL', paymentMethod: 'ALL', categoryId: 'ALL', station: 'ALL', tableNumber: 'ALL' })}
              className="text-[11px] text-rose-600 font-bold hover:underline ml-2"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* 3. TODAY AT A GLANCE (OWNER EXECUTIVE OVERVIEW) */}
      <div className="bg-white border border-jaman-border rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-base text-jaman-navy">
              Performance at a Glance • {dateRange.label}
            </h3>
            <p className="text-xs text-slate-400">
              {currentOrders.length} completed transactions reconciled across billing and kitchen counters.
            </p>
          </div>
          {compareDateRange && (
            <span className="text-[11px] font-bold text-slate-500 bg-jaman-cream px-3 py-1 rounded-full border border-slate-200">
              vs. {compareDateRange.label}
            </span>
          )}
        </div>

        {/* High-Level Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Gross Sales */}
          <div className="p-3.5 rounded-2xl bg-jaman-ivory border border-jaman-border space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Gross Sales</span>
            <div className="text-lg font-mono font-black text-jaman-navy">
              {formatINR(summary.grossSales.current)}
            </div>
            {summary.grossSales.diffPercent !== undefined && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                summary.grossSales.diffPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {summary.grossSales.diffPercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span>{summary.grossSales.diffPercent > 0 ? '+' : ''}{summary.grossSales.diffPercent}%</span>
              </span>
            )}
          </div>

          {/* Discounts */}
          <div className="p-3.5 rounded-2xl bg-jaman-ivory border border-jaman-border space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Discounts</span>
            <div className="text-lg font-mono font-black text-rose-600">
              -{formatINR(summary.discountAmount.current)}
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">Promotions</span>
          </div>

          {/* GST */}
          <div className="p-3.5 rounded-2xl bg-jaman-ivory border border-jaman-border space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">GST Tax (5%)</span>
            <div className="text-lg font-mono font-black text-jaman-saffron">
              {formatINR(summary.totalTax.current)}
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">CGST + SGST</span>
          </div>

          {/* Net Sales */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-1">
            <span className="text-[10px] font-bold text-emerald-900 uppercase block">Net Collected</span>
            <div className="text-xl font-mono font-black text-emerald-950">
              {formatINR(summary.netSales.current)}
            </div>
            {summary.netSales.diffPercent !== undefined && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                summary.netSales.diffPercent >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}>
                {summary.netSales.diffPercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span>{summary.netSales.diffPercent > 0 ? '+' : ''}{summary.netSales.diffPercent}%</span>
              </span>
            )}
          </div>

          {/* Orders Count */}
          <div className="p-3.5 rounded-2xl bg-jaman-ivory border border-jaman-border space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Orders</span>
            <div className="text-lg font-mono font-black text-jaman-navy">
              {summary.ordersCount.current}
            </div>
            {summary.ordersCount.diffPercent !== undefined && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                summary.ordersCount.diffPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {summary.ordersCount.diffPercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span>{summary.ordersCount.diffPercent > 0 ? '+' : ''}{summary.ordersCount.diffPercent}%</span>
              </span>
            )}
          </div>

          {/* AOV */}
          <div className="p-3.5 rounded-2xl bg-jaman-ivory border border-jaman-border space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Average Ticket</span>
            <div className="text-lg font-mono font-black text-slate-800">
              ₹{summary.avgOrderValue.current}
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">Avg per bill</span>
          </div>
        </div>
      </div>

      {/* 4. MAIN REPORT WORKSPACE (CATEGORIES + SUB-REPORTS + DATA VIEW) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: REPORT CATEGORIES & REPORT LIST (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Category Tabs */}
          <div className="bg-white border border-jaman-border rounded-3xl p-3 shadow-xs space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 block">
              Report Categories
            </span>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { id: 'SALES', label: 'Sales', icon: DollarSign },
                { id: 'MENU', label: 'Menu', icon: Utensils },
                { id: 'FINANCIAL', label: 'Financial', icon: BarChart3 },
                { id: 'OPERATIONS', label: 'Operations', icon: Clock },
                { id: 'CUSTOMERS', label: 'Customers', icon: Users },
                { id: 'INVENTORY', label: 'Inventory', icon: Package }
              ].map((c) => {
                const Icon = c.icon;
                const isCatActive = selectedCategory === c.id && !searchQuery.trim();
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCategory(c.id as ReportCategoryKey);
                      setSearchQuery('');
                      const firstInCat = ALL_REPORTS.find((r) => r.category === c.id);
                      if (firstInCat) handleSelectReport(firstInCat.id);
                    }}
                    className={`py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isCatActive
                        ? 'bg-jaman-navy text-white shadow-xs'
                        : 'bg-jaman-cream text-slate-600 hover:bg-[#F2EFE9]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Reports Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports (e.g. GST, Sales, Cash, Dish)..."
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-jaman-border rounded-2xl text-xs font-bold text-jaman-navy placeholder:text-slate-400 shadow-2xs focus:outline-none focus:border-jaman-saffron"
            />
          </div>

          {/* Favorite Reports Drawer */}
          {favoriteIds.length > 0 && !searchQuery.trim() && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>Favorite Reports</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {favoriteIds.map((favId) => {
                  const rep = ALL_REPORTS.find((r) => r.id === favId);
                  if (!rep) return null;
                  return (
                    <button
                      key={favId}
                      onClick={() => handleSelectReport(favId)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeReportId === favId
                          ? 'bg-jaman-saffron text-white shadow-2xs'
                          : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      ★ {rep.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* List of Sub-Reports */}
          <div className="bg-white border border-jaman-border rounded-3xl p-3 shadow-xs space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 block">
              {searchQuery ? `Search Results (${displayedReports.length})` : `${selectedCategory} Reports (${displayedReports.length})`}
            </span>

            {displayedReports.map((rep) => {
              const isSelected = activeReportId === rep.id;
              const isFav = favoriteIds.includes(rep.id);
              const Icon = rep.icon;

              return (
                <div
                  key={rep.id}
                  onClick={() => handleSelectReport(rep.id)}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer group ${
                    isSelected
                      ? 'bg-[#FFF7ED] border-jaman-saffron shadow-xs'
                      : 'bg-white border-jaman-border hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-jaman-saffron text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-xs text-jaman-navy truncate">{rep.title}</h4>
                        {rep.isPopular && (
                          <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            HOT
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{rep.subtitle}</p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => toggleFavorite(rep.id, e)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 transition-colors"
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE REPORT DETAIL & VISUAL WORKSPACE (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Active Report Header Card */}
          <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-jaman-navy text-white font-black text-[10px] uppercase tracking-wider">
                  {activeReport.category}
                </span>
                <h2 className="text-xl font-black text-jaman-navy">{activeReport.title}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{activeReport.subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="px-3.5 py-2 bg-[#FFF4ED] hover:bg-[#FFE8DA] border border-[#FDBA74] text-jaman-saffron rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Full Document Preview</span>
              </button>
            </div>
          </div>

          {/* REPORT SPECIFIC CONTENT ROUTING */}
          {/* 1. DAILY / SUMMARY / DAY-BY-DAY */}
          {(activeReportId === 'DAILY_SALES' || activeReportId === 'SALES_SUMMARY' || activeReportId === 'DAY_BY_DAY') && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-jaman-navy">Consecutive Daily Sales Ledger</h3>
                <span className="text-xs text-slate-400 font-mono">{dayByDay.length} Days Audited</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-jaman-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-jaman-border text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Orders</th>
                      <th className="p-3">Gross</th>
                      <th className="p-3">Discount</th>
                      <th className="p-3">GST (5%)</th>
                      <th className="p-3">Total Billed (incl. GST)</th>
                      <th className="p-3">Cash</th>
                      <th className="p-3">UPI</th>
                      <th className="p-3">Card</th>
                      <th className="p-3">AOV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dayByDay.map((d) => (
                      <tr key={d.dateKey} className="hover:bg-amber-50/40 transition-colors">
                        <td className="p-3 font-bold text-jaman-navy">{d.displayDate}</td>
                        <td className="p-3 font-mono">{d.ordersCount}</td>
                        <td className="p-3 font-mono font-bold text-slate-800">₹{d.grossSales}</td>
                        <td className="p-3 font-mono text-rose-600">-₹{d.discount}</td>
                        <td className="p-3 font-mono text-jaman-saffron">₹{d.tax}</td>
                        <td className="p-3 font-mono font-black text-emerald-800">₹{d.netSales}</td>
                        <td className="p-3 font-mono text-slate-600">₹{d.cash}</td>
                        <td className="p-3 font-mono text-blue-700">₹{d.upi}</td>
                        <td className="p-3 font-mono text-indigo-700">₹{d.card}</td>
                        <td className="p-3 font-mono font-bold">₹{d.avgOrderValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. HOURLY SALES */}
          {activeReportId === 'HOURLY_SALES' && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <h3 className="font-extrabold text-sm text-jaman-navy">Peak Dining Rush & Hourly Revenue Heatmap</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {hourly.map((h) => (
                  <div key={h.hour} className="p-3.5 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-jaman-navy">{h.label}</span>
                      <span className="font-mono text-slate-400">{h.ordersCount} orders</span>
                    </div>
                    <div className="text-base font-mono font-black text-emerald-800">
                      {formatINR(h.sales)}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      AOV: ₹{h.avgOrderValue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. TOP DISHES & MENU */}
          {(activeReportId === 'TOP_SELLING_DISHES' || activeReportId === 'SLOW_MOVING_DISHES' || activeReportId === 'CATEGORY_SALES' || activeReportId === 'DISH_REVENUE') && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-sm text-jaman-navy">Menu Dish Performance & Margins</h3>
                <span className="text-xs text-slate-400 font-mono">{dishes.length} Items Listed</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-jaman-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-jaman-border text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Dish Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Qty Sold</th>
                      <th className="p-3 text-right">Gross Sales</th>
                      <th className="p-3 text-right">Avg Price</th>
                      <th className="p-3 text-right">Revenue %</th>
                      <th className="p-3 text-right">Est. Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dishes.map((d, i) => (
                      <tr key={d.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-jaman-saffron">#{i + 1}</td>
                        <td className="p-3 font-bold text-jaman-navy">{d.name}</td>
                        <td className="p-3 text-slate-500">{d.categoryName}</td>
                        <td className="p-3 font-mono font-bold text-right">{d.quantitySold}</td>
                        <td className="p-3 font-mono font-black text-right text-emerald-800">{formatINR(d.grossRevenue)}</td>
                        <td className="p-3 font-mono text-right">₹{d.avgSellingPrice}</td>
                        <td className="p-3 font-mono text-right font-bold text-slate-700">{d.revenueSharePercent}%</td>
                        <td className="p-3 font-mono text-right font-bold text-emerald-700">{d.grossMarginPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. GST TAX REPORT */}
          {activeReportId === 'TAXES_GST' && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-jaman-navy">GST Tax Audit Statement (5% Food Rate)</h3>
                  <p className="text-xs text-slate-400">GSTIN: {db.restaurant.gstin || 'not registered'}</p>
                </div>
                <button
                  onClick={() => {
                    ReportExportService.exportGstCsv(gst);
                    showToast('Exported GST Tax CSV Report!');
                  }}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download GST CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-jaman-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-jaman-cream border-b border-jaman-border text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Tax Slab</th>
                      <th className="p-3">Invoices</th>
                      <th className="p-3 text-right">Taxable Turnover</th>
                      <th className="p-3 text-right">CGST (2.5%)</th>
                      <th className="p-3 text-right">SGST (2.5%)</th>
                      <th className="p-3 text-right">Total Tax Liability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gst.map((g, i) => (
                      <tr key={i} className="hover:bg-slate-50 font-mono">
                        <td className="p-3 font-bold text-jaman-navy">{g.taxRatePercent}% Standard GST</td>
                        <td className="p-3">{g.invoicesCount}</td>
                        <td className="p-3 font-bold text-right">{formatINR(g.taxableAmount)}</td>
                        {/* B2-036: derived from the same row's own totalTax via formatSplitTax. */}
                        <td className="p-3 text-right text-jaman-saffron">{formatSplitTax(g.totalTax, g.cgstAmount, g.sgstAmount).cgst}</td>
                        <td className="p-3 text-right text-jaman-saffron">{formatSplitTax(g.totalTax, g.cgstAmount, g.sgstAmount).sgst}</td>
                        <td className="p-3 font-black text-right text-emerald-800">{formatINR(g.totalTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. EOD SETTLEMENT */}
          {activeReportId === 'EOD_SETTLEMENT' && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-jaman-navy">End of Day (EOD) Cash Drawer Reconciliation</h3>
                  <p className="text-xs text-slate-400">Balancing cash drawer and digital settlements</p>
                </div>
                <span className={`px-3 py-1 rounded-full font-black text-xs ${
                  eod.isBalanced === null ? 'bg-slate-100 text-slate-600' : eod.isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {eod.isBalanced === null
                    ? 'NOT YET COUNTED'
                    : eod.isBalanced ? '✓ BALANCED' : `⚠ VARIANCE: ${formatINR(eod.cashDifference || 0)}`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-jaman-cream border border-jaman-border">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Opening Cash</span>
                  <div className="text-lg font-mono font-black text-jaman-navy mt-1">{formatINR(eod.openingCash)}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-jaman-cream border border-jaman-border">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Cash Sales</span>
                  <div className="text-lg font-mono font-black text-emerald-800 mt-1">{formatINR(eod.cashSales)}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-jaman-cream border border-jaman-border">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Expected Cash</span>
                  <div className="text-lg font-mono font-black text-jaman-navy mt-1">{formatINR(eod.expectedCash)}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-900 uppercase block">Digital Sales</span>
                  <div className="text-lg font-mono font-black text-blue-900 mt-1">{formatINR(eod.upiSales + eod.cardSales)}</div>
                </div>
              </div>
            </div>
          )}

          {/* 6. KITCHEN / OPERATIONS */}
          {(activeReportId === 'KITCHEN_PREP_TIME' || activeReportId === 'STATION_PERFORMANCE' || activeReportId === 'KOT_PERFORMANCE') && (
            <div className="bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4">
              <h3 className="font-extrabold text-sm text-jaman-navy">Kitchen Food Stations & Cook Latency</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stations.map((st) => (
                  <div key={st.stationName} className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-xs text-jaman-navy">{st.stationName}</h4>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        {st.avgPrepMinutes !== null ? `${st.avgPrepMinutes}m avg` : 'No data yet'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 pt-1">
                      <span>{st.kotCount} KOT Tickets</span>
                      <span>{st.itemsCount} Dishes Cooked</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {/* 1. Report Design Selector Modal */}
      <ReportDesignSelectorModal
        isOpen={isDesignModalOpen}
        onClose={() => setIsDesignModalOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={handleSelectTheme}
        summary={summary}
        onOpenFullPreview={() => setIsPreviewModalOpen(true)}
      />

      {/* 2. Full Report Document Preview Modal */}
      <ReportPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        reportTitle={activeReport.title}
        dateRange={dateRange}
        theme={currentTheme}
        onOpenDesignSelector={() => setIsDesignModalOpen(true)}
        summary={summary}
        hourly={hourly}
        dishes={dishes}
        gst={gst}
        days={dayByDay}
        orders={currentOrders}
      />
    </div>
  );
};
