import { RefreshButton } from '../../components/RefreshButton';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Device } from '../../api/types';
import { Badge, Button, Card, ConfirmModal, EmptyState, FilterTabs, SearchBar, SkeletonTable } from '../../components/ui';
import { Laptop2, Download, Wifi, WifiOff, Lock, Unlock, Eye, Pencil, Check, X } from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import { fetchAllPages } from '../../lib/fetchAll';
import { absoluteTime, relativeTime } from '../../lib/relativeTime';
import { useDebounced, usePagedList } from '../../hooks/usePagedList';
import { Pager } from '../../components/Pager';
import '../../components/shared.css';

type Health = 'online' | 'degraded' | 'offline' | 'never_seen' | 'revoked' | 'pending';
type View = 'ATTENTION' | 'ALL' | 'RESTAURANTS';
type DeviceRow = Device & { health: Health };
type Extra = { healthCounts: Record<Health, number>; lockedCount: number };

interface RestaurantFleetRow {
  restaurantId: string;
  restaurantName: string;
  total: number;
  online: number;
  degraded: number;
  offline: number;
  neverSeen: number;
  revoked: number;
  needsAttention: number;
}

const HEALTH_LABEL: Record<Health, string> = {
  online: 'Online', degraded: 'Degraded', offline: 'Offline', never_seen: 'Never seen', revoked: 'Revoked', pending: 'Pending'
};
const HEALTH_TONE: Record<Health, 'success' | 'warning' | 'error' | 'neutral'> = {
  online: 'success', degraded: 'warning', offline: 'error', never_seen: 'neutral', revoked: 'neutral', pending: 'neutral'
};

/**
 * Fleet overview. Health is decided once, on the server (online / degraded / offline, with revoked,
 * pending and never-seen kept apart), and the counts, search, filters and paging all happen there too,
 * so a real outage is not buried in a thousand-row table (BUG-067/069).
 */
export function DevicesListPage() {
  const [view, setView] = useState<View>('ATTENTION');
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState<Health | 'ALL'>('ALL');
  const [lockedOnly, setLockedOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [restaurant, setRestaurant] = useState<{ id: string; name: string } | null>(null);
  const q = useDebounced(search);

  const deviceFilters = {
    q,
    type: typeFilter,
    restaurantId: restaurant?.id,
    health: health === 'ALL' ? undefined : health,
    locked: lockedOnly ? 'true' : undefined,
    needsAttention: view === 'ATTENTION' && health === 'ALL' && !lockedOnly ? 'true' : undefined,
    sort: view === 'ATTENTION' ? 'lastSeen' : undefined
  };
  const devices = usePagedList<DeviceRow, Extra>('/api/v1/devices', deviceFilters, 25, view !== 'RESTAURANTS');
  const restaurants = usePagedList<RestaurantFleetRow>('/api/v1/devices/by-restaurant', { q }, 25, view === 'RESTAURANTS');
  const active = view === 'RESTAURANTS' ? restaurants : devices;
  const reload = () => {
    devices.reload();
    restaurants.reload();
  };

  const [confirmTarget, setConfirmTarget] = useState<Device | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [lockTarget, setLockTarget] = useState<Device | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockPending, setLockPending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const counts = devices.extra?.healthCounts;
  const hasFilters = !!(search || health !== 'ALL' || lockedOnly || typeFilter !== 'ALL' || restaurant);
  const clearFilters = () => {
    setSearch('');
    setHealth('ALL');
    setLockedOnly(false);
    setTypeFilter('ALL');
    setRestaurant(null);
  };

  async function handleExecuteRevoke() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/devices/${confirmTarget.id}/revoke`);
      showToast(`Device (${confirmTarget.type}) revoked successfully`);
      setConfirmTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Revoke failed');
    } finally {
      setActionPending(false);
    }
  }

  async function handleToggleLock(device: Device) {
    if (device.isLocked) {
      try {
        await api.post(`/api/v1/devices/${device.id}/unlock`);
        showToast('Unlock requested. The terminal releases once it checks in.');
        reload();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Unlock failed');
      }
    } else {
      setLockTarget(device);
      setLockReason('Operational review by Super Admin');
    }
  }

  async function handleExecuteLock() {
    if (!lockTarget) return;
    setLockPending(true);
    try {
      await api.post(`/api/v1/devices/${lockTarget.id}/lock`, { reason: lockReason });
      showToast('Terminal locked');
      setLockTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Lock failed');
    } finally {
      setLockPending(false);
    }
  }

  async function saveName() {
    if (!editing) return;
    try {
      await api.patch(`/api/v1/devices/${editing.id}`, { name: editing.name });
      showToast('Terminal renamed');
      setEditing(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? (err.issues?.map((i) => i.message).join(' ') || err.message) : 'Rename failed');
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages<DeviceRow>('/api/v1/devices', deviceFilters);
      exportRowsToCsv(`jamanvaar_devices_${new Date().toISOString().slice(0, 10)}.csv`, rows, [
        { header: 'Device ID', value: (d) => d.id },
        { header: 'Name', value: (d) => d.name ?? '' },
        { header: 'Type', value: (d) => d.type },
        { header: 'Restaurant', value: (d) => d.restaurant?.name || '' },
        { header: 'Branch', value: (d) => d.branch?.name || '' },
        { header: 'Health', value: (d) => d.health },
        { header: 'Locked', value: (d) => (d.isLocked ? 'YES' : 'NO') },
        { header: 'App version', value: (d) => d.appVersion || '' },
        { header: 'Last seen', value: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : 'Never') }
      ]);
      showToast(truncated ? `Exported the first ${rows.length} matching devices (limit reached)` : `Exported ${rows.length} devices`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const card = (label: string, value: number | undefined, colour: string, onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ textAlign: 'left', background: '#fff', border: `1px solid ${colour}33`, borderRadius: 12, padding: '14px 18px', cursor: onClick ? 'pointer' : 'default' }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: colour, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{value ?? '—'}</div>
    </button>
  );
  const focus = (h: Health) => () => {
    setView('ALL');
    setHealth(h);
    setLockedOnly(false);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Device Fleet / MDM Control Center</h1>
          <p className="page-subtitle">
            Terminal health, remote locking and fleet commands. Online means it checked in within the last 2 minutes; degraded within 15.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <RefreshButton loading={active.loading} onRefresh={reload} />
          <Button variant="ghost" onClick={handleExportCsv} disabled={exporting || view === 'RESTAURANTS' || devices.total === 0}>
            <Download className="w-4 h-4 mr-1" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {card('Online', counts?.online, '#16a34a', focus('online'))}
        {card('Degraded', counts?.degraded, '#d97706', focus('degraded'))}
        {card('Offline', counts?.offline, '#dc2626', focus('offline'))}
        {card('Never seen', counts?.never_seen, '#64748b', focus('never_seen'))}
        {card('Revoked', counts?.revoked, '#64748b', focus('revoked'))}
        {card('MDM locked', devices.extra?.lockedCount, '#c2410c', () => { setView('ALL'); setHealth('ALL'); setLockedOnly(true); })}
      </div>

      {active.error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>{active.error}</span>
          <Button variant="ghost" size="sm" onClick={reload}>Retry</Button>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <FilterTabs<View>
          value={view}
          onChange={(v) => {
            setView(v);
            if (v === 'ATTENTION') { setHealth('ALL'); setLockedOnly(false); }
            if (v === 'RESTAURANTS') setRestaurant(null);
          }}
          options={[
            { id: 'ATTENTION', label: 'Needs attention' },
            { id: 'ALL', label: 'All devices' },
            { id: 'RESTAURANTS', label: 'By restaurant' }
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder={view === 'RESTAURANTS' ? 'Search restaurants…' : 'Search terminal, ID, restaurant or branch…'} width="340px" />
        {view !== 'RESTAURANTS' && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Hardware type"
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
          >
            <option value="ALL">All hardware types</option>
            <option value="POS">Billing POS</option>
            <option value="POS_ADMIN">Restaurant Admin</option>
            <option value="CAPTAIN">Captain Device</option>
            <option value="KDS">Kitchen Display</option>
            <option value="KIOSK">Self-Service Kiosk</option>
            <option value="KIOSK_ADMIN">Kiosk Admin</option>
          </select>
        )}
        {(restaurant || health !== 'ALL' || lockedOnly) && view !== 'RESTAURANTS' && (
          <span style={{ fontSize: 13 }}>
            {restaurant && <>Restaurant: <strong>{restaurant.name}</strong> </>}
            {health !== 'ALL' && <>· {HEALTH_LABEL[health]} </>}
            {lockedOnly && <>· Locked </>}
          </span>
        )}
        {hasFilters && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{active.total} {view === 'RESTAURANTS' ? 'restaurant' : 'device'}{active.total === 1 ? '' : 's'}</span>
      </div>

      <Card style={{ marginTop: 16 }}>
        {active.loading && active.items.length === 0 ? (
          <SkeletonTable rows={5} cols={6} />
        ) : active.items.length === 0 ? (
          <EmptyState
            icon={<Laptop2 className="w-8 h-8 text-slate-400" />}
            title={view === 'ATTENTION' && !hasFilters ? 'Nothing needs attention' : 'No devices found'}
            description={
              view === 'ATTENTION' && !hasFilters
                ? 'Every active terminal has checked in recently and none is reporting a sync problem.'
                : hasFilters ? 'No devices match your current filters.' : 'No devices have been registered on the platform yet.'
            }
          />
        ) : view === 'RESTAURANTS' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                  {['Restaurant', 'Terminals', 'Online', 'Degraded', 'Offline', 'Never seen', 'Revoked', 'Needs attention', ''].map((h) => <th key={h} style={{ padding: '12px 14px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {restaurants.items.map((r) => (
                  <tr key={r.restaurantId} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 14px' }}><Link to={`/restaurants/${r.restaurantId}`} style={{ fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>{r.restaurantName}</Link></td>
                    <td style={{ padding: '12px 14px' }}>{r.total}</td>
                    <td style={{ padding: '12px 14px' }}>{r.online}</td>
                    <td style={{ padding: '12px 14px' }}>{r.degraded}</td>
                    <td style={{ padding: '12px 14px' }}>{r.offline}</td>
                    <td style={{ padding: '12px 14px' }}>{r.neverSeen}</td>
                    <td style={{ padding: '12px 14px' }}>{r.revoked}</td>
                    <td style={{ padding: '12px 14px' }}>{r.needsAttention > 0 ? <Badge tone="warning">{r.needsAttention}</Badge> : 0}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" onClick={() => { setRestaurant({ id: r.restaurantId, name: r.restaurantName }); setView('ALL'); }}>View terminals</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '12px 14px' }}>Terminal</th>
                  <th style={{ padding: '12px 14px' }}>Type</th>
                  <th style={{ padding: '12px 14px' }}>Restaurant &amp; branch</th>
                  <th style={{ padding: '12px 14px' }}>Health</th>
                  <th style={{ padding: '12px 14px' }}>Lock</th>
                  <th style={{ padding: '12px 14px' }}>Last seen</th>
                  <th style={{ padding: '12px 14px' }}>Version</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.items.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '14px' }}>
                      {editing?.id === d.id ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <input
                            autoFocus
                            aria-label="Terminal name"
                            value={editing.name}
                            maxLength={80}
                            onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setEditing(null); }}
                            style={{ height: 30, width: 150, padding: '0 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                          <Button variant="ghost" size="sm" aria-label="Save name" onClick={saveName}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                          <Button variant="ghost" size="sm" aria-label="Cancel" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Link to={`/devices/${d.id}`} style={{ fontWeight: 800, color: '#0f172a', textDecoration: 'none' }}>
                            {d.name || 'Unnamed terminal'}
                          </Link>
                          <button type="button" aria-label="Rename terminal" title="Rename" onClick={() => setEditing({ id: d.id, name: d.name ?? '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <Pencil className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}><code>{d.id.slice(0, 13)}…</code></div>
                    </td>
                    <td style={{ padding: '14px' }}>
                      <Badge tone={d.type === 'POS_ADMIN' || d.type === 'KIOSK_ADMIN' ? 'accent' : 'neutral'}>
                        {d.type === 'POS_ADMIN' ? 'RESTAURANT ADMIN' : d.type === 'KIOSK_ADMIN' ? 'KIOSK ADMIN' : d.type}
                      </Badge>
                    </td>
                    <td style={{ padding: '14px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.restaurant?.name || 'Unknown'}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{d.branch?.name ?? 'No branch assigned'}</div>
                    </td>
                    <td style={{ padding: '14px' }}>
                      <Badge tone={HEALTH_TONE[d.health]}>
                        {d.health === 'online' ? <Wifi className="w-3 h-3 inline mr-1" /> : d.health === 'offline' || d.health === 'degraded' ? <WifiOff className="w-3 h-3 inline mr-1" /> : null}
                        {HEALTH_LABEL[d.health]}
                      </Badge>
                      {d.syncError && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }} title={d.syncError}>Sync problem</div>}
                    </td>
                    <td style={{ padding: '14px' }}>
                      {d.isLocked ? <Badge tone="warning"><Lock className="w-3 h-3 inline mr-1" /> LOCKED</Badge> : <span className="muted">—</span>}
                    </td>
                    <td style={{ padding: '14px', color: '#64748b' }} title={d.lastSeenAt ?? undefined}>
                      {relativeTime(d.lastSeenAt)}
                      {d.lastSeenAt && <div style={{ fontSize: 11, color: '#94a3b8' }}>{absoluteTime(d.lastSeenAt)}</div>}
                    </td>
                    <td style={{ padding: '14px', color: '#64748b' }}>{d.appVersion ?? '—'}</td>
                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Link to={`/devices/${d.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5 mr-1" /> MDM</Button>
                        </Link>
                        <Button variant="ghost" size="sm" aria-label={d.isLocked ? 'Unlock terminal' : 'Lock terminal'} onClick={() => handleToggleLock(d)}>
                          {d.isLocked ? <Unlock className="w-3.5 h-3.5 text-green-600" /> : <Lock className="w-3.5 h-3.5 text-amber-600" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active.total > 0 && (
        <Pager page={active.page} pageSize={active.pageSize} total={active.total} totalPages={active.totalPages} loading={active.loading} onPage={active.setPage} />
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={!!confirmTarget}
          title="Revoke Device Hardware Credential"
          message={`Are you sure you want to permanently revoke ${confirmTarget.type} device (${confirmTarget.id})? It will immediately lose cloud access.`}
          confirmLabel={actionPending ? 'Revoking…' : 'Revoke Device'}
          onConfirm={handleExecuteRevoke}
          onClose={() => setConfirmTarget(null)}
          tone="danger"
        />
      )}

      {lockTarget && (
        <ConfirmModal
          isOpen={!!lockTarget}
          title={`Lock ${lockTarget.name ?? lockTarget.type} terminal`}
          message="The terminal stops working immediately, even if it has not fetched the command, and shows a lock screen until it is unlocked here."
          confirmLabel={lockPending ? 'Locking…' : 'Confirm Lock'}
          onConfirm={handleExecuteLock}
          onClose={() => setLockTarget(null)}
          tone="primary"
        />
      )}
    </div>
  );
}
