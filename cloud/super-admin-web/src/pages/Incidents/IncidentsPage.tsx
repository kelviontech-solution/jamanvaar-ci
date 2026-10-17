import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformIncident } from '../../api/types';
import { Badge, BadgeTone, Button, Card, EmptyState } from '../../components/ui';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import '../../components/shared.css';

const SEVERITY_TONE: Record<PlatformIncident['severity'], BadgeTone> = {
  MINOR: 'accent',
  MAJOR: 'warning',
  CRITICAL: 'error'
};

const STATUS_TONE: Record<PlatformIncident['status'], BadgeTone> = {
  INVESTIGATING: 'error',
  IDENTIFIED: 'warning',
  MONITORING: 'warning',
  RESOLVED: 'success'
};

const NEXT_STATUSES: PlatformIncident['status'][] = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'];

export function IncidentsPage() {
  const { can } = useAuth();
  const canWrite = can('ops', 'write');
  const [incidents, setIncidents] = useState<PlatformIncident[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<PlatformIncident['severity']>('MINOR');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updateDraft, setUpdateDraft] = useState<Record<string, { status: PlatformIncident['status']; message: string }>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    api
      .get<PlatformIncident[]>('/api/v1/platform/telemetry/incidents')
      .then(setIncidents)
      .catch((err) => {
        // A failed load used to leave `incidents` at its initial `null` and render identically to
        // a genuinely empty list — "No incidents on record / A clean history" — so a telemetry
        // outage looked exactly like a healthy platform with nothing wrong.
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load incidents');
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function handleOpen() {
    if (!title.trim() || !message.trim()) {
      showToast('Title and an initial update are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/v1/platform/telemetry/incidents', { title: title.trim(), severity, message: message.trim() });
      setTitle('');
      setSeverity('MINOR');
      setMessage('');
      setFormOpen(false);
      showToast('Incident opened');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to open incident');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddUpdate(incidentId: string) {
    const draft = updateDraft[incidentId];
    if (!draft || !draft.message?.trim()) {
      showToast('Write what changed before posting an update');
      return;
    }
    setUpdatingId(incidentId);
    try {
      await api.patch(`/api/v1/platform/telemetry/incidents/${incidentId}/updates`, {
        status: draft.status || 'INVESTIGATING',
        message: draft.message.trim()
      });
      setUpdateDraft((prev) => ({ ...prev, [incidentId]: { status: 'INVESTIGATING', message: '' } }));
      showToast('Update posted');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to post update');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Status History</h1>
          <p className="page-subtitle">
            What broke, when, and how it was worked — a real paper trail instead of just the current "Platform Online" instant.
          </p>
        </div>
        <Button variant="accent" disabled={!canWrite} title={canWrite ? undefined : "You don't have permission to open incidents"} onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Open Incident'}
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
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Elevated sync failures on Kiosk fleet" />
            </div>
            <div className="form-grid">
              <div>
                <label className="label">Severity</label>
                <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as PlatformIncident['severity'])}>
                  <option value="MINOR">Minor</option>
                  <option value="MAJOR">Major</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Initial update</label>
              <textarea className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's known so far." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={submitting}>Cancel</Button>
              <Button variant="primary" onClick={handleOpen} disabled={submitting}>
                {submitting ? 'Opening…' : 'Open Incident'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>Loading…</div>
      ) : loadError ? (
        <div role="alert" style={{ padding: 48, textAlign: 'center' }}>
          <p style={{ color: 'var(--jv-error-text)', marginBottom: 12 }}>{loadError}</p>
          <Button variant="ghost" onClick={load}>Retry</Button>
        </div>
      ) : !incidents || incidents.length === 0 ? (
        <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No incidents on record" description="A clean history — nothing's been opened." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {incidents.map((inc) => {
            const draft = updateDraft[inc.id] || { status: inc.status, message: '' };
            return (
              <Card key={inc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 15 }}>{inc.title}</strong>
                      <Badge tone={SEVERITY_TONE[inc.severity]}>{inc.severity}</Badge>
                      <Badge tone={STATUS_TONE[inc.status]}>{inc.status}</Badge>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--jv-text-light)' }}>
                      Opened by {inc.createdBy.fullName} · {new Date(inc.startedAt).toLocaleString('en-IN')}
                      {inc.resolvedAt ? ` · Resolved ${new Date(inc.resolvedAt).toLocaleString('en-IN')}` : ''}
                    </span>
                  </div>
                </div>

                <div style={{ borderLeft: '2px solid var(--jv-border-subtle)', paddingLeft: 14, marginBottom: 10 }}>
                  {inc.updates.map((u, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {u.status} <span style={{ color: 'var(--jv-text-light)', fontWeight: 400 }}>· {new Date(u.at).toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--jv-text-muted)' }}>{u.message}</div>
                    </div>
                  ))}
                </div>

                {inc.status !== 'RESOLVED' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <select
                      className="input"
                      style={{ maxWidth: 160 }}
                      value={draft.status}
                      onChange={(e) =>
                        setUpdateDraft((prev) => ({ ...prev, [inc.id]: { ...draft, status: e.target.value as PlatformIncident['status'] } }))
                      }
                    >
                      {NEXT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="What changed…"
                      value={draft.message}
                      onChange={(e) => setUpdateDraft((prev) => ({ ...prev, [inc.id]: { ...draft, message: e.target.value } }))}
                    />
                    <Button size="sm" variant="primary" disabled={updatingId === inc.id || !canWrite} title={canWrite ? undefined : "You don't have permission to post incident updates"} onClick={() => handleAddUpdate(inc.id)}>
                      {updatingId === inc.id ? 'Posting…' : 'Post Update'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
