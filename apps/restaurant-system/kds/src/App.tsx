import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, kdsDb, KOTRepository, AuditRepository, NotificationRepository, StaffRepository, KeyValueStore } from '@jamanvaar/database';
import { getAssignedStation, EntitySyncEngine, lanMeshSync, SyncOutboxEngine, syncServiceMessages, syncMenuCatalog, EndpointResolver, onAppResume } from '@jamanvaar/sync';
import { KOTRecord, KOTStatus, KOTItem } from '@jamanvaar/types';
import { KdsTicketCard } from './KdsTicketCard';
import { connectionLevel, effectiveItemStatus, liveItems, orderProgress, prepMinutes, prepSummary, sortForKitchen, ticketAge } from './kdsLogic';
import { Platform } from '@jamanvaar/api';
import { activateKdsDevice, isKdsDeviceConnected, pushOrderSync, pullOrderSync, pushEntitySync, pullEntitySync, reportHeartbeat, CloudApiError, leaseNumberBlock } from './cloud/cloudClient';
import {
  JamanvaarAuthLayout,
  APP_HERO_IMAGES,
  BrandHeader,
  NotificationToastContainer,
  JAMANVAARStartup,
  EmptyState,
  ActivationWelcomeScreen,
  ActivationNoticeBanner,
  ActivationHelpNote
} from '@jamanvaar/ui';
import { SessionPersistence } from '@jamanvaar/business';
import { sound } from '@jamanvaar/ui';
import {
  ChefHat,
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  Timer,
  Bell,
  UtensilsCrossed,
  Check,
  CheckCheck,
  LogOut,
  Zap,
  WifiOff,
  Delete,
  AlertTriangle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

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
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
    } finally {
      setIsActivating(false);
    }
  };

  useEffect(() => {
    if (!isDeviceActivated) {
      SyncOutboxEngine.configureTransport(null);
      return;
    }
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync, leaseNumbers: leaseNumberBlock, deviceId: () => localStorage.getItem('jamanvaar_kds_device_id') });
    EntitySyncEngine.configureTransport({ push: pushEntitySync, pull: pullEntitySync });

    // BUG-019/034/035: a staff PIN issued in Restaurant Admin used to work only on the device that
    // created it — KDS had no entity-sync wiring at all (not even for menu/CRM), so a kitchen chef's
    // PIN never reached this screen despite the create/reset screen's own promise that it would.
    const syncStaff = async () => {
      await EntitySyncEngine.catchUp('STAFF_USER', (remote) => StaffRepository.applyRemoteUser(remote.payload));
    };

    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void syncStaff();
    // The menu (read-only here) tells this screen which kitchen stations the restaurant uses.
    void syncMenuCatalog({ push: false });
    void reportHeartbeat();

    // A kitchen needs new tickets within seconds, not every 15 s.
    const orderInterval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      // BUG-100: messages from the floor to the kitchen arrive as notifications.
      void syncServiceMessages('KDS');
    }, 3000);
    const interval = setInterval(() => {
      void syncStaff();
      void syncMenuCatalog({ push: false });
      void reportHeartbeat();
    }, 15000);

    // Waking the screen (tab visible again, network back, tablet unlocked) catches up at once: no refresh needed.
    const stopResume = onAppResume(() => {
      void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
      void SyncOutboxEngine.catchUpFromCloud();
      void syncServiceMessages('KDS');
    });

    return () => {
      clearInterval(orderInterval);
      clearInterval(interval);
      stopResume();
    };
  }, [isDeviceActivated]);

  // KDS Authentication State — restored from persisted session
  const _kdsSession = SessionPersistence.load('kds');
  const [isKdsLoggedIn, setIsKdsLoggedIn] = useState<boolean>(_kdsSession !== null);
  const [kdsPin, setKdsPin] = useState('');
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PREPARING' | 'READY' | 'SERVED'>('ALL');
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

  // Real-time Multi-Device Sync Engine & Cluster Listeners
  useEffect(() => {
    if (typeof window !== 'undefined') {
      lanMeshSync.registerDevice('KDS', 'KDS-01', 'Kitchen Display System');
      lanMeshSync.setAttachedDatabase(kdsDb);

      // 1. Initial Merge: Synchronize central db.kots into kdsDb if missing
      if (db.kots && db.kots.length > 0) {
        let changed = false;
        db.kots.forEach((dk) => {
          if (!kdsDb.kots.some((k) => k.id === dk.id)) {
            kdsDb.kots.push(dk);
            changed = true;
          }
        });
        if (changed) {
          kdsDb.notify();
          setKots([...kdsDb.kots]);
        }
      }

      // 2. Real-time Listeners for Newly Fired KOTs from POS / Captain
      const unsubKot = lanMeshSync.on('KOT_CREATED', (event) => {
        const newKots: KOTRecord[] = Array.isArray(event.payload) ? event.payload : [event.payload];
        let hasNew = false;
        newKots.forEach((nk) => {
          if (nk && nk.id && !kdsDb.kots.some((k) => k.id === nk.id)) {
            kdsDb.kots.unshift(nk);
            hasNew = true;
          }
        });
        if (hasNew) {
          kdsDb.notify();
          setKots([...kdsDb.kots]);
        }
      });

      // 3. Listener for Orders Served
      const unsubServed = lanMeshSync.on('ORDER_SERVED', (event) => {
        const { kotId } = event.payload || {};
        if (kotId) {
          const target = kdsDb.kots.find((k) => k.id === kotId);
          if (target && target.status !== 'SERVED') {
            target.status = 'SERVED';
            target.printed = true;
            kdsDb.notify();
            setKots([...kdsDb.kots]);
          }
        }
      });

      // 4. Listener for Food Ready
      const unsubFoodReady = lanMeshSync.on('FOOD_READY', (event) => {
        const { kotId } = event.payload || {};
        if (kotId) {
          const target = kdsDb.kots.find((k) => k.id === kotId);
          if (target && target.status !== 'READY') {
            target.status = 'READY';
            kdsDb.notify();
            setKots([...kdsDb.kots]);
          }
        }
      });

      // 5. Database mutation subscriber
      const unsubDb = kdsDb.subscribe(() => {
        setKots([...kdsDb.kots]);
      });

      // 6. Internal messages from Captain/POS addressed to the Kitchen — a
      // message sent to "Kitchen" previously vanished silently, since KDS
      // never listened for INTERNAL_MESSAGE_SENT at all despite Captain
      // already broadcasting it correctly.
      const unsubMessage = lanMeshSync.on('INTERNAL_MESSAGE_SENT', (event) => {
        const msg = event.payload as { recipient?: string; senderName?: string; presetText?: string; customNote?: string; tableNumber?: string } | undefined;
        if (!msg || (msg.recipient !== 'KITCHEN' && msg.recipient !== 'ALL')) return;
        sound.play('kot');
        NotificationRepository.createNotification({
          type: 'MANAGER_ALERT' as any,
          title: `💬 Message from ${msg.senderName || 'Floor Staff'}${msg.tableNumber ? ` — Table ${msg.tableNumber}` : ''}`,
          message: msg.customNote || msg.presetText || 'New message for the kitchen.',
          priority: 'HIGH',
          targetRoles: ['KDS', 'ALL'],
          tableNumber: msg.tableNumber
        });
      });

      return () => {
        unsubKot();
        unsubServed();
        unsubFoodReady();
        unsubDb();
        unsubMessage();
      };
    }
  }, []);

  const [kdsPinError, setKdsPinError] = useState(false);
  // Set when the PIN is right but the person's role cannot use the kitchen screen (BUG-147).
  const [kdsPinDenied, setKdsPinDenied] = useState<string | null>(null);

  // Same fix as Captain's SEC-006: authenticate against real db.users
  // records instead of accepting any 4-digit sequence. Previously this
  // logged any staff member in the moment they'd typed 4 digits, checking
  // nothing — not even a hardcoded PIN, unlike Captain/POS Admin's
  // (already-fixed or already-removed) demo bypasses.
  const handleKdsPinPress = async (digit: string) => {
    if (kdsPin.length < 4) {
      const next = kdsPin + digit;
      setKdsPin(next);
      if (next.length === 4) {
        const candidate = (await StaffRepository.verifyPin(next))?.user;
        // A PIN for a role that does not work the kitchen screen is refused (BUG-118).
        const matchedUser = candidate && StaffRepository.canUseTerminal(candidate.roleId, 'KDS') ? candidate : undefined;

        setKdsPinDenied(candidate && !matchedUser ? StaffRepository.terminalDeniedMessage(candidate.roleId, 'KDS') : null);

        if (matchedUser) {
          setKdsPinError(false);
          setSelectedStation(kdsStationSelection);
          setIsKdsLoggedIn(true);
          SessionPersistence.save('kds', {
            userId: matchedUser.id,
            fullName: matchedUser.fullName,
            roleId: matchedUser.roleId || 'KDS_STATION',
            restaurantId: matchedUser.restaurantId || db.restaurant.id,
            stationId: kdsStationSelection.toLowerCase().replace(/\s+/g, '-'),
            stationName: kdsStationSelection,
            terminalId: 'KDS-01'
          });
        } else {
          setKdsPinError(true);
        }
        setKdsPin('');
      }
    }
  };

  const handleKdsLogout = () => {
    setIsKdsLoggedIn(false);
    setKdsPin('');
    SessionPersistence.clear('kds');
  };

  // The kitchen stations are the ones this restaurant really uses: every station named on a dish in the menu (Restaurant Admin > Menu),
  // plus any a live ticket already carries. Nothing is hard-coded, so a new station added to a dish appears here by itself.
  const kitchenStations = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (name?: string) => {
      const t = (name || '').trim();
      if (t && t.toUpperCase() !== 'ALL' && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    };
    db.menuItems.forEach((m) => add(m.kitchenStation));
    kots.forEach((k) => { add(k.station); k.items?.forEach((it) => add(it.kitchenStation)); });
    add(getAssignedStation() || undefined);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kots, db.menuItems.length]);
  const stationChoices = useMemo(() => [{ id: 'ALL', label: 'All stations' }, ...kitchenStations.map((n) => ({ id: n, label: n }))], [kitchenStations]);

  // Station Filtering Logic
  const stationKots = useMemo(() => {
    if (selectedStation === 'ALL') return kots;
    const exact = selectedStation.trim().toLowerCase();
    const sameStation = kots.filter((kot) => (kot.station || '').trim().toLowerCase() === exact || kot.items?.some((it) => (it.kitchenStation || '').trim().toLowerCase() === exact));
    if (sameStation.length > 0) return sameStation;
    const stLower = selectedStation.toLowerCase();
    return kots.filter((kot) => {
      const kotStation = (kot.station || '').toLowerCase();
      if (kotStation.includes(stLower)) return true;
      if (stLower.includes('main') && (kotStation.includes('main') || kotStation.includes('curry') || kotStation.includes('kitchen'))) return true;
      if (stLower.includes('tandoor') && kotStation.includes('tandoor')) return true;
      if (stLower.includes('dessert') && (kotStation.includes('dessert') || kotStation.includes('sweet'))) return true;
      if (stLower.includes('beverage') && (kotStation.includes('bar') || kotStation.includes('drink') || kotStation.includes('beverage'))) return true;
      return kot.items?.some((it) => {
        const itSt = (it.kitchenStation || '').toLowerCase();
        if (itSt.includes(stLower)) return true;
        if (stLower.includes('main') && (itSt.includes('main') || itSt.includes('curry') || itSt.includes('pantry'))) return true;
        if (stLower.includes('beverage') && (itSt.includes('bar') || itSt.includes('drink') || itSt.includes('beverage'))) return true;
        return false;
      });
    });
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

  // A cancelled ticket stays in view (red) until a cook dismisses it, but not for ever.
  const cancelledAlert = (k: KOTRecord) => k.status === 'CANCELLED' && !dismissed.has(k.id) && Date.now() - new Date(k.createdAt).getTime() < 12 * 60 * 60 * 1000;
  const alertCount = useMemo(() => stationKots.filter(cancelledAlert).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stationKots, dismissed]);

  // What is on screen for the chosen tab: cooking tickets oldest first (the one waiting longest is on top), then ready ones.
  const filteredKots = useMemo(() => {
    if (statusFilter === 'SERVED') {
      return stationKots
        .filter((k) => k.status === 'SERVED')
        .sort((a, b) => new Date(b.servedAt ?? b.createdAt).getTime() - new Date(a.servedAt ?? a.createdAt).getTime())
        .slice(0, 60);
    }
    const picked = stationKots.filter((kot) => {
      if (kot.status === 'CANCELLED') return statusFilter !== 'READY' && cancelledAlert(kot);
      if (statusFilter === 'ALL') return kot.status !== 'SERVED';
      if (statusFilter === 'PREPARING') {
        return kot.status === 'PREPARING' || kot.status === 'PENDING' || kot.status === 'ACCEPTED' || (kot.status as any) === 'COOKING';
      }
      return kot.status === statusFilter;
    });
    return sortForKitchen(picked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKots, statusFilter, dismissed]);

  const toCook = useMemo(() => prepSummary(stationKots), [stationKots]);
  const prepTimeOf = useMemo(() => {
    const byId = new Map(db.menuItems.map((m) => [m.id, m.prepTimeMinutes] as const));
    return (id: string) => byId.get(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.menuItems.length]);

  // The person at the screen, for the audit trail (it used to say "Head Chef" for everyone).
  const chefName = () => SessionPersistence.load('kds')?.fullName || 'Kitchen';
  const logKitchen = (action: string, details: string) => AuditRepository.log({ action, category: 'ORDER', details, username: chefName() });
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

  const retryNow = () => {
    void SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    void SyncOutboxEngine.catchUpFromCloud();
  };

  const stationName = selectedStation === 'ALL' ? 'All stations' : selectedStation;

  // Device activation gate — this terminal has no cloud identity until an
  // activation code is redeemed. Runs before the PIN-login screen below,
  // mirroring POS's activation-before-staff-login order.
  if (!isDeviceActivated) {
    return (
      <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
        <JamanvaarAuthLayout
          appIdentity="KDS"
          appTitle="Kitchen Display System"
          appSubtitle="One-time setup — activate this display to start receiving tickets."
          heroHeadline="Real-Time Kitchen Production Command"
          heroHighlightWord="Live KOTs"
          heroDescription="Instant station routing, live ticket timers, and cross-terminal food ready dispatch for kitchen staff."
          heroImages={APP_HERO_IMAGES.KDS}
        >
          <ActivationNoticeBanner />
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Activate This Terminal</h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              Enter the activation key from your Super Admin Welcome Kit to connect this Kitchen Display to your restaurant.
            </p>
          </div>
          <form onSubmit={handleActivate} className="space-y-3.5">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1.5">Activation Key *</label>
              <input
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
                placeholder="JMV-XXXX-XXXX-XXXX"
                required
                autoFocus
                className="w-full bg-white border border-jaman-border focus:border-jaman-saffron focus:ring-2 focus:ring-jaman-saffron/20 rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors uppercase placeholder:text-slate-400"
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
              disabled={isActivating || !activationCode.trim()}
              className="w-full py-4 rounded-2xl bg-jaman-saffron hover:bg-[#D45E0F] disabled:opacity-50 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isActivating ? 'Activating…' : 'Activate Terminal'}</span>
              {!isActivating && <ArrowRight className="w-4 h-4 text-white" />}
            </button>
          </form>
          <ActivationHelpNote deviceNoun="terminal" />
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
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
      <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" minDurationMs={1200}>
        <JamanvaarAuthLayout
          appIdentity="KDS"
          appTitle="Kitchen Display System"
          appSubtitle="Kitchen Stations & Line Cook Display"
          isLocalCoreUnauthorized={kdsDb.isLocalCoreUnauthorized()}
          healthCheckUrl={`${kdsDb.getSyncServerUrl()}/api/health`}
          heroHeadline="Real-Time Kitchen Production Command"
          heroHighlightWord="Live KOTs"
          heroDescription="Instant station routing, live ticket timers, and cross-terminal food ready dispatch for kitchen staff."
          heroImages={APP_HERO_IMAGES.KDS}
        >
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Kitchen Staff Sign In</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Choose your station, then enter your 4-digit staff PIN</p>
            </div>

            {/* Station: the ones on this restaurant's menu. A station assigned to this screen in Restaurant Admin is fixed. */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-jaman-navy uppercase tracking-wider">Kitchen Station</label>
              {getAssignedStation() ? (
                <div className="p-3.5 rounded-2xl bg-[#FDFBF7] border border-jaman-border text-xs font-bold text-jaman-navy">
                  This screen is assigned to <span className="text-jaman-saffron">{getAssignedStation()}</span> by your restaurant admin.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stationChoices.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setKdsStationSelection(st.id)}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                        kdsStationSelection === st.id
                          ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                          : 'bg-jaman-cream border-jaman-border text-jaman-navy hover:bg-[#FFF4ED] hover:border-jaman-saffron'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}
              {kitchenStations.length === 0 && (
                <p className="text-[11px] text-slate-500 font-medium">No kitchen stations are set on the menu yet, so this screen shows every ticket.</p>
              )}
            </div>

            {/* PIN Input & Numpad */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-jaman-navy uppercase tracking-wider">Staff 4-Digit PIN</label>
              <input
                type="password"
                maxLength={4}
                value={kdsPin}
                readOnly
                placeholder="• • • •"
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3.5 px-4 rounded-2xl bg-white border border-jaman-border focus:border-jaman-saffron outline-none text-jaman-navy"
              />
              {kdsPinError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{kdsPinDenied ?? 'Incorrect PIN. Please try again.'}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === 'C') { setKdsPin(''); setKdsPinError(false); }
                      else if (k === '⌫') setKdsPin((prev) => prev.slice(0, -1));
                      else handleKdsPinPress(k);
                    }}
                    className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-black font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
                  >
                    {k === '⌫' ? <Delete className="w-4 h-4 text-slate-500" /> : k === 'C' ? <span className="text-xs font-black uppercase tracking-wider text-slate-500">Clear</span> : k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
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
    { id: 'SERVED', label: 'SERVED', short: 'Served', count: servedCount, icon: CheckCheck }
  ] as const;

  return (
    <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
      <div className="h-dvh bg-jaman-cream text-jaman-navy flex flex-col select-none font-sans overflow-hidden">
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

        {/* TOP HEADER: brand, live status, counters, station selector */}
        <header className="bg-white border-b border-jaman-border px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-xs shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <BrandHeader app="KDS" logoHeight={narrow ? 32 : 46} badgeSize="sm" showContext={false} />
            <div className="hidden xl:flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] px-3 py-1.5 rounded-xl text-xs font-bold text-jaman-saffron">
              <span>Station:</span>
              <span className="font-black text-jaman-navy">{stationName}</span>
            </div>
          </div>

          {/* Station pills: their own row on small screens, scrolling sideways */}
          <nav aria-label="Kitchen station" className="order-last lg:order-none w-full lg:w-auto lg:flex-1 min-w-0 flex lg:justify-center">
            <div className="flex items-center gap-1.5 bg-jaman-cream p-1 rounded-2xl border border-jaman-border overflow-x-auto max-w-full">
              {stationChoices.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStation(st.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    selectedStation === st.id ? 'bg-jaman-navy text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-jaman-navy'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
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
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${isSelected ? 'bg-white text-jaman-saffron' : 'bg-white border border-jaman-border text-slate-600'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* WHAT STILL HAS TO BE COOKED, summed across tickets, so a cook can batch */}
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
        <main className="flex-1 p-3 sm:p-5 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 max-w-[1920px] mx-auto items-start">
            {filteredKots.map((kot) => {
              const cashier = kot.cashierName ? `${kotTakenByLabel(kot)}: ${kot.cashierName}` : null;
              return (
                <KdsTicketCard
                  key={kot.id}
                  kot={kot}
                  age={ticketAge(kot, nowMs, prepMinutes(kot, prepTimeOf))}
                  progress={orderProgress(kdsDb.kots, kot.orderId)}
                  orderTypeLabel={ORDER_TYPE_LABEL[kot.orderType] || kot.orderType}
                  takenBy={cashier}
                  onToggleDish={toggleDish}
                  onStart={(k) => updateStatus(k.id, 'PREPARING')}
                  onAllReady={markAllReady}
                  onServe={(k) => updateStatus(k.id, 'SERVED')}
                  onRecall={recallTicket}
                  onDismiss={dismissCancelled}
                />
              );
            })}

            {filteredKots.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={<ChefHat className="w-8 h-8" />}
                  title={statusFilter === 'SERVED' ? 'Nothing served yet' : 'All Kitchen Orders Cleared'}
                  description={statusFilter === 'SERVED' ? 'Tickets you mark served appear here, and can be brought back if you tapped by mistake.' : 'No tickets currently waiting at this station. New orders from POS, Captain or the kiosk appear here by themselves, no refresh needed.'}
                />
              </div>
            )}
          </div>
        </main>

        {/* UNDO / NOTICE */}
        {undo && (
          <div role="status" data-testid="kds-undo" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-jaman-navy text-white rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 text-sm font-bold">
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
