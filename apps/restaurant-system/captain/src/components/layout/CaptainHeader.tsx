import React, { useEffect, useState } from 'react';
import { BrandHeader } from '@jamanvaar/ui';
import { lanMeshSync, type MeshPeerInfo } from '@jamanvaar/sync';
import { useCaptainStore } from '../../store/captainStore';
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
  // Real mesh state, not the static "always connected" placeholder this
  // panel used to show — getConnectedPeers() drops a peer after 18s with no
  // heartbeat, so this genuinely reflects a dropped POS/KDS connection.
  const [meshOnline, setMeshOnline] = useState(lanMeshSync.getIsOnline());
  const [peers, setPeers] = useState<MeshPeerInfo[]>(lanMeshSync.getConnectedPeers());
  const [pendingSyncCount, setPendingSyncCount] = useState(lanMeshSync.getOutboxCount());

  useEffect(() => {
    const interval = setInterval(() => {
      setMeshOnline(lanMeshSync.getIsOnline());
      setPeers(lanMeshSync.getConnectedPeers());
      setPendingSyncCount(lanMeshSync.getOutboxCount());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const posPeer = peers.find((p) => p.role === 'POS' || p.role === 'POS_ADMIN');
  const kdsPeer = peers.find((p) => p.role === 'KDS');

  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="bg-white border-b border-jaman-border px-3 sm:px-5 py-2.5 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
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
              {currentCaptain?.name?.charAt(0) || 'R'}
            </div>
            <span className="font-extrabold">{currentCaptain?.name || 'Rahul Sharma'}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 font-semibold">Main Dining Floor</span>
          </div>
        </div>

        {/* Right: Realtime Connection + Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Connection Status Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSyncInfoOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 border px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] font-black tracking-wide shadow-2xs transition-all cursor-pointer ${
                meshOnline ? 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-200 text-emerald-800' : 'bg-rose-50 hover:bg-rose-100/80 border-rose-200 text-rose-800'
              }`}
              title="Click to view Local Database & LAN Mesh Status"
            >
              <span className={`w-2 h-2 rounded-full ${meshOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="hidden sm:inline">{meshOnline ? `LOCAL + SYNCED${pendingSyncCount > 0 ? ` (${pendingSyncCount})` : ''}` : 'OFFLINE'}</span>
              <span className="sm:hidden">{meshOnline ? 'SYNCED' : 'OFFLINE'}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Connection Detail Popover */}
            {isSyncInfoOpen && (
              <div
                className="absolute right-0 mt-2 w-72 bg-white border border-jaman-border rounded-2xl shadow-xl p-3 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100 space-y-2.5"
                onMouseLeave={() => setIsSyncInfoOpen(false)}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-xs">
                    <Server className="w-3.5 h-3.5 text-jaman-saffron" />
                    <span>Real-Time Mesh & Hardware Sync</span>
                  </div>
                  <button onClick={() => setIsSyncInfoOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">This Device</span>
                    <span
                      className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                        meshOnline ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}
                    >
                      {meshOnline ? `ONLINE${pendingSyncCount > 0 ? ` (${pendingSyncCount} pending)` : ''}` : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">POS Terminal Link</span>
                    <span
                      className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                        posPeer ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}
                    >
                      {posPeer ? 'CONNECTED' : 'NOT DETECTED'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                    <span className="font-semibold text-slate-600">KDS Kitchen Mesh</span>
                    <span
                      className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                        kdsPeer ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'
                      }`}
                    >
                      {kdsPeer ? 'LIVE' : 'NOT DETECTED'}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 text-center font-medium pt-1">
                  {posPeer || kdsPeer
                    ? 'Changes sync instantly across all floor handhelds & counter POS.'
                    : 'No POS/KDS terminal detected on this network yet — orders will queue locally until one is found.'}
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
                {currentCaptain?.name?.charAt(0) || 'R'}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isProfileOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white border border-jaman-border rounded-2xl shadow-xl p-2 text-xs text-jaman-navy z-50 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setIsProfileOpen(false)}
              >
                <div className="p-2.5 border-b border-jaman-border mb-1 bg-jaman-cream rounded-xl">
                  <p className="font-extrabold text-sm text-jaman-navy">{currentCaptain?.name || 'Rahul Sharma'}</p>
                  <p className="text-[11px] text-slate-500 font-medium">Floor Captain • Main Dining</p>
                </div>

                <div className="p-2 space-y-1 text-slate-600 font-medium border-b border-slate-100 mb-1">
                  <div className="flex justify-between">
                    <span>Shift Status:</span>
                    <span className="font-bold text-emerald-700">ACTIVE</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Assigned Tables:</span>
                    <span className="font-bold text-jaman-navy">{(currentCaptain?.assignedTableNumbers || []).join(', ') || 'None'}</span>
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
