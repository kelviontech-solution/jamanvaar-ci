import React from 'react';
import { useCaptainStore } from '../../store/captainStore';
import {
  LayoutGrid,
  ShoppingBag,
  Flame,
  MessageSquare,
  MoreHorizontal,
  ChefHat,
  Bell
} from 'lucide-react';

interface CaptainNavigationProps {
  activeTab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'REQUESTS' | 'SHIFT';
  onSelectTab: (tab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'REQUESTS' | 'SHIFT') => void;
  onOpenMoreDrawer: () => void;
}

export const CaptainNavigation: React.FC<CaptainNavigationProps> = ({
  activeTab,
  onSelectTab,
  onOpenMoreDrawer
}) => {
  const {
    tables,
    foodReadyItems,
    messages,
    customerRequests,
    kots
  } = useCaptainStore();

  const activeFoodReadyCount = foodReadyItems.filter((fr) => !fr.isServed).length;
  const unreadMessagesCount = messages.filter((m) => m.status !== 'RESOLVED').length;
  const pendingRequestsCount = customerRequests.filter((cr) => !cr.isResolved).length;

  const primaryTabs = [
    {
      id: 'TABLES',
      label: 'My Tables',
      icon: LayoutGrid,
      count: tables.length,
      isUrgent: false
    },
    {
      id: 'ORDERS',
      label: 'Active Orders',
      icon: ShoppingBag,
      count: tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length,
      isUrgent: false
    },
    {
      id: 'FOOD_READY',
      label: 'Food Ready',
      icon: Flame,
      count: activeFoodReadyCount,
      isUrgent: activeFoodReadyCount > 0
    },
    {
      id: 'MESSAGES',
      label: 'Messages',
      icon: MessageSquare,
      count: unreadMessagesCount,
      isUrgent: false
    }
  ];

  return (
    <>
      {/* ── Desktop / Tablet Top Navigation Bar ── */}
      <nav className="hidden md:block bg-white border-b border-[#EBE6DD] px-4 py-2 sticky top-[53px] z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Primary 4 Tabs */}
          <div className="flex items-center gap-2">
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id as any)}
                  className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shrink-0 cursor-pointer min-h-[44px] ${
                    isActive
                      ? 'bg-[#0B253A] text-white shadow-md'
                      : tab.isUrgent
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 animate-pulse hover:bg-emerald-100'
                      : 'bg-[#FAF7F2] text-slate-600 hover:text-[#E66817] hover:bg-[#FFF4ED] border border-[#EBE6DD]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-[#E66817]' : tab.isUrgent ? 'text-emerald-600 fill-emerald-600' : 'text-slate-500'
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-black ${
                        isActive
                          ? 'bg-[#E66817] text-white'
                          : tab.isUrgent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* More Drawer Trigger */}
          <button
            type="button"
            onClick={onOpenMoreDrawer}
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shrink-0 cursor-pointer min-h-[44px] ${
              activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT'
                ? 'bg-[#0B253A] text-white shadow-md'
                : 'bg-[#FAF7F2] text-slate-600 hover:text-[#E66817] hover:bg-[#FFF4ED] border border-[#EBE6DD]'
            }`}
            title="Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>More Options</span>
            {pendingRequestsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile / Tablet Bottom Navigation Bar (Fixed Touch Ergonomics) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#EBE6DD] px-2 py-1.5 shadow-lg select-none">
        <div className="grid grid-cols-5 gap-1">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id as any)}
                className={`py-1.5 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0B253A] text-white shadow-sm'
                    : tab.isUrgent
                    ? 'text-emerald-700 font-bold bg-emerald-50'
                    : 'text-slate-600 hover:bg-[#FAF7F2]'
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-4.5 h-4.5 ${
                      isActive ? 'text-[#E66817]' : tab.isUrgent ? 'text-emerald-600 fill-emerald-600' : 'text-slate-500'
                    }`}
                  />
                  {tab.count > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-2 text-[9px] font-black px-1 rounded-full ${
                        isActive
                          ? 'bg-[#E66817] text-white'
                          : tab.isUrgent
                          ? 'bg-emerald-600 text-white animate-pulse'
                          : 'bg-slate-300 text-slate-800'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold tracking-tight truncate max-w-[60px]">
                  {tab.label.replace('Active ', '')}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            type="button"
            onClick={onOpenMoreDrawer}
            className={`py-1.5 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT'
                ? 'bg-[#0B253A] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#FAF7F2]'
            }`}
          >
            <div className="relative">
              <MoreHorizontal className={`w-4.5 h-4.5 ${activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT' ? 'text-[#E66817]' : 'text-slate-500'}`} />
              {pendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <span className="text-[10px] font-bold tracking-tight">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
