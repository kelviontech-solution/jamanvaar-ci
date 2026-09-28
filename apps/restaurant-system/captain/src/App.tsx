import React, { useState, useEffect } from 'react';
import { useCaptainStore } from './store/captainStore';
import { DiningTable, MenuItem, Category } from '@jamanvaar/types';
import { captainDb, StaffRepository } from '@jamanvaar/database';
import { EntitlementService } from '@jamanvaar/business';
import {
  JamanvaarAuthLayout,
  APP_HERO_IMAGES,
  JAMANVAARStartup,
  ActivationWelcomeScreen,
  useAiAccess,
  ActivationNoticeBanner,
  ActivationHelpNote
} from '@jamanvaar/ui';
import { isDeviceConnected, activateCaptainWithKey, pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, CloudApiError, leaseNumberBlock } from './cloud/cloudClient';
import { SyncOutboxEngine, EntitySyncEngine, syncDiningTables, syncServiceMessages, syncMenuCatalog, onAppResume } from '@jamanvaar/sync';

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

import {
  AlertCircle,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export const App: React.FC = () => {
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

  // Local PIN keypad state for login
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

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
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed. Please verify the key.');
    } finally {
      setActivationBusy(false);
    }
  };

  useEffect(() => {
    if (!deviceConnected) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_captain_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    // Captain never edits the menu — only pulls whatever POS/Restaurant
    // Admin have pushed, so a Captain tablet with its own cleared/fresh
    // storage still gets the real menu instead of the local seed fallback.

    // Captain never edits categories either — pull only, same as menu items.

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — Captain never pulled staff records, despite the create/reset screen's own promise
    // that the PIN would work here too. Captain never edits staff either — pull only.
    const syncStaff = async () => {
      await EntitySyncEngine.catchUp('STAFF_USER', (remote) => StaffRepository.applyRemoteUser(remote.payload));
    };

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncMenuCatalog({ push: false });
    void syncStaff();
    void syncDiningTables();
    void reportHeartbeat();

    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      // BUG-096/097: table layout and status are shared with Restaurant Admin and POS.
      void syncDiningTables();
      // BUG-099/100: deliver this tablet's bill requests and messages, and show what others sent.
      void syncServiceMessages('CAPTAIN').then((inbound) => {
        if (inbound.length > 0) useCaptainStore.getState().receiveMessages(inbound);
      });
    }, 4000);
    const interval = setInterval(() => {
      void syncMenuCatalog({ push: false });
      void syncStaff();
      void reportHeartbeat();
    }, 15000);

    // Waking the tablet (screen unlocked, network back, tab visible again) catches up at once: no refresh needed.
    const stopResume = onAppResume(() => {
      void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      void SyncOutboxEngine.catchUpFromCloud();
      void syncDiningTables();
    });

    return () => {
      clearInterval(orderInterval);
      clearInterval(interval);
      stopResume();
    };
  }, [deviceConnected]);

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
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200 shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-xs">
            👑
          </div>
          <div className="space-y-2">
            <span className="inline-block text-[11px] font-black uppercase tracking-widest text-jaman-saffron bg-[#FFF4ED] px-3 py-1 rounded-full border border-[#FDBA74]">
              JAMANVAAR PRO (₹7,000) Exclusive
            </span>
            <h1 className="text-2xl font-black text-jaman-navy tracking-tight">Captain App Locked</h1>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              {entitlement.message || 'Wireless Table Ordering and Captain Service workflows are available only on the JAMANVAAR PRO (₹7,000) subscription plan.'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium text-left space-y-2">
            <div className="font-bold text-jaman-navy">Current Plan Status:</div>
            <div className="flex justify-between">
              <span>Restaurant Plan:</span>
              <span className="font-bold text-slate-900">{entitlement.tier}</span>
            </div>
            <div className="flex justify-between">
              <span>Captain Entitlement:</span>
              <span className="text-rose-600 font-bold">LOCKED (captainApp: false)</span>
            </div>
            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
              Upgrade your subscription to JAMANVAAR PRO via Super Admin or contact your platform administrator.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle Login PIN submission
  // One path for typed and keypad entry, so a wrong PIN always shows the error and clears the
  // entry (BUG-105: the keypad path used to ignore the result and jam at four digits).
  const attemptLogin = async (candidate: string) => {
    const ok = await login(candidate);
    setPinError(!ok);
    setPinInput('');
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;
    attemptLogin(pinInput);
  };

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
      <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={1500}>
        <JamanvaarAuthLayout
          appIdentity="CAPTAIN"
          appTitle="Floor Captain & Service"
          appSubtitle="High-Speed Table Orders & Service"
          isLocalCoreUnauthorized={captainDb.isLocalCoreUnauthorized()}
          healthCheckUrl={`${captainDb.getSyncServerUrl()}/api/health`}
          heroHeadline="Touch-First Restaurant Floor Command"
          heroHighlightWord="Instant KOT"
          heroDescription="Real-time table ordering, live KDS food ready alerts, and fast billing requests with zero cloud latency."
          heroImages={APP_HERO_IMAGES.CAPTAIN}
        >
          <div className="space-y-5">
            <ActivationNoticeBanner />
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Activate this Tablet</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                One-time setup — enter the activation key from your Super Admin Welcome Kit. Nothing else is needed.
              </p>
            </div>
            <form onSubmit={handleActivateSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Activation Key *</label>
                <input
                  type="text"
                  value={activationKeyInput}
                  onChange={(e) => setActivationKeyInput(e.target.value)}
                  placeholder="JMV-XXXX-XXXX-XXXX"
                  required
                  autoFocus
                  className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors uppercase"
                />
              </div>
              {activationError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{activationError}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={activationBusy || !activationKeyInput.trim()}
                className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{activationBusy ? 'Activating…' : 'Activate Tablet'}</span>
                {!activationBusy && <ArrowRight className="w-4 h-4 text-jaman-saffron" />}
              </button>
            </form>
            <ActivationHelpNote deviceNoun="tablet" />
          </div>
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
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
    return (
      <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={1500}>
        <JamanvaarAuthLayout
          appIdentity="CAPTAIN"
          appTitle="Floor Captain & Service"
          appSubtitle="High-Speed Table Orders & Service"
          isLocalCoreUnauthorized={captainDb.isLocalCoreUnauthorized()}
          healthCheckUrl={`${captainDb.getSyncServerUrl()}/api/health`}
          heroHeadline="Touch-First Restaurant Floor Command"
          heroHighlightWord="Instant KOT"
          heroDescription="Real-time table ordering, live KDS food ready alerts, and fast billing requests with zero cloud latency."
          heroImages={APP_HERO_IMAGES.CAPTAIN}
        >
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">
                Floor Captain Sign In
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Enter your authorized 4-digit staff PIN to unlock this tablet
              </p>
            </div>

            {/* Authorized Staff Help Notice */}
            <div className="p-3.5 rounded-2xl bg-[#FDFBF7] border border-jaman-border flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-jaman-navy block">🔒 Registered Staff Access</span>
                <span className="text-[11px] text-slate-600 font-medium">Ask your manager for your 4-digit staff PIN</span>
              </div>
            </div>

            {/* PIN Input & Keypad */}
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-jaman-navy uppercase tracking-wider mb-2">
                  Staff 4-Digit PIN
                </label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      setPinError(false);
                      setPinInput(e.target.value);
                    }}
                    placeholder="• • • •"
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3.5 px-4 rounded-2xl bg-white border border-jaman-border focus:border-jaman-saffron focus:ring-2 focus:ring-jaman-saffron/20 outline-none text-jaman-navy"
                  />
                </div>
                {pinError && (
                  <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {loginError ?? 'Invalid staff PIN code. Please enter your authorized 4-digit PIN.'}
                  </p>
                )}
              </div>

              {/* Touch Numpad */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (pinInput.length < 4) {
                        setPinError(false);
                        const next = pinInput + num;
                        setPinInput(next);
                        if (next.length === 4) {
                          setTimeout(() => attemptLogin(next), 50);
                        }
                      }
                    }}
                    className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-black font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(false);
                  }}
                  className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 4) {
                      setPinError(false);
                      const next = pinInput + '0';
                      setPinInput(next);
                      if (next.length === 4) {
                        setTimeout(() => attemptLogin(next), 50);
                      }
                    }
                  }}
                  className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-black font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                  className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={pinInput.length === 0}
                className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Unlock Captain Terminal</span>
                <ArrowRight className="w-4 h-4 text-jaman-saffron" />
              </button>
            </form>
          </div>
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  // =========================================================================
  // 2. MAIN CAPTAIN APPLICATION SHELL
  // =========================================================================
  return (
    <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN">
      <div className="min-h-screen bg-[#FBF8F2] flex flex-col select-none text-jaman-navy">
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

        {/* ── Main View Container ── */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6">
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
          className="fixed bottom-16 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-jaman-navy to-[#1a4a6e] text-white flex items-center justify-center shadow-2xl border-2 border-jaman-saffron hover:scale-105 active:scale-95 transition-all cursor-pointer group"
          title="JAMAN AI Floor Intelligence Assistant"
          aria-label="Open JAMAN AI Floor Intelligence Assistant"
        >
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-jaman-saffron fill-jaman-saffron group-hover:rotate-12 transition-transform" />
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
      </div>
    </JAMANVAARStartup>
  );
};

export default App;
