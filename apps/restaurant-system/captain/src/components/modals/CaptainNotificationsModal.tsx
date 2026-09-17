import React from 'react';
import { useCaptainStore } from '../../store/captainStore';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Flame,
  Receipt,
  MessageSquare,
  Clock,
  Trash2
} from 'lucide-react';

interface CaptainNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTable: (tableNumber: string) => void;
}

export const CaptainNotificationsModal: React.FC<CaptainNotificationsModalProps> = ({
  isOpen,
  onClose,
  onSelectTable
}) => {
  if (!isOpen) return null;

  const {
    notifications,
    markNotificationRead,
    clearAllNotifications
  } = useCaptainStore();

  const handleNotificationClick = (notif: any) => {
    markNotificationRead(notif.id);
    if (notif.tableNumber) {
      onSelectTable(notif.tableNumber);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 bg-jaman-navy text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-jaman-saffron" />
            <h3 className="font-extrabold text-sm">Floor Notification Alerts</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5 bg-jaman-cream">
          {notifications.length > 0 ? (
            notifications.map((notif) => {
              const elapsedMins = Math.max(
                1,
                Math.round((Date.now() - new Date(notif.timestamp).getTime()) / 60000)
              );

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 rounded-2xl border text-left transition-all shadow-2xs space-y-1.5 cursor-pointer ${
                    notif.isRead
                      ? 'bg-white border-jaman-border opacity-80'
                      : 'bg-[#FFFBF7] border-[#FDBA74]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-black text-xs text-jaman-navy leading-tight">
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">
                      {elapsedMins}m ago
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    {notif.message}
                  </p>

                  {notif.tableNumber && (
                    <div className="pt-1 flex items-center justify-between text-[11px] font-bold text-jaman-saffron">
                      <span>Table {notif.tableNumber}</span>
                      <span className="text-xs underline">Open Table ➔</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Bell className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">No notifications right now</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {notifications.length > 0 && (
          <div className="p-4 bg-white border-t border-jaman-border flex items-center justify-between">
            <button
              type="button"
              onClick={clearAllNotifications}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-jaman-navy text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
