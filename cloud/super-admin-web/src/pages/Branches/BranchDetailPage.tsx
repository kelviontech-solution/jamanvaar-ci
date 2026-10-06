// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Branch, Device, TenantUser, ActivationKey, AuditLogPage, RestaurantDetail } from '../../api/types';
import {
  Badge,
  Button,
  EmptyState,
  SkeletonCard,
  statusTone
} from '../../components/ui';
import {
  Building2,
  ArrowLeft,
  Store,
  Laptop2,
  Users,
  KeyRound,
  FileText,
  MapPin,
  Clock,
  Hash,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Copy,
  Check,
  ChevronRight
} from 'lucide-react';
import '../../components/card-grid.css';
import '../../components/shared.css';

type Tab = 'overview' | 'restaurant' | 'staff' | 'devices' | 'keys' | 'audit';

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'restaurant', label: 'Restaurant', icon: Store },
  { key: 'staff', label: 'Staff Users', icon: Users },
  { key: 'devices', label: 'Devices & Terminals', icon: Laptop2 },
  { key: 'keys', label: 'Activation Keys', icon: KeyRound },
  { key: 'audit', label: 'Audit Logs', icon: FileText },
];

export function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [copiedId, setCopiedId] = useState(false);

  // Tab data
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [staff, setStaff] = useState<TenantUser[] | null>(null);
  const [keys, setKeys] = useState<ActivationKey[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogPage | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Load branch from branch list, then load restaurant detail
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all branches, find matching one
      const branches = await api.get<Branch[]>('/api/v1/branches');
      const found = branches.find((b) => b.id === id);
      if (!found) {
        setError('Branch not found');
        return;
      }
      setBranch(found);
      // Fetch the parent restaurant for full detail
      if (found.restaurantId) {
        const rest = await api.get<RestaurantDetail>(`/api/v1/restaurants/${found.restaurantId}`);
        setRestaurant(rest);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load branch');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load tab-specific data
  useEffect(() => {
    if (!branch || !restaurant) return;

    async function loadTabData() {
      setTabLoading(true);
      try {
        if (tab === 'devices' && devices === null) {
          const allDevices = await api.get<Device[]>(`/api/v1/devices?restaurantId=${branch!.restaurantId}`);
          setDevices(allDevices.filter((d) => d.branchId === id));
        }
        if (tab === 'staff' && staff === null) {
          const allStaff = await api.get<TenantUser[]>(`/api/v1/owners?restaurantId=${branch!.restaurantId}`);
          setStaff(allStaff);
        }
        if (tab === 'keys' && keys === null) {
          const allKeys = await api.get<ActivationKey[]>(`/api/v1/activation-keys?restaurantId=${branch!.restaurantId}`);
          setKeys(allKeys);
        }
        if (tab === 'audit' && auditLogs === null) {
          const logs = await api.get<AuditLogPage>(`/api/v1/audit-logs?restaurantId=${branch!.restaurantId}&limit=30`);
          setAuditLogs(logs);
        }
      } catch (_e) {
        // non-critical tab failures silently handled
      } finally {
        setTabLoading(false);
      }
    }

    loadTabData();
  }, [tab, branch, restaurant]);

  async function handleCopyId() {
    if (!branch) return;
    if (!(await copyText(branch.id))) return;
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <SkeletonCard rows={4} />
        </div>
        <SkeletonCard rows={8} />
      </div>
    );
  }

  if (error || !branch) {
    return (
      <div style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: 40 }}>
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6 text-red-400" />}
          title="Branch Not Found"
          description={error || 'This branch could not be loaded. It may have been deleted or you may not have access.'}
          action={
            <Button variant="ghost" onClick={() => navigate('/branches')}>
              <ArrowLeft className="w-4 h-4" />
              Back to Branches
            </Button>
          }
        />
      </div>
    );
  }

  const terminalCount = branch._count?.devices ?? 0;
  const staffCount = branch._count?.users ?? 0;
  const initials = branch.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'B';

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="detail-page-header">
        <Link to="/branches" className="detail-page-back">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Branches
        </Link>

        <div className="detail-page-title-row">
          <div className="detail-page-identity">
            <div className="detail-page-avatar" style={{ background: 'linear-gradient(135deg, #0f4c75, #1b6ca8)' }}>
              {initials}
            </div>
            <div className="detail-page-name-group">
              <h1 className="detail-page-name">{branch.name}</h1>
              <div className="detail-page-meta">
                <Badge tone={statusTone(branch.status)} pulse={branch.status === 'ACTIVE'}>
                  {branch.status}
                </Badge>
                {branch.restaurant && (
                  <span className="detail-page-meta-item">
                    <Store className="w-3.5 h-3.5" />
                    <Link
                      to={`/restaurants/${branch.restaurantId}`}
                      style={{ fontWeight: 600, color: 'var(--jv-accent-text)', textDecoration: 'none' }}
                    >
                      {branch.restaurant.name}
                    </Link>
                  </span>
                )}
                <span className="detail-page-meta-item">
                  <Hash className="w-3.5 h-3.5" />
                  <code style={{ fontSize: 12, background: 'var(--jv-bg-muted)', padding: '2px 6px', borderRadius: 4 }}>
                    {branch.code}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'monospace', background: 'var(--jv-bg-muted)', border: '1px solid var(--jv-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'var(--jv-text-secondary)' }}
                >
                  {copiedId ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> {branch.id.slice(0, 8)}…</>}
                </button>
              </div>
            </div>
          </div>

          <div className="detail-page-actions">
            <Button
              variant={branch.status === 'ACTIVE' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => navigate('/branches')}
            >
              {branch.status === 'ACTIVE' ? 'Deactivate Branch' : 'Activate Branch'}
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="detail-stats-bar">
          <div className="detail-stat-item">
            <span className="detail-stat-label">Terminals</span>
            <span className="detail-stat-value">{terminalCount}</span>
            <span className="detail-stat-sublabel">registered devices</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Staff Users</span>
            <span className="detail-stat-value">{staffCount}</span>
            <span className="detail-stat-sublabel">associated staff</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Timezone</span>
            <span className="detail-stat-value" style={{ fontSize: 13, fontWeight: 700 }}>{branch.timezone || 'Asia/Kolkata'}</span>
            <span className="detail-stat-sublabel">local timezone</span>
          </div>
          <div className="detail-stat-item">
            <span className="detail-stat-label">Status</span>
            <span className="detail-stat-value" style={{ fontSize: 13, color: branch.status === 'ACTIVE' ? '#059669' : '#ef4444' }}>
              {branch.status}
            </span>
            <span className="detail-stat-sublabel">operational status</span>
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

      {/* ── TAB CONTENT ── */}

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Branch Info */}
          <div className="detail-section">
            <div className="detail-section-header">
              <h3 className="detail-section-title">
                <Building2 className="w-4 h-4 text-orange-500" />
                Branch Information
              </h3>
            </div>
            <div className="detail-section-body">
              <div className="detail-info-grid">
                <div className="detail-info-item">
                  <span className="detail-info-label">Branch Name</span>
                  <span className="detail-info-value">{branch.name}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Branch Code</span>
                  <span className="detail-info-value mono">{branch.code}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Status</span>
                  <span className="detail-info-value">
                    <Badge tone={statusTone(branch.status)} pulse={branch.status === 'ACTIVE'}>{branch.status}</Badge>
                  </span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Timezone</span>
                  <span className="detail-info-value">{branch.timezone || 'Asia/Kolkata'}</span>
                </div>
                {branch.address && (
                  <div className="detail-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="detail-info-label">Address</span>
                    <span className="detail-info-value">{branch.address}</span>
                  </div>
                )}
                <div className="detail-info-item">
                  <span className="detail-info-label">Branch ID</span>
                  <span className="detail-info-value mono" style={{ fontSize: 11 }}>{branch.id}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-info-label">Created</span>
                  <span className="detail-info-value">
                    {new Date(branch.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Restaurant Relationship */}
          {branch.restaurant && (
            <div className="detail-section">
              <div className="detail-section-header">
                <h3 className="detail-section-title">
                  <Store className="w-4 h-4 text-orange-500" />
                  Parent Restaurant
                </h3>
                <Link
                  to={`/restaurants/${branch.restaurantId}`}
                  style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--jv-accent-text)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Open Restaurant <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="detail-section-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg, #0b253a, #173f60)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {branch.restaurant.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--jv-text)' }}>{branch.restaurant.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>Restaurant ID: {branch.restaurantId.slice(0, 12)}…</div>
                  </div>
                  <Link
                    to={`/restaurants/${branch.restaurantId}`}
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--jv-accent)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8 }}
                  >
                    Open Workspace <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {[
              { label: 'Registered Terminals', value: terminalCount, icon: Laptop2, color: '#0ea5e9' },
              { label: 'Staff Users', value: staffCount, icon: Users, color: '#8b5cf6' },
            ].map((item) => (
              <div key={item.label} style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <item.icon style={{ width: 16, height: 16, color: item.color }} />
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--jv-text)', letterSpacing: '-0.03em' }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restaurant Tab */}
      {tab === 'restaurant' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Store className="w-4 h-4 text-orange-500" />
              Parent Restaurant Details
            </h3>
          </div>
          <div className="detail-section-body">
            {restaurant ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '16px 20px', background: 'var(--jv-bg-muted)', borderRadius: 12 }}>
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
                    </div>
                  </div>
                  <Link
                    to={`/restaurants/${restaurant.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--jv-accent)', textDecoration: 'none', padding: '8px 16px', borderRadius: 8 }}
                  >
                    Open Full Restaurant <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <span className="detail-info-label">City / State</span>
                    <span className="detail-info-value">{[restaurant.city, restaurant.state].filter(Boolean).join(', ') || '—'}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Total Branches</span>
                    <span className="detail-info-value">{restaurant.branches.length}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Total Devices</span>
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
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--jv-text-muted)' }}>
                Restaurant details not available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Users Tab */}
      {tab === 'staff' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Users className="w-4 h-4 text-orange-500" />
              Staff Users
            </h3>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading staff…</div>
          ) : !staff || staff.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<Users className="w-6 h-6 text-slate-400" />} title="No staff users" description="Staff accounts for this restaurant will appear here." />
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.email}</td>
                      <td>{u.role}</td>
                      <td><Badge tone={statusTone(u.status)} pulse={u.status === 'ACTIVE'}>{u.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Laptop2 className="w-4 h-4 text-orange-500" />
              Devices & Terminals
            </h3>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading devices…</div>
          ) : !devices || devices.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<Laptop2 className="w-6 h-6 text-slate-400" />} title="No devices for this branch" description="Terminals registered to this branch will appear here." />
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.name || d.type}</div>
                        <div style={{ fontSize: 11, color: 'var(--jv-text-muted)', fontFamily: 'monospace' }}>{d.id.slice(0, 12)}…</div>
                      </td>
                      <td>{d.type}</td>
                      <td><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                      <td style={{ fontSize: 12 }}>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Activation Keys Tab */}
      {tab === 'keys' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <KeyRound className="w-4 h-4 text-orange-500" />
              Activation Keys
            </h3>
            <span style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>Keys for parent restaurant shown</span>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading keys…</div>
          ) : !keys || keys.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<KeyRound className="w-6 h-6 text-slate-400" />} title="No activation keys" description="Activation keys for this restaurant will appear here." />
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
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{k.code}</td>
                      <td>{k.allowedDeviceType}</td>
                      <td><Badge tone={statusTone(k.status)} pulse={k.status === 'ACTIVE'}>{k.status}</Badge></td>
                      <td style={{ fontSize: 12 }}>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Logs Tab */}
      {tab === 'audit' && (
        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">
              <Activity className="w-4 h-4 text-orange-500" />
              Audit Logs
            </h3>
            <span style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>Recent 30 events for parent restaurant</span>
          </div>
          {tabLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--jv-text-muted)', fontSize: 13 }}>Loading audit logs…</div>
          ) : !auditLogs || auditLogs.rows.length === 0 ? (
            <div style={{ padding: 32 }}>
              <EmptyState icon={<FileText className="w-6 h-6 text-slate-400" />} title="No audit logs" description="Audit log events for this restaurant will appear here." />
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
