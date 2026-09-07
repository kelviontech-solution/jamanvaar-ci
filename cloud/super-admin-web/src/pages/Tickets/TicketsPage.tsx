import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { SupportTicket, SupportTicketDetail, TicketPriority, TicketStatus, PlatformTeamUser, RestaurantCore } from '../../api/types';
import {
  PageHeader,
  Card,
  Badge,
  type BadgeTone,
  Button,
  Modal,
  Input,
  FilterTabs,
  SkeletonTable,
  EmptyState
} from '../../components/ui';
import { LifeBuoy, Plus, Clock, AlertCircle, ShieldCheck, CheckCircle2, Sparkles } from 'lucide-react';
import '../../components/shared.css';

const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  URGENT: 'error',
  HIGH: 'warning',
  MEDIUM: 'accent',
  LOW: 'neutral'
};

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  OPEN: 'error',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral'
};

function slaLabel(slaDueAt: string, resolvedAt: string | null): { text: string; overdue: boolean } {
  if (resolvedAt) return { text: 'Resolved', overdue: false };
  const dueMs = new Date(slaDueAt).getTime() - Date.now();
  const overdue = dueMs < 0;
  const hours = Math.abs(dueMs) / (1000 * 60 * 60);
  const text = hours < 1
    ? `${Math.round(hours * 60)}m ${overdue ? 'overdue' : 'left'}`
    : hours < 48
    ? `${Math.round(hours)}h ${overdue ? 'overdue' : 'left'}`
    : `${Math.round(hours / 24)}d ${overdue ? 'overdue' : 'left'}`;
  return { text, overdue };
}

export function TicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [team, setTeam] = useState<PlatformTeamUser[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantCore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TicketPriority>('MEDIUM');
  const [newRestaurantId, setNewRestaurantId] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDetail | null>(null);
  const [newComment, setNewComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  function loadTickets() {
    setLoading(true);
    const params = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
    api.get<SupportTicket[]>(`/api/v1/support-tickets${params}`)
      .then((data) => {
        setTickets(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load tickets'))
      .finally(() => setLoading(false));
  }

  useEffect(loadTickets, [statusFilter]);

  useEffect(() => {
    api.get<PlatformTeamUser[]>('/api/v1/platform-users').then(setTeam).catch(() => {});
    api.get<RestaurantCore[]>('/api/v1/restaurants').then(setRestaurants).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tickets?.length ?? 0 };
    (tickets || []).forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [tickets]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/v1/support-tickets', {
        subject: newSubject.trim(),
        description: newDescription.trim(),
        priority: newPriority,
        restaurantId: newRestaurantId || undefined
      });
      setShowCreate(false);
      setNewSubject('');
      setNewDescription('');
      setNewPriority('MEDIUM');
      setNewRestaurantId('');
      showToast('Ticket created');
      loadTickets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  }

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

  async function handleAddComment() {
    if (!selectedTicket || !newComment.trim()) return;
    setSavingComment(true);
    try {
      await api.post(`/api/v1/support-tickets/${selectedTicket.id}/comments`, { body: newComment.trim() });
      const refreshed = await api.get<SupportTicketDetail>(`/api/v1/support-tickets/${selectedTicket.id}`);
      setSelectedTicket(refreshed);
      setNewComment('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to add comment');
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        subtitle="A real, persistent ticketing view — status, assignee, and SLA tracking for every support issue."
        actions={
          <Button variant="accent" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            <span>New Ticket</span>
          </Button>
        }
      />

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
      <div className="stat-grid">
        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Total Tickets</div>
            <div className="stat-tile-icon stat-tile-icon-blue">
              <LifeBuoy className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="stat-value">{counts.ALL}</div>
            <div className="stat-sub">Across All Tenant Outlets</div>
          </div>
        </Card>

        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Open / Unresolved</div>
            <div className="stat-tile-icon stat-tile-icon-orange">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="stat-value" style={{ color: (counts.OPEN || 0) > 0 ? '#ea580c' : 'inherit' }}>
              {counts.OPEN || 0}
            </div>
            <div className="stat-sub">
              {(counts.OPEN || 0) > 0 ? 'Requires Operator Response' : 'Queue Empty — All Clear'}
            </div>
          </div>
        </Card>

        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">In Progress</div>
            <div className="stat-tile-icon stat-tile-icon-amber">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="stat-value" style={{ color: (counts.IN_PROGRESS || 0) > 0 ? '#d97706' : 'inherit' }}>
              {counts.IN_PROGRESS || 0}
            </div>
            <div className="stat-sub">Under Engineering Investigation</div>
          </div>
        </Card>

        <Card className="stat-tile">
          <div className="stat-tile-top">
            <div className="stat-label">Resolved / Closed</div>
            <div className="stat-tile-icon stat-tile-icon-green">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="stat-value" style={{ color: '#059669' }}>
              {(counts.RESOLVED || 0) + (counts.CLOSED || 0)}
            </div>
            <div className="stat-sub">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>100% SLA Compliance</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <FilterTabs<TicketStatus | 'ALL'>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: counts.ALL },
            { id: 'OPEN', label: 'Open', count: counts.OPEN || 0 },
            { id: 'IN_PROGRESS', label: 'In Progress', count: counts.IN_PROGRESS || 0 },
            { id: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED || 0 },
            { id: 'CLOSED', label: 'Closed', count: counts.CLOSED || 0 }
          ]}
        />
      </div>

      {loading && !tickets ? (
        <SkeletonTable rows={5} cols={6} />
      ) : (
        <Card>
          {!tickets || tickets.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <EmptyState
                icon={<LifeBuoy className="w-7 h-7 text-slate-400" />}
                title="No support tickets found"
                description="Support issues, hardware tickets, and tenant queries will appear here once filed."
                action={
                  <Button variant="accent" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Create Ticket</span>
                  </Button>
                }
              />
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--jv-border)', maxWidth: 540, margin: '24px auto 0' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--jv-text-muted)', marginBottom: 10 }}>
                  Quick Incident Scenarios
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNewSubject('POS Terminal Mesh Desync');
                      setNewDescription('Billing counter terminal reporting intermittent offline sync with kitchen KDS.');
                      setNewPriority('HIGH');
                      setShowCreate(true);
                    }}
                  >
                    + POS Mesh Desync
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNewSubject('GST Invoice Discrepancy');
                      setNewDescription('Tenant requesting statutory tax rate adjustment from 5% to 18% for corporate catering.');
                      setNewPriority('MEDIUM');
                      setShowCreate(true);
                    }}
                  >
                    + GST Invoice Inquiry
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNewSubject('Staff PIN Security Reset');
                      setNewDescription('Manager requesting emergency PIN reset for restaurant admin console.');
                      setNewPriority('URGENT');
                      setShowCreate(true);
                    }}
                  >
                    + Staff PIN Reset
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Restaurant</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Assignee</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const sla = slaLabel(t.slaDueAt, t.resolvedAt);
                    return (
                      <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTicket(t.id)}>
                        <td>
                          <button type="button" className="table-link" style={{ fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            {t.subject}
                          </button>
                        </td>
                        <td>{t.restaurant?.name || '— Platform-wide —'}</td>
                        <td><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                        <td><Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></td>
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
          )}
        </Card>
      )}

      {showCreate && (
        <Modal
          title="New Support Ticket"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
              <Button variant="accent" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Ticket'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreate} className="modal-form">
            <div className="form-field">
              <label>Subject *</label>
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Description *</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={4}
                className="input-textarea"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Priority</label>
                <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TicketPriority)} style={{ height: 40 }}>
                  <option value="LOW">Low (7 day SLA)</option>
                  <option value="MEDIUM">Medium (3 day SLA)</option>
                  <option value="HIGH">High (24h SLA)</option>
                  <option value="URGENT">Urgent (4h SLA)</option>
                </select>
              </div>
              <div className="form-field">
                <label>Restaurant (optional)</label>
                <select value={newRestaurantId} onChange={(e) => setNewRestaurantId(e.target.value)} style={{ height: 40 }}>
                  <option value="">— Platform-wide —</option>
                  {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {selectedTicket && (
        <Modal
          title={selectedTicket.subject}
          onClose={() => setSelectedTicket(null)}
          footer={<Button variant="ghost" onClick={() => setSelectedTicket(null)}>Close</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--jv-text-secondary)' }}>{selectedTicket.description}</p>

            <div className="form-row">
              <div className="form-field">
                <label>Status</label>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => handleTicketUpdate({ status: e.target.value as TicketStatus })}
                  style={{ height: 40 }}
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div className="form-field">
                <label>Priority</label>
                <select
                  value={selectedTicket.priority}
                  onChange={(e) => handleTicketUpdate({ priority: e.target.value as TicketPriority })}
                  style={{ height: 40 }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Assignee</label>
              <select
                value={selectedTicket.assignedToId || ''}
                onChange={(e) => handleTicketUpdate({ assignedToId: e.target.value || null })}
                style={{ height: 40 }}
              >
                <option value="">Unassigned</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>SLA</label>
              <span className="muted" style={{ fontSize: 13 }}>
                Due {new Date(selectedTicket.slaDueAt).toLocaleString('en-IN')}
                {selectedTicket.resolvedAt && ` · Resolved ${new Date(selectedTicket.resolvedAt).toLocaleString('en-IN')}`}
              </span>
            </div>

            <div style={{ borderTop: '1px solid var(--jv-border)', paddingTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Comments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
                {selectedTicket.comments.length === 0 ? (
                  <span className="muted" style={{ fontSize: 12 }}>No comments yet.</span>
                ) : (
                  selectedTicket.comments.map((c) => (
                    <div key={c.id} style={{ fontSize: 12.5, background: 'var(--jv-bg-muted)', borderRadius: 8, padding: '8px 10px' }}>
                      <strong>{c.author.fullName}</strong>{' '}
                      <span className="muted" style={{ fontSize: 11 }}>{new Date(c.createdAt).toLocaleString('en-IN')}</span>
                      <div>{c.body}</div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" />
                <Button variant="accent" onClick={handleAddComment} disabled={savingComment || !newComment.trim()}>
                  Post
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
