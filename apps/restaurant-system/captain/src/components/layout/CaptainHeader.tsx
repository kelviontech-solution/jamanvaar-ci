import React, { useEffect, useRef, useState } from 'react';
import { BrandHeader, DisplayButtonSetting, sound, useConfirm, StaffLanguagePicker, JAMANVAAR_LOGOS } from '@jamanvaar/ui';
import { lanMeshSync, EndpointResolver, connectionLevel, type ConnectionLevel } from '@jamanvaar/sync';
import { isVibrationOn, setVibrationOn, alertWaiter } from '../../alerts';
import { useCaptainStore, selectMyTables } from '../../store/captainStore';
import { captainDb, getTerminalLabel } from '@jamanvaar/database';
import { MessageSquare, LogOut, Bell, Server, X, ChevronDown } from 'lucide-react';

interface CaptainHeaderProps {
  onOpenNotifications: () => void;
  onOpenQuickMessage: () => void;
}

/** True from the given width up; lets one language picker move between the header (wide) and the profile menu (phone) instead of mounting twice. */
function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export const CaptainHeader: React.FC<CaptainHeaderProps> = ({
  onOpenNotifications,
  onOpenQuickMessage
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { currentCaptain, logout, notifications } = useCaptainStore();
  const [isSyncInfoOpen, setIsSyncInfoOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // The real link to the server (how long since it last answered), not the same-browser mesh, which only ever sees other tabs.
  const startedAt = useRef(Date.now());
  const [conn, setConn] = useState<{ level: ConnectionLevel; ageSec: number | null }>({ level: 'ok', ageSec: null });
  const [pendingSyncCount, setPendingSyncCount] = useState(lanMeshSync.getOutboxCount());
  const [soundOn, setSoundOn] = useState(() => sound.getSettings().enabled);
  const [vibrateOn, setVibrateOn] = useState(() => isVibrationOn());
  const isWide = useMinWidth(640);
  const headerRef = useRef<HTMLElement>(null);

  // Touch screens have no mouse-leave: tapping anywhere outside the header closes an open menu, and Escape does too.
  useEffect(() => {
    if (!isSyncInfoOpen && !isProfileOpen) return;
    const closeIfOutside = (event: PointerEvent) => {
      if (headerRef.current && event.target instanceof Node && headerRef.current.contains(event.target)) return;
      setIsSyncInfoOpen(false);
      setIsProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsSyncInfoOpen(false);
      setIsProfileOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSyncInfoOpen, isProfileOpen]);

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
    <>
    <header ref={headerRef} className="sticky top-0 z-30 md:static bg-white border-b border-jaman-border px-3 sm:px-5 min-h-14 py-1.5 sm:py-2.5 shadow-2xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-x-2 sm:gap-x-3 sm:flex-wrap sm:gap-y-2">
        {isWide && <StaffLanguagePicker/>}
        {/* Left: brand. A phone gets the compact mark plus a two-line identity; wider screens keep the full lockup. */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-none sm:shrink-0">
          <div className="sm:hidden flex items-center gap-2 min-w-0" data-testid="captain-compact-brand">
            <img src={JAMANVAAR_LOGOS.mark} alt="JAMANVAAR" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-extrabold text-jaman-navy truncate">Captain App</p>
              <p className="text-[11px] font-semibold text-slate-500 truncate" title={captainDb.restaurant?.name || 'JAMANVAAR'}>{captainDb.restaurant?.name || 'JAMANVAAR'}</p>
            </div>
          </div>
          <div className="hidden sm:block">
          <BrandHeader
            app="CAPTAIN"
            restaurantName="JAMANVAAR"
            outletName="Floor Service"
            terminalId={getTerminalLabel('CAPTAIN')}
            logoHeight={46}
            badgeSize="sm"
            showContext={false}
          />
          </div>

          <div className="hidden md:block h-6 w-px bg-jaman-border" />

          {/* Captain Name & Assigned Zone Lockup */}
          <div className="hidden lg:flex items-center gap-2 bg-jaman-cream border border-jaman-border px-3 py-1 rounded-full text-xs font-bold text-jaman-navy">
            <div className="w-5 h-5 rounded-full bg-jaman-saffron text-white flex items-center justify-center text-[11px] font-bold">
              {currentCaptain?.name?.charAt(0) || '?'}
            </div>
            <span className="font-extrabold">{currentCaptain?.name || 'Staff'}</span>
            <span className="hidden xl:inline text-slate-300">•</span>
            <span className="hidden xl:inline text-slate-500 font-semibold">{captainDb.restaurant?.name || 'Floor'}</span>
          </div>
        </div>

        {/* Right: Realtime Connection + Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Connection status: the real link to the server, and the alert switches */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsProfileOpen(false); setIsSyncInfoOpen((prev) => !prev); }}
              data-testid="captain-connection-pill"
              data-level={conn.level}
              className={`flex items-center gap-1.5 border px-2 sm:px-3 min-h-[44px] sm:min-h-[40px] rounded-full text-[11px] font-bold tracking-wide shadow-2xs transition-all cursor-pointer ${
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
              <ChevronDown className="hidden sm:block w-3 h-3 opacity-60" />
            </button>

            {isSyncInfoOpen && (
              <div
                className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-auto mt-1 sm:mt-2 sm:w-72 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-white border border-jaman-border rounded-2xl shadow-md p-3 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100 space-y-2.5"
                onMouseLeave={() => setIsSyncInfoOpen(false)}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Server className="w-3.5 h-3.5 text-jaman-saffronText" />
                    <span>Connection and alerts</span>
                  </div>
                  <button onClick={() => setIsSyncInfoOpen(false)} aria-label="Close" className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-600 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">Kitchen and counter link</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${conn.level === 'ok' ? 'text-emerald-700 bg-emerald-100' : conn.level === 'slow' ? 'text-amber-800 bg-amber-100' : 'text-rose-700 bg-rose-100'}`}>
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
                  <DisplayButtonSetting />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundOn}
                    onClick={() => { const next = !soundOn; sound.setEnabled(next); setSoundOn(next); if (next) alertWaiter('MESSAGE'); }}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                  >
                    <span>Sound for food ready and messages</span>
                    <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md ${soundOn ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 bg-slate-200'}`}>{soundOn ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={vibrateOn}
                    onClick={() => { const next = !vibrateOn; setVibrationOn(next); setVibrateOn(next); if (next) alertWaiter('FOOD_READY'); }}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                  >
                    <span>Vibrate</span>
                    <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md ${vibrateOn ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 bg-slate-200'}`}>{vibrateOn ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 text-center font-medium pt-1">
                  {conn.level === 'ok' ? 'Orders reach the kitchen and counter within a second.' : 'Orders are kept on this phone and sent as soon as the connection is back.'}
                </p>
              </div>
            )}
          </div>

          {/* Quick Internal Staff Message Button */}
          <button
            type="button"
            onClick={onOpenQuickMessage}
            className="hidden sm:flex px-2.5 sm:px-3 py-1.5 min-h-[40px] rounded-xl bg-[#FFF4ED] hover:bg-[#FFE8D6] border border-[#FDBA74] text-jaman-saffronText font-extrabold text-xs items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Compose quick operational message to Kitchen, POS, or Manager"
            aria-label="Send message to Kitchen, POS or Manager"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Send Msg</span>
          </button>

          {/* Notifications Trigger */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-jaman-cream hover:bg-[#F5F0E8] active:bg-[#F5F0E8] border border-jaman-border text-slate-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
            title="Floor Notifications & Alerts"
            aria-label={unreadNotifs > 0 ? `Floor notifications, ${unreadNotifs} unread` : 'Floor notifications'}
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[11px] font-bold flex items-center justify-center shadow-xs animate-pulse">
                {unreadNotifs}
              </span>
            )}
          </button>

          {/* Profile & Shift Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsSyncInfoOpen(false); setIsProfileOpen((prev) => !prev); }}
              className="flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] min-w-[44px] bg-jaman-cream hover:bg-[#F5F0E8] active:bg-[#F5F0E8] border border-jaman-border px-2 py-1 rounded-xl transition-colors shadow-2xs text-jaman-navy cursor-pointer"
              aria-label="Profile and session menu"
              aria-haspopup="menu"
              aria-expanded={isProfileOpen}
            >
              <div className="w-6 h-6 rounded-lg bg-jaman-saffron text-white flex items-center justify-center font-bold text-xs">
                {currentCaptain?.name?.charAt(0) || '?'}
              </div>
              <ChevronDown className="hidden sm:block w-3 h-3 text-slate-500" />
            </button>

            {isProfileOpen && (
              <div
                className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-auto mt-1 sm:mt-2 w-[min(18rem,calc(100vw-1.5rem))] sm:w-56 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-white border border-jaman-border rounded-2xl shadow-md p-2 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100"
                role="menu"
                onMouseLeave={() => setIsProfileOpen(false)}
              >
                <div className="p-2.5 border-b border-jaman-border mb-1 bg-jaman-cream rounded-xl">
                  <p className="font-extrabold text-sm text-jaman-navy">{currentCaptain?.name || 'Staff'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Floor Captain • {captainDb.restaurant?.name || 'Floor'}</p>
                </div>

                {!isWide && (
                  <div className="p-1 space-y-1.5 border-b border-slate-100 mb-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setIsProfileOpen(false); onOpenQuickMessage(); }}
                      className="w-full min-h-[44px] flex items-center gap-2 px-3 rounded-xl bg-[#FFF4ED] border border-[#FDBA74] text-jaman-saffronText font-extrabold text-sm text-left active:scale-[0.98] cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Send message</span>
                    </button>
                    <StaffLanguagePicker />
                  </div>
                )}

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
                  onClick={async () => {
                    setIsProfileOpen(false);
                    if (await confirm({ title: 'End your session?', message: 'You will be logged out of Captain on this device.', confirmLabel: 'Log out', cancelLabel: 'Stay signed in', tone: 'danger' })) {
                      if (!logout()) await confirm({title:'Unsent dishes are kept',message:'Return to your order and send or deliberately remove its dishes before signing out.',confirmLabel:'Return to order',cancelLabel:'Stay signed in'});
                    }
                  }}
                  role="menuitem"
                  className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-left transition-colors font-bold cursor-pointer"
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
    {confirmDialog}
    </>
  );
};
