import React, { useState } from 'react';
import { RefreshCw, Calendar, Sparkles } from 'lucide-react';

export type DashboardPeriod = 'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';

interface DashboardHeaderProps {
  currentFilter: DashboardPeriod;
  onFilterChange: (period: DashboardPeriod) => void;
  onRefresh?: () => void;
  dateRangeLabel?: string;
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  '7_DAYS': '7 Days',
  '30_DAYS': '30 Days',
  THIS_MONTH: 'This Month',
  THIS_YEAR: 'This Year',
  CUSTOM: 'Custom'
};

const PERIODS: DashboardPeriod[] = ['TODAY', 'YESTERDAY', '7_DAYS', '30_DAYS', 'THIS_MONTH', 'THIS_YEAR'];

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentFilter,
  onFilterChange,
  onRefresh,
  dateRangeLabel
}) => {
  const [isSpinning, setIsSpinning] = useState(false);

  const handleRefresh = () => {
    setIsSpinning(true);
    if (onRefresh) {
      onRefresh();
    }
    setTimeout(() => setIsSpinning(false), 750);
  };

  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-1">
      {/* Title & Operational Mission Subtitle */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-jaman-navy tracking-tight">
            Restaurant Operations
          </h1>
        </div>
        {dateRangeLabel && (
          <p className="text-sm text-slate-500 mt-0.5">{dateRangeLabel}</p>
        )}
      </div>

      {/* Right Controls: Period Selector & Quick Refresh */}
      <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap sm:flex-nowrap">
        {/* Segmented Filter Pills */}
        <div className="inline-flex items-center bg-white p-1 rounded-2xl border border-jaman-border shadow-xs overflow-x-auto max-w-full">
          {PERIODS.map((period) => {
            const isSelected = currentFilter === period;
            return (
              <button
                key={period}
                type="button"
                onClick={() => onFilterChange(period)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-brand/[0.09] text-brand ring-1 ring-inset ring-brand/40 font-semibold'
                    : 'text-[#4A5568] hover:bg-[#F8F6F0] hover:text-jaman-navy'
                }`}
              >
                {PERIOD_LABELS[period]}
              </button>
            );
          })}
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh dashboard metrics"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-jaman-cream text-jaman-navy border border-jaman-border rounded-xl text-xs font-bold shadow-xs hover:border-[#D8D1C3] transition-all cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${isSpinning ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
};
