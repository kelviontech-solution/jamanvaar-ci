import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { SubscriptionListItem } from '../../api/types';
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
import { Plus, Repeat, CalendarClock, ArrowUpRight } from 'lucide-react';
import '../../components/shared.css';
import { AssignSubscriptionModal } from './AssignSubscriptionModal';
import { RenewSubscriptionModal } from './RenewSubscriptionModal';
import { ChangePlanModal } from './ChangePlanModal';
import { useAuth } from '../../auth/AuthContext';

type SubStatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'EXPIRED';

export function SubscriptionsListPage() {
  // B2-052 item 2: Finance legitimately has subscriptions write; Read-Only/Support/Ops don't.
  const { can } = useAuth();
  const canWrite = can('subscriptions', 'write');
  const [subs, setSubs] = useState<SubscriptionListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modals state
  const [showAssign, setShowAssign] = useState(false);
  const [renewTarget, setRenewTarget] = useState<SubscriptionListItem | null>(null);
  const [changePlanTarget, setChangePlanTarget] = useState<SubscriptionListItem | null>(null);

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    sub: SubscriptionListItem;
    action: 'suspend' | 'reactivate';
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubStatusFilter>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'CORE' | 'PRO' | 'ENTERPRISE'>('ALL');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<SubscriptionListItem[]>('/api/v1/subscriptions')
      .then((data) => {
        setSubs(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load subscriptions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filteredSubs = useMemo(() => {
    if (!subs) return [];
    return subs.filter((s) => {
      // Status filter
      if (statusFilter !== 'ALL') {
        if (s.status !== statusFilter) return false;
      }
      // Tier filter
      if (tierFilter !== 'ALL') {
        if (s.plan.tier !== tierFilter) return false;
      }
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchRest = s.restaurant.name.toLowerCase().includes(q);
        const matchPlan = s.plan.name.toLowerCase().includes(q);
        if (!matchRest && !matchPlan) return false;
      }
      return true;
    });
  }, [subs, statusFilter, tierFilter, search]);

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
      prev.size === filteredSubs.length ? new Set() : new Set(filteredSubs.map((s) => s.id))
    );
  }

  async function handleBulkAction(actionPath: 'suspend' | 'reactivate') {
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/api/v1/subscriptions/${id}/${actionPath}`))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} subscription(s) ${actionPath === 'reactivate' ? 'reactivated' : 'suspended'}`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  async function handleExecuteConfirm() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/subscriptions/${confirmTarget.sub.id}/${confirmTarget.action}`);
      showToast(`Subscription ${confirmTarget.action === 'reactivate' ? 'reactivated' : 'suspended'}`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = useMemo(() => subs?.filter((s) => s.status === 'ACTIVE').length || 0, [subs]);
  const suspendedCount = useMemo(() => subs?.filter((s) => s.status === 'SUSPENDED').length || 0, [subs]);
  const trialCount = useMemo(() => subs?.filter((s) => s.status === 'TRIAL').length || 0, [subs]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <p className="page-subtitle">
            Every restaurant tenant's recurring SaaS plan — assigned, renewed, and upgraded directly from the platform control center.
          </p>
        </div>
        <Button variant="accent" onClick={() => setShowAssign(true)} disabled={!canWrite}>
          <Plus className="w-4 h-4" />
          <span>Assign Subscription</span>
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
          placeholder="Search by restaurant or plan…"
          width="320px"
        />

        <FilterTabs<SubStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: subs?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'TRIAL', label: 'Trial', count: trialCount },
            { id: 'SUSPENDED', label: 'Suspended', count: suspendedCount }
          ]}
        />

        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as 'ALL' | 'CORE' | 'PRO' | 'ENTERPRISE')}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: 'var(--jv-surface-card)' }}
        >
          <option value="ALL">All Tiers</option>
          <option value="CORE">CORE (₹5,000)</option>
          <option value="PRO">PRO (₹7,000)</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
        </select>

        {(search || statusFilter !== 'ALL' || tierFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setTierFilter('ALL');
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredSubs.length} of {subs?.length ?? 0} subscriptions
        </span>
      </div>

      {loading && !subs && <SkeletonTable rows={6} cols={6} />}

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="danger" disabled={bulkPending || !canWrite} onClick={() => handleBulkAction('suspend')}>
          Suspend Selected
        </Button>
        <Button size="sm" variant="primary" disabled={bulkPending || !canWrite} onClick={() => handleBulkAction('reactivate')}>
          Reactivate Selected
        </Button>
      </BulkActionsBar>

      {subs && (
        <Card>
          {filteredSubs.length === 0 ? (
            <EmptyState
              icon={<Repeat className="w-6 h-6 text-slate-400" />}
              title={subs.length === 0 ? 'No subscriptions active' : 'No matching subscriptions'}
              description={
                subs.length === 0
                  ? 'Assign a plan to a restaurant tenant to unlock POS, tables, and captain features.'
                  : 'Try modifying your search or switching status tabs to locate records.'
              }
              action={
                subs.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setTierFilter('ALL'); }}>
                    Reset Filters
                  </Button>
                ) : (
                  <Button variant="accent" onClick={() => setShowAssign(true)} disabled={!canWrite}>
                    Assign First Subscription
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
                        checked={filteredSubs.length > 0 && selectedIds.size === filteredSubs.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Restaurant</th>
                    <th>Plan &amp; Tier</th>
                    <th>Fee (₹)</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>Renewal Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.map((s) => {
                    const isPremiumTier = s.plan.tier === 'PRO' || s.plan.tier === 'ENTERPRISE';
                    const isExpired = new Date(s.expiresAt).getTime() < Date.now();
                    return (
                      <tr key={s.id}>
                        <td>
                          <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} />
                        </td>
                        <td>
                          <Link to={`/restaurants/${s.restaurant.id}`} className="table-link" style={{ fontWeight: 700 }}>
                            {s.restaurant.name}
                          </Link>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{s.plan.name}</span>
                            <Badge tone={isPremiumTier ? 'gold' : 'neutral'}>{s.plan.tier}</Badge>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          ₹{(s.plan.priceMonthly / 100).toLocaleString('en-IN')}/mo
                        </td>
                        <td>
                          <Badge tone={isExpired ? 'error' : statusTone(s.status)} pulse={s.status === 'ACTIVE' && !isExpired}>
                            {isExpired ? 'EXPIRED' : s.status}
                          </Badge>
                        </td>
                        <td>{new Date(s.startDate).toLocaleDateString('en-IN')}</td>
                        <td>
                          <span style={{ fontWeight: isExpired ? 700 : 500, color: isExpired ? '#ef4444' : 'inherit' }}>
                            {new Date(s.expiresAt).toLocaleDateString('en-IN')}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setRenewTarget(s)}>
                              Renew
                            </Button>
                            <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setChangePlanTarget(s)}>
                              Change Tier
                            </Button>
                            <Button
                              size="sm"
                              variant={s.status === 'SUSPENDED' ? 'primary' : 'danger'}
                              disabled={!canWrite}
                              onClick={() => setConfirmTarget({
                                sub: s,
                                action: s.status === 'SUSPENDED' ? 'reactivate' : 'suspend'
                              })}
                            >
                              {s.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                            </Button>
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

      {/* Assign Modal */}
      {showAssign && (
        <AssignSubscriptionModal
          onClose={() => setShowAssign(false)}
          onSaved={() => {
            setShowAssign(false);
            showToast('Subscription assigned successfully');
            load();
          }}
        />
      )}

      {/* Renew Modal */}
      {renewTarget && (
        <RenewSubscriptionModal
          subscription={renewTarget}
          onClose={() => setRenewTarget(null)}
          onSaved={() => {
            setRenewTarget(null);
            showToast(`Subscription for "${renewTarget.restaurant.name}" renewed!`);
            load();
          }}
        />
      )}

      {/* Change Plan Modal */}
      {changePlanTarget && (
        <ChangePlanModal
          subscription={changePlanTarget}
          onClose={() => setChangePlanTarget(null)}
          onSaved={() => {
            setChangePlanTarget(null);
            showToast(`Plan updated for "${changePlanTarget.restaurant.name}"!`);
            load();
          }}
        />
      )}

      {/* Confirm Modal */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={confirmTarget.action === 'reactivate' ? 'Reactivate Subscription?' : 'Suspend Subscription?'}
          message={
            confirmTarget.action === 'reactivate'
              ? `Restore cloud sync and operational features for "${confirmTarget.sub.restaurant.name}"?`
              : `Suspending subscription for "${confirmTarget.sub.restaurant.name}" will pause billing and restrict cloud ordering features.`
          }
          tone={confirmTarget.action === 'reactivate' ? 'primary' : 'danger'}
          isPending={actionPending}
          onConfirm={handleExecuteConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
