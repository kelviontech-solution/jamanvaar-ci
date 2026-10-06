import React from 'react';
import { DashboardHeader, DashboardPeriod } from './DashboardHeader';
import { PrimaryMetricsGrid } from './PrimaryMetricsGrid';
import { OperationalSnapshot } from './OperationalSnapshot';
import { HourlySalesChart } from './HourlySalesChart';
import { TopDishesLeaderboard } from './TopDishesLeaderboard';
import { NeedsAttentionSection } from './NeedsAttentionSection';
import { OnboardingChecklistCard, OnboardingChecklistItem } from './OnboardingChecklistCard';
import { TopItemStat } from '@jamanvaar/business';
import { Receipt } from 'lucide-react';

interface RestaurantDashboardProps {
  dashFilter: DashboardPeriod;
  setDashFilter: (filter: DashboardPeriod) => void;
  dashPeriodReport: {
    summary: {
      netSales: number;
      ordersCount: number;
      avgOrderValue: number;
      totalTax: number;
      cgstAmount: number;
      sgstAmount: number;
      discountAmount: number;
      paymentBreakdown: {
        cash: number;
        upi: number;
        card?: number;
        totalPayments: number;
      };
      orderTypeBreakdown: {
        dineIn: { count: number; total: number };
        takeaway: { count: number; total: number };
        delivery?: { count: number; total: number };
        token?: { count: number; total: number };
      };
      reconciled: boolean;
      varianceAmount: number;
    };
    dateRange: {
      label: string;
    };
  };
  hourlySales: { hour: string; sales: number; ordersCount: number }[];
  peakHours: {
    peakHour: string;
    peakSales?: number;
    peakOrders?: number;
    peakDay?: string;
  };
  topDishes: TopItemStat[];
  pendingKotsCount: number;
  occupiedTablesCount: number;
  tablesTotalCount: number;
  lowStockCount: number;
  activeShift?: any;
  setActiveTab: (tab: any) => void;
  setReportSubTab: (subTab: any) => void;
  setIsReconModalOpen: (open: boolean) => void;
  onboardingItems: OnboardingChecklistItem[];
  onRefresh: () => void;
}

export const RestaurantDashboard: React.FC<RestaurantDashboardProps> = ({
  dashFilter,
  setDashFilter,
  dashPeriodReport,
  hourlySales,
  peakHours,
  topDishes,
  pendingKotsCount,
  occupiedTablesCount,
  tablesTotalCount,
  lowStockCount,
  activeShift,
  setActiveTab,
  setReportSubTab,
  setIsReconModalOpen,
  onboardingItems,
  onRefresh
}) => {
  const { summary, dateRange } = dashPeriodReport;

  return (
    <div className="jv-stagger space-y-6 sm:space-y-7 max-w-7xl mx-auto pb-8">
      {/* 1. Header: Operations Mission, Period Selector & Refresh */}
      <DashboardHeader
        currentFilter={dashFilter}
        onFilterChange={setDashFilter}
        onRefresh={onRefresh}
        dateRangeLabel={dateRange.label}
      />

      {/* First-run checklist — real state, disappears once complete or dismissed */}
      <OnboardingChecklistCard items={onboardingItems} />

      {/* 2. Primary Business Overview: The 4 Dominant Hero Cards */}
      <PrimaryMetricsGrid
        summary={summary}
        periodLabel={dateRange.label}
      />

      {/* Reassuring zero-sales state banner when no orders punched yet */}
      {summary.ordersCount === 0 && (
        <div className="bg-white border border-[#E6DEC9] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/[0.07] text-brand flex items-center justify-center shrink-0 border border-brand/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-jaman-navy">No sales yet for {dateRange.label.toLowerCase()}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Sales, collections and top dishes will appear here as orders come in from the POS, Captain and QR menu.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('TABLES')}
            className="self-start sm:self-auto shrink-0 h-9 px-3.5 rounded-xl bg-white border border-jaman-border text-jaman-navy text-sm font-medium hover:bg-jaman-cream transition-colors cursor-pointer"
          >
            View dining floor
          </button>
        </div>
      )}

      {/* 3. Operational Snapshot: Actionable kitchen, floor, stock, and quiet tax */}
      <OperationalSnapshot
        pendingKotsCount={pendingKotsCount}
        occupiedTablesCount={occupiedTablesCount}
        tablesTotalCount={tablesTotalCount}
        lowStockCount={lowStockCount}
        totalTax={summary.totalTax}
        cgstAmount={summary.cgstAmount}
        sgstAmount={summary.sgstAmount}
        discountAmount={summary.discountAmount}
        onNavigateToKitchen={() => setActiveTab('LIVE_KDS')}
        onNavigateToFloor={() => setActiveTab('TABLES')}
        onNavigateToInventory={() => setActiveTab('INVENTORY')}
      />

      {/* 4. Analytics Row: Hourly Sales Velocity (2/3) + Top Ranked Dishes (1/3) */}
      <section aria-label="Sales Analytics and Product Performance">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
          <div className="lg:col-span-2">
            <HourlySalesChart
              hourlySales={hourlySales}
              peakHours={peakHours}
            />
          </div>

          <div className="lg:col-span-1">
            <TopDishesLeaderboard
              topDishes={topDishes}
              onViewAll={() => {
                setActiveTab('REPORTS');
                setReportSubTab('TOP_ITEMS');
              }}
            />
          </div>
        </div>
      </section>

      {/* 5. Needs Attention & Operational Quick Actions */}
      <NeedsAttentionSection
        pendingKotsCount={pendingKotsCount}
        lowStockCount={lowStockCount}
        occupiedTablesCount={occupiedTablesCount}
        tablesTotalCount={tablesTotalCount}
        reconciled={summary.reconciled}
        varianceAmount={summary.varianceAmount}
        activeShift={activeShift}
        onNavigateToKitchen={() => setActiveTab('LIVE_KDS')}
        onNavigateToInventory={() => setActiveTab('INVENTORY')}
        onNavigateToFloor={() => setActiveTab('TABLES')}
        onNavigateToShifts={() => setActiveTab('SHIFTS')}
        onOpenReconciliation={() => setIsReconModalOpen(true)}
      />
    </div>
  );
};
