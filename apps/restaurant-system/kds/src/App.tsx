import React, { useState, useEffect, useMemo } from 'react';
import { db, kdsDb, KOTRepository, AuditRepository, NotificationRepository } from '@jamanvaar/database';
import { lanMeshSync, SyncOutboxEngine } from '@jamanvaar/sync';
import { KOTRecord, KOTStatus } from '@jamanvaar/types';
import { activateKdsDevice, isKdsDeviceConnected, pushOrderSync, pullOrderSync, reportHeartbeat, CloudApiError } from './cloud/cloudClient';
import {
  JamanvaarAuthLayout,
  BrandHeader,
  NotificationToastContainer,
  JAMANVAARStartup
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
  Delete,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

export const App: React.FC = () => {
  const [kots, setKots] = useState<KOTRecord[]>(kdsDb.kots);

  // Device activation gate — same activation-key flow as POS/POS-admin.
  // Without a device token this terminal has no way to reach cloud/api at
  // all, so it stays on LAN-mesh-only visibility until activated.
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKdsDeviceConnected());
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [isActivating, setIsActivating] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    setActivationError('');
    try {
      await activateKdsDevice(activationCode);
      setIsDeviceActivated(true);
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
    SyncOutboxEngine.configureTransport({ push: pushOrderSync, pull: pullOrderSync });
    void SyncOutboxEngine.catchUpFromCloud();
    void SyncOutboxEngine.processOutbox();
    void reportHeartbeat();

    const interval = setInterval(() => {
      void SyncOutboxEngine.processOutbox();
      void SyncOutboxEngine.catchUpFromCloud();
      void reportHeartbeat();
    }, 15000);

    return () => clearInterval(interval);
  }, [isDeviceActivated]);

  // KDS Authentication State — restored from persisted session
  const _kdsSession = SessionPersistence.load('kds');
  const [isKdsLoggedIn, setIsKdsLoggedIn] = useState<boolean>(_kdsSession !== null);
  const [kdsPin, setKdsPin] = useState('');
  const [kdsStationSelection, setKdsStationSelection] = useState(
    _kdsSession?.stationName || 'ALL'
  );
  // Initialize active station from session (so KDS resumes on correct station after refresh)
  const [selectedStation, setSelectedStation] = useState<string>(
    _kdsSession?.stationName || 'ALL'
  );
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
          // A new ticket landing on a kitchen wall display needs an audible
          // cue — cooks aren't watching the screen continuously. Fires once
          // per batch of genuinely-new KOTs, not per render.
          sound.play('kot');
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

  // Same fix as Captain's SEC-006: authenticate against real db.users
  // records instead of accepting any 4-digit sequence. Previously this
  // logged any staff member in the moment they'd typed 4 digits, checking
  // nothing — not even a hardcoded PIN, unlike Captain/POS Admin's
  // (already-fixed or already-removed) demo bypasses.
  const handleKdsPinPress = (digit: string) => {
    if (kdsPin.length < 4) {
      const next = kdsPin + digit;
      setKdsPin(next);
      if (next.length === 4) {
        const userPool = (db.users || []) as (import('@jamanvaar/types').User & { pinCode?: string })[];
        const matchedUser = userPool.find((u) => u.pinCode === next && u.isActive);

        if (matchedUser) {
          setKdsPinError(false);
          setSelectedStation(kdsStationSelection);
          setIsKdsLoggedIn(true);
          SessionPersistence.save('kds', {
            userId: matchedUser.id,
            fullName: matchedUser.fullName,
            roleId: matchedUser.roleId || 'KDS_STATION',
            restaurantId: matchedUser.restaurantId || 'restaurant-main',
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

  // Station Filtering Logic
  const stationKots = useMemo(() => {
    if (selectedStation === 'ALL') return kots;
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

  // Filtered KOTs for Active Screen
  const filteredKots = useMemo(() => {
    return stationKots.filter((kot) => {
      if (statusFilter === 'ALL') {
        return kot.status !== 'SERVED' && kot.status !== 'CANCELLED';
      }
      if (statusFilter === 'PREPARING') {
        return (
          kot.status === 'PREPARING' ||
          kot.status === 'PENDING' ||
          kot.status === 'ACCEPTED' ||
          (kot.status as any) === 'COOKING'
        );
      }
      return kot.status === statusFilter;
    });
  }, [stationKots, statusFilter]);

  // Action: Update KOT Status with LAN Broadcast
  const updateStatus = (kotId: string, nextStatus: KOTStatus) => {
    const targetKot = kdsDb.kots.find((k) => k.id === kotId);
    if (targetKot) {
      targetKot.status = nextStatus;
      if (nextStatus === 'SERVED') {
        targetKot.printed = true;
      }
      KOTRepository.updateKOTStatus(kotId, nextStatus);
      kdsDb.notify();
      setKots([...kdsDb.kots]);

      AuditRepository.log({
        action: `KOT_${nextStatus}`,
        category: 'ORDER',
        details: `KOT #${targetKot.kotNumber} status updated to ${nextStatus} on KDS`,
        username: 'Head Chef'
      });

      // Broadcast the raw status change so POS's/Admin's own Kitchen views
      // stay in sync for every transition, not just READY/SERVED.
      lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: targetKot.id, status: nextStatus });

      // Broadcast to Captain, POS & Admin
      if (nextStatus === 'READY') {
        lanMeshSync.broadcast('FOOD_READY', {
          tableNumber: targetKot.tableNumber,
          kotId: targetKot.id,
          kotNumber: targetKot.kotNumber,
          orderId: targetKot.orderId,
          orderNumber: targetKot.orderNumber,
          items: targetKot.items,
          dishName: targetKot.items?.[0]?.name,
          quantity: targetKot.items?.[0]?.quantity,
          station: targetKot.station
        });
      } else if (nextStatus === 'SERVED') {
        lanMeshSync.broadcast('ORDER_SERVED', {
          tableNumber: targetKot.tableNumber,
          kotId: targetKot.id,
          kotNumber: targetKot.kotNumber
        });
      }
    }
  };

  // Elapsed Time Calculator
  const getElapsedInfo = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - created);
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    const isDelayed = diffMins >= 15;
    const isWarning = diffMins >= 10 && !isDelayed;

    const timeStr = `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
    return { timeStr, diffMins, isDelayed, isWarning };
  };

  // Device activation gate — this terminal has no cloud identity until an
  // activation code is redeemed. Runs before the PIN-login screen below,
  // mirroring POS's activation-before-staff-login order.
  if (!isDeviceActivated) {
    return (
      <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
        <div className="min-h-screen flex items-center justify-center p-6">
          <form onSubmit={handleActivate} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg space-y-4 text-center">
            <h1 className="text-2xl font-black text-[#0B253A]">Activate This Terminal</h1>
            <p className="text-sm text-[#4A5568]">Enter the activation code provided by JAMANVAAR to connect this Kitchen Display to your restaurant.</p>
            <input
              type="text"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="Activation code"
              className="w-full text-center text-lg font-mono bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-4 py-3"
              autoFocus
            />
            {activationError && <p className="text-sm font-bold text-rose-700">{activationError}</p>}
            <button
              type="submit"
              disabled={isActivating || !activationCode.trim()}
              className="w-full py-3 rounded-2xl bg-[#E66817] text-white font-black uppercase tracking-wider disabled:opacity-60"
            >
              {isActivating ? 'Activating…' : 'Activate'}
            </button>
          </form>
        </div>
      </JAMANVAARStartup>
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
          heroHeadline="Real-Time Kitchen Production Command"
          heroHighlightWord="Live KOTs"
          heroDescription="Instant station routing, live ticket timers, and cross-terminal food ready dispatch for kitchen staff."
        >
          {/* Station Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Select Kitchen Station Display
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'ALL', label: '🍽 All Kitchen Stations' },
                { id: 'Main Kitchen', label: '🍳 Main Kitchen (Curry/Gravy)' },
                { id: 'Tandoor', label: '🔥 Tandoor Station' },
                { id: 'Beverage', label: '☕ Beverage & Bar' },
                { id: 'Dessert', label: '🍨 Dessert & Mithai' }
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setKdsStationSelection(st.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    kdsStationSelection === st.id
                      ? 'bg-[#0B253A] text-white border-[#0B253A] shadow-xs'
                      : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs font-black block">{st.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PIN Input & Numpad */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#0B253A] uppercase tracking-wider">
                Kitchen Staff PIN
              </label>
            </div>
            <input
              type="password"
              maxLength={4}
              value={kdsPin}
              readOnly
              placeholder="• • • •"
              className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 rounded-2xl bg-white border border-[#EBE6DD] focus:border-[#E66817] outline-none text-[#0B253A]"
            />
            {kdsPinError && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Incorrect PIN. Please try again.</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setKdsPin('');
                    else if (k === '⌫') setKdsPin((prev) => prev.slice(0, -1));
                    else handleKdsPinPress(k);
                  }}
                  className="h-12 sm:h-13 rounded-2xl bg-white hover:border-[#E66817] hover:bg-amber-50/30 active:scale-95 text-lg font-black transition-all flex items-center justify-center border border-[#EBE6DD] text-[#0B253A] shadow-2xs cursor-pointer"
                >
                  {k === '⌫' ? (
                    <Delete className="w-4 h-4 text-rose-600" />
                  ) : k === 'C' ? (
                    <span className="text-rose-600 font-black">C</span>
                  ) : (
                    k
                  )}
                </button>
              ))}
            </div>
          </div>
        </JamanvaarAuthLayout>
      </JAMANVAARStartup>
    );
  }

  // =========================================================================
  // 2. KDS MAIN OPERATIONS WORKSPACE
  // =========================================================================
  return (
    <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
      <div className="min-h-screen bg-[#FAF7F2] text-[#0B253A] flex flex-col select-none font-sans">
        {/* TOP HEADER: Brand, Station Selector, Live Clock, Switch Station */}
        <header className="bg-white border-b border-[#EBE6DD] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0 z-10">
          <div className="flex items-center gap-3">
            <BrandHeader
              app="KDS"
              logoHeight={46}
              badgeSize="sm"
              showContext={false}
            />
            <div className="hidden lg:flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] px-3 py-1.5 rounded-xl text-xs font-bold text-[#E66817]">
              <span>Station:</span>
              <span className="font-black text-[#0B253A]">{selectedStation}</span>
            </div>
          </div>

          {/* Center: Touch Station Selector Pills */}
          <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-2xl border border-[#EBE6DD] overflow-x-auto">
            {[
              { id: 'ALL', label: '🍽 All' },
              { id: 'Main Kitchen', label: '🍳 Main' },
              { id: 'Tandoor', label: '🔥 Tandoor' },
              { id: 'Beverage', label: '☕ Beverage' },
              { id: 'Dessert', label: '🍨 Dessert' }
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStation(st.id)}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                  selectedStation === st.id
                    ? 'bg-[#0B253A] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-[#0B253A]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Right: KDS Live Clock & Counters & Switch Station */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Sync Clock */}
            <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 font-mono shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline font-sans font-black text-[11px]">KDS LIVE</span>
              <span className="text-emerald-300 hidden sm:inline">|</span>
              <span>{currentTime}</span>
            </div>

            {/* Cooking Counter */}
            <div className="bg-[#FFF4ED] border border-[#FDBA74] px-3 py-1.5 rounded-xl text-xs font-bold text-[#E66817] flex items-center gap-1.5 shadow-2xs">
              <Flame className="w-4 h-4 text-[#E66817]" />
              <span className="font-mono font-black">{activePreparingCount}</span>
              <span className="hidden md:inline font-bold text-[11px]">Cooking</span>
            </div>

            {/* Ready Counter */}
            <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5 shadow-2xs">
              <Bell className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-black">{readyPickupCount}</span>
              <span className="hidden md:inline font-bold text-[11px]">Ready</span>
            </div>

            {/* Switch Station / Logout */}
            <button
              type="button"
              onClick={handleKdsLogout}
              title="Switch kitchen station or logout"
              className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-[#EBE6DD] hover:border-rose-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Switch Station</span>
            </button>
          </div>
        </header>

        {/* STATUS NAVIGATION BAR */}
        <div className="bg-white border-b border-[#EBE6DD] px-4 sm:px-6 py-2.5 shrink-0 shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto max-w-[1920px] mx-auto">
            {[
              { id: 'ALL', label: 'ACTIVE TICKETS', count: activePreparingCount + readyPickupCount, icon: UtensilsCrossed },
              { id: 'PREPARING', label: '🔥 COOKING', count: activePreparingCount, icon: Flame },
              { id: 'READY', label: '🔔 FOOD READY', count: readyPickupCount, icon: Bell },
              { id: 'SERVED', label: '✓ SERVED', count: servedCount, icon: CheckCheck }
            ].map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`min-h-[46px] px-4 sm:px-6 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center gap-2.5 shrink-0 active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-[#E66817] text-white shadow-md shadow-orange-500/25'
                      : 'bg-[#FAF7F2] border border-[#EBE6DD] text-slate-700 hover:bg-[#F0ECE1] hover:text-[#0B253A]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
                      isSelected
                        ? 'bg-white text-[#E66817]'
                        : 'bg-white border border-[#EBE6DD] text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN KITCHEN DISPLAY TICKET GRID */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 max-w-[1920px] mx-auto">
            {filteredKots.map((kot) => {
              const isReady = kot.status === 'READY';
              const isPreparing = kot.status === 'PREPARING' || (kot.status as any) === 'COOKING';
              const isServed = kot.status === 'SERVED';
              const isPending = kot.status === 'PENDING' || kot.status === 'ACCEPTED';
              const elapsed = getElapsedInfo(kot.createdAt);

              return (
                <div
                  key={kot.id}
                  className={`bg-white rounded-3xl border-2 transition-all shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden relative select-none ${
                    isReady
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : isPreparing
                      ? 'border-amber-400'
                      : isServed
                      ? 'border-slate-200 opacity-75'
                      : 'border-[#EBE6DD]'
                  }`}
                >
                  {/* State Accent Top Bar */}
                  <div
                    className={`h-2 w-full ${
                      isReady
                        ? 'bg-emerald-500'
                        : isPreparing
                        ? 'bg-amber-500'
                        : isServed
                        ? 'bg-slate-300'
                        : 'bg-blue-400'
                    }`}
                  />

                  {/* Header: Token, KOT Number, Table, Order Type & Elapsed Timer */}
                  <div className="p-4 sm:p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-2 border-b border-[#EBE6DD] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl sm:text-3xl font-black font-mono text-[#0B253A]">
                            #{kot.tokenNumber}
                          </span>
                          <span className="text-xs font-black bg-[#E66817] text-white px-2 py-0.5 rounded-md font-mono">
                            {kot.kotNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mt-1">
                          <span>{kot.tableNumber ? `Table ${kot.tableNumber}` : 'Takeaway'}</span>
                          <span>•</span>
                          <span className="uppercase text-xs bg-slate-100 px-1.5 py-0.2 rounded font-black text-slate-700">
                            {kot.orderType}
                          </span>
                        </div>
                      </div>

                      {/* Timer */}
                      {!isServed && (
                        <div>
                          {elapsed.isDelayed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              Delayed: {elapsed.diffMins}m
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold text-slate-600 bg-[#FAF7F2] border border-[#EBE6DD] font-mono">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {elapsed.timeStr}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Order-level Chef Note (distinct from per-item specialInstructions) */}
                    {kot.orderNotes && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-100/80 text-amber-900 text-xs font-bold flex items-start gap-1.5 border border-amber-300/60">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span>{kot.orderNotes}</span>
                      </div>
                    )}

                    {/* Food Items Ordered */}
                    <div className="space-y-2.5">
                      {kot.items.map((it: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD] space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <span className="font-mono font-black text-base sm:text-lg text-[#E66817] leading-none shrink-0">
                              {it.quantity}×
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="font-black text-xs sm:text-sm text-[#0B253A] leading-snug block">
                                {it.name}
                              </span>

                              {/* Modifiers — deliberately NOT small: this is often
                                  allergy/spice/prep-critical information read from
                                  a few feet away in a busy kitchen, so it gets the
                                  same weight/contrast as the dish name above it. */}
                              {it.modifiers && it.modifiers.length > 0 && (
                                <div className="text-sm font-bold text-slate-800 pt-0.5 space-y-0.5">
                                  {it.modifiers.map((m: any, mIdx: number) => (
                                    <span key={mIdx} className="block">
                                      • {m.optionName || m}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Special Kitchen Notes */}
                              {it.specialInstructions && (
                                <div className="mt-1 px-2 py-0.5 rounded-lg bg-amber-100/80 text-amber-900 text-xs font-bold inline-flex items-center gap-1 border border-amber-300/60">
                                  <AlertCircle className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span>{it.specialInstructions}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer & Large Touch Action Button (48px height) */}
                  <div className="p-4 sm:p-5 bg-[#FAF7F2] border-t border-[#EBE6DD] space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
                      <span>Captain: <strong className="text-[#0B253A]">{kot.cashierName || 'Rahul'}</strong></span>
                      <span className="font-mono text-slate-400">#{kot.id.slice(-5)}</span>
                    </div>

                    {/* Primary Action Trigger */}
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => updateStatus(kot.id, 'PREPARING')}
                        className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
                      >
                        <Flame className="w-4 h-4 text-white" />
                        <span>START COOKING</span>
                      </button>
                    )}

                    {isPreparing && (
                      <button
                        type="button"
                        onClick={() => updateStatus(kot.id, 'READY')}
                        className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer"
                      >
                        <Bell className="w-4 h-4 text-white" />
                        <span>MARK FOOD READY</span>
                      </button>
                    )}

                    {isReady && (
                      <button
                        type="button"
                        onClick={() => updateStatus(kot.id, 'SERVED')}
                        className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#0B253A] to-[#1E3A4C] hover:from-[#1E3A4C] hover:to-[#2B4C63] text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-slate-900/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4 text-emerald-400" />
                        <span>MARK SERVED ✓</span>
                      </button>
                    )}

                    {isServed && (
                      <div className="min-h-[44px] rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Order Completed & Served</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {filteredKots.length === 0 && (
              <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-[#EBE6DD] shadow-xs space-y-4 p-6">
                <div className="w-16 h-16 rounded-3xl bg-[#FFF4ED] text-[#E66817] mx-auto flex items-center justify-center shadow-2xs border border-[#FDBA74]">
                  <ChefHat className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-[#0B253A]">All Kitchen Orders Cleared</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  No tickets currently waiting for preparation at this station. New orders sent from POS terminals or Captain tablets will appear here instantly.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Real-time Push Notifications for Kitchen Staff */}
        <NotificationToastContainer role="KDS" />
      </div>
    </JAMANVAARStartup>
  );
};

export default App;
