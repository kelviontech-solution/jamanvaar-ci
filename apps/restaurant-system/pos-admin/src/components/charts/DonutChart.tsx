import React, { useState } from 'react';
import { formatINR } from '@jamanvaar/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  title: string;
  segments: DonutSegment[];
  /** How each segment's value is displayed in the legend and tooltip — money by default. */
  formatValue?: (n: number) => string;
}

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const DonutChart: React.FC<DonutChartProps> = ({ title, segments, formatValue = formatINR }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visibleSegments = segments.filter((s) => s.value > 0);

  return (
    <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col h-full">
      <h3 className="font-bold text-base text-jaman-navy tracking-tight pb-4 border-b border-slate-100">{title}</h3>

      {total === 0 ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center p-6 bg-jaman-cream/50 rounded-xl border border-dashed border-jaman-border my-3">
          <p className="text-sm font-bold text-jaman-navy">No data in this period</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">This breaks down once orders exist for the selected range.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-6 pt-5">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {(() => {
                let offset = 0;
                return visibleSegments.map((s, idx) => {
                  const fraction = s.value / total;
                  const dash = fraction * CIRCUMFERENCE;
                  const el = (
                    <circle
                      key={s.label}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={hoveredIdx === idx ? STROKE + 4 : STROKE}
                      strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                      strokeDashoffset={-offset}
                      opacity={hoveredIdx === null || hoveredIdx === idx ? 1 : 0.35}
                      style={{ transition: 'stroke-width 0.15s, opacity 0.15s' }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                  offset += dash;
                  return el;
                });
              })()}
            </g>
            <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="fill-jaman-navy font-bold" style={{ fontSize: 15 }}>
              {hoveredIdx !== null ? formatValue(visibleSegments[hoveredIdx]?.value ?? 0) : formatValue(total)}
            </text>
            <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
              {hoveredIdx !== null ? visibleSegments[hoveredIdx]?.label : 'Total'}
            </text>
          </svg>

          <div className="flex-1 w-full space-y-2">
            {visibleSegments.map((s, idx) => (
              <div
                key={s.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${hoveredIdx === idx ? 'bg-jaman-cream' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="truncate font-medium text-jaman-navy">{s.label}</span>
                </span>
                <span className="tabular-nums font-bold text-jaman-navy shrink-0">
                  {formatValue(s.value)} <span className="text-slate-500 font-normal">({Math.round((s.value / total) * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
