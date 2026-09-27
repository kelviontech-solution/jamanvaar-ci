import React, { useState, useEffect } from 'react';
import { AppNotification, NotificationRole } from '@jamanvaar/types';
import { db, NotificationRepository } from '@jamanvaar/database';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Sparkles,
  Flame,
  Receipt,
  AlertTriangle,
  Clock
} from 'lucide-react';

interface NotificationDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: NotificationRole;
  onSelectNotification?: (notif: AppNotification) => void;
}

export const NotificationDrawerModal: React.FC<NotificationDrawerModalProps> = ({
  isOpen,
  onClose,
  role = 'POS',
  onSelectNotification
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const refreshList = () => {
    const list = NotificationRepository.getNotifications(role, filter === 'UNREAD');
    setNotifications([...list]);
  };

  useEffect(() => {
    refreshList();
    const unsub = db.subscribe(() => {
      refreshList();
    });
    return () => unsub();
  }, [role, filter, isOpen]);

  // Escape closes this dialog like any other in the app, not just its own Close button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMarkAllRead = () => {
    NotificationRepository.markAllAsRead(role);
    refreshList();
  };

  const handleClearAll = () => {
    NotificationRepository.clearAll();
    refreshList();
  };

  const unreadCount = NotificationRepository.getUnreadCount(role);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in select-none">
      <div className="bg-[#FAF7F2] border-l border-[#EBE6DD] w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#EBE6DD] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E66817]/10 text-[#E66817] flex items-center justify-center font-black">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#0B253A] flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    {unreadCount} new
                  </span>
                )}
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                System & Workflow Real-Time Events
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-[#0B253A] rounded-xl hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-3 bg-white/70 border-b border-[#EBE6DD] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                filter === 'ALL'
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({NotificationRepository.getNotifications(role).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                filter === 'UNREAD'
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                title="Mark all as read"
                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-[#0B253A] hover:bg-slate-100 rounded-lg flex items-center gap-1 transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark read</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClearAll}
              title="Clear notifications"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Notifications Scroll List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-600">No notifications</p>
              <span className="text-xs text-slate-400">
                You're all caught up with business day events!
              </span>
            </div>
          ) : (
            notifications.map((notif) => {
              const isEod = notif.type === 'BUSINESS_DAY_CLOSED' || notif.type === 'BUSINESS_DAY_STARTED';
              const isFood = notif.type === 'FOOD_READY';
              const isBill = notif.type === 'BILL_REQUESTED' || notif.type === 'BILL_SETTLED';

              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    NotificationRepository.markAsRead(notif.id);
                    if (onSelectNotification) onSelectNotification(notif);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    !notif.isRead
                      ? 'bg-white border-amber-300 shadow-sm'
                      : 'bg-white/60 border-[#EBE6DD] opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isEod
                          ? 'bg-[#E66817]/10 text-[#E66817]'
                          : isFood
                          ? 'bg-amber-100 text-amber-600'
                          : isBill
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isEod ? (
                        <Sparkles className="w-4 h-4" />
                      ) : isFood ? (
                        <Flame className="w-4 h-4" />
                      ) : isBill ? (
                        <Receipt className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-black text-[#0B253A]">
                          {notif.title}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(notif.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                        {notif.message}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
