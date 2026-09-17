import React, { useState, useMemo } from 'react';
import { KOTRecord, KOTItem, KOTStatus } from '@jamanvaar/types';
import { db, KOTRepository, AuditRepository } from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';
import { formatTime } from '@jamanvaar/utils';
import { printThermalKotTicket } from '@jamanvaar/ui';
import {
  Flame,
  ChefHat,
  Clock,
  Printer,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  CheckCheck,
  XCircle,
  Utensils,
  Coffee,
  IceCream,
  Timer
} from 'lucide-react';

interface KitchenKotModuleProps {
  showToast: (msg: string) => void;
  onKotUpdated: () => void;
}

export const KitchenKotModule: React.FC<KitchenKotModuleProps> = ({
  showToast,
  onKotUpdated
}) => {
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKotForPrint, setSelectedKotForPrint] = useState<KOTRecord | null>(null);

  // All KOTs from database
  const kots: KOTRecord[] = db.kots || [];

  // Filtered KOTs
  const filteredKots = useMemo(() => {
    return kots.filter((kot) => {
      // Station filter
      if (stationFilter !== 'ALL' && kot.station !== stationFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (kot.status !== 'PREPARING' && (kot.status as any) !== 'NEW') return false;
      } else if (statusFilter === 'READY') {
        if (kot.status !== 'READY') return false;
      } else if (statusFilter === 'SERVED') {
        if (kot.status !== 'SERVED') return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKotNum = kot.kotNumber.toLowerCase().includes(q);
        const matchTable = kot.tableNumber?.toLowerCase().includes(q);
        const matchToken = kot.tokenNumber.toLowerCase().includes(q);
        const matchItem = kot.items.some((it) => it.name.toLowerCase().includes(q));
        if (!matchKotNum && !matchTable && !matchToken && !matchItem) {
          return false;
        }
      }

      return true;
    });
  }, [kots, stationFilter, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const active = kots.filter((k) => k.status === 'PREPARING' || (k.status as any) === 'NEW').length;
    const ready = kots.filter((k) => k.status === 'READY').length;
    const served = kots.filter((k) => k.status === 'SERVED').length;
    const totalItems = kots
      .filter((k) => k.status === 'PREPARING')
      .reduce((acc, k) => acc + k.items.reduce((s, it) => s + it.quantity, 0), 0);

    return { active, ready, served, totalItems };
  }, [kots]);

  const handleUpdateStatus = (kotId: string, newStatus: KOTStatus) => {
    const updated = KOTRepository.updateKOTStatus(kotId, newStatus);
    if (updated) {
      AuditRepository.log({
        action: 'KOT_STATUS_UPDATED',
        category: 'ORDER',
        details: `KOT ${updated.kotNumber} marked ${newStatus}`,
        username: 'Kitchen Display'
      });
      // Broadcast so POS's own Kitchen Orders view and KDS reflect this
      // change instead of silently disagreeing about the same ticket.
      lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: updated.id, status: newStatus });
      onKotUpdated();
      showToast(`KOT ${updated.kotNumber} marked as ${newStatus}`);
    }
  };

  // Helper for elapsed minutes
  const getElapsedMinutes = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none">
      
      {/* Header & Quick Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
              Kitchen Display & KOT Station Queue
            </h1>
            <span className="bg-orange-100 text-jaman-saffron font-black text-xs px-2.5 py-0.5 rounded-full border border-orange-200">
              LIVE KOT RADAR
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Real-time kitchen station routing, cook timers, ticket status progression, and KOT reprints.
          </p>
        </div>

      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cooking Now</span>
            <span className="w-2.5 h-2.5 rounded-full bg-jaman-saffron animate-pulse"></span>
          </div>
          <div className="text-2xl font-black text-jaman-saffron font-mono">
            {stats.active} Tickets
          </div>
          <span className="text-[10px] text-slate-500 font-bold block">
            {stats.totalItems} dishes being prepared
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Ready For Pickup</span>
          <div className="text-2xl font-black text-emerald-900 font-mono">
            {stats.ready} Tickets
          </div>
          <span className="text-[10px] text-emerald-700 font-bold block">
            Awaiting Captain delivery
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Served Today</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">
            {stats.served} Tickets
          </div>
          <span className="text-[10px] text-slate-500 font-bold block">
            Completed kitchen tickets
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-jaman-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Avg Cook Time</span>
          <div className="text-2xl font-black text-blue-700 font-mono">
            14 Min
          </div>
          <span className="text-[10px] text-blue-600 font-bold block">
            Optimal kitchen pacing
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-2xl border border-jaman-border shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Station Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Kitchen Stations', icon: ChefHat },
              { id: 'Main Kitchen', label: '🍲 Main Kitchen', icon: Utensils },
              { id: 'Tandoor', label: '🔥 Tandoor & Breads', icon: Flame },
              { id: 'Bar', label: '🍹 Beverages & Bar', icon: Coffee },
              { id: 'Dessert', label: '🍨 Dessert Station', icon: IceCream }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStationFilter(st.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  stationFilter === st.id
                    ? 'bg-jaman-navy text-white shadow-xs'
                    : 'text-slate-600 hover:bg-[#F8F6F0]'
                }`}
              >
                <span>{st.label}</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search KOT, table, dish..."
              className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
            />
          </div>
        </div>

        {/* Status Filter Sub-Bar */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-bold uppercase text-[10px]">Filter Status:</span>
          {[
            { id: 'ACTIVE', label: `🔥 Cooking (${stats.active})` },
            { id: 'READY', label: `✓ Ready for Table (${stats.ready})` },
            { id: 'SERVED', label: `🚀 Served (${stats.served})` },
            { id: 'ALL', label: `📋 All Tickets (${kots.length})` }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === st.id
                  ? 'bg-jaman-saffron text-white shadow-2xs'
                  : 'bg-jaman-cream text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* KOT Cards Grid */}
      {filteredKots.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-jaman-border shadow-2xs space-y-3 max-w-lg mx-auto my-6">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200/60 shadow-xs">
            <ChefHat className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-black text-base text-jaman-navy">Your Kitchen is Clear</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No active KOT tickets are waiting right now for the selected station or status.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKots.map((kot) => {
            const elapsed = getElapsedMinutes(kot.createdAt);
            const isLate = elapsed > 20;
            const isWarning = elapsed > 10 && !isLate;

            return (
              <div
                key={kot.id}
                className={`bg-white rounded-3xl border-2 p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                  kot.status === 'READY'
                    ? 'border-emerald-400 bg-emerald-50/10'
                    : kot.status === 'SERVED'
                    ? 'border-slate-200 opacity-70'
                    : isLate
                    ? 'border-rose-400 ring-2 ring-rose-200'
                    : isWarning
                    ? 'border-amber-400'
                    : 'border-jaman-border hover:border-slate-300'
                }`}
              >
                {/* KOT Card Top Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs font-mono ${
                      kot.tableNumber ? 'bg-jaman-navy text-white' : 'bg-purple-700 text-white'
                    }`}>
                      {kot.tableNumber ? `T-${kot.tableNumber}` : `#${kot.tokenNumber}`}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-jaman-navy">{kot.kotNumber}</span>
                        <span className="text-[10px] font-bold text-slate-400">#{kot.tokenNumber}</span>
                      </div>
                      <span className="text-[10px] font-bold text-jaman-saffron block uppercase">
                        {kot.station || 'Main Kitchen'}
                      </span>
                    </div>
                  </div>

                  {/* Cook Timer */}
                  <div className="text-right">
                    <div className={`flex items-center gap-1 font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                      kot.status === 'READY'
                        ? 'bg-emerald-100 text-emerald-900'
                        : isLate
                        ? 'bg-rose-100 text-rose-800 animate-pulse'
                        : isWarning
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      <Timer className="w-3 h-3" />
                      <span>{elapsed}m</span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                      {formatTime(kot.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Order-level Chef Note (distinct from per-item specialInstructions) */}
                {kot.orderNotes && (
                  <div className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
                    ⚡ Note: {kot.orderNotes}
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-2 text-xs divide-y divide-slate-100">
                  {kot.items.map((it, idx) => (
                    <div key={idx} className="pt-1.5 space-y-1">
                      <div className="flex items-center justify-between font-black text-sm text-jaman-navy">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-jaman-cream border border-jaman-border flex items-center justify-center font-mono text-xs text-jaman-saffron">
                            {it.quantity}x
                          </span>
                          <span>{it.name}</span>
                        </div>
                      </div>

                      {/* Special Instructions & Modifiers */}
                      {it.specialInstructions && (
                        <div className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md inline-block">
                          ⚡ Note: {it.specialInstructions}
                        </div>
                      )}
                      {it.modifiers && it.modifiers.length > 0 && (
                        <div className="text-[10px] text-slate-500 font-medium pl-8">
                          + {it.modifiers.map((m) => m.optionName).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Card Footer Details */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <div>
                    <span>Server: <strong>{kot.serverName || kot.cashierName}</strong></span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">
                    Order #{kot.orderNumber}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center gap-2">
                  {kot.status === 'PREPARING' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'READY')}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Ready</span>
                    </button>
                  )}

                  {kot.status === 'READY' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'SERVED')}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Mark Served</span>
                    </button>
                  )}

                  {kot.status === 'SERVED' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'PREPARING')}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                    >
                      <span>Re-open KOT</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      showToast(`Printing KOT #${kot.kotNumber || kot.id.slice(-6)} ticket...`);
                      printThermalKotTicket(kot, '80mm');
                    }}
                    className="px-3 py-2 bg-jaman-cream hover:bg-[#FFF4ED] border border-jaman-border text-jaman-navy font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Print</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
