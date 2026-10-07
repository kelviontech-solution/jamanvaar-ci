import React, { useState, useEffect } from 'react';
import { AppNotification } from '@jamanvaar/types';
import { db, NotificationRepository } from '@jamanvaar/database';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Receipt,
  X,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface NotificationToastContainerProps {
  role?: 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS';
  onActionClick?: (notif: AppNotification) => void;
}

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  role = 'POS',
  onActionClick
}) => {
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);
  const [lastProcessedId, setLastProcessedId] = useState<string>('');

  useEffect(() => {
    const unsub = db.subscribe(() => {
      // GUEST_HELP has its own full-attention popup (UrgentGuestAlertModal) — showing it here too,
      // as a small auto-dismissing corner card, is how it used to go unnoticed in the first place.
      const all = NotificationRepository.getNotifications(role).filter((n) => n.type !== 'GUEST_HELP');
      if (all.length > 0) {
        const newest = all[0];
        if (newest.id !== lastProcessedId && !newest.isRead) {
          setLastProcessedId(newest.id);
          setActiveToasts((prev) => {
            if (prev.some((t) => t.id === newest.id)) return prev;
            return [newest, ...prev.slice(0, 2)];
          });

          // Auto-dismiss after 6.5 seconds
          setTimeout(() => {
            setActiveToasts((prev) => prev.filter((t) => t.id !== newest.id));
          }, 6500);
        }
      }
    });

    return () => unsub();
  }, [role, lastProcessedId]);

  const handleDismiss = (id: string) => {
    NotificationRepository.markAsRead(id);
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (activeToasts.length === 0) return null;

  return (
    <aside aria-label="System Notifications" className="fixed bottom-14 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none">
      {activeToasts.map((toast) => {
        const isEod = toast.type === 'BUSINESS_DAY_CLOSED' || toast.type === 'BUSINESS_DAY_STARTED';
        const isFoodReady = toast.type === 'FOOD_READY';
        const isBill = toast.type === 'BILL_REQUESTED' || toast.type === 'BILL_SETTLED';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 duration-300 ${
              isEod
                ? 'bg-[#FAF7F2] border-[#E66817]/30 text-[#0B253A]'
                : isFoodReady
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-white border-[#EBE6DD] text-[#0B253A]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isEod
                      ? 'bg-[#E66817]/10 text-[#E66817]'
                      : isFoodReady
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isBill
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {isEod ? (
                    <Sparkles className="w-5 h-5" />
                  ) : isFoodReady ? (
                    <Flame className="w-5 h-5 animate-pulse" />
                  ) : isBill ? (
                    <Receipt className="w-5 h-5" />
                  ) : (
                    <Bell className="w-5 h-5" />
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-black tracking-tight flex items-center gap-1.5">
                    {toast.title}
                  </h4>
                  <p className="text-[11px] leading-relaxed text-slate-600 font-medium">
                    {toast.message}
                  </p>
                  <span className="text-[9px] text-slate-400 font-mono block">
                    {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDismiss(toast.id)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-black/5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {onActionClick && (
              <div className="mt-2.5 pt-2 border-t border-black/5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleDismiss(toast.id);
                    onActionClick(toast);
                  }}
                  className="px-2.5 py-1 bg-[#0B253A] hover:bg-[#123652] text-white rounded-lg text-[10px] font-black flex items-center gap-1 transition-all"
                >
                  <span>View Details</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};
