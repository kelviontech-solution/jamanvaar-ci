import React, { useEffect, useRef, useState } from 'react';
import { AppNotification } from '@jamanvaar/types';
import { db, NotificationRepository } from '@jamanvaar/database';
import { sound } from './SoundManager';
import { Megaphone, Check } from 'lucide-react';

interface UrgentGuestAlertModalProps {
  role: 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS';
}

/**
 * A guest tapping "Call Staff" used to reach the counter only as one more row behind the bell icon —
 * easy to miss entirely until it was long stale, since the small corner toast every other notification
 * gets auto-dismisses in 6.5 seconds. This is a full-screen, impossible-to-miss popup instead: it stays
 * on screen (no timer) until a staff member explicitly acknowledges it, and plays a sound the moment a
 * new one arrives, not just when the bell happens to be opened.
 */
export const UrgentGuestAlertModal: React.FC<UrgentGuestAlertModalProps> = ({ role }) => {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const urgent = NotificationRepository.getNotifications(role, true)
        .filter((n) => n.type === 'GUEST_HELP')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const fresh = urgent.filter((n) => !seenIds.current.has(n.id));
      if (fresh.length > 0) {
        fresh.forEach((n) => seenIds.current.add(n.id));
        try {
          sound.play('warning');
        } catch {
          // A browser that blocks audio before the first touch still shows the popup.
        }
      }
      setQueue(urgent);
    };

    check();
    const unsub = db.subscribe(check);
    return () => unsub();
  }, [role]);

  if (queue.length === 0) return null;
  const current = queue[0];

  const acknowledge = () => {
    NotificationRepository.markAsRead(current.id);
    setQueue((prev) => prev.filter((n) => n.id !== current.id));
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 sm:p-8 text-center space-y-5 border-4 border-rose-500 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto animate-pulse">
          <Megaphone className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-[#0B253A]">{current.title}</h2>
          <p className="text-sm text-slate-600 font-medium">{current.message}</p>
          <span className="text-xs text-slate-400 font-mono block">
            {new Date(current.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {queue.length > 1 && (
          <p className="text-xs font-bold text-rose-600">+{queue.length - 1} more guest{queue.length > 2 ? 's' : ''} waiting</p>
        )}
        <button
          type="button"
          onClick={acknowledge}
          className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm shadow-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          <span>Acknowledge — On My Way</span>
        </button>
      </div>
    </div>
  );
};
