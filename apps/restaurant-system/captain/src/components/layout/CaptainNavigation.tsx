import React from 'react';
import { useStaffLanguage } from '@jamanvaar/ui';
import { useCaptainStore, selectMyTables } from '../../store/captainStore';
import { captainDb } from '@jamanvaar/database';
import { LayoutGrid, ShoppingBag, Flame, MessageSquare, MoreHorizontal } from 'lucide-react';

interface CaptainNavigationProps {
  activeTab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'REQUESTS' | 'SHIFT' | 'CUSTOMERS';
  onSelectTab: (tab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'REQUESTS' | 'SHIFT' | 'CUSTOMERS') => void;
  onOpenMoreDrawer: () => void;
}

export const CaptainNavigation: React.FC<CaptainNavigationProps> = ({
  activeTab,
  onSelectTab,
  onOpenMoreDrawer
}) => {
  const {t} = useStaffLanguage();
  const {
    tables,
    foodReadyItems,
    messages,
    customerRequests,
    currentCaptain
  } = useCaptainStore();

  const activeFoodReadyCount = foodReadyItems.filter((fr) => !fr.isServed).length;
  const unreadMessagesCount = messages.filter((m) => m.status !== 'RESOLVED').length;
  const pendingRequestsCount = customerRequests.filter((cr) => !cr.isResolved).length;

  const primaryTabs = [
    {
      id: 'TABLES',
      label: 'My Tables',
      icon: LayoutGrid,
      count: selectMyTables(tables, currentCaptain).length,
      isUrgent: false
    },
    {
      id: 'ORDERS',
      label: 'Active Orders',
      icon: ShoppingBag,
      count: captainDb.orders.filter(order => !order.tableReleasedAt && !['DRAFT','CANCELLED','REFUNDED','COMPLETED','SERVED'].includes(order.orderStatus) && tables.some(table => (table.currentOrderId === order.id || table.id === order.tableId) && table.status !== 'AVAILABLE')).length,
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
      <nav className="hidden md:block bg-white border-b border-jaman-border px-4 py-2 shadow-2xs">
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
                  className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer min-h-[44px] ${
                    isActive
                      ? 'bg-jaman-navy text-white shadow-md'
                      : tab.isUrgent
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 animate-pulse hover:bg-emerald-100'
                      : 'bg-jaman-cream text-slate-600 hover:text-jaman-saffron hover:bg-[#FFF4ED] border border-jaman-border'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-jaman-saffron' : tab.isUrgent ? 'text-emerald-600 fill-emerald-600' : 'text-slate-500'
                    }`}
                  />
                  <span>{t(tab.label)}</span>
                  {tab.count > 0 && (
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-jaman-saffron text-white'
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
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer min-h-[44px] ${
              activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT'
                ? 'bg-jaman-navy text-white shadow-md'
                : 'bg-jaman-cream text-slate-600 hover:text-jaman-saffron hover:bg-[#FFF4ED] border border-jaman-border'
            }`}
            title="Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>{t('More Options')}</span>
            {pendingRequestsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile / Tablet Bottom Navigation Bar (Fixed Touch Ergonomics) ──
          paddingBottom adds the device's safe-area inset (notch/home-indicator
          devices) on top of the normal 6px padding, so the row of buttons
          never sits flush against a gesture bar. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-jaman-border px-2 pt-1.5 shadow-lg select-none"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-5 gap-1">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id as any)}
                className={`py-1.5 px-1 min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-jaman-navy text-white shadow-sm'
                    : tab.isUrgent
                    ? 'text-emerald-700 font-bold bg-emerald-50'
                    : 'text-slate-600 hover:bg-jaman-cream'
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-4.5 h-4.5 ${
                      isActive ? 'text-jaman-saffron' : tab.isUrgent ? 'text-emerald-600 fill-emerald-600' : 'text-slate-500'
                    }`}
                  />
                  {tab.count > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-2 text-[11px] font-bold px-1 rounded-full ${
                        isActive
                          ? 'bg-jaman-saffron text-white'
                          : tab.isUrgent
                          ? 'bg-emerald-600 text-white animate-pulse'
                          : 'bg-slate-300 text-slate-800'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold tracking-tight truncate max-w-[60px]">
                  {t(tab.label)}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            type="button"
            onClick={onOpenMoreDrawer}
            className={`py-1.5 px-1 min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT'
                ? 'bg-jaman-navy text-white shadow-sm'
                : 'text-slate-600 hover:bg-jaman-cream'
            }`}
          >
            <div className="relative">
              <MoreHorizontal className={`w-4.5 h-4.5 ${activeTab === 'KOTS' || activeTab === 'REQUESTS' || activeTab === 'SHIFT' ? 'text-jaman-saffron' : 'text-slate-500'}`} />
              {pendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-bold tracking-tight">{t('More Options')}</span>
          </button>
        </div>
      </nav>
    </>
  );
};
