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
    <section aria-label="Primary Business Overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: Net Sales */}
        <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group">
          {/* Subtle top indicator bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E66817] via-[#F59E0B] to-[#E66817]/40" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider">
                {periodLabel} Net Sales
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center border border-[#FDBA74]/30">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="text-3xl sm:text-[34px] font-black text-[#0B253A] font-mono tracking-tight leading-none">
                {formatINR(netSales)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>{reconciled ? 'Reconciled Single Source' : 'Audited Register'}</span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Authoritative</span>
          </div>
        </div>

        {/* CARD 2: Completed Orders */}
        <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 group-hover:bg-[#0B253A] transition-colors" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider">
                Completed Orders
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#F4EFE6] text-[#0B253A] flex items-center justify-center border border-[#EBE6DD]">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="text-3xl sm:text-[34px] font-black text-[#0B253A] font-mono tracking-tight leading-none">
                {ordersCount}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#5A6878]">
            <span className="font-semibold truncate">
              {orderTypeBreakdown.dineIn.count} dine-in • {orderTypeBreakdown.takeaway.count} takeaway
            </span>
            <span className="text-[11px] text-slate-400 font-mono shrink-0 ml-1">
              {ordersCount > 0 ? `${Math.round((orderTypeBreakdown.dineIn.count / ordersCount) * 100)}% dine` : '0%'}
            </span>
          </div>
        </div>

        {/* CARD 3: Average Order Value */}
        <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 group-hover:bg-blue-600 transition-colors" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider">
                Average Order (AOV)
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="text-3xl sm:text-[34px] font-black text-[#0B253A] font-mono tracking-tight leading-none">
                {formatINR(avgOrderValue)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#5A6878]">
            <span className="font-semibold">Net sales ÷ Orders</span>
            <span className="text-[11px] text-slate-400 font-medium">Per bill basket</span>
          </div>
        </div>

        {/* CARD 4: Collections */}
        <div className="dash-hero-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 group-hover:bg-emerald-600 transition-colors" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider">
                Total Collections
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="text-3xl sm:text-[34px] font-black text-[#0B253A] font-mono tracking-tight leading-none">
                {formatINR(totalCollections)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 truncate">
              Cash: <strong className="text-emerald-800 font-mono">{formatINR(paymentBreakdown.cash)}</strong> • UPI: <strong className="text-blue-800 font-mono">{formatINR(paymentBreakdown.upi)}</strong>
            </span>
            <span className="text-[11px] text-emerald-700 font-bold ml-1 shrink-0">Settled</span>
          </div>
        </div>
      </div>
    </section>
  );
};
