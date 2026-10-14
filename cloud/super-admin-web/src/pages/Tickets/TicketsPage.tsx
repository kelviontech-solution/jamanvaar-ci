import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { SupportTicket, SupportTicketDetail, TicketPriority, TicketStatus, PlatformTeamUser, RestaurantCore } from '../../api/types';
import { CreateTicketModal } from './CreateTicketModal';
import { TicketDetailModal } from './TicketDetailModal';
import { CATEGORY_LABEL, PRIORITY_TONE, TicketStatusBadge, ticketNumber, slaLabel } from './ticketShared';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  FilterTabs,
  SkeletonTable,
  EmptyState
} from '../../components/ui';
import { RefreshButton } from '../../components/RefreshButton';
import { LifeBuoy, Plus, Clock, AlertCircle, UserCheck, UserX } from 'lucide-react';
import '../../components/shared.css';

type View = 'all' | 'my-work' | 'unassigned' | 'created-by-me' | 'overdue' | 'from-restaurants';

interface TicketSummary {
  all: number;
  mine: number;
  unassigned: number;
  createdByMe: number;
  overdue: number;
  fromRestaurants: number;
  byAssignee: Array<{ userId: string; name: string; openCount: number }>;
}

const PAGE_SIZE = 25;

export function TicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [team, setTeam] = useState<PlatformTeamUser[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantCore[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [view, setView] = useState<View>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDetail | null>(null);
  // A notification opens its ticket straight away: /tickets?open=<id>.
  const [searchParams, setSearchParams] = useSearchParams();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Only people who can actually log in and work a ticket may be assigned one.
  const assignable = team.filter((u) => u.status === 'ACTIVE');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadTickets = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (view !== 'all') params.set('view', view);
    if (assigneeFilter) params.set('assignedToId', assigneeFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    params.set('limit', String(PAGE_SIZE));
    params.set('page', String(page));
    Promise.all([
      api.get<SupportTicket[]>(`/api/v1/support-tickets?${params.toString()}`),
      api.get<TicketSummary>('/api/v1/support-tickets/summary')
    ])
      .then(([rows, sum]) => {
        setTickets(rows);
        setSummary(sum);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load tickets'))
      .finally(() => setLoading(false));
  }, [view, assigneeFilter, statusFilter, debouncedSearch, page]);

  useEffect(loadTickets, [loadTickets]);

  useEffect(() => {
    api.get<PlatformTeamUser[]>('/api/v1/platform-users').then(setTeam).catch(() => {});
    api.get<RestaurantCore[]>('/api/v1/restaurants').then(setRestaurants).catch(() => {});
  }, []);

  function chooseView(next: View) {
    setView(next);
    setAssigneeFilter(null);
    setPage(1);
  }

  function chooseAssignee(userId: string | null) {
    setAssigneeFilter(userId);
    setView('all');
    setPage(1);
  }

  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    void openTicket(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function openTicket(id: string) {
    try {
      const detail = await api.get<SupportTicketDetail>(`/api/v1/support-tickets/${id}`);
      setSelectedTicket(detail);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to load ticket');
    }
  }

  async function handleTicketUpdate(updates: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) {
    if (!selectedTicket) return;
    try {
      await api.patch(`/api/v1/support-tickets/${selectedTicket.id}`, updates);
      const refreshed = await api.get<SupportTicketDetail>(`/api/v1/support-tickets/${selectedTicket.id}`);
      setSelectedTicket(refreshed);
      loadTickets();
      showToast('Ticket updated');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function reloadSelected() {
    if (!selectedTicket) return;
    setSelectedTicket(await api.get<SupportTicketDetail>(`/api/v1/support-tickets/${selectedTicket.id}`));
    loadTickets();
  }

  const viewLabel: Record<View, string> = {
    all: 'All tickets',
    'my-work': 'My work today',
    unassigned: 'Unassigned',
    'created-by-me': 'Created by me',
    overdue: 'Overdue',
    'from-restaurants': 'From restaurants'
  };

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        subtitle="Every ticket is visible to the whole team. Use My work today to see just what is assigned to you."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <RefreshButton loading={loading} onRefresh={loadTickets} />
            <Button variant="accent" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              <span>New Ticket</span>
            </Button>
          </div>
        }
      />

      {toast && (
        <div role="status" style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {loadError && (
        <div className="form-error" role="alert" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Could not load tickets: {loadError}</span>
          <Button variant="ghost" size="sm" onClick={loadTickets}>Retry</Button>
        </div>
      )}

      <div className="stat-grid">
        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Total tickets</div>
            <div className="stat-tile-icon stat-tile-icon-blue"><LifeBuoy className="w-5 h-5" /></div>
          </div>
          <div>
            <div className="stat-value">{summary?.all ?? '—'}</div>
            <div className="stat-sub">Visible to every team member</div>
          </div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Assigned to me</div>
            <div className="stat-tile-icon stat-tile-icon-green"><UserCheck className="w-5 h-5" /></div>
          </div>
          <div>
            <div className="stat-value">{summary?.mine ?? '—'}</div>
            <div className="stat-sub">Open or in progress</div>
          </div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Unassigned</div>
            <div className="stat-tile-icon stat-tile-icon-amber"><UserX className="w-5 h-5" /></div>
          </div>
          <div>
            <div className="stat-value" style={{ color: (summary?.unassigned ?? 0) > 0 ? '#d97706' : 'inherit' }}>{summary?.unassigned ?? '—'}</div>
            <div className="stat-sub">{(summary?.unassigned ?? 0) > 0 ? 'Nobody owns these yet' : 'Everything has an owner'}</div>
          </div>
        </Card>
        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Past SLA</div>
            <div className="stat-tile-icon stat-tile-icon-orange"><AlertCircle className="w-5 h-5" /></div>
          </div>
          <div>
            <div className="stat-value" style={{ color: (summary?.overdue ?? 0) > 0 ? '#dc2626' : 'inherit' }}>{summary?.overdue ?? '—'}</div>
            <div className="stat-sub">{(summary?.overdue ?? 0) > 0 ? 'Open tickets past their SLA' : 'No open ticket is past its SLA'}</div>
          </div>
        </Card>
      </div>

      <div className="toolbar" style={{ marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
        <FilterTabs<View>
          value={view}
          onChange={chooseView}
          options={[
            { id: 'all', label: 'All', count: summary?.all },
            { id: 'my-work', label: 'My work today', count: summary?.mine },
            { id: 'unassigned', label: 'Unassigned', count: summary?.unassigned },
            { id: 'created-by-me', label: 'Created by me', count: summary?.createdByMe },
            { id: 'overdue', label: 'Overdue', count: summary?.overdue },
            { id: 'from-restaurants', label: 'From restaurants', count: summary?.fromRestaurants }
          ]}
        />
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as TicketStatus | 'ALL');
            setPage(1);
          }}
          style={{ height: 36 }}
        >
          <option value="ALL">Any status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject or number (TKT-123)…" style={{ minWidth: 240 }} />
      </div>

      {summary && summary.byAssignee.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }} aria-label="Open tickets per teammate">
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>By teammate:</span>
          {summary.byAssignee.map((a) => (
            <button
              key={a.userId}
              type="button"
              className={`btn btn-sm ${assigneeFilter === a.userId ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => chooseAssignee(assigneeFilter === a.userId ? null : a.userId)}
              title={`Show tickets assigned to ${a.name}`}
            >
              {a.userId === user?.id ? `${a.name} (me)` : a.name} · {a.openCount}
            </button>
          ))}
        </div>
      )}

      {loading && !tickets ? (
        <SkeletonTable rows={5} cols={7} />
      ) : (
        <Card>
          {!tickets || tickets.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <EmptyState
                icon={<LifeBuoy className="w-7 h-7 text-slate-400" />}
                title={view === 'all' && !assigneeFilter && !debouncedSearch && statusFilter === 'ALL' ? 'No support tickets yet' : `Nothing in "${viewLabel[view]}"`}
                description={
                  view === 'my-work'
                    ? 'Nothing is assigned to you right now.'
                    : 'Support issues, hardware tickets and restaurant queries will appear here once filed.'
                }
                action={
                  <Button variant="accent" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Create Ticket</span>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Subject</th>
                      <th>Restaurant</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>SLA</th>
                      <th>Assignee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => {
                      const sla = slaLabel(t.slaDueAt, t.resolvedAt);
                      // Resolved/closed tickets are done work: muting them (not hiding them --
                      // they're one filter away) lets whatever is still open visually lead the table.
                      const isDone = t.status === 'RESOLVED' || t.status === 'CLOSED';
                      return (
                        <tr key={t.id} style={{ cursor: 'pointer', opacity: isDone ? 0.6 : 1 }} onClick={() => openTicket(t.id)}>
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>{ticketNumber(t.number)}</td>
                          <td>
                            <button type="button" className="table-link" style={{ fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                              {t.subject}
                            </button>
                            <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                              <Badge tone="neutral">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                              {t.source === 'RESTAURANT' && <Badge tone="accent">From restaurant</Badge>}
                            </div>
                          </td>
                          <td>{t.restaurant?.name || '— Platform-wide —'}</td>
                          <td><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                          <td><TicketStatusBadge status={t.status} /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: sla.overdue ? '#dc2626' : undefined, fontWeight: sla.overdue ? 700 : 500 }}>
                              <Clock className="w-3 h-3" /> {sla.text}
                            </span>
                          </td>
                          <td>{t.assignedTo?.fullName || <span className="muted">Unassigned</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                <span className="muted" style={{ fontSize: 12 }}>Page {page}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <Button variant="ghost" size="sm" disabled={tickets.length < PAGE_SIZE || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {showCreate && (
        <CreateTicketModal
          restaurants={restaurants}
          assignable={assignable}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            showToast(`Ticket ${ticketNumber(created.number)} created`);
            chooseView('all');
            loadTickets();
          }}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          team={team}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleTicketUpdate}
          onChanged={reloadSelected}
          showToast={showToast}
        />
      )}
    </div>
  );
}
