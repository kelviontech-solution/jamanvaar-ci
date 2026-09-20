import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../api/client';
import type { NotificationExtras, PlatformNotification } from '../api/types';
import { absoluteTime, relativeTime } from '../lib/relativeTime';
import './notifications.css';

const POLL_MS = 60_000;
const PREVIEW_COUNT = 8;

/** Bell in the header: unread count from the server, the latest items on open, each opening the exact record. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState({ count: 0, critical: 0 });
  const [items, setItems] = useState<PlatformNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    api
      .get<{ count: number; critical: number }>('/api/v1/platform/notifications/unread-count')
      .then((c) => setUnread(c))
      .catch(() => {
        /* a failed poll keeps the last known count */
      });
  }, []);

  const loadLatest = useCallback(() => {
    setFailed(false);
    api
      .get<{ items: PlatformNotification[] } & NotificationExtras>(`/api/v1/platform/notifications?page=1&pageSize=${PREVIEW_COUNT}`)
      .then((res) => {
        setItems(res.items);
        setUnread((u) => ({ ...u, count: res.unreadCount }));
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    loadLatest();
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, loadLatest]);

  async function openItem(n: PlatformNotification) {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev && prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => ({ ...u, count: Math.max(0, u.count - 1) }));
      void api.post(`/api/v1/platform/notifications/${n.id}/read`, {}).catch(() => undefined);
    }
    navigate(n.link);
  }

  async function markAll() {
    await api.post('/api/v1/platform/notifications/read-all', {}).catch(() => undefined);
    setUnread({ count: 0, critical: 0 });
    setItems((prev) => prev && prev.map((x) => ({ ...x, read: true })));
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        type="button"
        className="header-icon-btn notif-bell"
        title="Notifications"
        aria-label={unread.count > 0 ? `Notifications, ${unread.count} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="w-4 h-4" />
        {unread.count > 0 && (
          <span className={`notif-badge${unread.critical > 0 ? ' critical' : ''}`} data-testid="notif-count">
            {unread.count > 99 ? '99+' : unread.count}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <span>Notifications</span>
            {unread.count > 0 && (
              <button type="button" className="notif-link-btn" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          {failed ? (
            <div className="notif-empty">Could not load notifications.</div>
          ) : items === null ? (
            <div className="notif-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="notif-empty">Nothing needs your attention right now.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => openItem(n)}>
                    <span className={`notif-dot ${n.severity.toLowerCase()}`} aria-label={n.severity.toLowerCase()} />
                    <span className="notif-item-text">
                      <span className="notif-item-title">{n.title}</span>
                      {n.body && <span className="notif-item-body">{n.body}</span>}
                      <span className="notif-item-time" title={absoluteTime(n.createdAt)}>
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" className="notif-footer" onClick={() => setOpen(false)}>
            See all notifications →
          </Link>
        </div>
      )}
    </div>
  );
}
