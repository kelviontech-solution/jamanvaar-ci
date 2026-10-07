import React from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { Megaphone, Check } from 'lucide-react';

/**
 * A kiosk guest's "Call Staff" tap used to reach a captain only as one more row behind the bell icon
 * (and the Guest Requests tab, if they happened to be on it) — easy to miss entirely on a busy floor.
 * This is a full-screen, impossible-to-miss popup instead: it stays up (no auto-dismiss timer) until a
 * captain explicitly accepts it, and shows the oldest unanswered call first so none get skipped.
 */
export const CaptainUrgentHelpAlert: React.FC = () => {
  const { notifications, acknowledgeCustomerRequest, markNotificationRead } = useCaptainStore();

  const pending = notifications
    .filter((n) => n.type === 'GUEST_HELP' && !n.isRead)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (pending.length === 0) return null;
  const current = pending[0];

  const accept = () => {
    markNotificationRead(current.id);
    // notif-<id> / svc-<id> share the same base id (see receiveMessages in captainStore.ts).
    const base = current.id.replace(/^notif-/, '');
    acknowledgeCustomerRequest(`svc-${base}`);
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
          <h2 className="text-xl font-black text-jaman-navy">{current.title}</h2>
          <p className="text-sm text-slate-600 font-medium">{current.message}</p>
          <span className="text-xs text-slate-400 font-mono block">
            {new Date(current.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {pending.length > 1 && (
          <p className="text-xs font-bold text-rose-600">+{pending.length - 1} more guest{pending.length > 2 ? 's' : ''} waiting</p>
        )}
        <button
          type="button"
          onClick={accept}
          className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm shadow-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          <span>Accept — On My Way</span>
        </button>
      </div>
    </div>
  );
};
