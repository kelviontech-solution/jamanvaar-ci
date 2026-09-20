import React from 'react';
import { useAiAccess } from '@jamanvaar/ui';
import { useCaptainStore } from '../../store/captainStore';
import { captainDb } from '@jamanvaar/database';
import {
  X,
  ChefHat,
  Bell,
  Timer,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  Flame,
  Receipt,
  MessageSquare
} from 'lucide-react';

interface CaptainMoreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: any) => void;
  onOpenAiAssistant: () => void;
}

export const CaptainMoreDrawer: React.FC<CaptainMoreDrawerProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenAiAssistant
}) => {
  const ai = useAiAccess();
  if (!isOpen) return null;

  const {
    currentCaptain,
    kots,
    customerRequests,
    notifications,
    logout
  } = useCaptainStore();

  const pendingRequestsCount = customerRequests.filter((cr) => !cr.isResolved).length;
  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  const menuItems = [
    {
      id: 'KOTS',
      label: 'Live KOT Tickets & Kitchen Stations',
      description: 'View all active kitchen orders across Tandoor, Main Kitchen & Pantry',
      icon: ChefHat,
      count: kots.length,
      badgeColor: 'bg-slate-100 text-slate-700'
    },
    {
      id: 'REQUESTS',
      label: 'Guest Service Requests',
      description: 'Water, Extra plates, Napkins, Cutlery, Cleaning & Table calls',
      icon: Bell,
      count: pendingRequestsCount,
      badgeColor: pendingRequestsCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
    },
    {
      id: 'SHIFT',
      label: 'Shift & Performance Dashboard',
      description: 'Review tables served, orders taken, dishes delivered, and shift time',
      icon: Timer,
      count: null
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 bg-jaman-navy text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-jaman-saffron flex items-center justify-center font-black text-sm">
              {currentCaptain?.name?.charAt(0) || 'R'}
            </div>
            <div>
              <h3 className="font-extrabold text-sm">{currentCaptain?.name || 'Rahul Sharma'}</h3>
              <p className="text-[11px] text-slate-300 font-medium">Floor Captain • Main Dining</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Navigation List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5 bg-jaman-cream">
          {/* AI Quick Trigger — hidden when this restaurant opted out */}
          {ai.showButton(captainDb.restaurant?.showJamanAI !== false) && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAiAssistant();
            }}
            className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-[#FFF4ED] to-[#FFE8D6] border border-[#FDBA74] flex items-center justify-between text-left shadow-2xs hover:brightness-95 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-jaman-saffron text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs text-jaman-navy block">JAMAN AI Intelligence</span>
                <span className="text-[10px] text-slate-500 font-medium">Ask floor, kitchen & bill questions</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-jaman-saffron" />
          </button>
          )}

          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1 pt-2">
            Floor Operations:
          </span>

          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className="w-full p-3.5 rounded-2xl bg-white border border-jaman-border hover:border-jaman-saffron text-left transition-all shadow-2xs flex items-center justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-jaman-cream group-hover:bg-[#FFF4ED] text-slate-600 group-hover:text-jaman-saffron flex items-center justify-center transition-colors mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-jaman-navy group-hover:text-jaman-saffron transition-colors">
                        {item.label}
                      </span>
                      {item.count !== null && item.count > 0 && (
                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono ${item.badgeColor}`}>
                          {item.count}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 line-clamp-1">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-jaman-saffron transition-colors shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Footer: Sign Out Action */}
        <div className="p-4 bg-white border-t border-jaman-border">
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>End Shift Session & Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
