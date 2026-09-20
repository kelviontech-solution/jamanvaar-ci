import { CopyButton } from '../../components/CopyButton';
import { useState } from 'react';
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
  SkeletonTable
} from '../../components/ui';
import { KeyRound, Plus, Download } from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import { fetchAllPages } from '../../lib/fetchAll';
import { useDebounced, usePagedList } from '../../hooks/usePagedList';
import { Pager } from '../../components/Pager';
import '../../components/shared.css';
import { GenerateActivationKeyModal } from './GenerateActivationKeyModal';

type Lifecycle = 'ALL' | 'AVAILABLE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
type View = 'RESTAURANTS' | 'KEYS';

interface RestaurantKeyRow {
  restaurantId: string;
  restaurantName: string;
  issued: number;
  available: number;
  redeemed: number;
  revoked: number;
  expired: number;
  expiringSoon: number;
}

const LIFECYCLE_TONE = { AVAILABLE: 'success', REDEEMED: 'accent', REVOKED: 'error', EXPIRED: 'neutral' } as const;

/**
 * Keys are looked at per restaurant first (issued / available / redeemed / expiring), then drilled into.
 * Search, lifecycle, app type and expiry filters, counts and paging all come from the server, so this
 * stays fast with thousands of keys (BUG-060). A key's code is shown only while it can still be used.
 */
export function ActivationKeysListPage() {
  const [view, setView] = useState<View>('RESTAURANTS');
  const [toast, setToast] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState<Lifecycle>('ALL');
  const [deviceType, setDeviceType] = useState<string>('ALL');
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [restaurant, setRestaurant] = useState<{ id: string; name: string } | null>(null);
  const q = useDebounced(search);

  const keysFilters = { q, lifecycle, allowedDeviceType: deviceType, restaurantId: restaurant?.id, expiringInDays: expiringSoon ? 7 : undefined };
  const keys = usePagedList<ActivationKey, { lifecycleCounts: Record<Exclude<Lifecycle, 'ALL'>, number> }>('/api/v1/activation-keys', keysFilters, 25, view === 'KEYS');
  const restaurants = usePagedList<RestaurantKeyRow>('/api/v1/activation-keys/by-restaurant', { q }, 25, view === 'RESTAURANTS');

  const [confirmTarget, setConfirmTarget] = useState<ActivationKey | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const reload = () => {
    keys.reload();
    restaurants.reload();
  };

  const counts = keys.extra?.lifecycleCounts;
  const hasFilters = !!(search || lifecycle !== 'ALL' || deviceType !== 'ALL' || expiringSoon || restaurant);
  const clearFilters = () => {
    setSearch('');
    setLifecycle('ALL');
    setDeviceType('ALL');
    setExpiringSoon(false);
    setRestaurant(null);
  };
  const codeText = (k: ActivationKey) => k.code ?? `•••• ${k.codeLast4 ?? ''}`;
  const revocable = (k: ActivationKey) => k.lifecycle === 'AVAILABLE' || k.lifecycle === 'REDEEMED';

  async function handleExecuteRevoke() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/activation-keys/${confirmTarget.id}/revoke`);
      showToast(`Activation key ${codeText(confirmTarget)} revoked`);
      setConfirmTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Revoke failed');
    } finally {
      setActionPending(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === keys.items.length ? new Set() : new Set(keys.items.map((k) => k.id))));
  }

  async function handleBulkRevoke() {
    const ids = Array.from(selectedIds).filter((id) => {
      const k = keys.items.find((key) => key.id === id);
      return k && revocable(k);
    });
    if (ids.length === 0) {
      showToast('None of the selected keys can be revoked (already revoked or expired)');
      return;
    }
    const redeemed = keys.items.filter((k) => ids.includes(k.id) && k.lifecycle === 'REDEEMED').length;
    const extra = redeemed ? ` ${redeemed} of them are already in use: revoking those also revokes their terminals.` : '';
    if (!window.confirm(`Revoke ${ids.length} activation key(s)?${extra} This cannot be undone.`)) return;
    setBulkPending(true);
    try {
      // One request for the whole selection.
      const res = await api.post<{ revoked: number; skipped: number }>('/api/v1/activation-keys/bulk-revoke', { ids });
      showToast(res.skipped ? `${res.revoked} revoked, ${res.skipped} skipped` : `${res.revoked} activation key(s) revoked`);
      setSelectedIds(new Set());
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Bulk revoke failed');
    } finally {
      setBulkPending(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages<ActivationKey>('/api/v1/activation-keys', keysFilters);
      exportRowsToCsv(`jamanvaar_activation_keys_${new Date().toISOString().slice(0, 10)}.csv`, rows, [
        { header: 'Code (usable keys only)', value: (k) => k.code ?? '' },
        { header: 'Last 4', value: (k) => k.codeLast4 ?? '' },
        { header: 'Restaurant', value: (k) => k.restaurant?.name || '' },
        { header: 'Terminal name', value: (k) => k.label ?? '' },
        { header: 'Branch', value: (k) => k.branch?.name ?? '' },
        { header: 'Allowed terminal', value: (k) => k.allowedDeviceType },
        { header: 'State', value: (k) => k.lifecycle ?? k.status },
        { header: 'Expires', value: (k) => new Date(k.expiresAt).toISOString().slice(0, 10) }
      ]);
      showToast(truncated ? `Exported the first ${rows.length} matching keys (limit reached)` : `Exported ${rows.length} keys`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const openRestaurant = (r: RestaurantKeyRow, life: Lifecycle = 'ALL') => {
    setRestaurant({ id: r.restaurantId, name: r.restaurantName });
    setLifecycle(life);
    setSelectedIds(new Set());
    setView('KEYS');
  };

  const active = view === 'KEYS' ? keys : restaurants;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activation Keys</h1>
          <p className="page-subtitle">
            One-time provisioning codes for POS, Captain, KDS, Kiosk and admin terminals. A code is shown only while it can still be used.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={handleExportCsv} disabled={exporting || view !== 'KEYS' || keys.total === 0}>
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </Button>
          <Button variant="accent" onClick={() => setShowGenerate(true)}>
            <Plus className="w-4 h-4" />
            <span>Generate Key</span>
          </Button>
        </div>
      </div>

      {active.error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{active.error}</span>
          <Button variant="ghost" size="sm" onClick={reload}>Retry</Button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <FilterTabs<View>
          value={view}
          onChange={(v) => {
            setView(v);
            setSelectedIds(new Set());
            if (v === 'RESTAURANTS') setRestaurant(null);
          }}
          options={[
            { id: 'RESTAURANTS', label: 'By restaurant' },
            { id: 'KEYS', label: 'All keys' }
          ]}
        />
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={view === 'KEYS' ? 'Search code, terminal name or restaurant…' : 'Search restaurants…'}
          width="320px"
        />
        {view === 'KEYS' && (
          <>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              aria-label="Terminal type"
              style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
            >
              <option value="ALL">All terminal types</option>
              <option value="POS">POS Terminal</option>
              <option value="POS_ADMIN">Restaurant Admin</option>
              <option value="CAPTAIN">Captain App</option>
              <option value="KDS">Kitchen Display (KDS)</option>
              <option value="KIOSK">Self-Service Kiosk</option>
              <option value="KIOSK_ADMIN">Kiosk Admin</option>
              <option value="ANY">Any terminal</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={expiringSoon} onChange={(e) => setExpiringSoon(e.target.checked)} />
              Expiring within 7 days
            </label>
          </>
        )}
        {hasFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        )}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {active.total} {view === 'KEYS' ? 'key' : 'restaurant'}{active.total === 1 ? '' : 's'}
        </span>
      </div>

      {view === 'KEYS' && (
        <div className="toolbar" style={{ marginTop: 8 }}>
          {restaurant && (
            <span style={{ fontSize: 13 }}>
              Restaurant: <strong>{restaurant.name}</strong>
            </span>
          )}
          <FilterTabs<Lifecycle>
            value={lifecycle}
            onChange={setLifecycle}
            options={[
              { id: 'ALL', label: 'All', count: counts ? counts.AVAILABLE + counts.REDEEMED + counts.REVOKED + counts.EXPIRED : undefined },
              { id: 'AVAILABLE', label: 'Available', count: counts?.AVAILABLE },
              { id: 'REDEEMED', label: 'Redeemed', count: counts?.REDEEMED },
              { id: 'REVOKED', label: 'Revoked', count: counts?.REVOKED },
              { id: 'EXPIRED', label: 'Expired', count: counts?.EXPIRED }
            ]}
          />
        </div>
      )}

      {active.loading && active.items.length === 0 && <SkeletonTable rows={5} cols={6} />}

      {view === 'KEYS' && (
        <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <Button size="sm" variant="danger" disabled={bulkPending} onClick={handleBulkRevoke}>
            Revoke Selected
          </Button>
        </BulkActionsBar>
      )}

      {view === 'RESTAURANTS' && !(restaurants.loading && restaurants.items.length === 0) && (
        <Card>
          {restaurants.items.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="w-6 h-6 text-slate-400" />}
              title={search ? 'No matching restaurants' : 'No activation keys generated'}
              description={search ? 'Try a different search.' : 'Generate a key for a restaurant to hand off for terminal setup.'}
              action={search ? <Button variant="ghost" onClick={clearFilters}>Clear search</Button> : <Button variant="accent" onClick={() => setShowGenerate(true)}>Generate Key</Button>}
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Issued</th>
                    <th>Available</th>
                    <th>Redeemed</th>
                    <th>Revoked</th>
                    <th>Expired</th>
                    <th>Expiring in 7 days</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {restaurants.items.map((r) => (
                    <tr key={r.restaurantId}>
                      <td><Link to={`/restaurants/${r.restaurantId}`} className="table-link" style={{ fontWeight: 600 }}>{r.restaurantName}</Link></td>
                      <td>{r.issued}</td>
                      <td>{r.available}</td>
                      <td>{r.redeemed}</td>
                      <td>{r.revoked}</td>
                      <td>{r.expired}</td>
                      <td>{r.expiringSoon > 0 ? <Badge tone="warning">{r.expiringSoon}</Badge> : 0}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button size="sm" variant="ghost" onClick={() => openRestaurant(r)}>View keys</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {view === 'KEYS' && !(keys.loading && keys.items.length === 0) && (
        <Card>
          {keys.items.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="w-6 h-6 text-slate-400" />}
              title={hasFilters ? 'No matching keys' : 'No activation keys generated'}
              description={hasFilters ? 'Try modifying your search or filters.' : 'Generate a key for a restaurant to hand off for terminal setup.'}
              action={hasFilters ? <Button variant="ghost" onClick={clearFilters}>Reset filters</Button> : <Button variant="accent" onClick={() => setShowGenerate(true)}>Generate Key</Button>}
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" aria-label="Select all keys on this page" checked={keys.items.length > 0 && selectedIds.size === keys.items.length} onChange={toggleSelectAll} />
                    </th>
                    <th>Activation code</th>
                    <th>Restaurant</th>
                    <th>Terminal</th>
                    <th>State</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.items.map((k) => (
                    <tr key={k.id}>
                      <td><input type="checkbox" aria-label={`Select key ${codeText(k)}`} checked={selectedIds.has(k.id)} onChange={() => toggleSelected(k.id)} /></td>
                      <td>
                        <span className="mono" style={{ fontWeight: 800, color: k.code ? '#0B253A' : '#94a3b8', fontSize: 14, letterSpacing: '0.02em' }}>{codeText(k)}</span>
                        {k.label && <div className="muted" style={{ fontSize: 12 }}>{k.label}</div>}
                      </td>
                      <td>
                        {k.restaurant ? (
                          <Link to={`/restaurants/${k.restaurant.id}`} className="table-link" style={{ fontWeight: 600 }}>{k.restaurant.name}</Link>
                        ) : '—'}
                        {k.branch && <div className="muted" style={{ fontSize: 12 }}>{k.branch.name}</div>}
                      </td>
                      <td><Badge tone="accent">{k.allowedDeviceType}</Badge></td>
                      <td>
                        <Badge tone={LIFECYCLE_TONE[k.lifecycle ?? 'AVAILABLE']} pulse={k.lifecycle === 'AVAILABLE'}>{k.lifecycle ?? k.status}</Badge>
                      </td>
                      <td>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {k.code && (
                            <CopyButton
                              text={k.code}
                              title="Copy code"
                              onResult={(ok) => showToast(ok ? `Copied code "${k.code}" to clipboard` : 'Could not copy automatically. Select the code and press Ctrl+C.')}
                            />
                          )}
                          {revocable(k) && (
                            <Button size="sm" variant="danger" onClick={() => setConfirmTarget(k)}>Revoke</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {active.total > 0 && (
        <Pager page={active.page} pageSize={active.pageSize} total={active.total} totalPages={active.totalPages} loading={active.loading} onPage={active.setPage} />
      )}

      {showGenerate && (
        <GenerateActivationKeyModal
          onClose={() => setShowGenerate(false)}
          onSaved={() => {
            setShowGenerate(false);
            showToast('Activation key generated successfully');
            reload();
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title="Revoke Activation Key?"
          message={
            confirmTarget.lifecycle === 'REDEEMED'
              ? `Key ${codeText(confirmTarget)} is already in use. Revoking it also revokes the terminal that used it, and that terminal stops working.`
              : `Revoking activation key ${codeText(confirmTarget)} permanently invalidates it. It can never be used to activate a terminal.`
          }
          tone="danger"
          isPending={actionPending}
          onConfirm={handleExecuteRevoke}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
