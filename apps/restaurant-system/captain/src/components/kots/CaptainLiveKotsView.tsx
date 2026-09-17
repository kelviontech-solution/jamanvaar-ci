import React, { useState } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { KOT } from '@jamanvaar/types';
import {
  ChefHat,
  Clock,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  Filter,
  Search
} from 'lucide-react';

interface CaptainLiveKotsViewProps {
  onOpenSendMessage: (tableNumber: string) => void;
}

export const CaptainLiveKotsView: React.FC<CaptainLiveKotsViewProps> = ({
  onOpenSendMessage
}) => {
  const { kots, markEntireKotServed } = useCaptainStore();
  const [filter, setFilter] = useState<'ALL' | 'DELAYED' | 'PREPARING' | 'SERVED'>('ALL');
  const [search, setSearch] = useState('');

  const filteredKots = kots.filter((k) => {
    const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
    const isDelayed = elapsedMinutes > 15 && k.status !== 'SERVED' && k.status !== 'CANCELLED';

    if (filter === 'DELAYED' && !isDelayed) return false;
    if (filter === 'PREPARING' && (k.status as string) !== 'PREPARING' && (k.status as string) !== 'COOKING') return false;
    if (filter === 'SERVED' && k.status !== 'SERVED') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        k.kotNumber.toLowerCase().includes(q) ||
        (k.tableNumber || '').toLowerCase().includes(q) ||
        k.items.some((it) => it.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-jaman-border shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-jaman-saffron" />
            <h2 className="text-xl font-black text-jaman-navy">Live KOT Monitor</h2>
            <span className="bg-jaman-cream text-slate-600 text-xs font-black px-2.5 py-0.5 rounded-full border border-jaman-border">
              {kots.length} Tickets
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real-time kitchen order tickets synchronized across Tandoor, Main Kitchen, and Pantry.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'ALL', label: 'All KOTs' },
            { id: 'DELAYED', label: '🔴 Delayed (>15m)' },
            { id: 'PREPARING', label: 'Cooking' },
            { id: 'SERVED', label: 'Served' }
          ].map((flt) => (
            <button
              key={flt.id}
              type="button"
              onClick={() => setFilter(flt.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${
                filter === flt.id
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'
              }`}
            >
              {flt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KOTs Grid */}
      {filteredKots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16 md:pb-6">
          {filteredKots.map((kot) => {
            const elapsedMinutes = Math.max(
              1,
              Math.round((Date.now() - new Date(kot.createdAt).getTime()) / 60000)
            );
            const isDelayed = elapsedMinutes > 15 && kot.status !== 'SERVED' && kot.status !== 'CANCELLED';

            return (
              <div
                key={kot.id}
                className={`bg-white rounded-3xl border-2 p-5 space-y-4 shadow-sm flex flex-col justify-between ${
                  isDelayed
                    ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10'
                    : kot.status === 'SERVED'
                    ? 'border-slate-200 opacity-80'
                    : 'border-jaman-border'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-jaman-navy">
                          KOT #{kot.kotNumber?.slice(-3) || '—'}
                        </span>
                        <span className="bg-jaman-navy text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                          TABLE {kot.tableNumber}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-bold block mt-0.5">
                        Order #{kot.orderNumber?.slice(-4) || '—'}
                      </span>
                    </div>

                    <div
                      className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-xl ${
                        isDelayed
                          ? 'bg-rose-100 text-rose-800 font-black animate-pulse'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{elapsedMinutes}m {isDelayed ? '(Delayed)' : ''}</span>
                    </div>
                  </div>

                  {/* Items List in KOT */}
                  <div className="mt-4 space-y-2">
                    {kot.items.map((it, idx) => (
                      <div
                        key={it.id || idx}
                        className="p-2.5 rounded-xl bg-jaman-cream border border-jaman-border flex items-center justify-between text-xs font-semibold"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono font-black text-jaman-navy">{it.quantity}×</span>
                          <span className="truncate text-slate-800">{it.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">
                          {it.kitchenStation || 'Kitchen'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSendMessage(kot.tableNumber || '')}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] text-jaman-saffron font-black text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Message Kitchen</span>
                  </button>

                  {kot.status !== 'SERVED' && (
                    <button
                      type="button"
                      onClick={() => markEntireKotServed(kot.id)}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Served</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-jaman-border space-y-3">
          <ChefHat className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-lg font-black text-jaman-navy">No KOT Tickets Match</h3>
          <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
            Try switching filters to view all kitchen tickets.
          </p>
        </div>
      )}
    </div>
  );
};
