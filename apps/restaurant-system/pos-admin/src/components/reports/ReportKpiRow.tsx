import React from 'react';
import { ArrowUpRight, ArrowDownRight, IndianRupee, ShoppingBag, TrendingUp, Percent } from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';
import type { MetricWithVariance, ReportSummaryMetrics } from './reportDataEngine';

interface ReportKpiRowProps {
  summary: ReportSummaryMetrics;
  periodLabel: string;
  hasCompare: boolean;
}

/** Renders a metric's % change only when there's a real previous value to compare against —
 * MetricWithVariance.diffPercent is already null/undefined-guarded upstream in ReportDataEngine
 * (a zero or missing previous value never produces Infinity/NaN); this trusts that field as-is
 * and never recomputes its own percentage from current/previous. */
function Change({ metric, isPositiveGood = true }: { metric: MetricWithVariance; isPositiveGood?: boolean }) {
  if (metric.diffPercent === undefined || metric.previous === undefined) return null;
  const good = isPositiveGood ? metric.diffPercent >= 0 : metric.diffPercent <= 0;
  const Icon = metric.diffPercent >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(metric.diffPercent)}%
    </span>
  );
}

function Card({ icon: Icon, label, value, metric, isPositiveGood, hasCompare }: {
  icon: React.ElementType; label: string; value: string; metric: MetricWithVariance; isPositiveGood?: boolean; hasCompare: boolean;
}) {
  return (
    <div className="rounded-2xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="mt-2 text-2xl font-bold text-jaman-navy tabular-nums tracking-tight leading-none">{value}</div>
      {hasCompare && (
        <div className="mt-2">
          <Change metric={metric} isPositiveGood={isPositiveGood} />
          {metric.diffPercent === undefined && <span className="text-[11px] text-slate-400">No prior period to compare</span>}
        </div>
      )}
    </div>
  );
}

export const ReportKpiRow: React.FC<ReportKpiRowProps> = ({ summary, periodLabel, hasCompare }) => {
  return (
    <section aria-label="Reports overview KPIs" className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{periodLabel}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={IndianRupee} label="Gross Sales" value={formatINR(summary.grossSales.current)} metric={summary.grossSales} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Net Sales" value={formatINR(summary.netSales.current)} metric={summary.netSales} hasCompare={hasCompare} />
        <Card icon={ShoppingBag} label="Orders" value={String(summary.ordersCount.current)} metric={summary.ordersCount} hasCompare={hasCompare} />
        <Card icon={TrendingUp} label="Average Order Value" value={formatINR(summary.avgOrderValue.current)} metric={summary.avgOrderValue} hasCompare={hasCompare} />
        <Card icon={Percent} label="Discounts" value={formatINR(summary.discountAmount.current)} metric={summary.discountAmount} isPositiveGood={false} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Tax Collected" value={formatINR(summary.totalTax.current)} metric={summary.totalTax} hasCompare={hasCompare} />
        <Card icon={IndianRupee} label="Refunds" value={formatINR(summary.refundsAmount.current)} metric={summary.refundsAmount} isPositiveGood={false} hasCompare={hasCompare} />
        <Card icon={ShoppingBag} label="Cancelled" value={String(summary.cancelledCount.current)} metric={summary.cancelledCount} isPositiveGood={false} hasCompare={hasCompare} />
      </div>
    </section>
  );
};
