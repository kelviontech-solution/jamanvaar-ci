import React, { useState } from 'react';
import { TrendingUp, Clock } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import type { DayRow } from '../reports/reportDataEngine';

interface SalesTrendLineChartProps {
  days: DayRow[];
}

const WIDTH = 640;
const HEIGHT = 180;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

export const SalesTrendLineChart: React.FC<SalesTrendLineChartProps> = ({ days }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalSales = days.reduce((sum, d) => sum + d.netSales, 0);
  const hasActivity = days.some((d) => d.ordersCount > 0);

  const maxSale = Math.max(...days.map((d) => d.netSales), 100);
  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const stepX = days.length > 1 ? plotWidth / (days.length - 1) : 0;

  const points = days.map((d, i) => ({
    x: PADDING_X + i * stepX,
    y: PADDING_TOP + plotHeight - (d.netSales / maxSale) * plotHeight,
    day: d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${PADDING_TOP + plotHeight} L ${points[0].x} ${PADDING_TOP + plotHeight} Z`
    : '';

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-base text-jaman-navy tracking-tight">Sales Trend</h3>
          </div>
          <p className="text-xs text-[#5A6878] mt-0.5 font-medium">Net sales by day for the selected period</p>
        </div>
        {hasActivity && (
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand bg-brand/[0.07] border border-brand/30 px-3 py-1 rounded-xl self-start sm:self-auto">
            <span>Total: {formatINR(totalSales)}</span>
          </div>
        )}
      </div>

      {!hasActivity ? (
        <div className="h-48 sm:h-52 flex flex-col items-center justify-center text-center p-6 bg-jaman-cream/50 rounded-xl border border-dashed border-jaman-border my-3">
          <div className="w-10 h-10 rounded-full bg-brand/[0.07] text-brand flex items-center justify-center mb-2 shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-jaman-navy">No sales recorded in this period</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">The trend line appears once orders exist for at least one day in range.</p>
        </div>
      ) : (
        <div className="pt-6 pb-2">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-44 sm:h-48" preserveAspectRatio="none">
            <line x1={PADDING_X} y1={PADDING_TOP} x2={WIDTH - PADDING_X} y2={PADDING_TOP} stroke="#F1F5F9" strokeWidth={1} />
            <line x1={PADDING_X} y1={PADDING_TOP + plotHeight / 2} x2={WIDTH - PADDING_X} y2={PADDING_TOP + plotHeight / 2} stroke="#F1F5F9" strokeWidth={1} />
            {areaPath && <path d={areaPath} fill="var(--brand, #EF6A0B)" opacity={0.08} />}
            {linePath && <path d={linePath} fill="none" stroke="var(--brand, #EF6A0B)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, idx) => (
              <circle
                key={p.day.dateKey}
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === idx ? 5 : 3}
                fill={hoveredIdx === idx ? 'var(--brand, #EF6A0B)' : '#ffffff'}
                stroke="var(--brand, #EF6A0B)"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>

          {hoveredIdx !== null && (
            <div className="bg-jaman-navy text-white text-[11px] py-1.5 px-2.5 rounded-lg shadow-xl inline-flex flex-col items-start -mt-2">
              <span className="font-bold">{points[hoveredIdx].day.displayDate}</span>
              <span className="tabular-nums">{formatINR(points[hoveredIdx].day.netSales)} · {points[hoveredIdx].day.ordersCount} order{points[hoveredIdx].day.ordersCount === 1 ? '' : 's'}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 px-1 mt-3 border-t border-slate-100 pt-2">
            {days.map((d) => (
              <div key={d.dateKey} className="flex-1 text-center">
                <span className="text-[11px] font-bold text-slate-500 block truncate">{d.displayDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
