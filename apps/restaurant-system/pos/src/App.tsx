import React, { useEffect, useState } from 'react';
import { activatePosDevice, isPosDeviceConnected, pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, CloudApiError } from './cloud/cloudClient';
import { usePosStore } from './store/posStore';
import { db, CustomerRepository, NotificationRepository, StaffRepository } from '@jamanvaar/database';
import type { MenuItem, Category } from '@jamanvaar/types';
import { SyncOutboxEngine, EntitySyncEngine, lanMeshSync, syncDiningTables, syncServiceMessages, syncMenuCatalog, syncCustomers } from '@jamanvaar/sync';
import { sound } from '@jamanvaar/ui';
import { PosLogin } from './components/auth/PosLogin';
import { PosHeader } from './components/layout/PosHeader';
import { PosSidebar } from './components/layout/PosSidebar';
import { PosFooterKpiStrip } from './components/layout/PosFooterKpiStrip';
import { PosCatalog } from './components/menu/PosCatalog';
import { PosCart } from './components/cart/PosCart';
import { PosFloorPlan } from './components/tables/PosFloorPlan';
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
import { PosInstantBillConfirmationModal } from './components/payment/PosInstantBillConfirmationModal';
import { PosThermalReceiptModal } from './components/receipt/PosThermalReceiptModal';
import { PosPrintQueueModal } from './components/receipt/PosPrintQueueModal';
import { PosShiftModal } from './components/shift/PosShiftModal';
import { PosCashDrawerModal } from './components/shift/PosCashDrawerModal';
import { PosChatbot } from './components/assistant/PosChatbot';
import { ManagerOverrideModal } from './components/common/ManagerOverrideModal';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { CrashRecoveryBanner } from './components/common/CrashRecoveryBanner';
import { NotificationToastContainer, JAMANVAARStartup, ActivationWelcomeScreen, ActivationNoticeBanner } from '@jamanvaar/ui';
import { UtensilsCrossed } from 'lucide-react';

export const App: React.FC = () => {
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
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
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
    cart
  } = usePosStore();

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

  // Real-time LAN mesh — without this, POS only ever broadcasts (sendKOT
  // etc.) and never attaches to receive anything back, so events other
  // devices fire (Captain's bill request, food-ready, table transfers) never
  // apply to POS's own db at all, let alone surface as a notification. This
  // was a genuine gap: KDS/Captain both call setAttachedDatabase, POS never did.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    lanMeshSync.registerDevice('POS', 'POS-01', 'POS Terminal');
    lanMeshSync.setAttachedDatabase(db);

    const unsubBillRequested = lanMeshSync.on('BILL_REQUESTED', (event) => {
      const { tableNumber, captainName } = event.payload || {};
      if (!tableNumber) return;
      sound.play('kot');
      NotificationRepository.createNotification({
        type: 'MANAGER_ALERT' as any,
        title: `🧾 Bill Requested — Table ${tableNumber}`,
        message: `${captainName || 'Captain'} requested the bill for Table ${tableNumber}.`,
        priority: 'HIGH',
        targetRoles: ['POS', 'POS_ADMIN', 'ALL'],
        tableNumber
      });
    });

    return () => {
      unsubBillRequested();
    };
  }, []);

  // Wire the real cloud sync bridge once this terminal is activated — without
  // this, orders would sit at SAVED_LOCALLY forever and no other device
  // (KDS, Captain) would ever see them via the cloud catch-up path.
  useEffect(() => {
    if (!isDeviceActivated) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    // Guests registered here reach Restaurant Admin's CRM and back (BUG-159): only what changed is sent, and the
    // newer change wins, so a stale copy cannot overwrite loyalty points changed elsewhere.
    const syncCrm = () => syncCustomers({ push: true });

    // Database-layer gap: the menu previously lived only in this device's
    // own browser storage — clearing it, or a brand-new terminal, meant
    // starting from the seed menu with no way to recover a restaurant's
    // real one. Every device now pushes its full current menu and merges
    // in whatever other devices have pushed, so the menu has a real,
    // durable copy in Postgres instead of existing on exactly one screen.

    // BUG-016: MENU_CATEGORY was defined in the entity-sync bridge's DTO but no app
    // ever actually used it, so categories never synced (even though the dishes did).

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — nothing synced staff records here, despite the create/reset screen's own promise
    // that the PIN would work on POS too. Restaurant Admin is the only place staff are created, so
    // this terminal only pulls.
    const syncStaff = async () => {
      await EntitySyncEngine.catchUp('STAFF_USER', (remote) => StaffRepository.applyRemoteUser(remote.payload));
    };

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncCrm();
    void syncMenuCatalog({ push: true });
    void syncStaff();
    void syncDiningTables();
    void reportHeartbeat();

    // Orders, kitchen tickets and table states are time-critical: every few seconds. The
    // heavier snapshots (CRM, menu) and the heartbeat keep the slower cadence.
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      void syncDiningTables();
      // BUG-099/100: bill requests and messages from Captain arrive as notifications.
      void syncServiceMessages('POS');
    }, 4000);
    const interval = setInterval(() => {
      void syncCrm();
      void syncMenuCatalog({ push: true });
      void syncStaff();
      void reportHeartbeat();
    }, 15000);

    return () => {
      clearInterval(orderInterval);
      clearInterval(interval);
    };
  }, [isDeviceActivated]);

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
      <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform">
        <div className="min-h-screen flex items-center justify-center p-6">
          <form onSubmit={handleActivate} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg space-y-4 text-center">
            <ActivationNoticeBanner />
            <h1 className="text-2xl font-black text-jaman-navy">Activate This Terminal</h1>
            <p className="text-sm text-[#4A5568]">Enter the activation code provided by JAMANVAAR to connect this POS terminal to your restaurant.</p>
            <input
              type="text"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="Activation code"
              className="w-full text-center text-lg font-mono bg-jaman-cream border border-jaman-border rounded-xl px-4 py-3"
              autoFocus
            />
            {activationError && <p className="text-sm font-bold text-rose-700">{activationError}</p>}
            <button
              type="submit"
              disabled={isActivating || !activationCode.trim()}
              className="w-full py-3 rounded-2xl bg-jaman-saffron text-white font-black uppercase tracking-wider disabled:opacity-60"
            >
              {isActivating ? 'Activating…' : 'Activate'}
            </button>
          </form>
        </div>
      </JAMANVAARStartup>
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
      <div className="h-screen w-screen flex flex-col bg-jaman-cream overflow-hidden select-none">
        {/* Top Application Header */}
        <PosHeader />

      {/* Auto-saved Unfinished Order Recovery Notification */}
      <CrashRecoveryBanner />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Navigation Sidebar */}
        <PosSidebar />

        {/* Dynamic Center Stage */}
        <main className="flex-1 flex overflow-hidden relative">
          {activeTab === 'MENU' && (
            <div className="flex-1 flex overflow-hidden">
              <PosCatalog />
              <PosCart />
            </div>
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
      <PosPaymentModal />
      {/* Mounted globally (not tab-scoped) so F8 works from any tab, not just Menu. */}
      <PosHoldModal />
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
    </div>
    </JAMANVAARStartup>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('POS Runtime Caught Exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-jaman-cream p-6 text-center select-none">
          <div className="bg-white p-8 rounded-3xl border border-jaman-border shadow-2xl max-w-md w-full space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center mx-auto shadow-sm">
              <UtensilsCrossed className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-jaman-navy">JAMANVAAR POS Recovered</h2>
            <p className="text-xs text-slate-500">
              An unexpected UI exception was safely intercepted. Your database, cart items, and shift transactions are completely safe.
            </p>
            {this.state.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-left text-xs font-mono text-rose-800 max-h-32 overflow-auto whitespace-pre-wrap select-text">
                <strong className="block font-bold">{this.state.error.name}: {this.state.error.message}</strong>
              </div>
            )}
            <div className="pt-2 flex gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                  window.location.reload();
                }}
                className="px-5 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-black rounded-xl shadow-lg shadow-jaman-saffron/30 transition-all cursor-pointer"
              >
                ↻ Restore POS Workspace
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const PosAppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default PosAppWithBoundary;

