import React, { useMemo, useState } from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { FoodReadyItem } from '@jamanvaar/types';
import {
  Flame,
  Check,
  Clock,
  CheckCircle2,
  ChefHat,
  ArrowRight,
  Sparkles,
  Users, Search
} from 'lucide-react';

interface CaptainFoodReadyViewProps {
  onOpenTableWorkspace: (tableNumber: string) => void;
}

export const CaptainFoodReadyView: React.FC<CaptainFoodReadyViewProps> = ({
  onOpenTableWorkspace
}) => {
  const {
    foodReadyItems,
    kots,
    tables,
    markItemServed,
    markEntireKotServed
  } = useCaptainStore();
  const [search, setSearch] = useState('');

  const activeFoodReady = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return foodReadyItems.filter((fr) => !fr.isServed && (!q || [fr.tableNumber, fr.dishName, fr.kotNumber, fr.station,
      kots.find(k => k.id === fr.kotId)?.tokenNumber].some(value => value?.toLowerCase().includes(q))));
  }, [foodReadyItems, kots, search]);

  // Group items by Table Number
  const groupedByTable = useMemo(() => {
    const groups: { [tbl: string]: FoodReadyItem[] } = {};
    activeFoodReady.forEach((fr) => {
      const t = fr.tableNumber || 'Floor';
      if (!groups[t]) groups[t] = [];
      groups[t].push(fr);
    });
    return groups;
  }, [activeFoodReady]);

  const tableNumbers = Object.keys(groupedByTable);

  return (
    <div className="space-y-5">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-3xl border border-jaman-border shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-emerald-600 fill-emerald-600" />
            <h2 className="text-xl font-black text-jaman-navy">Food Ready for Delivery</h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-0.5 rounded-full">
              {activeFoodReady.length} Dishes Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Deliver ready dishes to diners and mark them served immediately to update POS and KDS.
          </p>
        </div>

        {activeFoodReady.length > 0 && (
          <span className="text-xs font-bold text-slate-500 bg-jaman-cream border border-jaman-border px-3 py-1.5 rounded-xl self-start sm:self-auto">
            {tableNumbers.length} Tables Waiting for Food
          </span>
        )}
      </div>

      <div className="relative max-w-xl"><Search className="absolute top-3 left-3 w-4 h-4 text-slate-500" /><input aria-label="Search ready food" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search table, token, dish or station…" className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-jaman-border bg-white text-sm" /></div>
      {/* Grouped Table Cards List */}
      {tableNumbers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16 md:pb-6">
          {tableNumbers.map((tableNum) => {
            const items = groupedByTable[tableNum];
            const tableObj = tables.find((t) => t.tableNumber === tableNum);
            const totalDishes = items.reduce((sum, it) => sum + (it.quantity || 1), 0);

            // Calculate oldest ready item elapsed minutes
            const oldestTime = items.reduce((oldest, it) => {
              const t = new Date(it.readyAt || Date.now()).getTime();
              return t < oldest ? t : oldest;
            }, Date.now());
            const elapsedMins = Math.max(1, Math.round((Date.now() - oldestTime) / 60000));

            return (
              <div
                key={tableNum}
                className="bg-white rounded-3xl border-2 border-emerald-500 ring-2 ring-emerald-500/20 p-5 space-y-4 shadow-sm flex flex-col justify-between"
              >
                {/* Table Header */}
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-jaman-navy">TABLE {tableNum}</span>
                        <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <Flame className="w-3 h-3 fill-white" />
                          <span>READY</span>
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-bold block mt-0.5">
                        {(tableObj as any)?.section || tableObj?.zone || 'Main Dining'} • {tableObj?.currentGuests || 2} Guests
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-xl">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Ready {elapsedMins}m ago</span>
                    </div>
                  </div>

                  {/* Dishes in this table */}
                  <div className="mt-4 space-y-2">
                    {items.map((it) => (
                      <div
                        key={it.id}
                        className="p-3 rounded-2xl bg-jaman-cream border border-jaman-border flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs font-mono shrink-0">
                            {it.quantity}×
                          </div>
                          <div>
                            <span className="font-extrabold text-xs text-jaman-navy block">
                              {it.dishName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {it.station || 'Kitchen'} • {it.kotNumber || 'KOT'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => markItemServed(it.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-black text-xs shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 shrink-0"
                          title="Mark this single dish as delivered"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Deliver</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Delivery Action */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      items.forEach((it) => markItemServed(it.id));
                    }}
                    className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{search.trim() ? 'DELIVER SHOWN READY ITEMS' : 'DELIVER ALL READY ITEMS'} ({items.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenTableWorkspace(tableNum)}
                    className="w-full py-2 px-3 rounded-xl bg-jaman-cream hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors text-center cursor-pointer"
                  >
                    View Table {tableNum} Workspace
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-jaman-border space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-jaman-navy">{search.trim() ? 'No ready food matches your search' : 'All Food Delivered & Served!'}</h3>
          <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
            The kitchen stations have no pending ready dishes. New food ready notifications will pop up automatically.
          </p>
        </div>
      )}
    </div>
  );
};
