import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Device } from '../../api/types';
import {
  Badge,
  BulkActionsBar,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  FilterTabs,
  SearchBar,
  SkeletonTable
} from '../../components/ui';
import {
  Laptop2,
  Download,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  RefreshCw,
  Eye,
  ShieldAlert,
  SlidersHorizontal
} from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';

type DeviceStatusFilter = 'ALL' | 'ACTIVE' | 'REVOKED' | 'LOCKED';

export function DevicesListPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Confirm Revoke Modal state
  const [confirmTarget, setConfirmTarget] = useState<Device | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Quick Lock modal state
  const [lockTarget, setLockTarget] = useState<Device | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockPending, setLockPending] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Device[]>('/api/v1/devices')
      .then((data) => {
        setDevices(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load devices'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const isOnline = (d: Device) =>
    d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 15 * 60 * 1000;

  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    return devices.filter((d) => {
      if (statusFilter === 'ACTIVE' && d.status !== 'ACTIVE') return false;
      if (statusFilter === 'REVOKED' && d.status !== 'REVOKED') return false;
      if (statusFilter === 'LOCKED' && !d.isLocked) return false;

      if (typeFilter !== 'ALL' && d.type !== typeFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchId = d.id.toLowerCase().includes(q);
        const matchRest = (d.restaurant?.name || '').toLowerCase().includes(q);
        const matchBranch = (d.branch?.name || '').toLowerCase().includes(q);
        const matchType = d.type.toLowerCase().includes(q);
        if (!matchId && !matchRest && !matchBranch && !matchType) return false;
      }
      return true;
    });
  }, [devices, statusFilter, typeFilter, search]);

  async function handleExecuteRevoke() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/devices/${confirmTarget.id}/revoke`);
      showToast(`Device (${confirmTarget.type}) revoked successfully`);
      setConfirmTarget(null);
      load();
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
        showToast(`Terminal unlocked successfully`);
        load();
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
      showToast(`Terminal locked via MDM`);
      setLockTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Lock failed');
    } finally {
      setLockPending(false);
    }
  }

  const activeCount = useMemo(() => devices?.filter((d) => d.status === 'ACTIVE').length || 0, [devices]);
  const revokedCount = useMemo(() => devices?.filter((d) => d.status === 'REVOKED').length || 0, [devices]);
  const lockedCount = useMemo(() => devices?.filter((d) => d.isLocked).length || 0, [devices]);
  const onlineCount = useMemo(() => devices?.filter((d) => isOnline(d)).length || 0, [devices]);
  const offlineCount = useMemo(() => Math.max(0, (devices?.length || 0) - onlineCount), [devices, onlineCount]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_devices_${new Date().toISOString().slice(0, 10)}.csv`, filteredDevices, [
      { header: 'Device ID', value: (d) => d.id },
      { header: 'Type', value: (d) => d.type },
      { header: 'Restaurant', value: (d) => d.restaurant?.name || '' },
      { header: 'Branch', value: (d) => d.branch?.name || '' },
      { header: 'Status', value: (d) => d.status },
      { header: 'Locked', value: (d) => (d.isLocked ? 'YES' : 'NO') },
      { header: 'App Version', value: (d) => d.appVersion || '' },
      { header: 'Last Seen', value: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : 'Never') }
    ]);
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Device Fleet / MDM Control Center</h1>
          <p className="page-subtitle">
            Centralized terminal management, remote locking, live sync heartbeats, and over-the-air fleet commands.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="ghost" onClick={handleExportCsv} disabled={!devices || devices.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      {/* Fleet KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Registered</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{devices?.length ?? '—'}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>● Online Now</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#15803d', marginTop: 4 }}>{onlineCount}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Offline Terminals</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#475569', marginTop: 4 }}>{offlineCount}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>MDM Locked</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#c2410c', marginTop: 4 }}>{lockedCount}</div>
        </div>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by terminal ID, name, restaurant, or branch…"
          width="340px"
        />

        <FilterTabs<DeviceStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Devices', count: devices?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'LOCKED', label: 'Locked', count: lockedCount },
            { id: 'REVOKED', label: 'Revoked', count: revokedCount }
          ]}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All Hardware Types</option>
          <option value="POS">Billing POS</option>
          <option value="POS_ADMIN">Admin Console (POS_ADMIN)</option>
          <option value="CAPTAIN">Captain Device</option>
          <option value="KDS">Kitchen Display</option>
          <option value="KIOSK">Self-Service Kiosk</option>
        </select>

        {(search || statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setTypeFilter('ALL');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table Card */}
      <Card style={{ marginTop: 16 }}>
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : filteredDevices.length === 0 ? (
          <EmptyState
            icon={<Laptop2 className="w-8 h-8 text-slate-400" />}
            title="No devices found"
            description={search || statusFilter !== 'ALL' || typeFilter !== 'ALL' ? 'No devices match your current filters.' : 'No devices have been registered on the platform yet.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '12px 14px' }}>Hardware / Name</th>
                  <th style={{ padding: '12px 14px' }}>Type</th>
                  <th style={{ padding: '12px 14px' }}>Restaurant & Branch</th>
                  <th style={{ padding: '12px 14px' }}>Connectivity</th>
                  <th style={{ padding: '12px 14px' }}>Security & Lock</th>
                  <th style={{ padding: '12px 14px' }}>Last Seen</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((d) => {
                  const online = isOnline(d);
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '14px' }}>
                        <Link to={`/devices/${d.id}`} style={{ fontWeight: 800, color: '#0f172a', textDecoration: 'none' }}>
                          {d.name || `${d.type} Terminal`}
                        </Link>
                        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          <code>{d.id.slice(0, 13)}…</code>
                        </div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <Badge tone={d.type === 'POS_ADMIN' ? 'accent' : 'neutral'}>
                          {d.type === 'POS_ADMIN' ? 'RESTAURANT ADMIN' : d.type}
                        </Badge>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.restaurant?.name || 'Unknown'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>{d.branch?.name || 'Main Branch'}</div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <Badge tone={online ? 'success' : 'neutral'}>
                          {online ? (
                            <><Wifi className="w-3 h-3 inline mr-1" /> Online</>
                          ) : (
                            <><WifiOff className="w-3 h-3 inline mr-1" /> Offline</>
                          )}
                        </Badge>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {d.isLocked ? (
                          <Badge tone="warning">
                            <Lock className="w-3 h-3 inline mr-1" /> LOCKED
                          </Badge>
                        ) : d.status === 'ACTIVE' ? (
                          <Badge tone="success">ACTIVE</Badge>
                        ) : (
                          <Badge tone="error">REVOKED</Badge>
                        )}
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : 'Never'}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Link to={`/devices/${d.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-3.5 h-3.5 mr-1" /> MDM
                            </Button>
                          </Link>
                          {d.isLocked ? (
                            <Button variant="ghost" size="sm" onClick={() => handleToggleLock(d)}>
                              <Unlock className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleToggleLock(d)}>
                              <Lock className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Revoke Confirmation Modal */}
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

      {/* Quick Lock Modal */}
      {lockTarget && (
        <ConfirmModal
          isOpen={!!lockTarget}
          title={`Lock ${lockTarget.type} Terminal`}
          message={`Locking this terminal stops operational access and blocks new orders until unlocked.`}
          confirmLabel={lockPending ? 'Locking…' : 'Confirm Lock'}
          onConfirm={handleExecuteLock}
          onClose={() => setLockTarget(null)}
          tone="primary"
        />
      )}
    </div>
  );
}
