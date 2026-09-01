import React from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { Flame, Receipt, AlertTriangle, MessageSquare, Bell, Sparkles } from 'lucide-react';

interface CaptainAttentionStripProps {
  onNavigateToTab: (tab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'REQUESTS' | 'SHIFT') => void;
  onFilterTablesByStatus: (status: 'MY_TABLES' | 'ALL_TABLES' | 'OCCUPIED' | 'FOOD_READY' | 'BILL_REQUESTED') => void;
}

export const CaptainAttentionStrip: React.FC<CaptainAttentionStripProps> = ({
  onNavigateToTab,
  onFilterTablesByStatus
}) => {
  const {
    foodReadyItems,
    tables,
    kots,
    messages,
    customerRequests
  } = useCaptainStore();

  const activeFoodReady = foodReadyItems.filter((fr) => !fr.isServed);
  const billRequestedCount = tables.filter((t) => t.status === 'BILL_REQUESTED').length;
  const delayedKotsCount = kots.filter((k) => {
    if (k.status === 'SERVED' || k.status === 'CANCELLED') return false;
    const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
    return elapsedMinutes > 15;
  }).length;
  const unreadMessagesCount = messages.filter((m) => m.status !== 'RESOLVED').length;
  const pendingRequestsCount = customerRequests.filter((cr) => !cr.isResolved).length;

  const totalAttentionItems =
    activeFoodReady.length +
    billRequestedCount +
    delayedKotsCount +
    pendingRequestsCount +
    unreadMessagesCount;

  return (
    <section className="bg-[#FFF8F0] border-b border-[#FDBA74]/40 px-3 sm:px-5 py-2 select-none shadow-2xs">
      <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none">
        {/* Label */}
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#E66817] shrink-0 mr-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Priority Actions:</span>
        </div>

        {/* 1. Food Ready Chip */}
        <button
          type="button"
          onClick={() => onNavigateToTab('FOOD_READY')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
            activeFoodReady.length > 0
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 animate-pulse active:scale-95'
              : 'bg-white hover:bg-slate-50 border border-[#EBE6DD] text-slate-500 hover:text-emerald-700'
          }`}
          title="Dishes ready in kitchen waiting for pickup and delivery"
        >
          <Flame className={`w-3.5 h-3.5 ${activeFoodReady.length > 0 ? 'fill-white text-white' : 'text-slate-400'}`} />
          <span>Food Ready ({activeFoodReady.length})</span>
        </button>

        {/* 2. Bills Requested Chip */}
        <button
          type="button"
          onClick={() => {
            onNavigateToTab('TABLES');
            onFilterTablesByStatus('BILL_REQUESTED');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
            billRequestedCount > 0
              ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-sm shadow-purple-700/20 active:scale-95'
              : 'bg-white hover:bg-slate-50 border border-[#EBE6DD] text-slate-500 hover:text-purple-700'
          }`}
          title="Tables asking for bill and settlement"
        >
          <Receipt className={`w-3.5 h-3.5 ${billRequestedCount > 0 ? 'text-white' : 'text-slate-400'}`} />
          <span>Bills ({billRequestedCount})</span>
        </button>

        {/* 3. Delayed KOTs Chip */}
        <button
          type="button"
          onClick={() => onNavigateToTab('KOTS')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
            delayedKotsCount > 0
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/20 animate-pulse active:scale-95'
              : 'bg-white hover:bg-slate-50 border border-[#EBE6DD] text-slate-500 hover:text-rose-700'
          }`}
          title="Kitchen orders exceeding 15 min preparation time"
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${delayedKotsCount > 0 ? 'text-white' : 'text-slate-400'}`} />
          <span>Delayed KOTs ({delayedKotsCount})</span>
        </button>

        {/* 4. Diner Requests Chip */}
        <button
          type="button"
          onClick={() => onNavigateToTab('REQUESTS')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
            pendingRequestsCount > 0
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-600/20 active:scale-95'
              : 'bg-white hover:bg-slate-50 border border-[#EBE6DD] text-slate-500 hover:text-amber-700'
          }`}
          title="Guest service requests: Water, Extra Plates, Cutlery, Cleaning"
        >
          <Bell className={`w-3.5 h-3.5 ${pendingRequestsCount > 0 ? 'text-white' : 'text-slate-400'}`} />
          <span>Diner Requests ({pendingRequestsCount})</span>
        </button>

        {/* 5. Staff Messages Chip */}
        <button
          type="button"
          onClick={() => onNavigateToTab('MESSAGES')}
          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
            unreadMessagesCount > 0
              ? 'bg-[#0B253A] hover:bg-[#163E5E] text-white shadow-sm active:scale-95'
              : 'bg-white hover:bg-slate-50 border border-[#EBE6DD] text-slate-500 hover:text-[#0B253A]'
          }`}
          title="Staff and Kitchen communications"
        >
          <MessageSquare className={`w-3.5 h-3.5 ${unreadMessagesCount > 0 ? 'text-[#E66817]' : 'text-slate-400'}`} />
          <span>Messages ({unreadMessagesCount})</span>
        </button>
      </div>
    </section>
  );
};
