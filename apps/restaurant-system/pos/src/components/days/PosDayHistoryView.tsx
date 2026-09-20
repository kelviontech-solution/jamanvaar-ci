import React, { useState, useMemo } from 'react';
import { BusinessDay } from '@jamanvaar/types';
import {
  BusinessDayRepository,
  BusinessDayAccountingService,
  BusinessDaySummary,
  db
} from '@jamanvaar/database';
import { PosBusinessDayDetailModal } from './PosBusinessDayDetailModal';
import { PosDayOrdersModal } from './PosDayOrdersModal';
import { PosCloseDayModal } from './PosCloseDayModal';
import { formatINR } from '@jamanvaar/utils';
import {
  CalendarDays,
  Search,
  Lock,
  ArrowRight,
  ShoppingBag,
  Receipt
} from 'lucide-react';

type DateFilterPreset = 'ALL' | 'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH';

export const PosDayHistoryView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<DateFilterPreset>('ALL');
  const [selectedDay, setSelectedDay] = useState<BusinessDay | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeDay = useMemo(() => {
    return BusinessDayAccountingService.getActiveBusinessDay();
  }, [refreshKey, db.orders.length, db.businessDays.length]);

  const activeDaySummary: BusinessDaySummary = useMemo(() => {
    return BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);
  }, [activeDay, refreshKey, db.orders.length]);

  const allDays = useMemo(() => {
    return BusinessDayRepository.getAllBusinessDays();
  }, [refreshKey, db.businessDays.length]);

  const filteredDays = useMemo(() => {
    return allDays.filter((d) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesDate = d.displayDate.toLowerCase().includes(q) || d.businessDate.includes(q);
        const matchesId = d.id.toLowerCase().includes(q);
        if (!matchesDate && !matchesId) return false;
      }

      // Filter preset
      if (selectedFilter === 'TODAY') {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (d.businessDate !== todayStr) return false;
      } else if (selectedFilter === 'YESTERDAY') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().slice(0, 10);
        if (d.businessDate !== yStr) return false;
      } else if (selectedFilter === '7_DAYS') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (new Date(d.openedAt) < cutoff) return false;
      } else if (selectedFilter === '30_DAYS') {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (new Date(d.openedAt) < cutoff) return false;
      }

      return true;
    });
  }, [allDays, searchQuery, selectedFilter]);

  const handleDayClick = (day: BusinessDay) => {
    setSelectedDay(day);
    setIsDetailModalOpen(true);
  };

  const handleViewOrdersForDay = (day: BusinessDay) => {
    setSelectedDay(day);
    setIsOrdersModalOpen(true);
  };

  const handleOpenCloseModal = () => {
    setSelectedDay(activeDay);
    setIsCloseModalOpen(true);
  };

  const filterOptions: Array<{ id: DateFilterPreset; label: string }> = [
    { id: 'ALL', label: 'All Days' },
    { id: 'TODAY', label: 'Today' },
    { id: 'YESTERDAY', label: 'Yesterday' },
    { id: '7_DAYS', label: 'Last 7 Days' },
    { id: '30_DAYS', label: 'Last 30 Days' },
    { id: 'THIS_MONTH', label: 'This Month' }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-y-auto select-none space-y-5">
      {/* 1. Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-jaman-saffron" />
            <span>Business Days & Day History</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Permanent daily audit archives, cash reconciliations, and historical order records.
          </p>
        </div>

        {/* Action Button: Close Day */}
        <div className="flex items-center gap-2">
          {activeDay && activeDay.status === 'OPEN' && (
            <button
              type="button"
              onClick={handleOpenCloseModal}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-rose-600/25 transition-all active:scale-95 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Close Business Day</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Active Business Day Hero Card */}
      {activeDay && (
        <div className="bg-gradient-to-r from-jaman-navy via-[#123652] to-jaman-navy text-white p-5 sm:p-6 rounded-3xl shadow-md border border-jaman-border/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                  activeDaySummary.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {activeDaySummary.status === 'OPEN' ? 'CURRENT ACTIVE DAY' : 'DAY CLOSED'}
                </span>
                <span className="text-xs text-slate-300 font-mono">({activeDaySummary.business_day_id})</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">{activeDaySummary.display_date}</h2>
              <span className="text-xs text-slate-300">
                Opened at {activeDaySummary.opened_at ? new Date(activeDaySummary.opened_at).toLocaleTimeString('en-IN') : '–'} by {activeDaySummary.opened_by}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleViewOrdersForDay(activeDay)}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>Today's Orders ({activeDaySummary.total_orders})</span>
              </button>

              <button
                type="button"
                onClick={() => handleDayClick(activeDay)}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-blue-400" />
                <span>Day Details</span>
              </button>

              {activeDaySummary.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={handleOpenCloseModal}
                  className="px-4 py-1.5 bg-jaman-saffron hover:bg-[#EA580C] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/25 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Close Day</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Day Live Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Total Billed (incl. GST)</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                {formatINR(activeDaySummary.net_sales)}
              </div>
              <span className="text-[10px] text-emerald-300 font-bold mt-1 inline-block">
                ● {activeDaySummary.completed_orders} of {activeDaySummary.total_orders} Orders Billed
              </span>
            </div>

            <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Cash Collected</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-amber-300 mt-0.5">
                {formatINR(activeDaySummary.cash_sales)}
              </div>
              <span className="text-[10px] text-slate-300 font-medium mt-1 inline-block">In Drawer</span>
            </div>

            <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">UPI / QR Sales</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-cyan-300 mt-0.5">
                {formatINR(activeDaySummary.upi_sales)}
              </div>
              <span className="text-[10px] text-slate-300 font-medium mt-1 inline-block">Settled to Bank</span>
            </div>

            <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Card Terminal</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-purple-300 mt-0.5">
                {formatINR(activeDaySummary.card_sales)}
              </div>
              <span className="text-[10px] text-slate-300 font-medium mt-1 inline-block">Cards</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar */}
      <div className="bg-white border border-jaman-border rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Preset Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterOptions.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedFilter === f.id
                  ? 'bg-jaman-navy text-white shadow-2xs'
                  : 'bg-jaman-cream text-slate-700 hover:bg-slate-100 border border-jaman-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by date (e.g. 31 Aug) or Day ID..."
            className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-9 pr-3 py-1 text-xs text-jaman-navy font-bold focus:outline-none focus:border-jaman-saffron"
          />
        </div>
      </div>

      {/* 4. Permanent Day Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-xs uppercase tracking-wider text-jaman-navy">
            Permanent Day Archives ({filteredDays.length})
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">AUTHORITATIVE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDays.map((day) => {
            const summary = BusinessDayAccountingService.getBusinessDaySummary(day.id);
            const isClosed = summary.status === 'CLOSED';
            const closedTime = summary.closed_at
              ? new Date(summary.closed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : 'Still Open';

            return (
              <div
                key={day.id}
                className="bg-white border border-jaman-border rounded-3xl p-5 shadow-2xs hover:shadow-md hover:border-slate-400 transition-all flex flex-col justify-between space-y-4"
              >
                {/* Top Row: Date & Status Badge */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-base font-black text-jaman-navy">{summary.display_date}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{summary.business_day_id}</span>
                  </div>

                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    isClosed
                      ? 'bg-slate-100 text-slate-700 border border-slate-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {isClosed ? '✓ CLOSED' : '🟢 ACTIVE'}
                  </span>
                </div>

                {/* Net Sales & Orders Count */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Total Billed (incl. GST)
                  </span>
                  <div className="text-2xl font-black font-mono text-jaman-navy">
                    {formatINR(summary.net_sales)}
                  </div>
                  <span className="text-xs font-bold text-emerald-600 block">
                    ● {summary.completed_orders} of {summary.total_orders} Orders Billed
                  </span>
                </div>

                {/* Tender Breakdown Mini-Row */}
                <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-jaman-cream rounded-2xl text-[11px] border border-jaman-border/60">
                  <div>
                    <span className="text-slate-400 text-[9px] block uppercase">Cash</span>
                    <strong className="font-mono text-slate-800">{formatINR(summary.cash_sales)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] block uppercase">UPI</span>
                    <strong className="font-mono text-slate-800">{formatINR(summary.upi_sales)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] block uppercase">Card</span>
                    <strong className="font-mono text-slate-800">{formatINR(summary.card_sales)}</strong>
                  </div>
                </div>

                {/* Footer & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-400">
                    {isClosed ? `Closed: ${closedTime}` : 'Active'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className="px-3.5 py-1.5 bg-jaman-cream hover:bg-jaman-navy hover:text-white text-jaman-navy border border-jaman-border rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <span>View Day</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDay && (
        <PosBusinessDayDetailModal
          businessDay={selectedDay}
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* Day Orders Modal */}
      {selectedDay && (
        <PosDayOrdersModal
          businessDay={selectedDay}
          isOpen={isOrdersModalOpen}
          onClose={() => setIsOrdersModalOpen(false)}
        />
      )}

      {/* Close Day Modal */}
      {selectedDay && (
        <PosCloseDayModal
          businessDay={selectedDay}
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onClosedSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
};
