// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TenantUser, ActivationKey, AuditLogPage, Branch, RestaurantDetail } from '../../api/types';
import {
  Badge,
  Button,
  EmptyState,
  SkeletonCard,
  statusTone
} from '../../components/ui';
import {
  Users,
  ArrowLeft,
  Store,
  Building2,
  Mail,
  Phone,
  KeyRound,
  FileText,
  Activity,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  ArrowRight,
  MapPin,
  Laptop2,
  Send,
  CheckCircle2
} from 'lucide-react';
import '../../components/card-grid.css';
import '../../components/shared.css';

type Tab = 'overview' | 'restaurant' | 'branches' | 'keys' | 'audit';

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: Users },
  { key: 'restaurant', label: 'Restaurant', icon: Store },
  { key: 'branches', label: 'Branches', icon: Building2 },
  { key: 'keys', label: 'Activation Keys', icon: KeyRound },
  { key: 'audit', label: 'Activity / Logs', icon: Activity },
];

export function OwnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [owner, setOwner] = useState<TenantUser | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [copiedId, setCopiedId] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Tab data
  const [keys, setKeys] = useState<ActivationKey[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogPage | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const owners = await api.get<TenantUser[]>('/api/v1/owners');
      const found = owners.find((o) => o.id === id);
      if (!found) {
        setError('Owner not found');
        return;
      }
      setOwner(found);
      if (found.restaurant?.id) {
        const rest = await api.get<RestaurantDetail>(`/api/v1/restaurants/${found.restaurant.id}`);
        setRestaurant(rest);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load owner');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Tab data loading
  useEffect(() => {
    if (!owner || !restaurant) return;

    async function loadTabData() {
      setTabLoading(true);
      try {
        if (tab === 'keys' && keys === null) {
          const allKeys = await api.get<ActivationKey[]>(`/api/v1/activation-keys?restaurantId=${restaurant!.id}`);
          setKeys(allKeys);
        }
        if (tab === 'audit' && auditLogs === null) {
          const logs = await api.get<AuditLogPage>(`/api/v1/audit-logs?restaurantId=${restaurant!.id}&limit=30`);
          setAuditLogs(logs);
        }
      } catch (_e) {
        // silently handled
      } finally {
        setTabLoading(false);
      }
    }

    loadTabData();
  }, [tab, owner, restaurant]);

  async function handleResendInvite() {
    if (!owner) return;
    try {
      const res = await api.post<{ emailSent: boolean; activationToken: string }>('/api/v1/support/resend-invite', {
        userId: owner.id,
        reason: 'Super Admin owner credentials invitation'
      });
      if (res.emailSent) {
        showToast(`New invitation emailed to ${owner.email}`);
      } else {
        navigator.clipboard?.writeText(res.activationToken).catch(() => {});
        showToast(`Email could not be sent — token copied to clipboard`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to resend invite');
    }
  }

  async function handleCopyId() {
    if (!owner) return;
    if (!(await copyText(owner.id))) return;
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}><SkeletonCard rows={4} /></div>
        <SkeletonCard rows={8} />
      </div>
    );
  }

  if (error || !owner) {
    return (
      <div style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: 40 }}>
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6 text-red-400" />}
          title="Owner Not Found"
          description={error || 'This owner could not be loaded.'}
          action={
            <Button variant="ghost" onClick={() => navigate('/owners')}>
              <ArrowLeft className="w-4 h-4" />
              Back to Owners
            </Button>
          }
        />
      </div>
    );
  }

  const initials = owner.fullName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'O';
  const branchCount = restaurant?.branches?.length ?? 0;

  return (
    <div>
      {toast && (
        <div style={{ padding: '12px 18px', background: 'var(--jv-surface)', color: 'var(--jv-text)', border: '1px solid var(--jv-border)', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="detail-page-header">
        <Link to="/owners" className="detail-page-back">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Restaurant Owners
        </Link>

        <div className="detail-page-title-row">
          <div className="detail-page-identity">
            <div
              className="detail-page-avatar"
              style={{ background: 'linear-gradient(135deg, #2d3561, #4a5099)' }}
            >
              {initials}
            </div>
            <div className="detail-page-name-group">
              <h1 className="detail-page-name">{owner.fullName}</h1>
              <div className="detail-page-meta">
                <Badge tone={statusTone(owner.status)} pulse={owner.status === 'ACTIVE'}>
                  {owner.status === 'PENDING_ACTIVATION' ? 'PENDING' : owner.status}
                </Badge>
                <span className="detail-page-meta-item">
                  <Mail className="w-3.5 h-3.5" />
                  <code style={{ fontSize: 12 }}>{owner.email}</code>
                </span>
                {owner.phone && (
                  <span className="detail-page-meta-item">
                    <Phone className="w-3.5 h-3.5" />
                    {owner.phone}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCopyId}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'monospace', background: 'var(--jv-bg-muted)', border: '1px solid var(--jv-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'var(--jv-text-secondary)' }}
                >
                  {copiedId ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> {owner.id.slice(0, 8)}…</>}
                </button>
              </div>
            </div>
          </div>

          <div className="detail-page-actions">
            {owner.status === 'PENDING_ACTIVATION' && (
              <Button variant="accent" size="sm" onClick={handleResendInvite}>
                <Send className="w-3.5 h-3.5" />
                Resend Invite
              </Button>
            )}
            {owner.restaurant && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/restaurants/${owner.restaurant!.id}`)}>
                <Store className="w-3.5 h-3.5" />
                Open Restaurant
              </Button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="detail-stats-bar">
          <div className="detail-stat-item">
            <span className="detail-stat-label">Restaurant</span>
            <span className="detail-stat-value" style={{ fontSize: 13, fontWeight: 700 }}>{owner.restaurant?.name || '—'}</span>
            <span className="detail-stat-sublabel">associated</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Branches</span>
            <span className="detail-stat-value">{branchCount}</span>
            <span className="detail-stat-sublabel">total branches</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Role</span>
            <span className="detail-stat-value" style={{ fontSize: 13, fontWeight: 700 }}>{owner.role}</span>
            <span className="detail-stat-sublabel">platform role</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Joined</span>
            <span className="detail-stat-value" style={{ fontSize: 13, fontWeight: 700 }}>
              {new Date(owner.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </span>
            <span className="detail-stat-sublabel">account created</span>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="detail-page-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`detail-tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Owner Profile */}
          <div className="detail-section">
            <div className="detail-section-header">
              <h3 className="detail-section-title">
                <Users className="w-4 h-4 text-orange-500" />
                Owner Profile
              </h3>
            </div>
            <div className="detail-section-body">
              <div className="detail-info-grid">
                <div className="detail-info-item">
                  <span className="detail-info-label">Full Name</span>
                  <span className="detail-info-value">{owner.fullName}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Email Address</span>
                  <span className="detail-info-value mono" style={{ fontSize: 12 }}>{owner.email}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Phone</span>
                  <span className="detail-info-value">{owner.phone || '—'}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Account Status</span>
                  <span className="detail-info-value">
                    <Badge tone={statusTone(owner.status)} pulse={owner.status === 'ACTIVE'}>{owner.status}</Badge>
                  </span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Role</span>
                  <span className="detail-info-value">{owner.role}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Invited At</span>
                  <span className="detail-info-value">{owner.invitedAt ? new Date(owner.invitedAt).toLocaleDateString('en-IN') : '—'}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Activated At</span>
                  <span className="detail-info-value">{owner.activatedAt ? new Date(owner.activatedAt).toLocaleDateString('en-IN') : '—'}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Owner ID</span>
                  <span className="detail-info-value mono" style={{ fontSize: 11 }}>{owner.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {[
              { label: 'Associated Restaurant', value: owner.restaurant ? 1 : 0, icon: Store, color: '#e66817' },
              { label: 'Total Branches', value: branchCount, icon: Building2, color: '#0ea5e9' },
              { label: 'Total Devices', value: restaurant?.devices?.length ?? 0, icon: Laptop2, color: '#8b5cf6' },
            ].map((item) => (
              <div key={item.label} style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <item.icon style={{ width: 16, height: 16, color: item.color }} />
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--jv-text)', letterSpacing: '-0.03em' }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Subscription info */}
          {restaurant?.subscriptions?.[0] && (
            <div className="detail-section">
              <div className="detail-section-header">
                <h3 className="detail-section-title">
                  <KeyRound className="w-4 h-4 text-orange-500" />
                  Subscription
                </h3>
              </div>
              <div className="detail-section-body">
                {(() => {
                  const sub = restaurant.subscriptions[0];
                  return (
                    <div className="detail-info-grid">
                      <div className="detail-info-item">
                        <span className="detail-info-label">Plan</span>
                        <span className="detail-info-value">{sub.plan?.name || '—'}</span>
                      </div>
                      <div className="detail-info-item">
                        <span className="detail-info-label">Tier</span>
                        <span className="detail-info-value">{sub.plan?.tier || '—'}</span>
                      </div>
                      <div className="detail-info-item">
                        <span className="detail-info-label">Status</span>
                        <span className="detail-info-value">
                          <Badge tone={statusTone(sub.status)} pulse={sub.status === 'ACTIVE'}>{sub.status}</Badge>
                        </span>
                      </div>
                      <div className="detail-info-item">
                        <span className="detail-info-label">Expires</span>
                        <span className="detail-info-value">{new Date(sub.expiresAt).toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESTAURANT ── */}
      {tab === 'restaurant' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Store className="w-4 h-4 text-orange-500" />
              Associated Restaurant
            </h3>
          </div>
          <div className="detail-section-body">
            {restaurant ? (
              <div>
                {/* Restaurant card-style block */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'var(--jv-bg-muted)', borderRadius: 12, marginBottom: 24, cursor: 'pointer', border: '1px solid var(--jv-border)', transition: 'border-color 0.15s' }}
                  onClick={() => navigate(`/restaurants/${restaurant.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #0b253a, #173f60)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 }}>
                    {restaurant.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--jv-text)' }}>{restaurant.name}</div>
                    {restaurant.legalName && restaurant.legalName !== restaurant.name && (
                      <div style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>{restaurant.legalName}</div>
                    )}
                    <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                      <Badge tone={statusTone(restaurant.status)} pulse={restaurant.status === 'ACTIVE'}>{restaurant.status}</Badge>
                      {restaurant.subscriptions?.[0]?.plan && (
                        <Badge tone="gold">{restaurant.subscriptions[0].plan.tier}</Badge>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5" style={{ color: 'var(--jv-text-muted)' }} />
                </div>

                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <span className="detail-info-label">City / State</span>
                    <span className="detail-info-value">{[restaurant.city, restaurant.state].filter(Boolean).join(', ') || '—'}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Branches</span>
                    <span className="detail-info-value">{restaurant.branches.length}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Devices</span>
                    <span className="detail-info-value">{restaurant.devices.length}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Timezone</span>
                    <span className="detail-info-value">{restaurant.timezone}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Currency</span>
                    <span className="detail-info-value">{restaurant.currency}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">GSTIN</span>
                    <span className="detail-info-value mono">{restaurant.gstin || '—'}</span>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <Button variant="accent" onClick={() => navigate(`/restaurants/${restaurant.id}`)}>
                    <Store className="w-3.5 h-3.5" />
                    Open Full Restaurant Workspace
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState icon={<Store className="w-6 h-6 text-slate-400" />} title="No restaurant associated" description="This owner does not have an associated restaurant." />
            )}
          </div>
        </div>
      )}

      {/* ── BRANCHES ── */}
      {tab === 'branches' && (
        <div>
          {!restaurant || restaurant.branches.length === 0 ? (
            <div className="detail-section">
              <div className="detail-section-body">
                <EmptyState icon={<Building2 className="w-6 h-6 text-slate-400" />} title="No branches" description="No branches found for this owner's restaurant." />
              </div>
            </div>
          ) : (
            <div className="mgmt-card-grid">
              {restaurant.branches.map((b) => {
                const initials = b.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'B';
                const terminalCount = b._count?.devices ?? 0;
                const staffCount = b._count?.users ?? 0;
                const isActive = b.status === 'ACTIVE';

                return (
                  <div
                    key={b.id}
                    className={`mgmt-card ${!isActive ? 'is-suspended' : ''}`}
                    onClick={() => navigate(`/branches/${b.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/branches/${b.id}`)}
                  >
                    <div className="mgmt-card-top">
                      <div className={`mgmt-card-avatar branch-icon ${!isActive ? 'is-suspended' : ''}`}>{initials}</div>
                      <div className="mgmt-card-top-right">
                        <Badge tone={statusTone(b.status)} pulse={isActive}>{b.status}</Badge>
                      </div>
                    </div>
                    <div className="mgmt-card-body">
                      <p className="mgmt-card-name">{b.name}</p>
                      <p className="mgmt-card-subtitle">
                        <Store style={{ display: 'inline', width: 12, height: 12, marginRight: 4, verticalAlign: 'middle' }} />
                        {restaurant.name}
                      </p>
                      <span className="mgmt-card-plan-badge" style={{ background: 'linear-gradient(135deg, #0f4c75, #1b6ca8)' }}>
                        # {b.code}
                      </span>
                    </div>
                    <div className="mgmt-card-divider" />
                    <div className="mgmt-card-stats">
                      <div className="mgmt-card-stat">
                        <span className="mgmt-card-stat-label">Terminals</span>
                        <span className={`mgmt-card-stat-value ${terminalCount > 0 ? 'has-data' : ''}`}>{terminalCount}</span>
                      </div>
                      <div className="mgmt-card-stat">
                        <span className="mgmt-card-stat-label">Staff</span>
                        <span className={`mgmt-card-stat-value ${staffCount > 0 ? 'has-data' : ''}`}>{staffCount}</span>
                      </div>
                    </div>
                    {b.address && (
                      <div className="mgmt-card-info-row">
                        <div className="mgmt-card-info-item">
                          <MapPin className="w-3 h-3" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.address}</span>
                        </div>
                      </div>
                    )}
                    <div className="mgmt-card-footer">
                      <span className="mgmt-card-cta">
                        <Building2 className="w-3.5 h-3.5" />
                        Manage Branch
                        <span className="mgmt-card-cta-arrow">
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVATION KEYS ── */}
      {tab === 'keys' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <KeyRound className="w-4 h-4 text-orange-500" />
              Hardware Activation Keys
            </h3>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading keys…</div>
          ) : !keys || keys.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<KeyRound className="w-6 h-6 text-slate-400" />} title="No activation keys" description="No activation keys have been generated for this restaurant." />
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Key Code</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{k.code}</td>
                      <td>{k.allowedDeviceType}</td>
                      <td><Badge tone={statusTone(k.status)} pulse={k.status === 'ACTIVE'}>{k.status}</Badge></td>
                      <td style={{ fontSize: 12 }}>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                      <td style={{ fontSize: 12 }}>{k.redeemedAt ? new Date(k.redeemedAt).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT LOGS ── */}
      {tab === 'audit' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Activity className="w-4 h-4 text-orange-500" />
              Activity / Audit Logs
            </h3>
            <span style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>Recent 30 events for associated restaurant</span>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading…</div>
          ) : !auditLogs || auditLogs.rows.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<FileText className="w-6 h-6 text-slate-400" />} title="No audit logs" description="No audit events found." />
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Category</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.action}</td>
                      <td><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--jv-bg-muted)', fontWeight: 600 }}>{row.category}</span></td>
                      <td style={{ fontSize: 12 }}>{row.actorType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
