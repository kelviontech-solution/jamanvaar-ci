import React, { useState, useMemo } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, KOTRepository } from '@jamanvaar/database';
import { KOTRecord, KOTStatus } from '@jamanvaar/types';
import { sound } from '@jamanvaar/ui';
import { lanMeshSync } from '@jamanvaar/sync';
import {
  ChefHat,
  Clock,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Utensils,
  Sparkles,
  RefreshCw,
  Flame,
  Check
} from 'lucide-react';

export const PosKotView: React.FC = () => {
  const { currentUser, requestManagerOverride } = usePosStore();
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [reprintedKotId, setReprintedKotId] = useState<string | null>(null);

  const kots = db.kots;

  const stations = useMemo(() => {
    const set = new Set<string>();
    kots.forEach((k) => {
      if (k.station) set.add(k.station);
    });
    return Array.from(set);
  }, [kots]);

  const filteredKots = useMemo(() => {
    return kots.filter((k) => {
      if (selectedStation !== 'ALL' && k.station !== selectedStation) return false;
      if (statusFilter === 'ACTIVE' && (k.status === 'SERVED' || k.status === 'CANCELLED')) return false;
      if (statusFilter === 'READY' && k.status !== 'READY') return false;
      if (statusFilter === 'COMPLETED' && k.status !== 'SERVED') return false;
      return true;
    });
  }, [kots, selectedStation, statusFilter]);

  const handleUpdateStatus = (kotId: string, nextStatus: KOTStatus) => {
    KOTRepository.updateKOTStatus(kotId, nextStatus);
    // Broadcast so Restaurant Admin's Kitchen/KOT view and KDS reflect this
    // change instead of silently disagreeing about the same ticket.
    lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId, status: nextStatus });
    if (nextStatus === 'READY' || nextStatus === 'SERVED') {
      sound.play('success');
    }
  };

  const handleReprint = (kotId: string) => {
    sound.play('click');
    setReprintedKotId(kotId);
    setTimeout(() => setReprintedKotId(null), 2000);
  };

  const handleCancelKot = (kot: KOTRecord) => {
    requestManagerOverride(
      'CANCEL_ITEM',
      `Cancel KOT #${kot.kotNumber}`,
      `Cancellation requested for KOT #${kot.kotNumber} (Order #${kot.orderNumber})`,
      (mgr) => {
        KOTRepository.updateKOTStatus(kot.id, 'CANCELLED');
        lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: kot.id, status: 'CANCELLED' });
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-4 sm:p-6 overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-jaman-navy flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-jaman-saffron" />
            <span>Kitchen Orders & KOT Tickets</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time kitchen station routing (Main Kitchen, Tandoor, Bar, Dessert) synchronized with KDS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white border border-jaman-border px-3 py-1.5 rounded-xl shadow-2xs text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>KDS Connected • Live Sync</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        {/* Station Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedStation('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              selectedStation === 'ALL'
                ? 'bg-jaman-navy text-white shadow-xs'
                : 'bg-white border border-jaman-border text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Stations
          </button>
          {stations.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStation(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                selectedStation === st
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'bg-white border border-jaman-border text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 bg-white border border-jaman-border p-1 rounded-xl shadow-2xs">
          {[
            { id: 'ACTIVE', label: 'In Progress' },
            { id: 'READY', label: 'Ready for Service' },
            { id: 'COMPLETED', label: 'Completed' }
          ].map((sf) => (
            <button
              key={sf.id}
              onClick={() => setStatusFilter(sf.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === sf.id
                  ? 'bg-jaman-saffron text-white shadow-xs'
                  : 'text-slate-600 hover:text-jaman-navy'
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {/* KOT Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredKots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredKots.map((kot) => {
              const isPreparing = kot.status === 'PREPARING';
              const isReady = kot.status === 'READY';
              const isServed = kot.status === 'SERVED';
              const isCancelled = kot.status === 'CANCELLED';

              return (
                <div
                  key={kot.id}
                  className={`bg-white border-2 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-all ${
                    isReady
                      ? 'border-emerald-500 bg-emerald-50/20'
                      : isCancelled
                      ? 'border-slate-200 opacity-60 bg-slate-50'
                      : 'border-jaman-border hover:border-slate-400'
                  }`}
                >
                  {/* KOT Header */}
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2.5 mb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-jaman-navy">
                          {kot.kotNumber}
                        </span>
                        <span className="text-[10px] font-bold bg-jaman-saffron/10 text-jaman-saffron px-1.5 py-0.5 rounded border border-jaman-saffron/20">
                          {kot.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{kot.station || 'Kitchen'}</span>
                        <span>•</span>
                        <span>{new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-base text-jaman-navy font-mono">
                        {kot.tableNumber ? `T-${kot.tableNumber}` : `Token #${kot.tokenNumber}`}
                      </span>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{kot.orderType}</div>
                    </div>
                  </div>

                  {/* Order-level Chef Note (distinct from per-item specialInstructions) */}
                  {kot.orderNotes && (
                    <div className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-md mb-2.5">
                      ⚡ Note: {kot.orderNotes}
                    </div>
                  )}

                  {/* KOT Items */}
                  <div className="space-y-2 mb-4 flex-1">
                    {kot.items.map((it, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="flex items-baseline justify-between font-bold text-jaman-navy">
                          <span className="flex-1">{it.name}</span>
                          <span className="w-8 text-right font-black text-sm bg-slate-100 px-1.5 py-0.5 rounded">
                            ×{it.quantity}
                          </span>
                        </div>

                        {it.modifiers && it.modifiers.length > 0 && (
                          <div className="text-[10px] text-slate-500 pl-2">
                            + {it.modifiers.map((m) => m.optionName).join(', ')}
                          </div>
                        )}

                        {it.specialInstructions && (
                          <div className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold mt-0.5">
                            Note: {it.specialInstructions}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* KOT Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleReprint(kot.id)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 text-xs font-bold flex items-center gap-1"
                      title="Reprint KOT Ticket"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{reprintedKotId === kot.id ? 'Printed!' : 'Reprint'}</span>
                    </button>

                    {isPreparing && (
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'READY')}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Ready</span>
                      </button>
                    )}

                    {isReady && (
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'SERVED')}
                        className="flex-1 py-2 px-3 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Mark Served</span>
                      </button>
                    )}

                    {isServed && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Served to Table</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 my-auto bg-white/50 border-2 border-dashed border-slate-200 rounded-3xl p-6">
            <ChefHat className="w-12 h-12 text-slate-300 mb-2 stroke-1" />
            <h4 className="font-bold text-sm text-jaman-navy">No active KOTs</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Newly created orders and dispatched KOTs will stream here in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
