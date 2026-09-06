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
  SkeletonTable,
  statusTone
} from '../../components/ui';
import { Laptop2, Download } from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';

type DeviceStatusFilter = 'ALL' | 'ACTIVE' | 'REVOKED';

export function DevicesListPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<Device | null>(null);
  const [actionPending, setActionPending] = useState(false);

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

  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    return devices.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
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

  const activeCount = useMemo(() => devices?.filter((d) => d.status === 'ACTIVE').length || 0, [devices]);
  const revokedCount = useMemo(() => devices?.filter((d) => d.status === 'REVOKED').length || 0, [devices]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === filteredDevices.length ? new Set() : new Set(filteredDevices.map((d) => d.id))
    );
  }

  async function handleBulkRevoke() {
    const ids = Array.from(selectedIds);
    if (!window.confirm(`Revoke ${ids.length} device(s)? They will be immediately unauthenticated and disconnected from cloud sync.`)) {
      return;
    }
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.patch(`/api/v1/devices/${id}/revoke`)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} device(s) revoked`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_devices_${new Date().toISOString().slice(0, 10)}.csv`, filteredDevices, [
      { header: 'Device ID', value: (d) => d.id },
      { header: 'Type', value: (d) => d.type },
      { header: 'Restaurant', value: (d) => d.restaurant?.name || '' },
      { header: 'Branch', value: (d) => d.branch?.name || '' },
      { header: 'Status', value: (d) => d.status },
      { header: 'App Version', value: (d) => d.appVersion || '' },
      { header: 'Last Seen', value: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : 'Never') }
    ]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Registered Devices</h1>
          <p className="page-subtitle">
            POS, Captain, KDS, and Kiosk terminals registered in restaurant fleets — authenticated through verified cryptographic keypairs.
          </p>
        </div>
        <Button variant="ghost" onClick={handleExportCsv} disabled={!devices || devices.length === 0}>
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </Button>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by device ID, restaurant, branch, or type…"
          width="340px"
        />

        <FilterTabs<DeviceStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Terminals', count: devices?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'REVOKED', label: 'Revoked', count: revokedCount }
          ]}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All Hardware Types</option>
          <option value="POS">POS Terminal</option>
          <option value="CAPTAIN">Captain Device</option>
          <option value="KDS">Kitchen Display</option>
          <option value="KIOSK">Kiosk</option>
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

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredDevices.length} of {devices?.length ?? 0} terminals
        </span>
      </div>

      {loading && !devices && <SkeletonTable rows={5} cols={7} />}

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={handleBulkRevoke}>
          Revoke Selected
        </Button>
      </BulkActionsBar>

      {devices && (
        <Card>
          {filteredDevices.length === 0 ? (
            <EmptyState
              icon={<Laptop2 className="w-6 h-6 text-slate-400" />}
              title={devices.length === 0 ? 'No terminals registered' : 'No matching terminals'}
              description={
                devices.length === 0
                  ? 'Devices appear here once activated with an activation key on-site.'
                  : 'Try changing your search query or hardware type filters.'
              }
              action={
                devices.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setTypeFilter('ALL'); }}>
                    Reset Filters
                  </Button>
                ) : (
                  <Link to="/activation-keys" className="btn btn-accent">
                    Generate Activation Key →
                  </Link>
                )
              }
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filteredDevices.length > 0 && selectedIds.size === filteredDevices.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Terminal Type</th>
                    <th>Restaurant</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>App Version</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelected(d.id)} />
                      </td>
                      <td>
                        <span className="badge badge-accent" style={{ fontWeight: 800 }}>{d.type}</span>
                        <div className="muted mono" style={{ fontSize: 10, marginTop: 2 }}>{d.id.slice(0, 10)}…</div>
                      </td>
                      <td>
                        {d.restaurant ? (
                          <Link to={`/restaurants/${d.restaurant.id}`} className="table-link" style={{ fontWeight: 600 }}>
                            {d.restaurant.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{d.branch?.name ?? '—'}</td>
                      <td>
                        <Badge tone={statusTone(d.status)} pulse={d.status === 'ACTIVE'}>
                          {d.status}
                        </Badge>
                      </td>
                      <td className="mono">{d.appVersion ?? 'v2.4.0'}</td>
                      <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('en-IN') : 'Never'}</td>
                      <td>
                        {d.status !== 'REVOKED' && (
                          <Button size="sm" variant="danger" onClick={() => setConfirmTarget(d)}>
                            Revoke Device
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Confirm Dialog */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title="Revoke Device Access?"
          message={`Are you sure you want to revoke terminal "${confirmTarget.type}" (${confirmTarget.id.slice(0, 8)})? It will be immediately unauthenticated and disconnected from cloud sync.`}
          tone="danger"
          isPending={actionPending}
          onConfirm={handleExecuteRevoke}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
