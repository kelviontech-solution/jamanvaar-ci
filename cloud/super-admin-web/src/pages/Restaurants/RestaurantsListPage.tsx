import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Badge, BulkActionsBar, Button, Card, EmptyState, FilterTabs, SearchBar, SkeletonTable, statusTone } from '../../components/ui';
import { Plus, Store, Sparkles, Filter, Download } from 'lucide-react';
import { CreateRestaurantModal } from './CreateRestaurantModal';
import { exportRowsToCsv } from '../../lib/csvExport';
import './restaurants.css';

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';
type PlanFilter = 'ALL' | 'CORE' | 'PRO' | 'ENTERPRISE';

export function RestaurantsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<RestaurantListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Search and filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');

  // Bulk selection — there was previously no way to suspend/activate more
  // than one restaurant tenant at a time.
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
      .get<RestaurantListItem[]>('/api/v1/restaurants')
      .then((data) => {
        setRestaurants(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load restaurants'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Keep search input in sync if URL search param changes
  useEffect(() => {
    const urlQuery = searchParams.get('search');
    if (urlQuery !== null && urlQuery !== search) {
      setSearch(urlQuery);
    }
  }, [searchParams]);

  // Handle search change and update URL parameter
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val.trim()) {
      setSearchParams({ search: val.trim() });
    } else {
      setSearchParams({});
    }
  };

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) return [];
    return restaurants.filter((r) => {
      // Status filter
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }
      // Plan filter
      if (planFilter !== 'ALL') {
        const subPlanTier = r.subscriptions?.[0]?.plan?.tier;
        if (subPlanTier !== planFilter) return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchCity = (r.city || '').toLowerCase().includes(q);
        const matchLegal = (r.legalName || '').toLowerCase().includes(q);
        const matchPlan = (r.subscriptions?.[0]?.plan?.name || '').toLowerCase().includes(q);
        if (!matchName && !matchCity && !matchLegal && !matchPlan) return false;
      }
      return true;
    });
  }, [restaurants, statusFilter, planFilter, search]);

  const activeCount = useMemo(() => restaurants?.filter((r) => r.status === 'ACTIVE').length || 0, [restaurants]);
  const suspendedCount = useMemo(() => restaurants?.filter((r) => r.status === 'SUSPENDED').length || 0, [restaurants]);

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
      prev.size === filteredRestaurants.length ? new Set() : new Set(filteredRestaurants.map((r) => r.id))
    );
  }

  async function handleBulkAction(actionPath: 'suspend' | 'reactivate') {
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/api/v1/restaurants/${id}/${actionPath}`))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} restaurant(s) ${actionPath === 'suspend' ? 'suspended' : 'activated'}`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_restaurants_${new Date().toISOString().slice(0, 10)}.csv`, filteredRestaurants, [
      { header: 'Name', value: (r) => r.name },
      { header: 'Legal Name', value: (r) => r.legalName || '' },
      { header: 'City', value: (r) => r.city || '' },
      { header: 'State', value: (r) => r.state || '' },
      { header: 'Status', value: (r) => r.status },
      { header: 'Plan', value: (r) => r.subscriptions?.[0]?.plan?.name || '' },
      { header: 'Tier', value: (r) => r.subscriptions?.[0]?.plan?.tier || '' },
      { header: 'Subscription Status', value: (r) => r.subscriptions?.[0]?.status || '' },
      { header: 'Branches', value: (r) => r._count.branches },
      { header: 'Devices', value: (r) => r._count.devices }
    ]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurants</h1>
          <p className="page-subtitle">Every restaurant tenant on the platform, across every branch and licensed device fleet.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="ghost" onClick={handleExportCsv} disabled={!restaurants || restaurants.length === 0}>
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </Button>
          <Button variant="ghost" onClick={() => setShowCreate(true)}>
            + Quick create
          </Button>
          <Button variant="accent" onClick={() => navigate('/restaurants/onboard')}>
            <Plus className="w-4 h-4" />
            <span>Onboard Restaurant</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Toolbar: Search, Status Filter & Plan Filter */}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by restaurant name, city, or plan…"
          width="320px"
        />

        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: restaurants?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'SUSPENDED', label: 'Suspended', count: suspendedCount }
          ]}
        />

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All SaaS Tiers</option>
          <option value="CORE">CORE (₹5,000)</option>
          <option value="PRO">PRO (₹7,000)</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
        </select>

        {(search || statusFilter !== 'ALL' || planFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setPlanFilter('ALL');
              setSearchParams({});
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredRestaurants.length} of {restaurants?.length ?? 0} restaurants
        </span>
      </div>

      {loading && !restaurants && (
        <SkeletonTable rows={6} cols={7} />
      )}

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={() => handleBulkAction('suspend')}>
          Suspend Selected
        </Button>
        <Button size="sm" variant="primary" disabled={bulkPending} onClick={() => handleBulkAction('reactivate')}>
          Activate Selected
        </Button>
      </BulkActionsBar>

      {restaurants && (
        <Card>
          {filteredRestaurants.length === 0 ? (
            <EmptyState
              icon={<Store className="w-6 h-6 text-slate-400" />}
              title={restaurants.length === 0 ? 'No restaurants onboarded yet' : 'No matching restaurants found'}
              description={
                restaurants.length === 0
                  ? 'Launch your first restaurant with the comprehensive 7-step onboarding wizard.'
                  : 'Try modifying your search keywords or switching filters to view all records.'
              }
              action={
                restaurants.length === 0 ? (
                  <Button variant="accent" onClick={() => navigate('/restaurants/onboard')}>
                    Onboard Restaurant Now
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('ALL');
                      setPlanFilter('ALL');
                      setSearchParams({});
                    }}
                  >
                    Reset Filters
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
                        checked={filteredRestaurants.length > 0 && selectedIds.size === filteredRestaurants.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Restaurant</th>
                    <th>Location</th>
                    <th>Plan</th>
                    <th>Subscription</th>
                    <th>Branches</th>
                    <th>Devices</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRestaurants.map((r) => {
                    const sub = r.subscriptions[0];
                    const isPremiumTier = sub?.plan?.tier === 'PRO' || sub?.plan?.tier === 'ENTERPRISE';
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelected(r.id)}
                          />
                        </td>
                        <td>
                          <Link to={`/restaurants/${r.id}`} className="table-link" style={{ fontWeight: 700, fontSize: 14 }}>
                            {r.name}
                          </Link>
                          {r.legalName && r.legalName !== r.name && (
                            <div className="muted" style={{ fontSize: 11 }}>{r.legalName}</div>
                          )}
                        </td>
                        <td>{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                        <td>
                          {sub?.plan ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600 }}>{sub.plan.name}</span>
                              <Badge tone={isPremiumTier ? 'gold' : 'neutral'}>{sub.plan.tier}</Badge>
                            </div>
                          ) : (
                            <span className="muted">No Plan</span>
                          )}
                        </td>
                        <td>{sub ? <Badge tone={statusTone(sub.status)} pulse={sub.status === 'ACTIVE'}>{sub.status}</Badge> : '—'}</td>
                        <td style={{ fontWeight: 600 }}>{r._count.branches}</td>
                        <td style={{ fontWeight: 600 }}>{r._count.devices}</td>
                        <td>
                          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
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

      {showCreate && (
        <CreateRestaurantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
