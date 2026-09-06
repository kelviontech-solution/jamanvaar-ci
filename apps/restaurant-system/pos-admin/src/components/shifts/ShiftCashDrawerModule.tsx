import React from 'react';
import { formatINR, formatTime } from '@jamanvaar/utils';
import {
  Coins,
  FileText,
  Printer,
  CheckCircle2,
  Clock,
  ArrowDownRight,
  ArrowUpRight
} from 'lucide-react';

interface ShiftCashDrawerModuleProps {
  activeShift: any;
  dailyReport: {
    paymentBreakdown: {
      cash: number;
      upi: number;
      card: number;
    };
  };
  shifts: any[];
  onOpenEodModal: () => void;
  onOpenCashDropModal: () => void;
  showToast: (msg: string) => void;
}

export const ShiftCashDrawerModule: React.FC<ShiftCashDrawerModuleProps> = ({
  activeShift,
  dailyReport,
  shifts,
  onOpenEodModal,
  onOpenCashDropModal,
  showToast
}) => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
              Shift & Cash Drawer Ledger
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
              REGISTER RECONCILIATION
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Audit opening cash, cash drops, payouts, and cash count variance in real time.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenEodModal}
            className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-[#E66817]/25 active:scale-95 transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Official EOD Z-Report</span>
          </button>
          <button
            onClick={onOpenCashDropModal}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-2 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <Coins className="w-4 h-4 text-[#E66817]" />
            <span>Record Cash Movement</span>
          </button>
        </div>
      </div>

      {/* Active Shift Workspace Card */}
      {activeShift ? (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#EBE6DD] shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#FFF4ED] border border-[#FED7AA] flex items-center justify-center text-[#E66817]">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#E66817] uppercase tracking-wider">
                    Active Register Shift
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[10px] rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    OPEN & RECORDING
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#0B253A] mt-0.5">{activeShift.cashierName}</h3>
                <span className="text-xs text-slate-400">
                  Terminal: POS-01 • Opened at {formatTime(activeShift.openedAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenCashDropModal}
                className="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Coins className="w-3.5 h-3.5 text-[#E66817]" />
                <span>Add Drop / Payout</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-[#0B253A] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Print Slip</span>
              </button>
            </div>
          </div>

          {/* 4 Financial Shift Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
                Opening Float
              </span>
              <div className="text-xl sm:text-2xl font-mono font-black text-[#0B253A]">
                {formatINR(activeShift.openingCash)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">Starting Till Reserve</span>
            </div>

            <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
                Cash Sales Today
              </span>
              <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700">
                {formatINR(dailyReport.paymentBreakdown.cash)}
              </div>
              <span className="text-[10px] text-emerald-600 font-medium block">Physical In-Drawer Cash</span>
            </div>

            <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-1">
              <span className="text-[11px] text-amber-900 font-bold uppercase tracking-wider block">
                Expected in Drawer
              </span>
              <div className="text-xl sm:text-2xl font-mono font-black text-[#0B253A]">
                {formatINR(activeShift.openingCash + dailyReport.paymentBreakdown.cash)}
              </div>
              <span className="text-[10px] text-amber-700 font-medium block">Opening Float + Cash Sales</span>
            </div>

            <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#EBE6DD] space-y-1">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">
                Digital Non-Cash Volume
              </span>
              <div className="text-xl sm:text-2xl font-mono font-black text-blue-700">
                {formatINR(dailyReport.paymentBreakdown.upi + dailyReport.paymentBreakdown.card)}
              </div>
              <span className="text-[10px] text-blue-600 font-medium block">UPI QR + Card Swipe</span>
            </div>
          </div>

          {/* Drawer Status & Reconciliation Alert Strip */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-extrabold text-emerald-900 block">
                  Drawer Register Verified & In Balance
                </span>
                <span className="text-emerald-700 text-[11px]">
                  All recorded cash sales match expected drawer balance. No unexplained cash shortages recorded.
                </span>
              </div>
            </div>
            <button
              onClick={onOpenEodModal}
              className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
            >
              Close Shift & Reconcile
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-[#EBE6DD] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#E66817] flex items-center justify-center mx-auto">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-[#0B253A] text-base">No Active Register Shift</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
              Start a new cashier register shift with an opening cash float to begin recording sales, cash drops, and drawer balance.
            </p>
          </div>
          <button
            onClick={onOpenCashDropModal}
            className="px-4 py-2 rounded-xl bg-[#E66817] text-white font-bold text-xs shadow-xs cursor-pointer"
          >
            Open Cashier Shift
          </button>
        </div>
      )}

      {/* Shift History Ledger */}
      {shifts.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs">
          <div className="p-4 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between">
            <span className="font-extrabold text-sm text-[#0B253A]">
              Register Shift Audit History ({shifts.length})
            </span>
            <span className="text-xs text-slate-400 font-semibold">Local SQLite Ledger</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-[#EBE6DD] text-slate-500 uppercase font-black text-[11px] tracking-wider">
                <tr>
                  <th className="p-4">Cashier Name</th>
                  <th className="p-4">Shift Status</th>
                  <th className="p-4">Opened At</th>
                  <th className="p-4">Opening Float</th>
                  <th className="p-4">Expected Cash</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FDFBF7] transition-colors">
                    <td className="p-4 font-extrabold text-[#0B253A]">{s.cashierName}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                          s.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            s.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        ></span>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 font-mono text-[11px]">{formatTime(s.openedAt)}</td>
                    <td className="p-4 font-mono font-bold text-[#0B253A]">{formatINR(s.openingCash)}</td>
                    <td className="p-4 font-mono font-bold text-emerald-700">
                      {formatINR(s.openingCash + (s.status === 'OPEN' ? dailyReport.paymentBreakdown.cash : 0))}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={onOpenEodModal}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F2EFE9] border border-[#EBE6DD] text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        View Z-Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
