import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { NotificationExtras, NotificationSeverity, PlatformNotification } from '../../api/types';
import { EmptyState, Badge, Button, Card, FilterTabs, PageHeader, type BadgeTone } from '../../components/ui';
import { Pager } from '../../components/Pager';
import { RefreshButton } from '../../components/RefreshButton';
import { usePagedList } from '../../hooks/usePagedList';
import { absoluteTime, relativeTime } from '../../lib/relativeTime';
import { allCategories, categoryForType } from '../../lib/notificationCategory';
import '../../components/shared.css';
import '../../components/notifications.css';

type ReadFilter = 'ALL' | 'UNREAD';
type SeverityFilter = 'ALL' | NotificationSeverity;

const TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION_EXPIRING: 'Subscription',
  BACKUP_FAILED: 'Backup',
  INVOICE_OVERDUE: 'Invoice',
  DEVICES_OFFLINE: 'Terminals offline',
  KEYS_EXPIRING: 'Activation keys',
  SYNC_FAILING: 'Sync',
  RESTAURANT_SUSPENDED: 'Suspended',
  WHATSAPP_CONNECTION_LOCKED: 'WhatsApp connector',
  TICKET_CREATED: 'New ticket',
  TICKET_ASSIGNED: 'Ticket assigned',
  TICKET_COMMENT: 'Ticket reply'
};
const SEVERITY_TONE: Record<NotificationSeverity, BadgeTone> = { CRITICAL: 'error', WARNING: 'warning', INFO: 'neutral' };

export function NotificationsPage() {
  const navigate = useNavigate();
  const [readFilter, setReadFilter] = useState<ReadFilter>('UNREAD');
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [type, setType] = useState('');

  const list = usePagedList<PlatformNotification, NotificationExtras>(
    '/api/v1/platform/notifications',
    { unread: readFilter === 'UNREAD' ? 'true' : '', severity: severity === 'ALL' ? '' : severity, type },
    25
  );
  const counts = list.extra?.severityCounts;

  async function open(n: PlatformNotification) {
    if (!n.read) await api.post(`/api/v1/platform/notifications/${n.id}/read`, {}).catch(() => undefined);
    navigate(n.link);
  }

  async function markAll() {
    await api.post('/api/v1/platform/notifications/read-all', {}).catch(() => undefined);
    list.reload();
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Notifications"
        subtitle="Things that need attention across restaurants: expiring subscriptions, failed backups, overdue invoices, terminals gone quiet. Each opens the exact record."
        actions={
          <>
            <RefreshButton onRefresh={list.reload} loading={list.loading} />
            <Button variant="ghost" onClick={markAll} disabled={!list.extra || list.extra.unreadCount === 0}>
              Mark all read
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <FilterTabs<ReadFilter>
          value={readFilter}
          onChange={setReadFilter}
          options={[
            { id: 'UNREAD', label: 'Unread', count: list.extra?.unreadCount },
            { id: 'ALL', label: 'All' }
          ]}
        />
        <FilterTabs<SeverityFilter>
          value={severity}
          onChange={setSeverity}
          options={[
            { id: 'ALL', label: 'Any severity' },
            { id: 'CRITICAL', label: 'Critical', count: counts?.CRITICAL },
            { id: 'WARNING', label: 'Warning', count: counts?.WARNING },
            { id: 'INFO', label: 'Info', count: counts?.INFO }
          ]}
        />
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {allCategories().map((cat) => {
            const typesInCategory = Object.entries(TYPE_LABELS).filter(([value]) => categoryForType(value).id === cat.id);
            if (typesInCategory.length === 0) return null;
            return (
              <optgroup key={cat.id} label={cat.label}>
                {typesInCategory.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {list.error && <div className="page-error" role="alert">{list.error}</div>}

      <Card>
        {list.items.length === 0 && !list.loading ? (
          <EmptyState
            title={readFilter === 'UNREAD' ? 'You are all caught up' : 'No notifications yet'}
            description="New ones appear here when something needs attention."
          />
        ) : (
          list.items.map((n) => (
            <button key={n.id} type="button" className={`notif-page-item${n.read ? '' : ' unread'}`} onClick={() => open(n)}>
              <span className={`notif-dot ${n.severity.toLowerCase()}`} aria-label={n.severity.toLowerCase()} />
              <span className="notif-item-text" style={{ flex: 1 }}>
                <span className="notif-item-title">{n.title}</span>
                {n.body && <span className="notif-item-body">{n.body}</span>}
              </span>
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className="muted" style={{ fontSize: 11 }}>{categoryForType(n.type).label}</span>
                <Badge tone={SEVERITY_TONE[n.severity]}>{TYPE_LABELS[n.type] ?? n.type}</Badge>
                <span className="notif-item-time" title={absoluteTime(n.createdAt)}>{relativeTime(n.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </Card>
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} totalPages={list.totalPages} onPage={list.setPage} loading={list.loading} />
    </div>
  );
}
