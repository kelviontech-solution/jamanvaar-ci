import React, { useState, useEffect, useRef } from 'react';
import { usePosStore } from '../../store/posStore';
import { BrandHeader, NotificationDrawerModal, sound, useAiAccess, ConnectionBadge } from '@jamanvaar/ui';
import {
  db,
  ShiftRepository,
  NotificationRepository,
  BusinessDayRepository,
  BusinessDayAccountingService,
  BusinessDaySummary
} from '@jamanvaar/database';
import { PosCloseDayModal } from '../days/PosCloseDayModal';
import { BusinessDayService } from '@jamanvaar/business';
import { formatINR } from '@jamanvaar/utils';
import { lanMeshSync } from '@jamanvaar/sync';
import {
  Search,
  Wifi,
  WifiOff,
  Server,
  Printer,
  ChefHat,
  Lock,
  LogOut,
  HelpCircle,
  Clock,
  CircleDollarSign,
  ChevronDown,
  PlusCircle,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Bell,
  Calendar,
  Sparkles,
  User,
  ShieldCheck,
  RotateCcw,
  Check
} from 'lucide-react';

export const PosHeader: React.FC = () => {
  const ai = useAiAccess();
  const {
    currentUser,
    posTerminalId,
    isOnline,
    hardwareStatus,
    toggleNetworkStatus,
    lockTerminal,
    logout,
    setActiveTab,
    setOrderType,
    cart,
    clearCart,
    setIsGlobalSearchOpen,
    setIsShortcutsOpen,
    setIsShiftModalOpen,
    setIsCashDrawerModalOpen,
    setIsPrintQueueOpen,
    setIsChatbotOpen,
    isChatbotOpen
  } = usePosStore();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [newOrderDropdownOpen, setNewOrderDropdownOpen] = useState(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [isBusinessDayPanelOpen, setIsBusinessDayPanelOpen] = useState(false);
  const [isCloseDayModalOpen, setIsCloseDayModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Refs for click outside handling
  const profileRef = useRef<HTMLDivElement>(null);
  const businessDayRef = useRef<HTMLDivElement>(null);
  const newOrderRef = useRef<HTMLDivElement>(null);

  // Subscribe to db mutations
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = db.subscribe(() => setTick((n) => n + 1));
    return unsub;
  }, []);

  // Click Outside & Escape Key Listeners
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileDropdownOpen(false);
      }
      if (businessDayRef.current && !businessDayRef.current.contains(target)) {
        setIsBusinessDayPanelOpen(false);
      }
      if (newOrderRef.current && !newOrderRef.current.contains(target)) {
        setNewOrderDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileDropdownOpen(false);
        setIsBusinessDayPanelOpen(false);
        setNewOrderDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Real KDS mesh connectivity — getConnectedPeers() drops a peer after a
  // missed heartbeat, so this genuinely reflects whether the kitchen
  // display is actually reachable, instead of a permanently-green badge.
  const [kdsConnected, setKdsConnected] = useState(
    lanMeshSync.getConnectedPeers().some((p) => p.role === 'KDS')
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setKdsConnected(lanMeshSync.getConnectedPeers().some((p) => p.role === 'KDS'));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Single authoritative business day summary
  const [dayState, setDayState] = useState<{ day: ReturnType<typeof BusinessDayAccountingService.getActiveBusinessDay>; summary: BusinessDaySummary } | null>(null);
  useEffect(() => {
    // Opening/rolling a business day can write to the database; do it after render, never while another component renders.
    const day = BusinessDayAccountingService.getActiveBusinessDay();
    setDayState({ day, summary: BusinessDayAccountingService.getBusinessDaySummary(day.id) });
  }, [tick]);
  if (!dayState) return null;
  const activeDay = dayState.day;
  const daySummary = dayState.summary;
  const activeShift = ShiftRepository.getActiveShift();
  const unreadNotifsCount = NotificationRepository.getUnreadCount('POS');
  const failedJobsCount = db.printJobs.filter((j) => j.status === 'FAILED').length;
  const isPrinterOffline = !hardwareStatus.printer || failedJobsCount > 0;
  const allSystemsOk = hardwareStatus.localDb && !isPrinterOffline && isOnline;

  // AI badge alerts
  const delayedKotCount = (db.kots || []).filter((k) => {
    if (k.status !== 'PENDING' && k.status !== 'PREPARING') return false;
    const elapsed = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
    return elapsed > 15;
  }).length;
  const lowStockCount = (db.inventoryItems || []).filter(
    (i) => i.currentStock <= i.reorderLevel
  ).length;
  const aiAlertCount = delayedKotCount + lowStockCount;

  const handleStartNewOrder = (type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY') => {
    setNewOrderDropdownOpen(false);
    // An in-progress cart used to be discarded with zero confirmation here,
    // in direct contrast to the cart's own "Clear Cart" button, which
    // correctly asks first.
    if (cart.items.length > 0 && !window.confirm(`Discard the ${cart.items.length} item(s) in the current cart and start a new order?`)) {
      return;
    }
    clearCart();
    setOrderType(type);
    if (type === 'DINE_IN') {
      setActiveTab('TABLES');
    } else {
      setActiveTab('MENU');
    }
  };

  const handleStartNewBusinessDay = () => {
    if (cart.items.length > 0 && !window.confirm(`Discard the ${cart.items.length} item(s) in the current cart and start a new business day?`)) {
      return;
    }
    BusinessDayRepository.openNewBusinessDay(currentUser?.fullName || 'Cashier', 2000);
    setIsBusinessDayPanelOpen(false);
    clearCart();
    setActiveTab('MENU');
  };

  return (
    <header className="w-full h-14 bg-white border border-jaman-border rounded-2xl px-3 sm:px-4 flex items-center justify-between text-jaman-navy select-none shrink-0 z-30 shadow-2xs max-w-full overflow-visible">
      {/* Left: Brand Header & New Order */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <BrandHeader
          app="POS"
          restaurantName={db.restaurant.name}
          outletName={db.outlet.name}
          terminalId={posTerminalId}
          logoHeight={54}
          badgeSize="sm"
        />

        {/* Quick Action: + NEW ORDER Dropdown */}
        <div ref={newOrderRef} className="relative">
          <button
            type="button"
            onClick={() => setNewOrderDropdownOpen((prev) => !prev)}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-jaman-saffron hover:bg-[#C95A12] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-jaman-saffron/20 transition-all active:scale-95 cursor-pointer shrink-0"
            title="Start fresh order"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ New Order</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>

          {newOrderDropdownOpen && (
            <div className="absolute left-0 mt-2 w-52 bg-white border border-jaman-border rounded-2xl shadow-xl p-1.5 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => handleStartNewOrder('DINE_IN')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-jaman-navy cursor-pointer"
              >
                <UtensilsCrossed className="w-4 h-4 text-jaman-saffron" />
                <span>Dine-In (Floor Table)</span>
              </button>
              <button
                type="button"
                onClick={() => handleStartNewOrder('TAKEAWAY')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-jaman-navy cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span>Quick Takeaway</span>
              </button>
              <button
                type="button"
                onClick={() => handleStartNewOrder('DELIVERY')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-jaman-navy cursor-pointer"
              >
                <Bike className="w-4 h-4 text-blue-600" />
                <span>Delivery Order</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search Everything Bar */}
      <div className="flex-1 min-w-[100px] max-w-xs md:max-w-md mx-1.5 sm:mx-3">
        <button
          type="button"
          onClick={() => setIsGlobalSearchOpen(true)}
          className="w-full h-9 sm:h-10 bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border hover:border-jaman-saffron/60 rounded-2xl px-2.5 sm:px-3.5 flex items-center justify-between text-slate-500 text-xs sm:text-sm transition-all shadow-2xs group active:scale-[0.99] cursor-pointer"
          title="Search dishes, SKU, tables, bills, customers"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-jaman-saffron transition-colors shrink-0" />
            <span className="truncate text-xs font-medium">Search dishes, SKU, tables, bills, customers...</span>
          </div>
        </button>
      </div>

      {/* Right: Interactive Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Printer alert — only rendered when something needs attention.
            Healthy printer status now lives inside the profile menu's
            System Health section instead of taking permanent header space. */}
        <ConnectionBadge className="hidden lg:inline-flex" />
        {isPrinterOffline && (
          <button
            type="button"
            onClick={() => setIsPrintQueueOpen(true)}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
            title="Thermal Print Queue & Spooler — printer needs attention"
          >
            <Printer className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden xl:inline text-[11px] font-bold">Printer Offline</span>
            {failedJobsCount > 0 && (
              <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full">
                {failedJobsCount}
              </span>
            )}
          </button>
        )}

        {/* ── AUTHORITATIVE BUSINESS DAY + SHIFT CONTROL (merged) ── */}
        <div ref={businessDayRef} className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setIsBusinessDayPanelOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold transition-colors cursor-pointer shadow-2xs ${
              daySummary.status === 'OPEN'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
            }`}
            title="Business Day & Shift Status — Click to manage"
          >
            <span className={`w-2 h-2 rounded-full ${
              daySummary.status === 'OPEN' ? 'bg-emerald-500' : 'bg-rose-500'
            }`} />
            <span className="font-bold">
              {daySummary.status === 'OPEN' ? 'DAY OPEN' : 'DAY CLOSED'}
            </span>
            <span className="text-slate-400 font-bold">•</span>
            <span className="font-mono text-xs">
              {activeShift ? formatINR(activeShift.totalSales ?? 0) : 'No Shift'}
            </span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {/* Business Day + Shift Popover */}
          {isBusinessDayPanelOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-jaman-border rounded-2xl shadow-2xl p-4 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Accounting Business Day</p>
                  <p className="font-bold text-sm text-jaman-navy">{daySummary.display_date}</p>
                  <span className="text-[11px] font-mono text-slate-400">{daySummary.business_day_id}</span>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  daySummary.status === 'OPEN'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {daySummary.status === 'OPEN' ? 'OPEN' : 'CLOSED'}
                </span>
              </div>

              {/* Day Metrics */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between p-2 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Opened At:</span>
                  <span className="font-bold">{daySummary.opened_at ? new Date(daySummary.opened_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '–'}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Billed (incl. GST):</span>
                  <span className="font-bold text-emerald-700 font-mono">{formatINR(daySummary.net_sales)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Orders:</span>
                  <span className="font-bold font-mono">{daySummary.completed_orders} completed / {daySummary.total_orders} total</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Active Tables:</span>
                  <span className={`font-bold ${
                    db.tables.filter((t) => t.status !== 'AVAILABLE').length > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {db.tables.filter((t) => t.status !== 'AVAILABLE').length} occupied
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-jaman-border pt-2.5 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBusinessDayPanelOpen(false);
                    setActiveTab('DAYS');
                  }}
                  className="w-full py-2 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border text-xs font-bold text-jaman-navy transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>View Day History & Reports</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsBusinessDayPanelOpen(false);
                    setActiveTab('SHIFTS');
                  }}
                  className={`w-full py-2 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeShift
                      ? 'bg-jaman-cream hover:bg-[#F5F0E8] border-jaman-border text-jaman-navy'
                      : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                  }`}
                >
                  <Clock className={`w-3.5 h-3.5 ${activeShift ? 'text-jaman-saffron' : 'text-amber-700'}`} />
                  <span>{activeShift ? `Shift #${activeShift.shiftNumber ?? activeShift.id.slice(-2) ?? '01'} — Open Drawer` : 'Shift Closed — Open New Shift'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsBusinessDayPanelOpen(false);
                    setIsCashDrawerModalOpen(true);
                  }}
                  className="w-full py-2 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border text-xs font-bold text-amber-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CircleDollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>Cash In / Out (Float Adjustment)</span>
                </button>

                {daySummary.status === 'OPEN' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBusinessDayPanelOpen(false);
                      setIsCloseDayModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close Business Day (EOD)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartNewBusinessDay}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Start New Business Day</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          onClick={() => { sound.play('notification'); setIsNotifDrawerOpen(true); }}
          className="relative w-8 h-8 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border text-slate-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
          title="Notifications & System Events"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-xs">
              {unreadNotifsCount}
            </span>
          )}
        </button>

        {/* Quick Help — the icon this button uses sat imported but unused
            for a while; this is a real touch-only orientation popover for a
            new cashier, not keyboard shortcuts (POS is touch-first and
            tests/pos_touch_first_no_shortcuts_ui.test.ts enforces that no
            shortcut hints appear anywhere in this file). */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsHelpOpen((v) => !v)}
            className="w-8 h-8 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border text-slate-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
            title="Quick Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          {isHelpOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsHelpOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white border border-jaman-border rounded-2xl shadow-xl p-4 z-50 text-xs text-jaman-navy space-y-2.5">
                <h3 className="font-bold text-sm text-jaman-navy">Quick Help</h3>
                <ul className="space-y-2 text-[#4A5568]">
                  <li>• Tap a dish to add it. Dishes with options show a <strong>Customize</strong> button first.</li>
                  <li>• <strong>Hold Order</strong> parks a bill — find it again from the <strong>Held Carts</strong> indicator in the sidebar.</li>
                  <li>• <strong>Send KOT</strong> fires the ticket to the kitchen. <strong>Instant Bill</strong> skips that for quick takeaway sales.</li>
                  <li>• Use the search bar above to jump straight to a table, bill, or customer.</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* JAMAN AI Button — hidden when this restaurant has opted out via
            Restaurant Admin's "Show JAMAN AI Assistant" setting. Previously
            unconditional: the only real on/off control was a platform-wide
            entitlement, with no per-restaurant preference at all. */}
        {ai.showButton(db.restaurant?.showJamanAI !== false) && (
        <button
          type="button"
          onClick={() => setIsChatbotOpen(true)}
          className={`relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 ${
            isChatbotOpen
              ? 'bg-jaman-navy text-white border-jaman-navy'
              : aiAlertCount > 0
              ? 'bg-[#FFF4ED] hover:bg-[#FFE8D6] border-[#FDBA74] text-jaman-saffron'
              : 'bg-white hover:bg-[#FFF4ED] border-jaman-border hover:border-[#FDBA74] text-jaman-navy hover:text-jaman-saffron'
          }`}
          title="JAMAN AI — Offline Restaurant Intelligence (Ctrl+J)"
          aria-label="Open JAMAN AI Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-jaman-saffron" />
          <span className="hidden md:inline tracking-tight">JAMAN AI</span>
          {ai.locked && <Lock className="w-3 h-3 text-slate-400" aria-label="Locked"><title>Not enabled for your restaurant</title></Lock>}
          {aiAlertCount > 0 && !isChatbotOpen && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-rose-600 text-white text-[10px] font-bold px-1 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
              {aiAlertCount}
            </span>
          )}
        </button>
        )}

        {/* ── CASHIER PROFILE MENU (AMIT DAVE ▼) ── */}
        <div ref={profileRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setProfileDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border px-2 py-1 rounded-xl transition-colors shadow-2xs text-jaman-navy cursor-pointer"
            title={allSystemsOk ? 'User Profile & Session Options — All Systems OK' : 'User Profile & Session Options — Hardware needs attention'}
          >
            <div className="relative w-6 h-6 rounded-lg bg-jaman-saffron text-white flex items-center justify-center font-bold text-xs">
              {currentUser?.fullName?.charAt(0) || '?'}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                  allSystemsOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-bold leading-tight truncate max-w-[110px]">
                {currentUser?.fullName || 'Staff'}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">
                {currentUser?.roleId?.replace('role-', '').replace('-', ' ') || 'Staff'}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Profile Dropdown Popover */}
          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-jaman-border rounded-2xl shadow-2xl p-2 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1">
              <div className="p-2.5 border-b border-jaman-border bg-jaman-cream rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm text-jaman-navy">{currentUser?.fullName || 'Staff'}</p>
                  <span className="text-[11px] font-bold bg-jaman-saffron/10 text-jaman-saffron px-1.5 py-0.5 rounded">
                    POS-01
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{currentUser?.email || 'No email on file'}</p>
                <div className={`flex items-center gap-1.5 text-[11px] font-bold pt-0.5 ${isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>{isOnline ? 'Online' : 'Offline'} • Local Database Active</span>
                </div>
              </div>

              {/* Current Shift Snapshot */}
              <div className="p-2 bg-slate-50 rounded-xl space-y-1 text-[11px]">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Current Shift:</span>
                  <span className="text-jaman-navy">{activeShift ? `Shift #${activeShift.shiftNumber ?? activeShift.id.slice(-2) ?? '01'} (Active)` : 'No Active Shift'}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Opening Float:</span>
                  <span className="font-mono text-jaman-navy">{formatINR(activeShift?.openingCash ?? 0)}</span>
                </div>
              </div>

              {/* System Health — moved here from the standalone header
                  dropdown to cut a permanently-visible button that was
                  almost always showing "System Ready" with nothing to act on. */}
              <div className="p-2 bg-slate-50 rounded-xl space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-slate-500 pb-0.5">
                  <Activity className="w-3 h-3" />
                  <span>System Health</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Server className={`w-3 h-3 ${hardwareStatus.localDb ? 'text-emerald-600' : 'text-rose-600'}`} />
                    Local Database
                  </span>
                  <span className={`font-bold ${hardwareStatus.localDb ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {hardwareStatus.localDb ? 'ACTIVE' : 'UNAVAILABLE'}
                  </span>
                </div>
                <div
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setIsPrintQueueOpen(true);
                  }}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Printer className={`w-3 h-3 ${isPrinterOffline ? 'text-rose-600' : 'text-emerald-600'}`} />
                    Thermal Printer
                  </span>
                  <span className={`font-bold ${isPrinterOffline ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {isPrinterOffline ? 'OFFLINE' : 'READY'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <ChefHat className={`w-3 h-3 ${kdsConnected ? 'text-emerald-600' : 'text-amber-600'}`} />
                    KDS Kitchen Sync
                  </span>
                  <span className={`font-bold ${kdsConnected ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {kdsConnected ? 'SYNCED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <div onClick={toggleNetworkStatus} className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    {isOnline ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3 text-amber-600" />}
                    LAN / Cloud Sync
                  </span>
                  <span className={`font-bold ${isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              <div className="pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setActiveTab('SHIFTS');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-slate-700 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-jaman-saffron" />
                  <span>Current Shift & Drawer</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setIsNotifDrawerOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-slate-700 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5 text-blue-600" />
                  <span>System Notifications</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setIsPrintQueueOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-slate-700 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Thermal Printer & Queue</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    lockTerminal();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-jaman-cream text-left transition-colors font-bold text-amber-700 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Lock Screen (PIN)</span>
                </button>
              </div>

              <div className="border-t border-jaman-border my-1" />

              <button
                type="button"
                onClick={() => {
                  setProfileDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-left transition-colors font-bold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                <span>Logout Cashier Session</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Notification Drawer Modal */}
      <NotificationDrawerModal
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        role="POS"
      />

      {/* Close Business Day Modal */}
      {isCloseDayModalOpen && (
        <PosCloseDayModal
          businessDay={activeDay}
          isOpen={isCloseDayModalOpen}
          onClose={() => setIsCloseDayModalOpen(false)}
          onClosedSuccess={() => {
            setIsCloseDayModalOpen(false);
            setActiveTab('DAYS');
          }}
          onStartNewOrder={() => {
            setIsCloseDayModalOpen(false);
            clearCart();
            setActiveTab('MENU');
          }}
          onViewEodReport={() => {
            setIsCloseDayModalOpen(false);
            setActiveTab('DAYS');
          }}
        />
      )}
    </header>
  );
};
