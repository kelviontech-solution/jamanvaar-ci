import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, kdsDb, KOTRepository, AuditRepository, KeyValueStore, setKitchenPriority } from '@jamanvaar/database';
import { DeviceGate, getAssignedStation, lanMeshSync, SyncOutboxEngine, EndpointResolver } from '@jamanvaar/sync';
import { KOTRecord, KOTStatus, KOTItem } from '@jamanvaar/types';
import { KdsTicketCard } from './KdsTicketCard';
import { loadKitchenDisplay, saveKitchenDisplay } from './displayPreferences';
import { StaffLanguagePicker, useStaffLanguage, StaffPracticePanel } from '@jamanvaar/ui';
import { KitchenStationRepository } from '@jamanvaar/database';
import { KdsExpoBoard } from './KdsExpoBoard';
import { buildExpoBoard, connectionLevel, effectiveItemStatus, liveItems, orderProgress, prepMinutes, prepSummary, sortForKitchen, ticketAge, matchesKitchenSearch, ticketsForStation, needsCancellationAcknowledgement } from './kdsLogic';
import { Platform } from '@jamanvaar/api';
import { activateKdsDevice, deviceFetch, isKdsDeviceConnected, reportAiQueryNow, CloudApiError } from './cloud/cloudClient';
import {
  JamanAiAssistantModal, useAiAccess,
  NotificationToastContainer,
  JAMANVAARStartup,
  EmptyState,
  ActivationWelcomeScreen,
  BrandHeader,
  printThermalKotTicket, Modal, OrderActivityView, type CanonicalOrderActivity
} from '@jamanvaar/ui';
import { SessionPersistence, EntitlementService } from '@jamanvaar/business';
import { sound } from '@jamanvaar/ui';
import { useKdsDeviceSync } from './hooks/useKdsDeviceSync';
import { useKdsLanMesh } from './hooks/useKdsLanMesh';
import { KdsActivationScreen } from './components/auth/KdsActivationScreen';
import { KdsSignInScreen } from './components/auth/KdsSignInScreen';
import { ChefHat, Flame, Bell, UtensilsCrossed, CheckCheck, LogOut, WifiOff, Search, X, Sparkles, ArrowRight } from 'lucide-react';

const loadOrderActivity = async (id: string): Promise<CanonicalOrderActivity> => {const r=await deviceFetch(`/api/v1/orders/sync/${encodeURIComponent(id)}/activity`);if(!r.ok)throw new Error('Activity unavailable');return r.json();};
/** Who took the order: a table order from the Captain app is the waiter's, anything else was rung up by a cashier (BUG-157). */
function kotTakenByLabel(kot: KOTRecord): string {
  const order = db.orders.find((o) => o.id === kot.orderId);
  return order?.source_type === 'CAPTAIN' || order?.captainName ? 'Captain' : 'Cashier';
}

/**
 * B2-020: the ticket chip printed the raw `OrderType` enum verbatim ("DINE_IN"), and a fake/test
 * ticket with no table read the contradictory "Takeaway • DINE_IN" (the "Takeaway" half was a
 * hardcoded guess from a missing table number, not the order's own real type). Always show a real
 * friendly label for the order's own `orderType`, not a guess.
 */
const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  TOKEN: 'Token',
  TOKEN_QR: 'Token (QR)',
  QR_TABLE: 'QR Table',
  KIOSK: 'Kiosk',
  PICKUP: 'Pickup',
  ONLINE: 'Online',
  COMPLIMENTARY: 'Complimentary'
};

export const App: React.FC = () => {
  const ai = useAiAccess();
  const {t:staffText} = useStaffLanguage();
  const [display, setDisplay] = useState(() => loadKitchenDisplay('ALL'));
  const [displayError, setDisplayError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [captainServicePolicy, setCaptainServicePolicy] = useState(() => DeviceGate.getState().captainHandlesService);
  useEffect(() => DeviceGate.subscribe(() => setCaptainServicePolicy(DeviceGate.getState().captainHandlesService)), []);
  const [kots, setKots] = useState<KOTRecord[]>(kdsDb.kots);

  // A new ticket needs an audible cue: cooks are not watching the screen. Tickets normally arrive from the cloud (a Captain
  // tablet or POS on another device), not over the same-browser mesh, so the cue follows the ticket list itself. One beep
  // per batch of tickets not seen before; what was already on screen at start-up stays quiet.
  const seenKotIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(kots.map((k) => k.id));
    const seen = seenKotIds.current;
    seenKotIds.current = ids;
    if (seen === null) return;
    if (kots.some((k) => !seen.has(k.id) && k.status !== 'READY' && k.status !== 'SERVED' && k.status !== 'CANCELLED')) sound.play('kot');
  }, [kots]);

  // A cancelled dish or ticket is an alarm, not a silent disappearance: it stays on screen in red until a cook dismisses it,
  // and it makes a different (warning) sound the moment it arrives.
  const DISMISSED_KEY = 'jamanvaar_kds_dismissed_cancelled';
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(KeyValueStore.get(DISMISSED_KEY) || '[]'));
    } catch {
      return new Set<string>();
    }
  });
  const dismissCancelled = (kot: KOTRecord) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(kot.id);
      try {
        KeyValueStore.set(DISMISSED_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        // Storage unavailable: the ticket stays dismissed until the screen reloads.
      }
      return next;
    });
  };
  const seenCancelled = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set<string>();
    kots.forEach((k) => {
      if (k.status === 'CANCELLED') now.add(k.id);
      k.items?.forEach((i) => { if (i.status === 'CANCELLED') now.add(`${k.id}:${i.id}`); });
    });
    const before = seenCancelled.current;
    seenCancelled.current = now;
    if (before === null) return;
    if ([...now].some((id) => !before.has(id))) sound.play('warning');
  }, [kots]);

  // Is this screen still hearing from the server? Shown in the header and, when it is not, as a bar across the top.
  const startedAt = useRef(Date.now());
  const [conn, setConn] = useState<{ level: ReturnType<typeof connectionLevel>; ageSec: number | null }>({ level: 'ok', ageSec: null });
  const [undo, setUndo] = useState<{ text: string; run?: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerUndo = (text: string, run?: () => void) => {
    setUndo({ text, run });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  // A smaller logo on a phone-sized screen so the header does not eat the tickets' space.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A kitchen screen must never go to sleep mid-service (display port: wake lock in a browser, native in a shell).
  useEffect(() => {
    Platform.display.keepAwake(true);
    return () => Platform.display.keepAwake(false);
  }, []);

  // Device activation gate — same activation-key flow as POS/POS-admin.
  // Without a device token this terminal has no way to reach cloud/api at
  // all, so it stays on LAN-mesh-only visibility until activated.
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKdsDeviceConnected());
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  // Only true right after THIS activation succeeds — a one-time
  // orientation screen, not a persistent state.
  const [activityOrderId, setActivityOrderId] = useState<string | null>(null);
  const [showActivationWelcome, setShowActivationWelcome] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    setActivationError('');
    try {
      await activateKdsDevice(activationCode);
      setIsDeviceActivated(true);
      setShowActivationWelcome(true);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : "Could not complete activation. Check this device's internet connection and try again.");
    } finally {
      setIsActivating(false);
    }
  };

  useKdsDeviceSync(isDeviceActivated);

  // KDS Authentication State — restored from persisted session
  const _kdsSession = SessionPersistence.load('kds');
  const [isKdsLoggedIn, setIsKdsLoggedIn] = useState<boolean>(_kdsSession !== null);
  const [kdsStationSelection, setKdsStationSelection] = useState(
    getAssignedStation() || _kdsSession?.stationName || 'ALL'
  );
  // Initialize active station from session (so KDS resumes on correct station after refresh)
  const [selectedStation, setSelectedStation] = useState<string>(
    getAssignedStation() || _kdsSession?.stationName || 'ALL'
  );
  // A station assigned by Restaurant Admin wins over what was picked on this screen, and follows a change made later.
  useEffect(() => {
    const follow = () => {
      const assigned = getAssignedStation();
      if (assigned) { setKdsStationSelection(assigned); setSelectedStation(assigned); }
    };
    follow();
    const t = setInterval(follow, 5000);
    return () => clearInterval(t);
  }, []);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PREPARING' | 'READY' | 'SERVED' | 'EXPO'>('ALL');
  useEffect(() => {setDisplay(loadKitchenDisplay(selectedStation));setDisplayError('');},[selectedStation]);
  const updateDisplay = (partial: Partial<typeof display>) => {
    try {const next = {...display,...partial};saveKitchenDisplay(selectedStation,next);setDisplay(next);setDisplayError('');}
    catch(e) {setDisplayError(e instanceof Error ? e.message : 'Could not save display settings.');}
  };
  const [ticketSearch, setTicketSearch] = useState('');
  const [sortMode, setSortMode] = useState<'PRIORITY' | 'FIFO'>('PRIORITY');
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  // Real-time Clock Timer for elapsed calculations
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      const since = EndpointResolver.msSinceLastContact();
      const level = connectionLevel(since, typeof navigator === 'undefined' ? true : navigator.onLine !== false, Date.now() - startedAt.current);
      setConn((prev) => (prev.level === level && prev.ageSec === (since === null ? null : Math.floor(since / 1000)) ? prev : { level, ageSec: since === null ? null : Math.floor(since / 1000) }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useKdsLanMesh(setKots);

  // The kitchen stations are the ones this restaurant really uses: every station named on a dish in the menu (Restaurant Admin > Menu),
  // plus any a live ticket already carries. Nothing is hard-coded, so a new station added to a dish appears here by itself.
  const kitchenStations = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (name?: string) => {
      const t = (KitchenStationRepository.resolve(name || '')?.name || name || '').trim();
      if (t && t.toUpperCase() !== 'ALL' && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    };
    KitchenStationRepository.list().forEach(station => add(station.name));
    db.menuItems.forEach((m) => add(m.kitchenStation));
    kots.forEach((k) => { add(k.station); k.items?.forEach((it) => add(it.kitchenStation)); });
    add(getAssignedStation() || undefined);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kots, db.menuItems.length]);
  const stationChoices = useMemo(() => [{ id: 'ALL', label: 'All stations' }, ...kitchenStations.map((n) => ({ id: KitchenStationRepository.resolve(n)?.id || n, label: n }))], [kitchenStations]);

  // Station Filtering Logic
  const stationKots = useMemo(() => {
    return ticketsForStation(kots, selectedStation);
  }, [kots, selectedStation]);

  // Derived KPI Counts (Station Aware)
  const activePreparingCount = useMemo(() => {
    return stationKots.filter(
      (k) => k.status === 'PREPARING' || k.status === 'PENDING' || k.status === 'ACCEPTED' || (k.status as any) === 'COOKING'
    ).length;
  }, [stationKots]);

  const readyPickupCount = useMemo(() => {
    return stationKots.filter((k) => k.status === 'READY').length;
  }, [stationKots]);

  const servedCount = useMemo(() => {
    return stationKots.filter((k) => k.status === 'SERVED').length;
  }, [stationKots]);

  // Cancellation stays visible until acknowledged; ticket creation age cannot suppress a new cancellation.
  const cancelledAlert = (k: KOTRecord) => needsCancellationAcknowledgement(k, dismissed);
  const alertCount = useMemo(() => stationKots.filter(cancelledAlert).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stationKots, dismissed]);

  // What is on screen for the chosen tab: cooking tickets oldest first (the one waiting longest is on top), then ready ones.
  const filteredKots = useMemo(() => {
    const searched = stationKots.filter(k => matchesKitchenSearch(k, ticketSearch));
    if (statusFilter === 'SERVED') {
      return searched
        .filter((k) => k.status === 'SERVED')
        .sort((a, b) => new Date(b.servedAt ?? b.createdAt).getTime() - new Date(a.servedAt ?? a.createdAt).getTime())
        .slice(0, 60);
    }
    const picked = searched.filter((kot) => {
      if (kot.status === 'CANCELLED') return statusFilter !== 'READY' && cancelledAlert(kot);
      if (statusFilter === 'ALL') return kot.status !== 'SERVED';
      if (statusFilter === 'PREPARING') {
        return kot.status === 'PREPARING' || kot.status === 'PENDING' || kot.status === 'ACCEPTED' || (kot.status as any) === 'COOKING';
      }
      return kot.status === statusFilter;
    });
    return sortForKitchen(picked, id => sortMode === 'PRIORITY' ? db.orders.find(o => o.id === id)?.kitchenPriority : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKots, statusFilter, dismissed, ticketSearch, sortMode]);

  // A table order is only truly "served" once a captain has physically delivered it — the kitchen marking
  // it served itself (while the plate may still be sitting at the pass going cold) is exactly the gap that
  // put Captain's own "Food Ready for Delivery" queue there in the first place. This only applies when the
  // restaurant actually has the Captain app (a paid add-on): without it, nobody else can ever mark a dine-in
  // ticket served, so the kitchen keeps that ability rather than stranding every table order at "Ready" forever.
  const captainHandlesService = captainServicePolicy ?? EntitlementService.checkCaptainAppAccess().allowed;

  const toCook = useMemo(() => prepSummary(stationKots), [stationKots]);
  const prepTimeOf = useMemo(() => {
    const byId = new Map(db.menuItems.map((m) => [m.id, m.prepTimeMinutes] as const));
    return (id: string) => byId.get(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.menuItems.length]);

  // The person at the screen, for the audit trail (it used to say "Head Chef" for everyone).
  const chefName = () => SessionPersistence.load('kds')?.fullName || 'Kitchen';
  const logKitchen = (action: string, details: string) => AuditRepository.log({ action, category: 'ORDER', details, username: chefName() });
  const changePriority = (kot: KOTRecord, priority: 'NORMAL' | 'URGENT') => {
    if (!setKitchenPriority(kot.orderId, priority)) return;
    logKitchen('KITCHEN_PRIORITY_CHANGED', `Order #${kot.orderNumber}: ${priority} priority`);
    SyncOutboxEngine.flush();
  };
  const reprintKot = (kot: KOTRecord) => {
    printThermalKotTicket(kot, '80mm', { reprint: true });
    logKitchen('KOT_REPRINTED', `Reprint KOT #${kot.kotNumber} for token #${kot.tokenNumber}`);
    offerUndo(`Reprint opened for #${kot.tokenNumber}. Choose your kitchen printer.`);
  };
  // Every change is pushed at once so the Captain and the counter see it within a second.
  const commit = () => {
    kdsDb.notify();
    setKots([...kdsDb.kots]);
    SyncOutboxEngine.flush();
  };
  const announceReady = (kot: KOTRecord) =>
    lanMeshSync.broadcast('FOOD_READY', {
      tableNumber: kot.tableNumber,
      kotId: kot.id,
      kotNumber: kot.kotNumber,
      orderId: kot.orderId,
      orderNumber: kot.orderNumber,
      items: kot.items,
      dishName: kot.items?.[0]?.name,
      quantity: kot.items?.[0]?.quantity,
      station: kot.station
    });

  // Ticket-level change (start cooking, served). Ready and undo go through the dish-level functions below.
  const updateStatus = (kotId: string, nextStatus: KOTStatus) => {
    const targetKot = kdsDb.kots.find((k) => k.id === kotId);
    if (!targetKot) return;
    if (nextStatus === 'SERVED') targetKot.printed = true;
    KOTRepository.updateKOTStatus(kotId, nextStatus);
    commit();
    logKitchen(`KOT_${nextStatus}`, `KOT #${targetKot.kotNumber} status updated to ${nextStatus} on KDS`);
    lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: targetKot.id, status: nextStatus });
    if (nextStatus === 'READY') announceReady(targetKot);
    else if (nextStatus === 'SERVED') {
      lanMeshSync.broadcast('ORDER_SERVED', { tableNumber: targetKot.tableNumber, kotId: targetKot.id, kotNumber: targetKot.kotNumber });
      offerUndo(`Ticket #${targetKot.tokenNumber} served`, () => recallTicket(targetKot));
    }
  };

  const setDish = (kot: KOTRecord, item: KOTItem, next: 'PREPARING' | 'READY'): boolean => {
    const live = kdsDb.kots.find((k) => k.id === kot.id);
    if (!live || !KOTRepository.setItemStatus(kot.id, item.id, next)) return false;
    logKitchen(next === 'READY' ? 'KOT_ITEM_READY' : 'KOT_ITEM_UNDONE', `${item.quantity} x ${item.name} on KOT #${kot.kotNumber} ${next === 'READY' ? 'marked ready' : 'put back to cooking'}`);
    lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: kot.id, status: live.status });
    if (next === 'READY' && live.status === 'READY') announceReady(live);
    commit();
    return true;
  };

  // One tap on a dish: cooking -> ready, ready -> back to cooking. The ticket becomes ready by itself with its last dish.
  const toggleDish = (kot: KOTRecord, item: KOTItem) => {
    const next = effectiveItemStatus(kot, item) === 'READY' ? 'PREPARING' : 'READY';
    if (!setDish(kot, item, next)) return;
    if (next === 'READY') offerUndo(`${item.name} ready`, () => { setDish(kot, item, 'PREPARING'); setUndo(null); });
  };

  const markAllReady = (kot: KOTRecord) => {
    const live = kdsDb.kots.find((k) => k.id === kot.id);
    if (!live) return;
    let moved = 0;
    liveItems(live).forEach((i) => {
      if (effectiveItemStatus(live, i) !== 'READY' && effectiveItemStatus(live, i) !== 'SERVED' && KOTRepository.setItemStatus(kot.id, i.id, 'READY')) moved += 1;
    });
    if (moved === 0) KOTRepository.updateKOTStatus(kot.id, 'READY');
    logKitchen('KOT_READY', `KOT #${live.kotNumber} marked ready on KDS`);
    lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: live.id, status: 'READY' });
    announceReady(live);
    commit();
    offerUndo(`Ticket #${live.tokenNumber} ready`, () => recallTicket(live));
  };

  function recallTicket(kot: KOTRecord) {
    if (KOTRepository.recallKot(kot.id)) {
      logKitchen('KOT_RECALLED', `KOT #${kot.kotNumber} brought back to cooking on KDS`);
      lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: kot.id, status: 'PREPARING' });
      commit();
      setUndo(null);
    } else {
      offerUndo('This ticket cannot be brought back: the order is already settled.');
    }
  }

  // The pass looks at every station, whichever one this screen is set to.
  const expoBoard = useMemo(
    () => {
      const matching = new Set(kots.filter(k => matchesKitchenSearch(k, ticketSearch)).map(k => k.orderId));
      return buildExpoBoard(kots.filter(k => matching.has(k.orderId)), Date.now(), prepTimeOf, id => sortMode === 'PRIORITY' ? db.orders.find(o => o.id === id)?.kitchenPriority : undefined);
    },
    // currentTime ticks every second, which keeps each order's age moving
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kots, currentTime, prepTimeOf, ticketSearch, sortMode]
  );

  const serveOrder = (order: { orderId: string; tableNumber?: string; tokenNumber: string; ticketIds: string[] }) => {
    const served: KOTRecord[] = [];
    for (const id of order.ticketIds) {
      const t = kdsDb.kots.find((k) => k.id === id);
      if (!t) continue;
      t.printed = true;
      KOTRepository.updateKOTStatus(id, 'SERVED');
      lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: t.id, status: 'SERVED' });
      lanMeshSync.broadcast('ORDER_SERVED', { tableNumber: t.tableNumber, kotId: t.id, kotNumber: t.kotNumber });
      served.push(t);
    }
    if (served.length === 0) return;
    logKitchen('KOT_SERVED', `Order #${served[0].orderNumber} sent out from the pass (${served.length} ticket${served.length === 1 ? '' : 's'})`);
    commit();
    offerUndo(`${order.tableNumber ? `Table ${order.tableNumber}` : `Token ${order.tokenNumber}`} sent out`, () => { served.forEach((t) => KOTRepository.recallKot(t.id)); commit(); setUndo(null); });
  };

  const retryNow = () => {
    void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    void SyncOutboxEngine.catchUpFromCloud();
  };

  const stationName = selectedStation === 'ALL' ? 'All stations' : KitchenStationRepository.resolve(selectedStation)?.name || selectedStation;

  const handleKdsLogout = () => {
    setIsKdsLoggedIn(false);
    SessionPersistence.clear('kds');
  };

  // Device activation gate — this terminal has no cloud identity until an
  // activation code is redeemed. Runs before the PIN-login screen below,
  // mirroring POS's activation-before-staff-login order.
  if (!isDeviceActivated) {
    return (
      <KdsActivationScreen
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
        appName="Kitchen Display"
        tips={[
          'Pick your station (or "All") on the next screen.',
          'Real orders sent from POS, Captain, or Kiosk appear here automatically — nothing to configure.',
          'Mark a ticket Ready or Served with one tap once it\'s cooking.'
        ]}
        onContinue={() => setShowActivationWelcome(false)}
      />
    );
  }

  // =========================================================================
  // 1. KDS AUTHENTICATION & STATION LOCK SCREEN
  // =========================================================================
  if (!isKdsLoggedIn) {
    return (
      <KdsSignInScreen
        kitchenStations={kitchenStations}
        stationChoices={stationChoices}
        kdsStationSelection={kdsStationSelection}
        setKdsStationSelection={setKdsStationSelection}
        onLoggedIn={(stationName) => {
          setSelectedStation(stationName);
          setIsKdsLoggedIn(true);
        }}
      />
    );
  }

  // =========================================================================
  // 2. KDS MAIN OPERATIONS WORKSPACE
  // =========================================================================
  const nowMs = Date.now();
  const tabs = [
    { id: 'ALL', label: 'ACTIVE', short: 'Active', count: activePreparingCount + readyPickupCount + alertCount, icon: UtensilsCrossed },
    { id: 'PREPARING', label: 'COOKING', short: 'Cooking', count: activePreparingCount, icon: Flame },
    { id: 'READY', label: 'READY', short: 'Ready', count: readyPickupCount, icon: Bell },
    { id: 'SERVED', label: 'SERVED', short: 'Served', count: servedCount, icon: CheckCheck },
    { id: 'EXPO', label: 'EXPO (PASS)', short: 'Pass', count: expoBoard.length, icon: ArrowRight }
  ] as const;

  return (
    <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
      <div data-jv-workspace="kds" className="h-dvh bg-jaman-cream text-jaman-navy flex flex-col select-none font-sans overflow-hidden">
        {/* CONNECTION BAR: shown only when this screen has stopped hearing from the server */}
        {conn.level !== 'ok' && (
          <div
            role="alert"
            data-testid="kds-connection-bar"
            className={`shrink-0 px-3 sm:px-6 py-2 text-xs sm:text-sm font-black flex items-center justify-between gap-3 ${conn.level === 'lost' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-amber-950'}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span className="min-w-0">
                {conn.level === 'lost' ? 'Connection lost: new orders may be delayed. Reconnecting…' : 'Slow connection: orders may arrive late.'}
                {conn.ageSec !== null && <span className="opacity-90 font-bold"> Last update {conn.ageSec}s ago.</span>}
              </span>
            </span>
            <button type="button" onClick={retryNow} className="shrink-0 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 font-black text-xs cursor-pointer">
              Retry now
            </button>
          </div>
        )}

        <JamanAiAssistantModal isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} app="KDS" userRole="CHEF" posContext="KOT" onPerformAction={() => { setStatusFilter("ALL"); setTicketSearch(""); }} onQueryExecuted={(intent, _query, ms) => void reportAiQueryNow(intent, ms ?? 0)} />

        {/* TOP HEADER: brand, live status, counters, station selector */}
        <header className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-xs shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <BrandHeader app="KDS" logoHeight={narrow ? 32 : 46} badgeSize="sm" showContext={false} />
            <div className="hidden xl:flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] px-3 py-1.5 rounded-xl text-xs font-bold text-jaman-saffron">
              <span>Station:</span>
              <span className="font-black text-jaman-navy">{stationName}</span>
            </div>
          </div>

          {ai.showButton(db.restaurant?.showJamanAI !== false) && <button type="button" aria-label="Open JAMAN AI Kitchen Intelligence" onClick={() => setAssistantOpen(true)} className="flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-jaman-saffron"><Sparkles className="h-4 w-4" /> JAMAN AI</button>}
          {/* Station pills: their own row on small screens, scrolling sideways */}
          <nav aria-label="Kitchen station" className="order-last xl:order-none w-full xl:w-auto xl:flex-1 min-w-0 flex xl:justify-center">
            <div className="flex items-center gap-1.5 bg-jaman-cream p-1 rounded-2xl border border-jaman-border overflow-x-auto max-w-full">
              {stationChoices.map((st) => (
                <button
                  key={st.id}
                  aria-label={`Kitchen station ${st.label}`}
                  type="button"
                  onClick={() => setSelectedStation(st.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    selectedStation === st.id || KitchenStationRepository.resolve(selectedStation)?.id === st.id ? 'bg-jaman-navy text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-jaman-navy'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <StaffLanguagePicker/>
            <details className="relative text-xs"><summary className="min-h-11 flex items-center cursor-pointer font-bold">{staffText('Staff practice')}</summary><div className="absolute right-0 top-full w-80 max-w-[85vw] shadow-lg bg-white z-50 rounded-2xl"><StaffPracticePanel/></div></details>
            <div
              data-testid="kds-live-pill"
              data-level={conn.level}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 font-mono shadow-2xs border ${
                conn.level === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : conn.level === 'slow' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${conn.level === 'ok' ? 'bg-emerald-500 animate-pulse' : conn.level === 'slow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span className="hidden sm:inline font-sans font-black text-[11px]">{conn.level === 'ok' ? 'LIVE' : conn.level === 'slow' ? 'SLOW' : 'OFFLINE'}</span>
              <span className="hidden md:inline text-slate-300">|</span>
              <span className="hidden md:inline">{currentTime}</span>
            </div>

            <div className="bg-[#FFF4ED] border border-[#FDBA74] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-jaman-saffron flex items-center gap-1.5 shadow-2xs" title="Tickets cooking">
              <Flame className="w-4 h-4 text-jaman-saffron" />
              <span className="font-mono font-black">{activePreparingCount}</span>
              <span className="hidden lg:inline font-bold text-[11px]">Cooking</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5 shadow-2xs" title="Tickets ready">
              <Bell className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-black">{readyPickupCount}</span>
              <span className="hidden lg:inline font-bold text-[11px]">Ready</span>
            </div>

            <button
              type="button"
              onClick={handleKdsLogout}
              title="Switch kitchen station or logout"
              aria-label="Switch station or log out"
              className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-jaman-border hover:border-rose-300 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Switch Station</span>
            </button>
          </div>
        </header>

        {/* STATUS TABS */}
        <details className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 shrink-0">
          <summary className="min-h-11 cursor-pointer font-bold text-sm text-jaman-navy">Display & station timing</summary>
          <div className="flex flex-wrap gap-3 py-3 text-sm">
            <label>Screen layout<select aria-label="Kitchen screen layout" value={display.density} onChange={e => updateDisplay({density:e.target.value as typeof display.density})} className="block min-h-11 rounded-xl border px-3"><option value="compact">Compact</option><option value="comfortable">Comfortable / tablet</option><option value="tv">Large / TV</option></select></label>
            {(['minimumMinutes','fallbackMinutes','maximumMinutes'] as const).map(field => <label key={`${selectedStation}:${field}`}>{field === 'minimumMinutes' ? 'Minimum prep (min)' : field === 'maximumMinutes' ? 'Maximum prep (min)' : 'Default prep (min)'}<input aria-label={field} type="number" min="1" max="240" defaultValue={display[field]} onBlur={e => updateDisplay({[field]:Number(e.target.value)})} className="block min-h-11 w-32 rounded-xl border px-3"/></label>)}
            <p className="self-end text-slate-600">Saved for this screen and selected station. Dish prep times take precedence.</p>
          </div>
          {displayError && <p role="alert" className="text-rose-700 text-sm mb-2">{displayError}</p>}
        </details>
        <div className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 shrink-0 shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto max-w-[1920px] mx-auto" role="tablist">
            {tabs.map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`min-h-[44px] px-3 sm:px-5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shrink-0 active:scale-95 cursor-pointer ${
                    isSelected ? 'bg-jaman-saffron text-white shadow-md shadow-orange-500/25' : 'bg-jaman-cream border border-jaman-border text-slate-700 hover:bg-[#F0ECE1] hover:text-jaman-navy'
                  }`}
                >
                  <tab.icon className="w-4 h-4 hidden sm:block" />
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{staffText(tab.label)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${isSelected ? 'bg-white text-jaman-saffron' : 'bg-white border border-jaman-border text-slate-600'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* WHAT STILL HAS TO BE COOKED, summed across tickets, so a cook can batch */}
        <div className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[140px] max-w-xl">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input aria-label="Search kitchen tickets" value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} placeholder="Search token, table, KOT or dish…" className="w-full min-h-[40px] pl-9 pr-10 rounded-xl border border-jaman-border text-sm bg-jaman-cream" />
            {ticketSearch && <button aria-label="Clear ticket search" onClick={() => setTicketSearch('')} className="absolute right-1 top-0 min-h-[40px] w-9 flex justify-center items-center"><X className="w-4 h-4" /></button>}
          </div>
          <select aria-label="Kitchen ticket ordering" value={sortMode} onChange={e => setSortMode(e.target.value as 'PRIORITY' | 'FIFO')} className="min-h-[40px] px-3 rounded-xl border border-jaman-border text-xs font-bold bg-jaman-cream text-jaman-navy">
            <option value="PRIORITY">Priority, then oldest</option><option value="FIFO">Oldest first</option>
          </select>
          {ticketSearch && <span className="text-xs text-slate-500" role="status">{statusFilter === 'EXPO' ? expoBoard.length + ' orders' : filteredKots.length + ' tickets'} found</span>}
        </div>
        {(statusFilter === 'ALL' || statusFilter === 'PREPARING') && toCook.length > 0 && (
          <div className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 shrink-0 flex items-center gap-2 overflow-x-auto" aria-label="Dishes still to cook" data-testid="kds-to-cook">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500 shrink-0">To cook</span>
            {toCook.map((d) => (
              <span key={d.name} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-1 text-xs font-black text-amber-900">
                <span className="font-mono text-sm">{d.qty}×</span>
                {d.name}
              </span>
            ))}
          </div>
        )}

        {/* TICKETS */}
        <main data-testid="kds-board" className="kds-board flex-1 p-3 sm:p-5 overflow-y-auto min-h-0 min-w-0">
          <div className={`kds-grid kds-density-${display.density} gap-3 sm:gap-4 mx-auto items-start`} style={{'--kds-card-width':display.density === 'compact' ? '270px' : display.density === 'tv' ? '460px' : '330px'} as React.CSSProperties}>
            {statusFilter === 'EXPO' && <KdsExpoBoard orders={expoBoard} orderTypeLabel={(t) => ORDER_TYPE_LABEL[t] || t} onServeOrder={serveOrder} captainHandlesService={captainHandlesService} />}

            {statusFilter !== 'EXPO' && filteredKots.map((kot) => {
              const cashier = kot.cashierName ? `${kotTakenByLabel(kot)}: ${kot.cashierName}` : null;
              return (
                <KdsTicketCard
                  key={kot.id}
                  kot={kot}
                  age={ticketAge(kot, nowMs, prepMinutes(kot, prepTimeOf, display))}
                  progress={orderProgress(kdsDb.kots, kot.orderId)}
                  orderTypeLabel={ORDER_TYPE_LABEL[kot.orderType] || kot.orderType}
                  takenBy={cashier}
                  onToggleDish={toggleDish}
                  onStart={(k) => updateStatus(k.id, 'PREPARING')}
                  onAllReady={markAllReady}
                  onServe={(k) => updateStatus(k.id, 'SERVED')}
                  captainHandlesService={captainHandlesService}
                  onRecall={recallTicket}
                  onDismiss={dismissCancelled}
                  priority={db.orders.find(o => o.id === kot.orderId)?.kitchenPriority || 'NORMAL'}
                  onPriority={changePriority}
                  onReprint={reprintKot}
                  onActivity={kot=>setActivityOrderId(kot.orderId)}
                />
              );
            })}

            <Modal isOpen={!!activityOrderId} onClose={()=>setActivityOrderId(null)} title="Order history">{db.orders.find(o=>o.id===activityOrderId) ? <OrderActivityView order={db.orders.find(o=>o.id===activityOrderId)!} loadActivity={loadOrderActivity}/> : <p>Order details have not arrived on this screen yet. Refresh sync and try again.</p>}</Modal>
            {statusFilter !== 'EXPO' && filteredKots.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={<ChefHat className="w-8 h-8" />}
                  title={ticketSearch ? 'No matching kitchen tickets' : statusFilter === 'SERVED' ? 'Nothing served yet' : 'All Kitchen Orders Cleared'}
                  description={ticketSearch ? 'Clear the search or try a token, table, KOT number or dish name.' : statusFilter === 'SERVED' ? 'Tickets you mark served appear here, and can be brought back if you tapped by mistake.' : 'No tickets currently waiting at this station. New orders from POS, Captain or the kiosk appear here by themselves, no refresh needed.'}
                />
              </div>
            )}
          </div>
        </main>

        {/* UNDO / NOTICE */}
        {undo && (
          <div role="status" data-testid="kds-undo" className="shrink-0 bg-jaman-navy text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-bold">
            <span className="min-w-0 break-words">{undo.text}</span>
            {undo.run && (
              <button type="button" onClick={() => { undo.run?.(); setUndo(null); }} className="shrink-0 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 font-black text-xs uppercase cursor-pointer">
                Undo
              </button>
            )}
            <button type="button" onClick={() => setUndo(null)} aria-label="Dismiss" className="shrink-0 text-white/70 hover:text-white cursor-pointer">×</button>
          </div>
        )}

        {/* Real-time Push Notifications for Kitchen Staff */}
        <NotificationToastContainer role="KDS" />
      </div>
    </JAMANVAARStartup>
  );
};

export default App;
