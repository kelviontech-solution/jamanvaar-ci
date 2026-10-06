import React from 'react';
import { usePosStore } from '../../store/posStore';
import { db, BusinessDayRepository } from '@jamanvaar/database';
import { CentralReportingService } from '@jamanvaar/business';
import { formatINR } from '@jamanvaar/utils';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  ChefHat,
  LayoutGrid,
  ShieldCheck,
  Zap
} from 'lucide-react';

export const PosFooterKpiStrip: React.FC = () => {
  const { setActiveTab } = usePosStore();

  const activeDay = BusinessDayRepository.getActiveBusinessDay();
  const todayOrders = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
  const todaySummary = CentralReportingService.calculateFinancialSummary(todayOrders);
  const todaySales = todaySummary.netSales;
  const totalOrdersCount = todaySummary.ordersCount;
  const aov = todaySummary.avgOrderValue;

  const tables = db.tables;
  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING');
  const occupancyPct = tables.length > 0 ? Math.round((occupiedTables.length / tables.length) * 100) : 0;

  const pendingKots = db.kots.filter((k) => k.status === 'PREPARING' || k.status === 'PENDING');

  return (
    <footer className="h-10 bg-white border border-jaman-border rounded-2xl px-3 sm:px-4 flex items-center justify-between text-jaman-navy select-none shrink-0 z-20 text-xs shadow-2xs">
      {/* Left & Middle KPI Metrics */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-none py-0.5">
        {/* Sales */}
        <button
          onClick={() => setActiveTab('REPORTS')}
          className="flex items-center gap-1.5 hover:text-jaman-saffron transition-colors pr-3 border-r border-jaman-border"
          title="Click to open Sales Reports"
        >
          <TrendingUp className="w-3.5 h-3.5 text-jaman-saffron" />
          <span className="text-slate-400 text-[11px]">Today Sales:</span>
          <strong className="font-mono font-bold text-jaman-navy text-xs">{formatINR(todaySales)}</strong>
        </button>

        {/* Orders */}
        <button
          onClick={() => setActiveTab('ORDERS')}
          className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors pr-3 border-r border-jaman-border"
          title="Click to view Live Orders"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-slate-400 text-[11px]">Orders:</span>
          <strong className="font-mono font-bold text-jaman-navy text-xs">{totalOrdersCount}</strong>
        </button>

        {/* AOV */}
        <div className="hidden sm:flex items-center gap-1.5 pr-3 border-r border-jaman-border">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-slate-400 text-[11px]">AOV:</span>
          <strong className="font-mono font-bold text-jaman-navy text-xs">{formatINR(aov)}</strong>
        </div>

        {/* Tables */}
        <button
          onClick={() => setActiveTab('TABLES')}
          className="hidden md:flex items-center gap-1.5 hover:text-amber-600 transition-colors pr-3 border-r border-jaman-border"
          title="Click to open Floor Plan"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-slate-400 text-[11px]">Tables:</span>
          <strong className="font-mono font-bold text-jaman-navy text-xs">
            {occupancyPct}% ({occupiedTables.length}/{tables.length})
          </strong>
        </button>

        {/* Pending KOT */}
        <button
          onClick={() => setActiveTab('KOT')}
          className="hidden lg:flex items-center gap-1.5 hover:text-rose-600 transition-colors"
          title="Click to open Kitchen KOTs"
        >
          <ChefHat className="w-3.5 h-3.5 text-rose-600" />
          <span className="text-slate-400 text-[11px]">Pending KOT:</span>
          <strong className="font-mono font-bold text-jaman-navy text-xs">{pendingKots.length}</strong>
        </button>
      </div>

      {/* Right: Security & Sync Status */}
      <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500">
        <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg font-bold shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Local Engine Active</span>
        </div>
      </div>
    </footer>
  );
};
