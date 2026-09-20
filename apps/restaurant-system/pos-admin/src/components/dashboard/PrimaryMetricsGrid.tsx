import React from 'react';
import {
  DollarSign,
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
      <div className="dash-hero-card rounded-2xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative overflow-hidden group">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-jaman-saffron via-[#F59E0B] to-jaman-saffron/40" />

        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center border border-[#FDBA74]/30">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
            <span className="text-xs font-bold text-[#8C9BAE] uppercase tracking-wider">
              {periodLabel} Total Billed (incl. GST)
            </span>
          </div>
          <div className="mt-3 text-4xl sm:text-[46px] font-black text-jaman-navy font-mono tracking-tight leading-none">
            {formatINR(netSales)}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{reconciled ? 'Reconciled Single Source' : 'Audited Register'}</span>
          </span>
        </div>
      </div>

      {/* SECONDARY: supporting metrics, visibly demoted — smaller type,
          tighter padding, no gradient accent — so they read as context
          around the primary figure rather than competing with it. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Completed Orders */}
        <div className="rounded-xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider">
              Completed Orders
            </span>
            <ShoppingBag className="w-3.5 h-3.5 text-jaman-navy/50" />
          </div>
          <div className="mt-2 text-xl font-black text-jaman-navy font-mono tracking-tight leading-none">
            {ordersCount}
          </div>
          <div className="mt-2 text-[11px] text-[#5A6878] font-medium truncate">
            {orderTypeBreakdown.dineIn.count} dine-in • {orderTypeBreakdown.takeaway.count} takeaway
          </div>
        </div>

        {/* Average Order Value */}
        <div className="rounded-xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider">
              Average Order (AOV)
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600/70" />
          </div>
          <div className="mt-2 text-xl font-black text-jaman-navy font-mono tracking-tight leading-none">
            {formatINR(avgOrderValue)}
          </div>
          <div className="mt-2 text-[11px] text-[#5A6878] font-medium">Net sales ÷ orders</div>
        </div>

        {/* Collections */}
        <div className="rounded-xl p-4 bg-white border border-jaman-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider">
              Total Collections
            </span>
            <CreditCard className="w-3.5 h-3.5 text-emerald-600/70" />
          </div>
          <div className="mt-2 text-xl font-black text-jaman-navy font-mono tracking-tight leading-none">
            {formatINR(totalCollections)}
          </div>
          <div className="mt-2 text-[11px] text-[#5A6878] font-medium truncate">
            Cash <strong className="text-emerald-800 font-mono">{formatINR(paymentBreakdown.cash)}</strong> • UPI <strong className="text-blue-800 font-mono">{formatINR(paymentBreakdown.upi)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
};
