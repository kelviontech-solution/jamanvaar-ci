import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Badge, Button, Card, EmptyState, FilterTabs, SearchBar, SkeletonTable, statusTone } from '../../components/ui';
import { Plus, Store, Sparkles, Filter } from 'lucide-react';
import { CreateRestaurantModal } from './CreateRestaurantModal';
import './restaurants.css';

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';
type PlanFilter = 'ALL' | 'CORE' | 'PRO';

export function RestaurantsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<RestaurantListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Search and filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurants</h1>
          <p className="page-subtitle">Every restaurant tenant on the platform, across every branch and licensed device fleet.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
                    const isPro = sub?.plan?.tier === 'PRO';
                    return (
                      <tr key={r.id}>
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
                              <Badge tone={isPro ? 'gold' : 'neutral'}>{sub.plan.tier}</Badge>
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
