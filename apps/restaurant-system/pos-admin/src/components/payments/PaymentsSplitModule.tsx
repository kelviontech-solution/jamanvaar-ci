import React from 'react';
import { Order } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  CreditCard,
  CheckCircle2,
  DollarSign,
  QrCode,
  Smartphone,
  TrendingUp,
  Receipt
} from 'lucide-react';

interface PaymentsSplitModuleProps {
  orders: Order[];
  dashPeriodReport: {
    summary: {
      netSales: number;
      paymentBreakdown: {
        cash: number;
        upi: number;
        card: number;
      };
    };
  };
  onSelectOrderDetail: (ord: Order) => void;
  showToast: (msg: string) => void;
}

export const PaymentsSplitModule: React.FC<PaymentsSplitModuleProps> = ({
  orders,
  dashPeriodReport,
  onSelectOrderDetail,
  showToast
}) => {
  const settledOrders = orders.filter((o) => o.paymentStatus === 'SUCCESS');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
              Payments & Split Tenders Ledger
            </h1>
            <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              MULTI-TENDER AUDIT
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Breakdown of Cash, UPI Bharat QR, Card Swipe EDC, and Split-Tender reconciliations across all cashier counters.
          </p>
        </div>
      </div>

      {/* 4 Financial Tender Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <span className="text-[11px] font-black uppercase text-slate-500 block">TOTAL COLLECTIONS</span>
          <div className="text-2xl font-black text-[#0B253A] font-mono">
            {formatINR(dashPeriodReport.summary.netSales)}
          </div>
          <span className="text-[10px] text-slate-500 font-bold block">All Payment Modes Combined</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-500 block">CASH IN DRAWER</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono">
            {formatINR(dashPeriodReport.summary.paymentBreakdown.cash)}
          </div>
          <span className="text-[10px] text-emerald-700 font-bold block">
            {dashPeriodReport.summary.netSales > 0
              ? Math.round((dashPeriodReport.summary.paymentBreakdown.cash / dashPeriodReport.summary.netSales) * 100)
              : 0}
            % of Total Volume
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-500 block">UPI / BHARAT QR</span>
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <div className="text-2xl font-black text-blue-900 font-mono">
            {formatINR(dashPeriodReport.summary.paymentBreakdown.upi)}
          </div>
          <span className="text-[10px] text-blue-700 font-bold block">
            {dashPeriodReport.summary.netSales > 0
              ? Math.round((dashPeriodReport.summary.paymentBreakdown.upi / dashPeriodReport.summary.netSales) * 100)
              : 0}
            % Digital QR Volume
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-slate-500 block">CARD SWIPE EDC</span>
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          </div>
          <div className="text-2xl font-black text-purple-900 font-mono">
            {formatINR(dashPeriodReport.summary.paymentBreakdown.card)}
          </div>
          <span className="text-[10px] text-purple-700 font-bold block">Bank EDC Settlements</span>
        </div>
      </div>

      {/* Split Payment Operational Feature Card */}
      <div className="p-5 bg-gradient-to-r from-[#0B253A] to-[#173A56] rounded-3xl text-white shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#E66817] flex items-center justify-center text-white shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Understanding Split Multi-Tender Payments</h3>
              <p className="text-[11px] text-slate-300">How JAMANVAAR POS handles split payment allocations seamlessly</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black bg-white/10 text-[#FDBA74] border border-white/10">
            Smart Settlement Active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">1. Flexible Allocation</span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              For any bill (e.g. ₹756), the cashier can allocate part of the amount to Cash (e.g. ₹500) and the remaining balance to UPI QR (e.g. ₹256).
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">2. Exact Cash Drawer Math</span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              The Cash portion is strictly recorded in the Cash Drawer Shift Ledger, preventing float discrepancies during end-of-day reconciliation.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] font-bold text-[#FDBA74] uppercase block">3. Itemized Tax Receipt</span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              The printed 80mm/58mm thermal receipt and WhatsApp e-Bill itemize the breakdown clearly: <span className="font-mono text-white">Cash: ₹500 | UPI: ₹256</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-xs">
        <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between">
          <span className="font-black text-xs sm:text-sm text-[#0B253A]">
            Completed Payment Transactions ({settledOrders.length})
          </span>
          <span className="text-xs text-slate-400 font-semibold">Real-Time Sync</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
              <tr>
                <th className="p-4">Order / Invoice</th>
                <th className="p-4">Table / Type</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Total Settled</th>
                <th className="p-4">Payment Method</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {settledOrders.map((ord: Order) => (
                <tr key={ord.id} className="hover:bg-[#FDFBF7] transition-colors">
                  <td className="p-4 font-mono font-black text-sm text-[#0B253A]">
                    #{ord.orderNumber}
                    <span className="text-[10px] text-slate-400 block font-normal">Token: {ord.tokenNumber}</span>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-700 text-[11px] block w-fit">
                      {ord.orderType}
                    </span>
                    {ord.tableNumber && (
                      <span className="text-[10px] text-slate-500 block mt-0.5">Table {ord.tableNumber}</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-700">
                    <span className="font-bold block">{ord.customerName || 'Walk-in Guest'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{ord.customerPhone || 'Counter'}</span>
                  </td>
                  <td className="p-4 font-mono font-black text-sm text-emerald-700">
                    {formatINR(ord.totalAmount)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black ${
                        ord.paymentMethod.includes('CASH')
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : ord.paymentMethod.includes('UPI')
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {ord.paymentMethod.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500 font-mono text-[11px]">
                    {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onSelectOrderDetail(ord)}
                      className="px-3 py-1.5 bg-[#FAF7F2] hover:bg-slate-100 text-[#0B253A] border border-[#EBE6DD] font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      View Bill →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
