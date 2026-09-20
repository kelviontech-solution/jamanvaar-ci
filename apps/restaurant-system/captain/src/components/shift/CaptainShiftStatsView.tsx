import React, { useState, useEffect } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import {
  Timer,
  Users,
  ShoppingBag,
  Flame,
  Receipt,
  CheckCircle2,
  Clock,
  LogOut,
  Award,
  Sparkles
} from 'lucide-react';

export const CaptainShiftStatsView: React.FC = () => {
  const {
    currentCaptain,
    shiftStats,
    activeShiftStartTime,
    tables,
    logout
  } = useCaptainStore();

  const [elapsedMinutes, setElapsedMinutes] = useState(120);

  useEffect(() => {
    if (activeShiftStartTime) {
      const diff = Math.max(1, Math.round((Date.now() - new Date(activeShiftStartTime).getTime()) / 60000));
      setElapsedMinutes(diff);
    }
  }, [activeShiftStartTime]);

  const hours = Math.floor(elapsedMinutes / 60);
  const mins = elapsedMinutes % 60;

  const assignedCount = (currentCaptain?.assignedTableNumbers || ['1', '2', '3', '4', '5', '6', '12', '14']).length;
  const activeOccupied = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length;

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16 md:pb-6">
      {/* Shift Header Card */}
      <div className="bg-jaman-navy text-white p-6 rounded-3xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-jaman-saffron text-white flex items-center justify-center font-black text-2xl shadow-sm">
            {currentCaptain?.name?.charAt(0) || 'R'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black">{currentCaptain?.name || 'Staff'}</h2>
              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                ACTIVE SHIFT
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Floor Captain • Terminal CAPTAIN-01
            </p>
          </div>
        </div>

        {/* Shift Timer */}
        <div className="bg-white/10 p-3 rounded-2xl border border-white/10 flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Clock className="w-4 h-4 text-jaman-saffron" />
            <span>Shift Time:</span>
          </div>
          <span className="text-sm font-black font-mono text-white">
            {hours}h {mins}m
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Tables Served</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {shiftStats.tablesServed}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Today's completed seatings</span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <ShoppingBag className="w-4 h-4 text-jaman-saffron" />
            <span>Orders Taken</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {shiftStats.ordersTaken}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Live order sessions</span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Flame className="w-4 h-4 text-emerald-600" />
            <span>Food Delivered</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {shiftStats.foodServed}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Ready dishes served to tables</span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Receipt className="w-4 h-4 text-purple-600" />
            <span>Bills Requested</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {shiftStats.billsRequested}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Table settlements initiated</span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Award className="w-4 h-4 text-amber-600" />
            <span>Assigned Tables</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {assignedCount}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Tables 1-6, 12, 14 in Zone A</span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-jaman-border shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Timer className="w-4 h-4 text-blue-600" />
            <span>Currently Active</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono text-jaman-navy block">
            {activeOccupied}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold">Seated tables on floor</span>
        </div>
      </div>

      {/* End Shift Action */}
      <div className="p-5 rounded-3xl bg-white border border-jaman-border flex items-center justify-between gap-4">
        <div>
          <h4 className="font-extrabold text-sm text-jaman-navy">Captain Shift Handover</h4>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            End your shift session and transfer active floor assignments to the incoming captain.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (window.confirm('End your shift and sign out? Make sure any active tables have been handed over first.')) {
              logout();
            }
          }}
          className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>End Shift & Sign Out</span>
        </button>
      </div>
    </div>
  );
};
