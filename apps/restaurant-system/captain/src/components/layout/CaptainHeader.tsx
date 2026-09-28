import React, { useEffect, useRef, useState } from 'react';
import { BrandHeader, sound } from '@jamanvaar/ui';
import { lanMeshSync, EndpointResolver, connectionLevel, type ConnectionLevel } from '@jamanvaar/sync';
import { isVibrationOn, setVibrationOn, alertWaiter } from '../../alerts';
import { useCaptainStore, selectMyTables } from '../../store/captainStore';
import { captainDb } from '@jamanvaar/database';
import {
  MessageSquare,
  LogOut,
  Bell,
  Wifi,
  Server,
  User,
  X,
  ChevronDown,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface CaptainHeaderProps {
  onOpenNotifications: () => void;
  onOpenQuickMessage: () => void;
}

export const CaptainHeader: React.FC<CaptainHeaderProps> = ({
  onOpenNotifications,
  onOpenQuickMessage
}) => {
  const { currentCaptain, logout, notifications } = useCaptainStore();
  const [isSyncInfoOpen, setIsSyncInfoOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // The real link to the server (how long since it last answered), not the same-browser mesh, which only ever sees other tabs.
  const startedAt = useRef(Date.now());
  const [conn, setConn] = useState<{ level: ConnectionLevel; ageSec: number | null }>({ level: 'ok', ageSec: null });
  const [pendingSyncCount, setPendingSyncCount] = useState(lanMeshSync.getOutboxCount());
  const [soundOn, setSoundOn] = useState(() => sound.getSettings().enabled);
  const [vibrateOn, setVibrateOn] = useState(() => isVibrationOn());

  useEffect(() => {
    const tick = () => {
      const since = EndpointResolver.msSinceLastContact();
      const level = connectionLevel(since, typeof navigator === 'undefined' ? true : navigator.onLine !== false, Date.now() - startedAt.current);
      const ageSec = since === null ? null : Math.floor(since / 1000);
      setConn((prev) => (prev.level === level && prev.ageSec === ageSec ? prev : { level, ageSec }));
      setPendingSyncCount(lanMeshSync.getOutboxCount());
    };
    tick();
    const interval = setInterval(tick, 1500);
    return () => clearInterval(interval);
  }, []);

  const meshOnline = conn.level !== 'lost';

  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="bg-white border-b border-jaman-border px-3 sm:px-5 py-2.5 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
        {/* Left: Prominent Official Master Brand Header */}
        <div className="flex items-center gap-3 shrink-0">
          <BrandHeader
            app="CAPTAIN"
            restaurantName="JAMANVAAR"
            outletName="Floor Service"
            terminalId="CAPTAIN-01"
            logoHeight={46}
            badgeSize="sm"
            showContext={false}
          />

          <div className="hidden md:block h-6 w-px bg-jaman-border" />

          {/* Captain Name & Assigned Zone Lockup */}
          <div className="hidden sm:flex items-center gap-2 bg-jaman-cream border border-jaman-border px-3 py-1 rounded-full text-xs font-bold text-jaman-navy">
            <div className="w-5 h-5 rounded-full bg-jaman-saffron text-white flex items-center justify-center text-[10px] font-black">
              {currentCaptain?.name?.charAt(0) || '?'}
            </div>
            <span className="font-extrabold">{currentCaptain?.name || 'Staff'}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 font-semibold">{captainDb.restaurant?.name || 'Floor'}</span>
          </div>
        </div>

        {/* Right: Realtime Connection + Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Connection status: the real link to the server, and the alert switches */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSyncInfoOpen((prev) => !prev)}
              data-testid="captain-connection-pill"
              data-level={conn.level}
              className={`flex items-center gap-1.5 border px-2.5 sm:px-3 min-h-[36px] rounded-full text-[11px] font-black tracking-wide shadow-2xs transition-all cursor-pointer ${
                conn.level === 'ok'
                  ? 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-200 text-emerald-800'
                  : conn.level === 'slow'
                  ? 'bg-amber-50 hover:bg-amber-100/80 border-amber-300 text-amber-900'
                  : 'bg-rose-50 hover:bg-rose-100/80 border-rose-200 text-rose-800'
              }`}
              title="Connection and alert settings"
              aria-label="Connection and alert settings"
            >
              <span className={`w-2 h-2 rounded-full ${conn.level === 'ok' ? 'bg-emerald-500 animate-pulse' : conn.level === 'slow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span>
                {conn.level === 'ok' ? (pendingSyncCount > 0 ? `SENDING (${pendingSyncCount})` : 'LIVE') : conn.level === 'slow' ? 'SLOW' : 'OFFLINE'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {isSyncInfoOpen && (
              <div
                className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white border border-jaman-border rounded-2xl shadow-xl p-3 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100 space-y-2.5"
                onMouseLeave={() => setIsSyncInfoOpen(false)}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-xs">
                    <Server className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Connection and alerts</span>
                  </div>
                  <button onClick={() => setIsSyncInfoOpen(false)} aria-label="Close" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">Kitchen and counter link</span>
                    <span className={`font-black px-2 py-0.5 rounded-md text-[10px] ${conn.level === 'ok' ? 'text-emerald-700 bg-emerald-100' : conn.level === 'slow' ? 'text-amber-800 bg-amber-100' : 'text-rose-700 bg-rose-100'}`}>
                      {conn.level === 'ok' ? 'CONNECTED' : conn.level === 'slow' ? 'SLOW' : 'LOST'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">Last update</span>
                    <span className="font-mono text-[11px] text-slate-700">{conn.ageSec === null ? 'not yet' : `${conn.ageSec}s ago`}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">Waiting to send</span>
                    <span className="font-mono text-[11px] text-slate-700">{pendingSyncCount}</span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundOn}
                    onClick={() => { const next = !soundOn; sound.setEnabled(next); setSoundOn(next); if (next) alertWaiter('MESSAGE'); }}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                  >
                    <span>Sound for food ready and messages</span>
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded-md ${soundOn ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 bg-slate-200'}`}>{soundOn ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={vibrateOn}
                    onClick={() => { const next = !vibrateOn; setVibrationOn(next); setVibrateOn(next); if (next) alertWaiter('FOOD_READY'); }}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                  >
                    <span>Vibrate</span>
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded-md ${vibrateOn ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 bg-slate-200'}`}>{vibrateOn ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 text-center font-medium pt-1">
                  {conn.level === 'ok' ? 'Orders reach the kitchen and counter within a second.' : 'Orders are kept on this phone and sent as soon as the connection is back.'}
                </p>
              </div>
            )}
          </div>

          {/* Quick Internal Staff Message Button */}
          <button
            type="button"
            onClick={onOpenQuickMessage}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] text-jaman-saffron font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Compose quick operational message to Kitchen, POS, or Manager"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Send Msg</span>
          </button>

          {/* Notifications Trigger */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border text-slate-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            title="Floor Notifications & Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs animate-pulse">
                {unreadNotifs}
              </span>
            )}
          </button>

          {/* Profile & Shift Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileOpen((prev) => !prev)}
              className="flex items-center gap-1.5 bg-jaman-cream hover:bg-[#F5F0E8] border border-jaman-border px-2 py-1 rounded-xl transition-colors shadow-2xs text-jaman-navy cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-jaman-saffron text-white flex items-center justify-center font-black text-xs">
                {currentCaptain?.name?.charAt(0) || '?'}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isProfileOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white border border-jaman-border rounded-2xl shadow-xl p-2 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setIsProfileOpen(false)}
              >
                <div className="p-2.5 border-b border-jaman-border mb-1 bg-jaman-cream rounded-xl">
                  <p className="font-extrabold text-sm text-jaman-navy">{currentCaptain?.name || 'Staff'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Floor Captain • {captainDb.restaurant?.name || 'Floor'}</p>
                </div>

                <div className="p-2 space-y-1 text-slate-600 font-medium border-b border-slate-100 mb-1">
                  <div className="flex justify-between">
                    <span>Shift Status:</span>
                    <span className="font-bold text-emerald-700">ACTIVE</span>
                  </div>
                  <div className="flex justify-between">
                    <span>My Tables:</span>
                    <span className="font-bold text-jaman-navy">{selectMyTables(captainDb.tables, currentCaptain).map((t) => t.tableNumber).join(', ') || 'None'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    if (window.confirm('End your session and log out?')) {
                      logout();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-left transition-colors font-bold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>End Session & Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
