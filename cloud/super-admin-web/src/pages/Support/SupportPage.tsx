import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import type { SearchResult, RestaurantDiagnostics } from '../../api/types';
import { Card, Button, Input, Modal, Badge, EmptyState } from '../../components/ui';
import { absoluteTime, relativeTime } from '../../lib/relativeTime';
import { useAuth } from '../../auth/AuthContext';
import {
  Search,
  LifeBuoy,
  Store,
  Users,
  Laptop2,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Mail,
  HelpCircle,
  Clock,
  Send,
  UserCog,
  Copy
} from 'lucide-react';
import '../../components/shared.css';
import './support.css';

export function SupportPage() {
  const { hasPermission } = useAuth();
  const canImpersonate = hasPermission('SUPPORT_ADMIN');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RestaurantDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [fleetList, setFleetList] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/api/v1/restaurants')
      .then((data) => setFleetList(data || []))
      .catch(() => {});
  }, []);

  // Audited Action Modals
  const [actionModal, setActionModal] = useState<{
    type: 'RESEND_INVITE' | 'REVOKE_DEVICE' | 'IMPERSONATE';
    targetId: string;
    targetName: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [performingAction, setPerformingAction] = useState(false);
  const [impersonationResult, setImpersonationResult] = useState<{
    accessToken: string;
    expiresAt: string;
    restaurantName: string;
    ownerEmail: string;
    ownerName: string;
  } | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 2) return;

    setSearching(true);
    setError(null);
    // A new search starts from a clean slate: results from the previous query must not stay on screen
    // as if they matched this one (BUG-090).
    setSearchResults(null);
    setDiagnostics(null);
    setSelectedRestaurantId(null);
    try {
      const res = await api.get<SearchResult>(`/api/v1/support/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(res);
      // Auto select first restaurant if found
      if (res.restaurants.length > 0) {
        loadDiagnostics(res.restaurants[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function loadDiagnostics(restaurantId: string) {
    setSelectedRestaurantId(restaurantId);
    setDiagLoading(true);
    setError(null);
    try {
      const res = await api.get<RestaurantDiagnostics>(`/api/v1/support/diagnostics/${restaurantId}`);
      setDiagnostics(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load diagnostics');
    } finally {
      setDiagLoading(false);
    }
  }

  async function handlePerformAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionModal || !actionReason.trim()) return;

    setPerformingAction(true);
    try {
      if (actionModal.type === 'RESEND_INVITE') {
        const res = await api.post<{ emailSent: boolean; activationToken: string }>('/api/v1/support/resend-invite', {
          userId: actionModal.targetId,
          reason: actionReason.trim()
        });
        if (res.emailSent) {
          setSuccessToast(`New invitation emailed to ${actionModal.targetName}`);
        } else {
          navigator.clipboard?.writeText(res.activationToken).catch(() => {});
          setSuccessToast(`Email could not be sent — new token copied to clipboard, relay it to ${actionModal.targetName} manually`);
        }
      } else if (actionModal.type === 'REVOKE_DEVICE') {
        await api.post('/api/v1/support/revoke-device-session', {
          deviceId: actionModal.targetId,
          reason: actionReason.trim()
        });
        setSuccessToast(`Device ${actionModal.targetName} disconnected and session revoked`);
      } else if (actionModal.type === 'IMPERSONATE') {
        const res = await api.post<{
          accessToken: string;
          expiresAt: string;
          restaurantName: string;
          ownerEmail: string;
          ownerName: string;
        }>('/api/v1/support/impersonate', {
          restaurantId: actionModal.targetId,
          reason: actionReason.trim()
        });
        setImpersonationResult(res);
        setSuccessToast(`Impersonation token issued for ${res.ownerName} (${res.restaurantName})`);
      }

      setActionModal(null);
      setActionReason('');
      if (selectedRestaurantId) loadDiagnostics(selectedRestaurantId);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setPerformingAction(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Support & Diagnostic Console</h1>
          <p className="page-subtitle">
            Universal operator search, live tenant health inspect, device session revocation, and audited troubleshooting tools.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}
      {successToast && <div className="page-success">{successToast}</div>}

      {/* Universal Search Bar */}
      <Card className="support-search-card">
        <form onSubmit={handleSearch} className="support-search-input-box">
          <Search className="w-5 h-5 support-search-icon" />
          <input
            type="text"
            className="support-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by restaurant name, owner email, GSTIN, terminal device ID, or activation key…"
          />
          <Button
            type="submit"
            variant="accent"
            disabled={searching}
            style={{ position: 'absolute', right: '0.5rem' }}
          >
            {searching ? 'Searching…' : 'Inspect'}
          </Button>
        </form>

        {searchResults && (
          <div className="search-results-grid">
            <div>
              <div className="result-section-title">Restaurants ({searchResults.restaurants.length})</div>
              {searchResults.restaurants.map((r) => (
                <div
                  key={r.id}
                  className="result-item-card"
                  style={{
                    borderColor: selectedRestaurantId === r.id ? 'var(--jv-accent)' : undefined
                  }}
                  onClick={() => loadDiagnostics(r.id)}
                >
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>
                    {r.city || 'India'} • {r.status}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="result-section-title">Owners ({searchResults.owners.length})</div>
              {searchResults.owners.map((u) => (
                <div
                  key={u.id}
                  className="result-item-card"
                  onClick={() => loadDiagnostics(u.restaurantId)}
                >
                  <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>{u.email}</div>
                  <Badge tone={u.status === 'ACTIVE' ? 'success' : 'accent'}>{u.status}</Badge>
                </div>
              ))}
            </div>

            <div>
              <div className="result-section-title">Devices ({searchResults.devices.length})</div>
              {searchResults.devices.map((d) => (
                <div
                  key={d.id}
                  className="result-item-card"
                  onClick={() => loadDiagnostics(d.restaurantId)}
                >
                  <div style={{ fontWeight: 600 }}>{d.type} Terminal</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>ID: {d.id.slice(0, 8)}…</div>
                  <Badge tone={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge>
                </div>
              ))}
            </div>

            <div>
              <div className="result-section-title">Activation Keys ({searchResults.activationKeys.length})</div>
              {searchResults.activationKeys.map((k) => (
                <div
                  key={k.id}
                  className="result-item-card"
                  onClick={() => loadDiagnostics(k.restaurantId)}
                >
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{k.code}</div>
                  <Badge tone={k.status === 'ACTIVE' ? 'success' : 'neutral'}>{k.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Diagnostics Panel */}
      {diagLoading ? (
        <div className="page-loading">Inspecting tenant operational state…</div>
      ) : diagnostics ? (
        <div className="diagnostics-panel">
          {/* Summary Column */}
          <div className="diag-summary-col">
            <Card>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Tenant Profile</h3>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Restaurant Name</span>
                <span className="diag-kv-value">{diagnostics.restaurant.name}</span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Status</span>
                <span className="diag-kv-value">
                  <Badge tone={diagnostics.restaurant.status === 'ACTIVE' ? 'success' : 'error'}>
                    {diagnostics.restaurant.status}
                  </Badge>
                </span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">GSTIN</span>
                <span className="diag-kv-value">{diagnostics.restaurant.gstin || 'Not registered'}</span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Branches Count</span>
                <span className="diag-kv-value">{diagnostics.branches.length}</span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Active Plan</span>
                <span className="diag-kv-value">
                  {diagnostics.activeSubscription?.plan?.name || 'No active plan'}
                </span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Subscription Status</span>
                <span className="diag-kv-value">
                  <Badge tone={diagnostics.activeSubscription?.status === 'ACTIVE' ? 'success' : 'accent'}>
                    {diagnostics.activeSubscription?.status || 'NONE'}
                  </Badge>
                </span>
              </div>
              <div className="diag-kv-row">
                <span className="diag-kv-label">Online Terminals</span>
                <span className="diag-kv-value">
                  {diagnostics.onlineDevicesCount} of {diagnostics.devices.length} Online
                </span>
              </div>
              {canImpersonate && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--jv-border)' }}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setActionModal({
                        type: 'IMPERSONATE',
                        targetId: diagnostics.restaurant.id,
                        targetName: diagnostics.restaurant.name
                      })
                    }
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8 }}
                  >
                    <UserCog className="w-4 h-4" />
                    <span>Impersonate Owner Session</span>
                  </Button>
                </div>
              )}
            </Card>

            {impersonationResult && impersonationResult.restaurantName === diagnostics.restaurant.name && (
              <Card style={{ border: '1px solid var(--jv-accent-border)', background: 'var(--jv-accent-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Impersonation Token — {impersonationResult.ownerName}</h3>
                  <button
                    onClick={() => setImpersonationResult(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--jv-text-muted)' }}
                  >
                    ✕
                  </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--jv-text-secondary)', margin: '0 0 0.75rem' }}>
                  A real, valid tenant access token for <strong>{impersonationResult.ownerEmail}</strong>, expiring at{' '}
                  {new Date(impersonationResult.expiresAt).toLocaleTimeString('en-IN')}. This is an API-level debugging
                  credential (use it as a Bearer token against tenant-scoped endpoints, e.g. via Postman or browser
                  devtools) — it does not open a view of this restaurant's live local POS data, which never leaves that
                  restaurant's own on-site device. This action has been recorded in the audit log.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    readOnly
                    value={impersonationResult.accessToken}
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      padding: '0.5rem',
                      border: '1px solid var(--jv-border)',
                      borderRadius: 6,
                      background: 'var(--jv-surface)',
                      color: 'var(--jv-text)'
                    }}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => navigator.clipboard?.writeText(impersonationResult.accessToken).catch(() => {})}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            )}

            {/* Owner accounts */}
            <Card>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Owner Accounts</h3>
              {diagnostics.owners.map((o) => (
                <div key={o.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--jv-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{o.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>{o.email}</div>
                    </div>
                    <Badge tone={o.status === 'ACTIVE' ? 'success' : 'accent'}>{o.status}</Badge>
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setActionModal({
                          type: 'RESEND_INVITE',
                          targetId: o.id,
                          targetName: o.email
                        })
                      }
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Resend Invite / Activation</span>
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          {/* Details & Live Telemetry Column */}
          <div className="diag-details-col">
            <Card>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Connected Terminal Hardware</h3>
              {diagnostics.devices.length === 0 ? (
                <div style={{ color: 'var(--jv-text-muted)' }}>No devices registered yet.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Terminal</th>
                      <th>Version</th>
                      <th>Last Seen</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.devices.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong>{d.type}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>ID: {d.id.slice(0, 8)}…</div>
                        </td>
                        <td>{d.appVersion || <span style={{ color: 'var(--jv-text-muted)', fontStyle: 'italic' }}>Unknown</span>}</td>
                        <td title={d.lastSeenAt ?? undefined}>
                          {relativeTime(d.lastSeenAt)}
                          {d.lastSeenAt && <div style={{ fontSize: '0.75rem', color: 'var(--jv-text-muted)' }}>{absoluteTime(d.lastSeenAt)}</div>}
                        </td>
                        <td>
                          <Badge tone={d.status === 'ACTIVE' ? 'success' : d.status === 'REVOKED' ? 'error' : 'neutral'}>{d.status}</Badge>
                        </td>
                        <td>
                          {d.status === 'ACTIVE' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setActionModal({
                                  type: 'REVOKE_DEVICE',
                                  targetId: d.id,
                                  targetName: `${d.type} (${d.id.slice(0, 8)})`
                                })
                              }
                            >
                              Disconnect
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Recent Diagnostic Audit Logs</h3>
              {diagnostics.recentAudits.length === 0 ? (
                <div style={{ color: 'var(--jv-text-muted)' }}>No audit entries logged for this tenant.</div>
              ) : (
                <div style={{ fontSize: '0.8rem' }}>
                  {diagnostics.recentAudits.slice(0, 8).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0',
                        borderBottom: '1px solid var(--jv-border)'
                      }}
                    >
                      <span>
                        <strong>{a.action}</strong> ({a.category})
                      </span>
                      <span style={{ color: 'var(--jv-text-muted)' }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Diagnostic Mesh Quick Summary */}
          <div className="stat-grid">
            <Card className="stat-tile">
              <div className="stat-tile-top">
                <div className="stat-label">Diagnostic Telemetry Mesh</div>
                <div className="stat-tile-icon stat-tile-icon-green">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="stat-value" style={{ color: '#059669', fontSize: 20 }}>Cluster Active</div>
                <div className="stat-sub">Port 4000 Backend Serving Real-Time Metrics</div>
              </div>
            </Card>

            <Card className="stat-tile">
              <div className="stat-tile-top">
                <div className="stat-label">Operator Privilege</div>
                <div className="stat-tile-icon stat-tile-icon-blue">
                  <UserCog className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="stat-value" style={{ fontSize: 20 }}>Support Admin</div>
                <div className="stat-sub">Audited Device Revocation &amp; Impersonation</div>
              </div>
            </Card>

            <Card className="stat-tile">
              <div className="stat-tile-top">
                <div className="stat-label">Indexed Tenants</div>
                <div className="stat-tile-icon stat-tile-icon-purple">
                  <Store className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="stat-value">{fleetList.length}</div>
                <div className="stat-sub">Ready for Instant Live Inspection</div>
              </div>
            </Card>
          </div>

          {/* Quick Inspection Targets */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--jv-primary)' }}>
                  Live Diagnostic Targets
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--jv-text-secondary)' }}>
                  Select any active restaurant below to immediately pull its hardware devices, active license tokens, and audit history.
                </p>
              </div>
              <Badge tone="accent">{fleetList.length} Active Outlets</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {fleetList.map((rest) => (
                <div
                  key={rest.id}
                  style={{
                    padding: '16px',
                    border: '1px solid var(--jv-border)',
                    borderRadius: 'var(--jv-radius-md)',
                    background: selectedRestaurantId === rest.id ? 'var(--jv-accent-soft)' : 'var(--jv-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: 'var(--jv-shadow-xs)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--jv-primary)' }}>
                        {rest.name}
                      </h4>
                      <Badge tone={rest.status === 'ACTIVE' ? 'success' : 'neutral'}>{rest.status}</Badge>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--jv-text-muted)', marginTop: 4 }}>
                      {rest.city || 'India'} • GSTIN: {rest.gstin || 'Unregistered'}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => loadDiagnostics(rest.id)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Inspect Live Diagnostics</span>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Audited Operator Action Modal ── */}
      {actionModal && (
        <Modal
          title={`Support Operator Action: ${
            actionModal.type === 'RESEND_INVITE'
              ? 'Resend Invitation'
              : actionModal.type === 'REVOKE_DEVICE'
              ? 'Revoke Device Session'
              : 'Impersonate Owner Session'
          }`}
          onClose={() => setActionModal(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setActionModal(null)} disabled={performingAction}>
                Cancel
              </Button>
              <Button variant="accent" onClick={handlePerformAction} disabled={performingAction || !actionReason.trim()}>
                {performingAction ? 'Executing…' : 'Confirm Action'}
              </Button>
            </>
          }
        >
          <form onSubmit={handlePerformAction} className="modal-form">
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', marginBottom: '1rem' }}>
              <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>
                Audited Operator Procedure
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--jv-text-secondary)' }}>
                Target: <strong>{actionModal.targetName}</strong>. A mandatory reason is required and will be appended to the immutable platform audit trail.
                {actionModal.type === 'IMPERSONATE' && ' This mints a real, time-boxed (15 min) access token for this restaurant\'s owner account.'}
              </div>
            </div>

            <div className="form-field">
              <label>Reason for Diagnostic Intervention *</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                className="input-textarea"
                placeholder="e.g. Owner requested password link re-issuance via ticket #9921..."
                required
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
