import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { ActivationKey } from '../../api/types';
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
import { KeyRound, Plus, Copy, Download } from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';
import { GenerateActivationKeyModal } from './GenerateActivationKeyModal';

type KeyStatusFilter = 'ALL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export function ActivationKeysListPage() {
  const [keys, setKeys] = useState<ActivationKey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<KeyStatusFilter>('ALL');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>('ALL');

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<ActivationKey | null>(null);
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
      .get<ActivationKey[]>('/api/v1/activation-keys')
      .then((data) => {
        setKeys(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load activation keys'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filteredKeys = useMemo(() => {
    if (!keys) return [];
    return keys.filter((k) => {
      const isExpired = new Date(k.expiresAt).getTime() < Date.now();
      if (statusFilter === 'ACTIVE' && (k.status !== 'ACTIVE' || isExpired)) return false;
      if (statusFilter === 'REVOKED' && k.status !== 'REVOKED') return false;
      if (statusFilter === 'EXPIRED' && !isExpired) return false;

      if (deviceTypeFilter !== 'ALL' && k.allowedDeviceType !== deviceTypeFilter) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCode = k.code.toLowerCase().includes(q);
        const matchRest = (k.restaurant?.name || '').toLowerCase().includes(q);
        const matchType = k.allowedDeviceType.toLowerCase().includes(q);
        if (!matchCode && !matchRest && !matchType) return false;
      }
      return true;
    });
  }, [keys, statusFilter, deviceTypeFilter, search]);

  async function handleExecuteRevoke() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/activation-keys/${confirmTarget.id}/revoke`);
      showToast(`Activation key "${confirmTarget.code}" revoked`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Revoke failed');
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = useMemo(() => {
    return keys?.filter((k) => k.status === 'ACTIVE' && new Date(k.expiresAt).getTime() > Date.now()).length || 0;
  }, [keys]);

  const revokedCount = useMemo(() => keys?.filter((k) => k.status === 'REVOKED').length || 0, [keys]);

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
      prev.size === filteredKeys.length ? new Set() : new Set(filteredKeys.map((k) => k.id))
    );
  }

  async function handleBulkRevoke() {
    // Only currently-active, non-expired keys can actually be revoked —
    // silently skip the rest rather than erroring on them.
    const ids = Array.from(selectedIds).filter((id) => {
      const k = keys?.find((key) => key.id === id);
      return k && k.status === 'ACTIVE' && new Date(k.expiresAt).getTime() > Date.now();
    });
    if (ids.length === 0) {
      showToast('None of the selected keys are revocable (already revoked or expired)');
      return;
    }
    if (!window.confirm(`Revoke ${ids.length} activation key(s)? This permanently invalidates them.`)) return;
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.patch(`/api/v1/activation-keys/${id}/revoke`)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} activation key(s) revoked`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_activation_keys_${new Date().toISOString().slice(0, 10)}.csv`, filteredKeys, [
      { header: 'Code', value: (k) => k.code },
      { header: 'Restaurant', value: (k) => k.restaurant?.name || '' },
      { header: 'Allowed Device Type', value: (k) => k.allowedDeviceType },
      { header: 'Status', value: (k) => k.status },
      { header: 'Expires', value: (k) => new Date(k.expiresAt).toISOString().slice(0, 10) }
    ]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activation Keys</h1>
          <p className="page-subtitle">
            One-time hardware provisioning tokens for POS, Captain, KDS, and Kiosk terminal authentication.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={handleExportCsv} disabled={!keys || keys.length === 0}>
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </Button>
          <Button variant="accent" onClick={() => setShowGenerate(true)}>
            <Plus className="w-4 h-4" />
            <span>Generate Key</span>
          </Button>
        </div>
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
          placeholder="Search by code, restaurant, or device type…"
          width="340px"
        />

        <FilterTabs<KeyStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Keys', count: keys?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'REVOKED', label: 'Revoked', count: revokedCount }
          ]}
        />

        <select
          value={deviceTypeFilter}
          onChange={(e) => setDeviceTypeFilter(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All Device Types</option>
          <option value="POS">POS Terminal</option>
          <option value="CAPTAIN">Captain App</option>
          <option value="KDS">Kitchen Display (KDS)</option>
          <option value="KIOSK">Self-Service Kiosk</option>
        </select>

        {(search || statusFilter !== 'ALL' || deviceTypeFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setDeviceTypeFilter('ALL');
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredKeys.length} of {keys?.length ?? 0} keys
        </span>
      </div>

      {loading && !keys && <SkeletonTable rows={5} cols={6} />}

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={handleBulkRevoke}>
          Revoke Selected
        </Button>
      </BulkActionsBar>

      {keys && (
        <Card>
          {filteredKeys.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="w-6 h-6 text-slate-400" />}
              title={keys.length === 0 ? 'No activation keys generated' : 'No matching keys'}
              description={
                keys.length === 0
                  ? 'Generate a key for a restaurant tenant to hand off for terminal device setup.'
                  : 'Try modifying your search or switching device type filters.'
              }
              action={
                keys.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setDeviceTypeFilter('ALL'); }}>
                    Reset Filters
                  </Button>
                ) : (
                  <Button variant="accent" onClick={() => setShowGenerate(true)}>
                    Generate Key
                  </Button>
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
                        checked={filteredKeys.length > 0 && selectedIds.size === filteredKeys.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Activation Code</th>
                    <th>Restaurant</th>
                    <th>Allowed Terminal</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((k) => {
                    const isExpired = new Date(k.expiresAt).getTime() < Date.now();
                    const isRevoked = k.status === 'REVOKED';
                    return (
                      <tr key={k.id}>
                        <td>
                          <input type="checkbox" checked={selectedIds.has(k.id)} onChange={() => toggleSelected(k.id)} />
                        </td>
                        <td>
                          <span className="mono" style={{ fontWeight: 800, color: '#0B253A', fontSize: 14, letterSpacing: '0.02em' }}>
                            {k.code}
                          </span>
                        </td>
                        <td>
                          {k.restaurant ? (
                            <Link to={`/restaurants/${k.restaurant.id}`} className="table-link" style={{ fontWeight: 600 }}>
                              {k.restaurant.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <Badge tone="accent">{k.allowedDeviceType}</Badge>
                        </td>
                        <td>
                          <Badge
                            tone={isRevoked ? 'error' : isExpired ? 'neutral' : statusTone(k.status)}
                            pulse={k.status === 'ACTIVE' && !isExpired}
                          >
                            {isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : k.status}
                          </Badge>
                        </td>
                        <td>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Copy className="w-3.5 h-3.5" />}
                              onClick={() => {
                                navigator.clipboard.writeText(k.code);
                                showToast(`Copied code "${k.code}" to clipboard`);
                              }}
                              title="Copy code"
                            >
                              Copy
                            </Button>
                            {k.status === 'ACTIVE' && !isExpired && (
                              <Button size="sm" variant="danger" onClick={() => setConfirmTarget(k)}>
                                Revoke
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
      )}

      {showGenerate && (
        <GenerateActivationKeyModal
          onClose={() => setShowGenerate(false)}
          onSaved={() => {
            setShowGenerate(false);
            showToast('Activation key generated successfully');
            load();
          }}
        />
      )}

      {/* Confirm Dialog */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title="Revoke Activation Key?"
          message={`Revoking activation key "${confirmTarget.code}" will permanently invalidate it. It can never be used to activate any hardware terminal.`}
          tone="danger"
          isPending={actionPending}
          onConfirm={handleExecuteRevoke}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
