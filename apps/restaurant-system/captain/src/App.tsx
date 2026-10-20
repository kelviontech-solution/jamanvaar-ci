import React, { useState, useEffect } from 'react';
import { useCaptainStore } from './store/captainStore';
import { registerNativeUpdateGuard } from '@jamanvaar/ui';
import { DiningTable } from '@jamanvaar/types';
import { captainDb } from '@jamanvaar/database';
import { NetworkStatusService } from '@jamanvaar/api';
import { ImageCache, collectMenuImageUrls } from '@jamanvaar/utils';
import { EntitlementService } from '@jamanvaar/business';
import {
  JAMANVAARStartup,
  ActivationWelcomeScreen,
  useAiAccess,
  sound
} from '@jamanvaar/ui';
import { isDeviceConnected, activateCaptainWithKey, CloudApiError } from './cloud/cloudClient';
import { useCaptainDeviceSync } from './hooks/useCaptainDeviceSync';
import { CaptainActivationScreen } from './components/auth/CaptainActivationScreen';
import { CaptainSignInScreen } from './components/auth/CaptainSignInScreen';
import { CaptainLockedScreen } from './components/auth/CaptainLockedScreen';

// Captain Modular Layout & Views
import { CaptainHeader } from './components/layout/CaptainHeader';
import { CaptainAttentionStrip } from './components/layout/CaptainAttentionStrip';
import { CaptainNavigation } from './components/layout/CaptainNavigation';
import { CaptainFloorView } from './components/tables/CaptainFloorView';
import { CaptainActiveOrdersView } from './components/orders/CaptainActiveOrdersView';
import { CaptainFoodReadyView } from './components/food-ready/CaptainFoodReadyView';
import { CaptainLiveKotsView } from './components/kots/CaptainLiveKotsView';
import { CaptainGuestRequestsView } from './components/requests/CaptainGuestRequestsView';
import { CaptainMessagesView } from './components/messages/CaptainMessagesView';
import { CaptainShiftStatsView } from './components/shift/CaptainShiftStatsView';

// Modals & Floating AI
import { CaptainTableWorkspaceModal } from './components/tables/CaptainTableWorkspaceModal';
import { CaptainGuestCountModal } from './components/modals/CaptainGuestCountModal';
import { CaptainMoreDrawer } from './components/modals/CaptainMoreDrawer';
import { CaptainNotificationsModal } from './components/modals/CaptainNotificationsModal';
import { CaptainQuickMessageModal } from './components/modals/CaptainQuickMessageModal';
import { CaptainTransferMergeModal } from './components/modals/CaptainTransferMergeModal';
import { CaptainJamanAiModal } from './components/assistant/CaptainJamanAiModal';
import { CaptainUrgentHelpAlert } from './components/modals/CaptainUrgentHelpAlert';

import { Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  useEffect(() => registerNativeUpdateGuard(() => useCaptainStore.getState().cartItems.some(item => !item.isFired)
    ? 'Send or clear the current Captain order before updating.' : null), []);
  const ai = useAiAccess();
  const {
    isLoggedIn,
    authStatus,
    loginError,
    activeTab,
    selectedTable,
    isTableWorkspaceOpen,
    login,
    serveReadyForTable,
    setActiveTab,
    setTableFilter,
    openTableWorkspace,
    closeTableWorkspace,
    openTable,
    refreshState
  } = useCaptainStore();

  // Browsers stay silent until the person has touched the screen once: warm the audio up on the first touch (the PIN keypad
  // counts), so the first "food ready" of the shift is heard.
  useEffect(() => {
    const warm = () => sound.warmUp();
    window.addEventListener('pointerdown', warm, { once: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, []);

  // Keep menu/category pictures on this device, so a dish still shows its real photo once the internet is
  // down, instead of silently falling back to the placeholder icon. This only ever ran in the kiosk app; a
  // waiter working through an outage never had the menu's pictures saved locally to fall back to.
  useEffect(() => {
    let lastKey = '';
    const warmImages = () => {
      if (!NetworkStatusService.isOnline()) return;
      const list = collectMenuImageUrls(captainDb.menuItems, captainDb.categories);
      const key = list.join('|');
      if (key === lastKey) return;
      lastKey = key;
      void ImageCache.sync(list);
    };
    const unsubNet = NetworkStatusService.subscribe(warmImages);
    const unsubDb = captainDb.subscribe(warmImages);
    return () => { unsubNet(); unsubDb(); };
  }, []);

  // One-time device connection to JAMANVAAR Cloud — separate from the PIN
  // keypad below, which stays the fast day-to-day login once this tablet is
  // connected. isDeviceConnected() persists across reloads, so this screen
  // only ever appears the first time a tablet is set up.
  const [deviceConnected, setDeviceConnected] = useState(isDeviceConnected());
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  // Only true right after THIS activation succeeds — a one-time orientation screen, not a persistent state.
  const [showActivationWelcome, setShowActivationWelcome] = useState(false);

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError('');
    setActivationBusy(true);
    try {
      await activateCaptainWithKey(activationKeyInput);
      setDeviceConnected(true);
      setShowActivationWelcome(true);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : "Could not complete activation. Check this device's internet connection and that the key is correct, then try again.");
    } finally {
      setActivationBusy(false);
    }
  };

  useCaptainDeviceSync(deviceConnected);

  // Active Modals State
  const [guestModalTable, setGuestModalTable] = useState<DiningTable | null>(null);
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickMsgOpen, setIsQuickMsgOpen] = useState(false);
  const [quickMsgDefaultTable, setQuickMsgDefaultTable] = useState('');
  const [isTransferMergeOpen, setIsTransferMergeOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);

  // Real-time Database subscription listener
  useEffect(() => {
    const unsub = captainDb.subscribe(() => {
      refreshState();
    });
    return () => unsub();
  }, [refreshState]);

  // SEC-007 Fix: Enforce SaaS Plan Entitlement (Requires JAMANVAAR PRO ₹7,000)
  const entitlement = EntitlementService.checkCaptainAppAccess();
  if (!entitlement.allowed) {
    return <CaptainLockedScreen entitlement={entitlement} />;
  }

  // Seating guest modal handlers
  const handleOpenGuestModal = (table: DiningTable) => {
    setGuestModalTable(table);
  };

  const handleConfirmSeatGuests = (tableNumber: string, guestCount: number) => {
    openTable(tableNumber, guestCount);
    setGuestModalTable(null);
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (tbl) {
      openTableWorkspace(tbl);
    }
  };

  // Open table workspace directly
  const handleOpenWorkspaceFromTable = (table: DiningTable) => {
    openTableWorkspace(table);
  };

  // The green "DELIVER FOOD" button on a table card: the waiter is taking the finished dishes to the table, so
  // they are marked served (BUG-148). It used to just open the table, so a ready table could never be cleared.
  const handleDeliverFood = (table: DiningTable) => {
    serveReadyForTable(table.tableNumber);
  };

  const handleOpenWorkspaceFromNumber = (tableNumber: string) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (tbl) {
      openTableWorkspace(tbl);
    }
  };

  // Open Quick Message with prefilled table
  const handleOpenSendMessage = (tableNum?: string) => {
    setQuickMsgDefaultTable(tableNum || '');
    setIsQuickMsgOpen(true);
  };

  // =========================================================================
  // 1. AUTH STATE MACHINE GUARD (Prevents flash-to-login on refresh)
  // =========================================================================
  if (authStatus === 'AUTH_LOADING') {
    return (
      <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={800} />
    );
  }

  if (!deviceConnected) {
    return (
      <CaptainActivationScreen
        activationKeyInput={activationKeyInput}
        setActivationKeyInput={setActivationKeyInput}
        activationError={activationError}
        activationBusy={activationBusy}
        onSubmit={handleActivateSubmit}
      />
    );
  }

  if (showActivationWelcome) {
    return (
      <ActivationWelcomeScreen
        appName="Captain tablet"
        tips={[
          'Sign in with your 4-digit staff PIN.',
          'Tap a table to open it, add dishes, and fire the KOT to the kitchen.',
          'Send Bill Request notifies the counter — POS handles the actual payment.'
        ]}
        onContinue={() => setShowActivationWelcome(false)}
      />
    );
  }

  if (!isLoggedIn) {
    return <CaptainSignInScreen login={login} loginError={loginError} />;
  }

  // =========================================================================
  // 2. MAIN CAPTAIN APPLICATION SHELL
  // =========================================================================
  return (
    <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN">
      <div data-jv-workspace="captain" className="min-h-dvh bg-[#FBF8F2] flex flex-col select-none text-jaman-navy">
        {/* Below md only the header sticks (the priority chips scroll away with the content, so a phone keeps its
            height for the tables); from md up the whole header / chips / nav block sticks together. `contents`
            lets the children take part in the outer column on a phone without a wrapper box. */}
        <div className="contents md:block md:sticky md:top-0 md:z-30 md:bg-white">
        {/* ── Brand Header with Master Logo & Quick Actions ── */}
        <CaptainHeader
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenQuickMessage={() => handleOpenSendMessage()}
        />

        {/* ── High-Priority Top Attention Strip ── */}
        <CaptainAttentionStrip
          onNavigateToTab={(tab) => setActiveTab(tab as any)}
          onFilterTablesByStatus={(st) => {
            setActiveTab('TABLES');
            setTableFilter(st);
          }}
        />

        {/* ── Focused Primary Navigation (Desktop Top & Mobile Bottom) ── */}
        <CaptainNavigation
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab as any)}
          onOpenMoreDrawer={() => setIsMoreDrawerOpen(true)}
        />
        </div>

        {/* ── Main View Container ── */}
        <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-3 pt-3 pb-[calc(var(--cap-nav-h)+4.5rem)] sm:px-5 sm:pt-5 lg:pb-6 lg:px-6 lg:pt-6">
          {/* TAB 1: MY TABLES (HOME) */}
          {activeTab === 'TABLES' && (
            <CaptainFloorView
              onOpenGuestModal={handleOpenGuestModal}
              onOpenWorkspace={handleOpenWorkspaceFromTable}
              onDeliverFood={handleDeliverFood}
            />
          )}

          {/* TAB 2: ACTIVE ORDERS */}
          {activeTab === 'ORDERS' && (
            <CaptainActiveOrdersView
              onOpenTableWorkspace={handleOpenWorkspaceFromNumber}
            />
          )}

          {/* TAB 3: FOOD READY */}
          {activeTab === 'FOOD_READY' && (
            <CaptainFoodReadyView
              onOpenTableWorkspace={handleOpenWorkspaceFromNumber}
            />
          )}

          {/* TAB 4: MESSAGES */}
          {activeTab === 'MESSAGES' && (
            <CaptainMessagesView />
          )}

          {/* TAB 5: LIVE KOTS */}
          {activeTab === 'KOTS' && (
            <CaptainLiveKotsView
              onOpenSendMessage={handleOpenSendMessage}
            />
          )}

          {/* TAB 6: GUEST REQUESTS */}
          {(activeTab as any) === 'REQUESTS' && (
            <CaptainGuestRequestsView />
          )}

          {/* TAB 7: SHIFT STATS */}
          {activeTab === 'SHIFT' && (
            <CaptainShiftStatsView />
          )}
        </main>

        {/* ── Floating Branded JAMAN AI Assistant Button — hidden when this
            restaurant opted out via Restaurant Admin settings ── */}
        {ai.showButton(captainDb.restaurant?.showJamanAI !== false) && (
        <button
          type="button"
          onClick={() => setIsAiAssistantOpen(true)}
          className="fixed bottom-[calc(var(--cap-nav-h)+8px)] lg:bottom-6 right-3 lg:right-6 z-40 w-11 h-11 lg:w-14 lg:h-14 rounded-full bg-gradient-to-tr from-jaman-navy to-[#1a4a6e] text-white flex items-center justify-center shadow-md border-2 border-jaman-saffron hover:scale-105 active:scale-95 transition-all cursor-pointer group"
          title="JAMAN AI Floor Intelligence Assistant"
          aria-label="Open JAMAN AI Floor Intelligence Assistant"
        >
          <Sparkles className="w-5 h-5 lg:w-6 lg:h-6 text-jaman-saffron fill-jaman-saffron group-hover:rotate-12 transition-transform" />
          <span className="sr-only">JAMAN AI</span>
        </button>
        )}

        {/* ── All Modals & Workspaces ── */}
        {/* 1. Table Workspace Modal */}
        <CaptainTableWorkspaceModal
          table={selectedTable}
          isOpen={isTableWorkspaceOpen}
          onClose={closeTableWorkspace}
          onOpenTransferMerge={() => setIsTransferMergeOpen(true)}
          onOpenSendMessage={handleOpenSendMessage}
        />

        {/* 2. Seating Guest Modal */}
        <CaptainGuestCountModal
          table={guestModalTable}
          isOpen={!!guestModalTable}
          onClose={() => setGuestModalTable(null)}
          onConfirm={handleConfirmSeatGuests}
        />

        {/* 3. More Drawer Modal */}
        <CaptainMoreDrawer
          isOpen={isMoreDrawerOpen}
          onClose={() => setIsMoreDrawerOpen(false)}
          onSelectTab={(tab) => setActiveTab(tab)}
          onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        />

        {/* 4. Notification Center Modal */}
        <CaptainNotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          onSelectTable={handleOpenWorkspaceFromNumber}
        />

        {/* 5. Quick Message Modal */}
        <CaptainQuickMessageModal
          isOpen={isQuickMsgOpen}
          onClose={() => setIsQuickMsgOpen(false)}
          defaultTableNumber={quickMsgDefaultTable}
        />

        {/* 6. Transfer / Merge Modal */}
        <CaptainTransferMergeModal
          currentTable={selectedTable}
          isOpen={isTransferMergeOpen}
          onClose={() => setIsTransferMergeOpen(false)}
        />

        {/* 7. JAMAN AI Intelligence Modal */}
        <CaptainJamanAiModal
          isOpen={isAiAssistantOpen}
          onClose={() => setIsAiAssistantOpen(false)}
          onNavigateToTab={(tab) => {
            setActiveTab(tab);
            setIsAiAssistantOpen(false);
          }}
        />

        {/* 8. Urgent: a guest's own "Call Staff" tap — full-attention, stays up until accepted */}
        <CaptainUrgentHelpAlert />
      </div>
    </JAMANVAARStartup>
  );
};

export default App;
