import React from 'react';
import {
  IndianRupee,
  ShoppingBag,
  TrendingUp,
  CreditCard,
  CheckCircle2,
  ReceiptText
} from 'lucide-react';
import { formatINR } from '@jamanvaar/utils';

interface PrimaryMetricsGridProps {
  summary: {
    netSales: number;
    ordersCount: number;
    avgOrderValue: number;
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
  };
  periodLabel: string;
}

export const PrimaryMetricsGrid: React.FC<PrimaryMetricsGridProps> = ({
  summary,
  periodLabel
}) => {
  const { netSales, ordersCount, avgOrderValue, paymentBreakdown, orderTypeBreakdown, reconciled } = summary;

  const totalCollections = paymentBreakdown.totalPayments || (paymentBreakdown.cash + paymentBreakdown.upi + (paymentBreakdown.card || 0));

  return (
    <section aria-label="Primary Business Overview" className="space-y-4">
      {/* PRIMARY: Net Sales — the one number an owner opens this dashboard to
          see. Given its own row and roughly double the visual weight of the
          three supporting metrics below, instead of four identically-sized
          cards competing for the same amount of attention. */}
      <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden group">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <IndianRupee className="w-[18px] h-[18px]" />
            </div>
            <span className="text-sm font-medium text-slate-500">
              {periodLabel} total billed (incl. GST)
            </span>
          </div>
          <div className="mt-3 text-4xl sm:text-[40px] font-bold text-jaman-navy tabular-nums tracking-tight leading-none">
            {formatINR(netSales)}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>Recorded sales and payments</span>
          </span>
        </div>
      </div>

      {/* SECONDARY: supporting metrics, visibly demoted — smaller type,
          tighter padding, no gradient accent — so they read as context
          around the primary figure rather than competing with it. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Completed Orders */}
        <div className="rounded-2xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Completed Orders
            </span>
            <ShoppingBag className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-jaman-navy tabular-nums tracking-tight leading-none">
            {ordersCount}
          </div>
          <div className="mt-2 text-xs text-slate-500 truncate">
            {orderTypeBreakdown.dineIn.count} dine-in • {orderTypeBreakdown.takeaway.count} takeaway
          </div>
        </div>

        {/* Average Order Value */}
        <div className="rounded-2xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Average Order (AOV)
            </span>
            <TrendingUp className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-jaman-navy tabular-nums tracking-tight leading-none">
            {formatINR(avgOrderValue)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Net sales ÷ orders</div>
        </div>

        {/* Collections */}
        <div className="rounded-2xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Total Collections
            </span>
            <CreditCard className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-jaman-navy tabular-nums tracking-tight leading-none">
            {formatINR(totalCollections)}
          </div>
          <div className="mt-2 text-xs text-slate-500 truncate">
            Cash <strong className="text-jaman-navy font-semibold tabular-nums">{formatINR(paymentBreakdown.cash)}</strong> • UPI <strong className="text-jaman-navy font-semibold tabular-nums">{formatINR(paymentBreakdown.upi)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
};
