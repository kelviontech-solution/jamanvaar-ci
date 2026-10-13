import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformAnnouncement } from '../../api/types';
import { Badge, BadgeTone, Button, Card, EmptyState } from '../../components/ui';
import { Megaphone } from 'lucide-react';
import '../../components/shared.css';

const SEVERITY_TONE: Record<PlatformAnnouncement['severity'], BadgeTone> = {
  INFO: 'accent',
  WARNING: 'warning',
  CRITICAL: 'error'
};

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<PlatformAnnouncement['severity']>('INFO');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<PlatformAnnouncement[]>('/api/v1/platform/settings/announcements')
      .then(setAnnouncements)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load announcements'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function handleCreate() {
    if (!title.trim() || !body.trim()) {
      showToast('Title and message are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/v1/platform/settings/announcements', {
        title: title.trim(),
        body: body.trim(),
        severity,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {})
      });
      setTitle('');
      setBody('');
      setSeverity('INFO');
      setExpiresAt('');
      setFormOpen(false);
      showToast('Announcement published');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to publish announcement');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw(id: string) {
    setWithdrawingId(id);
    try {
      await api.patch(`/api/v1/platform/settings/announcements/${id}/withdraw`, {});
      showToast('Announcement withdrawn');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to withdraw');
    } finally {
      setWithdrawingId(null);
    }
  }

  function status(a: PlatformAnnouncement): { label: string; tone: BadgeTone } {
    if (a.withdrawnAt) return { label: 'Withdrawn', tone: 'neutral' };
    if (a.expiresAt && new Date(a.expiresAt) < new Date()) return { label: 'Expired', tone: 'neutral' };
    return { label: 'Active', tone: 'success' };
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Announcements</h1>
          <p className="page-subtitle">
            Broadcast a maintenance window, a new feature, or a policy change to every restaurant owner —
            authored and withdrawn from here.
          </p>
        </div>
        <Button variant="accent" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New Announcement'}
        </Button>
      </div>

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {formOpen && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance tonight 11pm–12am IST" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea
                className="input"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What's happening and what, if anything, the restaurant needs to do."
              />
            </div>
            <div className="form-grid">
              <div>
                <label className="label">Severity</label>
                <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as PlatformAnnouncement['severity'])}>
                  <option value="INFO">Info</option>
                  <option value="WARNING">Warning</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="label">Expires (optional)</label>
                <input type="datetime-local" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={submitting}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>Loading…</div>
      ) : !announcements || announcements.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="w-8 h-8" />}
          title="No announcements yet"
          description="Publish one to reach every restaurant owner at once."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.map((a) => {
            const s = status(a);
            return (
              <Card key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 15 }}>{a.title}</strong>
                      <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--jv-text-muted)' }}>{a.body}</p>
                    <span style={{ fontSize: 11, color: 'var(--jv-text-light)' }}>
                      By {a.createdBy.fullName} · {new Date(a.publishedAt).toLocaleString('en-IN')}
                      {a.expiresAt ? ` · Expires ${new Date(a.expiresAt).toLocaleString('en-IN')}` : ''}
                    </span>
                  </div>
                  {s.label === 'Active' && (
                    <Button size="sm" variant="ghost" disabled={withdrawingId === a.id} onClick={() => handleWithdraw(a.id)}>
                      {withdrawingId === a.id ? 'Withdrawing…' : 'Withdraw'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
