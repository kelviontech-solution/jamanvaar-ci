import React, { useState, useEffect } from 'react';
import { useCaptainStore } from './store/captainStore';
import { DiningTable } from '@jamanvaar/types';
import { captainDb } from '@jamanvaar/database';
import {
  JamanvaarAuthLayout,
  JAMANVAARStartup
} from '@jamanvaar/ui';

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
  const {
    isLoggedIn,
    authStatus,
    activeTab,
    selectedTable,
    isTableWorkspaceOpen,
    login,
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

  // Handle Login PIN submission
  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;

    const ok = login(pinInput);
    if (!ok) {
      setPinError(true);
      setPinInput('');
    } else {
      setPinError(false);
      setPinInput('');
    }
  };

  const handleQuickDemoLogin = () => {
    login('1234');
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

  if (!isLoggedIn) {
    return (
      <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={1500}>
        <JamanvaarAuthLayout
          appIdentity="CAPTAIN"
          appTitle="Floor Captain & Service"
          appSubtitle="High-Speed Table Orders & Service"
          heroHeadline="Touch-First Restaurant Floor Command"
          heroHighlightWord="Instant KOT"
          heroDescription="Real-time table ordering, live KDS food ready alerts, and fast billing requests with zero cloud latency."
        >
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#0B253A] tracking-tight">
                Floor Captain Sign In
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Enter your 4-digit staff PIN or use quick demo sign in
              </p>
            </div>

            {/* Quick Demo Login Pill */}
            <div className="p-3.5 rounded-2xl bg-[#FFF4ED] border border-[#FDBA74] flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-[#0B253A] block">⚡ Quick Demo Login</span>
                <span className="text-[11px] text-slate-600 font-medium">Auto-sign in as Lead Captain Rahul Sharma</span>
              </div>
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Sign In (1234)
              </button>
            </div>

            {/* PIN Input & Keypad */}
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B253A] uppercase tracking-wider mb-2">
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
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3.5 px-4 rounded-2xl bg-white border border-[#EBE6DD] focus:border-[#E66817] focus:ring-2 focus:ring-[#E66817]/20 outline-none text-[#0B253A]"
                  />
                </div>
                {pinError && (
                  <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Invalid PIN code. Try default PIN: 1234
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
                          setTimeout(() => login(next), 50);
                        }
                      }
                    }}
                    className="h-14 rounded-2xl bg-[#FAF7F2] hover:bg-[#FFF4ED] hover:border-[#E66817] border border-[#EBE6DD] text-lg font-black font-mono text-[#0B253A] active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
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
                        setTimeout(() => login(next), 50);
                      }
                    }
                  }}
                  className="h-14 rounded-2xl bg-[#FAF7F2] hover:bg-[#FFF4ED] hover:border-[#E66817] border border-[#EBE6DD] text-lg font-black font-mono text-[#0B253A] active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
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
                className="w-full py-4 rounded-2xl bg-[#0B253A] hover:bg-[#163E5E] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Unlock Captain Terminal</span>
                <ArrowRight className="w-4 h-4 text-[#E66817]" />
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
      <div className="min-h-screen bg-[#FBF8F2] flex flex-col select-none text-[#0B253A]">
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
              onDeliverFood={handleOpenWorkspaceFromTable}
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

        {/* ── Floating Branded JAMAN AI Assistant Button ── */}
        <button
          type="button"
          onClick={() => setIsAiAssistantOpen(true)}
          className="fixed bottom-16 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-[#0B253A] to-[#1a4a6e] text-white flex items-center justify-center shadow-2xl border-2 border-[#E66817] hover:scale-105 active:scale-95 transition-all cursor-pointer group"
          title="JAMAN AI Floor Intelligence Assistant"
          aria-label="Open JAMAN AI Floor Intelligence Assistant"
        >
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#E66817] fill-[#E66817] group-hover:rotate-12 transition-transform" />
          <span className="sr-only">JAMAN AI</span>
        </button>

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
