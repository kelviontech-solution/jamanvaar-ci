import React, { useEffect, useState } from 'react';
import { activatePosDevice, isPosDeviceConnected, CloudApiError } from './cloud/cloudClient';
import { usePosStore } from './store/posStore';
import { db, BILL_REQUESTED_EVENT, getTerminalId } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { ImageCache, collectMenuImageUrls } from '@jamanvaar/utils';

import { lanMeshSync } from '@jamanvaar/sync';
import { sound, registerNativeUpdateGuard } from '@jamanvaar/ui';
import { usePosDeviceSync } from './hooks/usePosDeviceSync';
import { PosActivationScreen } from './components/auth/PosActivationScreen';
import { PosLogin } from './components/auth/PosLogin';
import { PosHeader } from './components/layout/PosHeader';
import { PosSidebar } from './components/layout/PosSidebar';
import { PosFooterKpiStrip } from './components/layout/PosFooterKpiStrip';
import { PosBillingWorkspace } from './components/menu/PosBillingWorkspace';
import { PosFloorPlan } from './components/tables/PosFloorPlan';
import { PosTableSelectionScreen } from './components/tables/PosTableSelectionScreen';
import { PosOrdersView } from './components/orders/PosOrdersView';
import { PosBillsView } from './components/bills/PosBillsView';
import { PosKotView } from './components/kitchen/PosKotView';
import { PosCustomersView } from './components/customers/PosCustomersView';
import { PosShiftAndCashView } from './components/shift/PosShiftAndCashView';
import { PosReportsView } from './components/reports/PosReportsView';
import { PosDayHistoryView } from './components/days/PosDayHistoryView';
import { PosSettingsView } from './components/settings/PosSettingsView';
import { PosInventoryView } from './components/inventory/PosInventoryView';
import { PosPaymentModal } from './components/payment/PosPaymentModal';
import { PosHoldModal } from './components/cart/PosHoldModal';
import { PosDiscountModal } from './components/cart/PosDiscountModal';
import { PosInstantBillConfirmationModal } from './components/payment/PosInstantBillConfirmationModal';
import { PosThermalReceiptModal } from './components/receipt/PosThermalReceiptModal';
import { PosPrintQueueModal } from './components/receipt/PosPrintQueueModal';
import { PosShiftModal } from './components/shift/PosShiftModal';
import { PosCashDrawerModal } from './components/shift/PosCashDrawerModal';
import { PosChatbot } from './components/assistant/PosChatbot';
import { ManagerOverrideModal } from './components/common/ManagerOverrideModal';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { CrashRecoveryBanner } from './components/common/CrashRecoveryBanner';
import { NotificationToastContainer, UrgentGuestAlertModal, JAMANVAARStartup, ActivationWelcomeScreen } from '@jamanvaar/ui';
import { Modal } from '@jamanvaar/ui';
import { Menu } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

export const App: React.FC = () => {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isPosDeviceConnected());
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  // Only true right after THIS activation succeeds (not on every subsequent
  // load of an already-activated terminal) — a one-time orientation screen,
  // not a persistent state.
  const [showActivationWelcome, setShowActivationWelcome] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    setActivationError('');
    try {
      await activatePosDevice(activationCode);
      setIsDeviceActivated(true);
      setShowActivationWelcome(true);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : "Could not complete activation. Check this device's internet connection and try again.");
    } finally {
      setIsActivating(false);
    }
  };

  const {
    isAuthenticated,
    authStatus,
    isLocked,
    activeTab,
    setActiveTab,
    setIsPaymentOpen,
    holdCurrentOrder,
    setIsHoldOrdersOpen,
    setIsGlobalSearchOpen,
    setIsShortcutsOpen,
    setIsShiftModalOpen,
    setIsChatbotOpen,
    restoreSession,
    cart,
    orderType,
    selectedTable,
    isDiscountModalOpen,
    setIsDiscountModalOpen
  } = usePosStore();

  useEffect(() => registerNativeUpdateGuard(() => {
    const state = usePosStore.getState();
    return state.cart.items.length || state.isPaymentOpen
      ? 'Finish or hold the current POS order and close payment before updating.' : null;
  }), []);

  // Restore session state on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Force component re-render on database broadcast updates (e.g. new Kiosk order)
  const [, setDbRevision] = useState(0);
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setDbRevision((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  // Keep menu/category pictures on this device, so a dish still shows its real photo once the internet is
  // down, instead of silently falling back to the placeholder icon. This only ever ran in the kiosk app; a
  // cashier working through an outage never had the menu's pictures saved locally to fall back to.
  useEffect(() => {
    let lastKey = '';
    const warm = () => {
      if (!NetworkStatusService.isOnline()) return;
      const list = collectMenuImageUrls(db.menuItems, db.categories);
      const key = list.join('|');
      if (key === lastKey) return;
      lastKey = key;
      void ImageCache.sync(list);
    };
    const unsubNet = NetworkStatusService.subscribe(warm);
    const unsubDb = db.subscribe(warm);
    return () => { unsubNet(); unsubDb(); };
  }, []);

  // Real-time LAN mesh — without this, POS only ever broadcasts (sendKOT
  // etc.) and never attaches to receive anything back, so events other
  // devices fire (Captain's bill request, food-ready, table transfers) never
  // apply to POS's own db at all, let alone surface as a notification. This
  // was a genuine gap: KDS/Captain both call setAttachedDatabase, POS never did.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const terminalId = getTerminalId('POS');
    usePosStore.setState({posTerminalId:terminalId});
    lanMeshSync.registerDevice('POS', terminalId, 'POS Terminal');
    lanMeshSync.setAttachedDatabase(db);

    // A bill request is raised from its order (see refreshBillState), so the chime follows the order too.
    const onBillRequested = () => sound.play('kot');
    window.addEventListener(BILL_REQUESTED_EVENT, onBillRequested);
    return () => window.removeEventListener(BILL_REQUESTED_EVENT, onBillRequested);
  }, [isDeviceActivated]);

  usePosDeviceSync(isDeviceActivated);

  // Global Keyboard Shortcuts (F1 - F10, Ctrl+K, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
        return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          setActiveTab('MENU');
          break;
        case 'F2':
          e.preventDefault();
          setIsGlobalSearchOpen(true);
          break;
        case 'F3':
          e.preventDefault();
          setActiveTab('TABLES');
          break;
        case 'F4':
          e.preventDefault();
          setActiveTab('ORDERS');
          break;
        case 'F5':
          e.preventDefault();
          setActiveTab('CUSTOMERS');
          break;
        case 'F6':
          e.preventDefault();
          if (cart.items.length > 0) setIsPaymentOpen(true);
          break;
        case 'F7':
          e.preventDefault();
          if (cart.items.length > 0) holdCurrentOrder();
          break;
        case 'F8':
          e.preventDefault();
          setIsHoldOrdersOpen(true);
          break;
        case 'F9':
          e.preventDefault();
          setActiveTab('BILLS');
          break;
        case 'F10':
          e.preventDefault();
          setIsShiftModalOpen(true);
          break;
        case 'Escape':
          setIsChatbotOpen(false);
          setIsGlobalSearchOpen(false);
          setIsShortcutsOpen(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.items.length, setActiveTab, setIsPaymentOpen, holdCurrentOrder, setIsHoldOrdersOpen, setIsGlobalSearchOpen, setIsShiftModalOpen, setIsChatbotOpen, setIsShortcutsOpen]);

  // Device activation gate — this terminal has no cloud identity until an
  // activation code is redeemed. Runs before the auth state machine below:
  // device identity comes before staff login.
  if (!isDeviceActivated) {
    return (
      <PosActivationScreen
        activationCode={activationCode}
        setActivationCode={setActivationCode}
        activationError={activationError}
        isActivating={isActivating}
        onSubmit={handleActivate}
      />
    );
  }

  if (showActivationWelcome) {
    return (
      <ActivationWelcomeScreen
        appName="POS Terminal"
        tips={[
          'Sign in with your 4-digit staff PIN.',
          'Tap a dish to add it — Customize opens options for dishes that have them.',
          'Send KOT fires the ticket to the kitchen; Instant Bill skips that for quick takeaway sales.'
        ]}
        onContinue={() => setShowActivationWelcome(false)}
      />
    );
  }

  // ───────────────────────────────────────────────────
  // AUTH STATE MACHINE GUARD
  // Never redirect during AUTH_LOADING — prevents flash-to-login on refresh
  // ───────────────────────────────────────────────────
  // AUTH_LOADING: session restoration in progress, render splash only
  if (authStatus === 'AUTH_LOADING') {
    return (
      <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform" />
    );
  }

  // UNAUTHENTICATED or locked: show login screen
  if (!isAuthenticated || isLocked) {
    return (
      <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform">
        <PosLogin />
      </JAMANVAARStartup>
    );
  }

  return (
    <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform">
      <div data-jv-workspace="pos" className="h-dvh w-full flex flex-col gap-2.5 p-2.5 bg-jaman-cream overflow-hidden select-none">
        {/* Top Application Header */}
        <PosHeader />

      {/* Auto-saved Unfinished Order Recovery Notification */}
      <CrashRecoveryBanner />
      <div className="xl:hidden shrink-0">
        <button type="button" onClick={() => setNavigationOpen(true)} className="min-h-11 px-4 bg-white border border-jaman-border rounded-xl text-sm font-bold flex items-center gap-2"><Menu size={20} />Pages & categories</button>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex gap-2.5 overflow-hidden relative min-h-0">
        {/* Left Navigation Sidebar */}
        <div className="hidden xl:flex min-h-0"><PosSidebar /></div>

        {/* Dynamic Center Stage */}
        <main className={`flex-1 flex overflow-hidden relative min-w-0 ${activeTab === 'MENU' ? '' : 'rounded-2xl border border-jaman-border bg-white'}`}>
          {activeTab === 'MENU' && (
            // Dine-in starts with the table: a full-width picker until a table is chosen (or the order
            // type is switched, or dishes are already in the cart from a recalled/held order).
            orderType === 'DINE_IN' && !selectedTable && (cart?.items?.length ?? 0) === 0 ? (
              <PosTableSelectionScreen />
            ) : (
              <PosBillingWorkspace />
            )
          )}

          {activeTab === 'TABLES' && <PosFloorPlan />}
          {activeTab === 'ORDERS' && <PosOrdersView />}
          {activeTab === 'BILLS' && <PosBillsView />}
          {activeTab === 'KOT' && <PosKotView />}
          {activeTab === 'CUSTOMERS' && <PosCustomersView />}
          {activeTab === 'SHIFTS' && <PosShiftAndCashView />}
          {activeTab === 'DAYS' && <PosDayHistoryView />}
          {activeTab === 'REPORTS' && <PosReportsView />}
          {activeTab === 'INVENTORY' && <PosInventoryView />}
          {activeTab === 'SETTINGS' && <PosSettingsView />}
        </main>
      </div>

      {/* Real-time Dashboard KPI Strip */}
      <PosFooterKpiStrip />

      {/* Global Application Modals */}
      <Modal isOpen={navigationOpen} onClose={() => setNavigationOpen(false)} title="Pages & categories" maxWidth="sm" bodyClassName="!p-0 flex min-h-0">
        <PosSidebar onNavigate={() => setNavigationOpen(false)} className="!w-full h-[65dvh] !border-0 !rounded-none" />
      </Modal>
      <PosPaymentModal />
      {/* Mounted globally (not tab-scoped) so F8 works from any tab, not just Menu. */}
      <PosHoldModal />
      {/* Mounted here, not inside PosCart, for the same reason PosHoldModal already is: PosCart's own
          root div is a flex item with an explicit z-index (z-10), which — per the CSS flex-item
          z-index rule — makes it a stacking context of its own even though it is not positioned. A
          fixed, z-50 modal rendered as its descendant still nests INSIDE that z-10 layer for paint
          order, so PosSidebar's z-20 (a sibling, not a descendant) painted over it: the category
          sidebar, and even PosCart's own header/cart list, stayed visible above the "dimmed" backdrop
          instead of being covered by it. Rendering from here, outside PosCart entirely, sidesteps it. */}
      <PosDiscountModal isOpen={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)} />
      <PosInstantBillConfirmationModal />
      <PosThermalReceiptModal />
      <PosPrintQueueModal />
      <PosShiftModal />
      <PosCashDrawerModal />
      <PosChatbot />
      <ManagerOverrideModal />
      <GlobalSearchModal />

      {/* Real-time Push Notifications */}
      <NotificationToastContainer role="POS" />
      <UrgentGuestAlertModal role="POS" />
    </div>
    </JAMANVAARStartup>
  );
};

export const PosAppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default PosAppWithBoundary;
