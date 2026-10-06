import React, { useState } from 'react';
import { BarChart3, Flame, Clock } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';

interface HourlySalesEntry {
  hour: string;
  sales: number;
  ordersCount: number;
}

interface HourlySalesChartProps {
  hourlySales: HourlySalesEntry[];
  peakHours: {
    peakHour: string;
    peakSales?: number;
    peakOrders?: number;
    peakDay?: string;
  };
}

export const HourlySalesChart: React.FC<HourlySalesChartProps> = ({
  hourlySales,
  peakHours
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalDaySales = hourlySales.reduce((sum, h) => sum + h.sales, 0);
  const maxSale = Math.max(...hourlySales.map((item) => item.sales), 1000);

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      {/* Header with Title & Peak Hour Highlight */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-base text-jaman-navy tracking-tight">
              Hourly Sales Velocity
            </h3>
          </div>
          <p className="text-xs text-[#5A6878] mt-0.5 font-medium">
            Track revenue movement throughout operating hours
          </p>
        </div>

        {totalDaySales > 0 ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand bg-brand/[0.07] border border-brand/30 px-3 py-1 rounded-xl self-start sm:self-auto">
            <Flame className="w-3.5 h-3.5 fill-brand" />
            <span>Peak: {peakHours.peakHour}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl self-start sm:self-auto">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>9:00 AM – 11:00 PM</span>
          </div>
        )}
      </div>

      {/* Chart Canvas / Empty State */}
      {totalDaySales === 0 ? (
        <div className="h-48 sm:h-52 flex flex-col items-center justify-center text-center p-6 bg-jaman-cream/50 rounded-xl border border-dashed border-jaman-border my-3">
          <div className="w-10 h-10 rounded-full bg-brand/[0.07] text-brand flex items-center justify-center mb-2 shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-jaman-navy">No sales recorded yet today</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            Orders punched at POS terminals, captain tablets, or QR codes will automatically populate this revenue velocity curve.
          </p>
        </div>
      ) : (
        <div className="pt-6 pb-2">
          {/* Bar Chart Area */}
          <div className="h-44 sm:h-48 flex items-end gap-1.5 sm:gap-2 px-1 relative">
            {/* Horizontal Guide Lines */}
            <div className="absolute inset-x-0 top-0 border-t border-slate-100 pointer-events-none" />
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-100/60 pointer-events-none" />

            {hourlySales.map((h, idx) => {
              const heightPercent = h.sales > 0 ? Math.max(12, Math.round((h.sales / maxSale) * 100)) : 6;
              const isHovered = hoveredIdx === idx;
              const isPeak = h.hour.includes(peakHours.peakHour.split(' ')[0]) && h.sales > 0;

              return (
                <div
                  key={h.hour}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                >
                  {/* Floating Tooltip */}
                  {isHovered && (
                    <div className="absolute -top-12 z-20 bg-jaman-navy text-white text-[11px] py-1.5 px-2.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none flex flex-col items-center animate-in fade-in zoom-in-95 duration-150">
                      <span className="tabular-nums font-bold">{formatINR(h.sales)}</span>
                      <span className="text-[11px] text-slate-500">{h.ordersCount} {h.ordersCount === 1 ? 'order' : 'orders'}</span>
                      <div className="w-2 h-2 bg-jaman-navy rotate-45 -mb-1 mt-0.5" />
                    </div>
                  )}

                  {/* The Bar */}
                  <div
                    style={{ height: `${heightPercent}%`, ['--i' as string]: idx } as React.CSSProperties}
                    className={`jv-bar w-full rounded-t-md transition-colors duration-200 ${
                      h.sales > 0
                        ? isPeak
                          ? 'bg-brand shadow-sm shadow-brand/20 group-hover:brightness-110'
                          : isHovered
                          ? 'bg-brand'
                          : 'bg-jaman-navy group-hover:bg-jaman-darkBorder'
                        : 'bg-slate-100 group-hover:bg-slate-200'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-Axis Hour Labels */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-1 mt-2 border-t border-slate-100 pt-2">
            {hourlySales.map((h) => (
              <div key={h.hour} className="flex-1 text-center">
                <span className="text-[11px] font-bold text-slate-500 block truncate">
                  {h.hour.replace(' ', '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart Footer with Velocity Summary */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#5A6878]">
        <span className="font-medium">
          Total Today: <strong className="text-jaman-navy tabular-nums font-bold">{formatINR(totalDaySales)}</strong>
        </span>
        <span className="text-[11px] text-slate-500 font-medium">
          Active Operating Window: 9:00 AM – 11:00 PM
        </span>
      </div>
    </div>
  );
};
