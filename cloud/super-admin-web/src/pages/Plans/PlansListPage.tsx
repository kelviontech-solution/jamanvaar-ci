import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Plan } from '../../api/types';
import { ENTITLEMENT_KEYS } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  FilterTabs,
  SearchBar,
  SkeletonTable,
  statusTone
} from '../../components/ui';
import { Package, Plus } from 'lucide-react';
import '../../components/shared.css';
import { PlanFormModal } from './PlanFormModal';
import { useAuth } from '../../auth/AuthContext';

type PlanStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function PlansListPage() {
  // B2-052 item 2: Finance legitimately has subscriptions (plans) write; Read-Only/Support/Ops don't.
  const { can } = useAuth();
  const canWrite = can('subscriptions', 'write');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modal, setModal] = useState<'create' | Plan | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>('ALL');

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    plan: Plan;
    action: 'activate' | 'deactivate';
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Plan[]>('/api/v1/plans')
      .then((data) => {
        setPlans(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    return plans.filter((p) => {
      if (statusFilter !== 'ALL') {
        const isAct = p.status === 'ACTIVE';
        if (statusFilter === 'ACTIVE' && !isAct) return false;
        if (statusFilter === 'INACTIVE' && isAct) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchTier = p.tier.toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchName && !matchTier && !matchDesc) return false;
      }
      return true;
    });
  }, [plans, statusFilter, search]);

  async function handleExecuteConfirm() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/plans/${confirmTarget.plan.id}/${confirmTarget.action}`);
      showToast(`Plan "${confirmTarget.plan.name}" ${confirmTarget.action === 'activate' ? 'activated' : 'deactivated'}`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = useMemo(() => plans?.filter((p) => p.status === 'ACTIVE').length || 0, [plans]);
  const inactiveCount = useMemo(() => plans?.filter((p) => p.status !== 'ACTIVE').length || 0, [plans]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SaaS Plans</h1>
          <p className="page-subtitle">
            Authoritative plans governing feature access, pricing, and hardware quotas — never hardcoded in client applications.
          </p>
        </div>
        <Button variant="accent" onClick={() => setModal('create')} disabled={!canWrite}>
          <Plus className="w-4 h-4" />
          <span>Create Plan</span>
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
          placeholder="Search by plan name or tier…"
          width="320px"
        />

        <FilterTabs<PlanStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Plans', count: plans?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'INACTIVE', label: 'Inactive', count: inactiveCount }
          ]}
        />

        {(search || statusFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredPlans.length} of {plans?.length ?? 0} plans
        </span>
      </div>

      {loading && !plans && <SkeletonTable rows={4} cols={7} />}

      {plans && (
        <Card>
          {filteredPlans.length === 0 ? (
            <EmptyState
              icon={<Package className="w-6 h-6 text-slate-400" />}
              title={plans.length === 0 ? 'No plans configured yet' : 'No matching plans'}
              description={
                plans.length === 0
                  ? 'Build your first commercial plan tier to start provisioning restaurant subscriptions.'
                  : 'Try clearing your search query or status filter.'
              }
              action={
                plans.length > 0 ? (
                  <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}>
                    Reset Filters
                  </Button>
                ) : (
                  <Button variant="accent" onClick={() => setModal('create')}>
                    Create Plan
                  </Button>
                )
              }
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan &amp; Tier</th>
                    <th>Monthly (₹)</th>
                    <th>Yearly (₹)</th>
                    <th>Quotas</th>
                    <th>Features</th>
                    <th>Restaurants</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((p) => {
                    const activeEntCount = Object.values(p.entitlements).filter(Boolean).length;
                    const isPro = p.tier === 'PRO';
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Link to={`/plans/${p.id}`} className="table-link" style={{ fontWeight: 800, fontSize: 14 }}>
                              {p.name}
                            </Link>
                            <Badge tone={isPro ? 'gold' : 'neutral'}>{p.tier}</Badge>
                          </div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            {p.description || `${p.tier} edition`}
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0B253A' }}>
                          ₹{(p.priceMonthly / 100).toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {p.priceYearly ? `₹${(p.priceYearly / 100).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: '#475569' }}>
                          <div>{p.maxBranches} Br • {p.maxDevices} Dev</div>
                          <div className="muted">{p.maxUsers} Users</div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: isPro ? '#ea580c' : '#166534',
                              background: isPro ? '#fff4ed' : '#f0fdf4',
                              border: `1px solid ${isPro ? '#fed7aa' : '#bbf7d0'}`,
                              padding: '2px 8px',
                              borderRadius: 12
                            }}
                          >
                            {/* Was a literal "/20" — silently wrong the
                                moment a 21st entitlement (e.g. Kiosk) got
                                added, since it never changed to match. */}
                            {activeEntCount}/{ENTITLEMENT_KEYS.length} Active
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{p._count?.subscriptions ?? 0}</td>
                        <td>
                          <Badge tone={statusTone(p.status)} pulse={p.status === 'ACTIVE'}>{p.status}</Badge>
                        </td>
                        <td>
                          <div className="row-actions">
                            <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setModal(p)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant={p.status === 'ACTIVE' ? 'danger' : 'primary'}
                              disabled={!canWrite}
                              onClick={() => setConfirmTarget({
                                plan: p,
                                action: p.status === 'ACTIVE' ? 'deactivate' : 'activate'
                              })}
                            >
                              {p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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

      {modal && (
        <PlanFormModal
          plan={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            showToast('Plan saved successfully');
            load();
          }}
        />
      )}

      {/* Confirm Dialog */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={confirmTarget.action === 'activate' ? 'Activate Plan?' : 'Deactivate Plan?'}
          message={
            confirmTarget.action === 'activate'
              ? `Make "${confirmTarget.plan.name}" available for new restaurant subscriptions?`
              : `Deactivating "${confirmTarget.plan.name}" will prevent new subscriptions from selecting this plan.`
          }
          tone={confirmTarget.action === 'activate' ? 'primary' : 'danger'}
          isPending={actionPending}
          onConfirm={handleExecuteConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
