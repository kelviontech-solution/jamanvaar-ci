import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Badge, BulkActionsBar, Button, Card, EmptyState, statusTone } from '../../components/ui';
import {
  Plus,
  Store,
  Download,
  Building2,
  Laptop2,
  User,
  Mail,
  MapPin,
  Calendar,
  ArrowRight,
  MoreVertical,
  Edit3,
  ShieldAlert,
  CheckCircle2,
  Repeat,
  KeyRound,
  FileText,
  Copy,
  Check,
  LayoutGrid,
  List,
  Search,
  X
} from 'lucide-react';
import { CreateRestaurantModal } from './CreateRestaurantModal';
import { EditRestaurantModal } from './EditRestaurantModal';
import { exportRowsToCsv } from '../../lib/csvExport';
import './restaurants.css';
import '../../components/card-grid.css';

function getAvatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `mgmt-avatar-c${Math.abs(hash) % 8}`;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'NO_PLAN';
type PlanFilter = 'ALL' | 'CORE' | 'PRO' | 'ENTERPRISE' | 'NO_PLAN';
type SortOption = 'recent' | 'name_asc' | 'name_desc' | 'branches_desc' | 'devices_desc' | 'status';

export function RestaurantsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<RestaurantListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<RestaurantListItem | null>(null);
  const [confirmingStatusRestaurant, setConfirmingStatusRestaurant] = useState<RestaurantListItem | null>(null);
  const [statusActionPending, setStatusActionPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Search and filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

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

  // Handle outside click to close active dropdown menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.more-actions-menu-container')) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val.trim()) {
      setSearchParams({ search: val.trim() });
    } else {
      setSearchParams({});
    }
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) return [];
    let list = restaurants.filter((r) => {
      const sub = r.subscriptions?.[0];
      // Status filter
      if (statusFilter === 'ACTIVE' && r.status !== 'ACTIVE') return false;
      if (statusFilter === 'SUSPENDED' && r.status !== 'SUSPENDED') return false;
      if (statusFilter === 'TRIAL' && sub?.status !== 'TRIAL') return false;
      if (statusFilter === 'NO_PLAN' && sub?.plan) return false;

      // Plan filter
      if (planFilter !== 'ALL') {
        if (planFilter === 'NO_PLAN') {
          if (sub?.plan) return false;
        } else {
          if (sub?.plan?.tier !== planFilter) return false;
        }
      }

      // Search filter across multiple entity fields
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchCity = (r.city || '').toLowerCase().includes(q);
        const matchState = (r.state || '').toLowerCase().includes(q);
        const matchLegal = (r.legalName || '').toLowerCase().includes(q);
        const matchId = r.id.toLowerCase().includes(q);
        const matchPlan = (sub?.plan?.name || '').toLowerCase().includes(q);
        const owner = r.users?.[0];
        const matchOwnerName = (owner?.fullName || '').toLowerCase().includes(q);
        const matchOwnerEmail = (owner?.email || '').toLowerCase().includes(q);

        if (
          !matchName &&
          !matchCity &&
          !matchState &&
          !matchLegal &&
          !matchId &&
          !matchPlan &&
          !matchOwnerName &&
          !matchOwnerEmail
        ) {
          return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      const subA = a.subscriptions?.[0];
      const subB = b.subscriptions?.[0];
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'branches_desc':
          return b._count.branches - a._count.branches;
        case 'devices_desc':
          return b._count.devices - a._count.devices;
        case 'status':
          return (subB?.status || '').localeCompare(subA?.status || '');
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return list;
  }, [restaurants, statusFilter, planFilter, search, sortBy]);

  const activeCount = useMemo(() => restaurants?.filter((r) => r.status === 'ACTIVE').length || 0, [restaurants]);
  const suspendedCount = useMemo(() => restaurants?.filter((r) => r.status === 'SUSPENDED').length || 0, [restaurants]);
  const trialCount = useMemo(
    () => restaurants?.filter((r) => r.subscriptions?.[0]?.status === 'TRIAL').length || 0,
    [restaurants]
  );

  async function handleConfirmStatusChange() {
    if (!confirmingStatusRestaurant) return;
    const { id, status } = confirmingStatusRestaurant;
    const actionPath = status === 'ACTIVE' ? 'suspend' : 'reactivate';
    setStatusActionPending(true);
    try {
      await api.patch(`/api/v1/restaurants/${id}/${actionPath}`);
      showToast(
        `Restaurant "${confirmingStatusRestaurant.name}" was ${actionPath === 'suspend' ? 'suspended' : 'reactivated'} successfully`
      );
      setConfirmingStatusRestaurant(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update restaurant status');
    } finally {
      setStatusActionPending(false);
    }
  }

  function toggleSelected(id: string, e?: React.SyntheticEvent) {
    if (e) e.stopPropagation();
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
      { header: 'Restaurant ID', value: (r) => r.id },
      { header: 'Name', value: (r) => r.name },
      { header: 'Legal Name', value: (r) => r.legalName || '' },
      { header: 'Owner Name', value: (r) => r.users?.[0]?.fullName || '' },
      { header: 'Owner Email', value: (r) => r.users?.[0]?.email || '' },
      { header: 'City', value: (r) => r.city || '' },
      { header: 'State', value: (r) => r.state || '' },
      { header: 'Status', value: (r) => r.status },
      { header: 'Plan', value: (r) => r.subscriptions?.[0]?.plan?.name || 'No Plan' },
      { header: 'Tier', value: (r) => r.subscriptions?.[0]?.plan?.tier || '—' },
      { header: 'Subscription Status', value: (r) => r.subscriptions?.[0]?.status || '—' },
      { header: 'Branches Count', value: (r) => r._count.branches },
      { header: 'Devices Count', value: (r) => r._count.devices },
      { header: 'Onboarded Date', value: (r) => r.createdAt }
    ]);
  }

  return (
    <div>
      {/* 1. Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, color: '#0B253A', letterSpacing: '-0.02em' }}>
            Restaurants
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13.5, color: '#64748B', marginTop: 4 }}>
            Manage every restaurant tenant, branch, subscription, and connected device from one place.
          </p>
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
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {toast && (
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--jv-surface)',
            color: 'var(--jv-text)',
            border: '1px solid var(--jv-border)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--jv-shadow-card)'
          }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* 2. Search & Filter Bar */}
      <div className="restaurants-toolbar">
        {/* Search Input */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            type="text"
            className="input"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search name, owner, city, ID…"
            style={{ paddingLeft: 34, height: 38, fontSize: 13 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              style={{ position: 'absolute', right: 10, top: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jv-text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(
            [
              { id: 'ALL', label: 'All', count: restaurants?.length },
              { id: 'ACTIVE', label: 'Active', count: activeCount },
              { id: 'SUSPENDED', label: 'Suspended', count: suspendedCount },
              { id: 'TRIAL', label: 'Trial', count: trialCount },
              { id: 'NO_PLAN', label: 'No Plan', count: undefined }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id)}
              className={`filter-chip-btn ${statusFilter === t.id ? 'active' : ''}`}
            >
              <span>{t.label}</span>
              {typeof t.count === 'number' && (
                <span className="filter-chip-count">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan Filter Dropdown */}
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          className="filter-select-input"
        >
          <option value="ALL">All SaaS Tiers</option>
          <option value="CORE">CORE (₹5,000)</option>
          <option value="PRO">PRO (₹7,000)</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
          <option value="NO_PLAN">No Plan</option>
        </select>

        {/* Sort Dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="filter-select-input"
        >
          <option value="recent">Recently Onboarded</option>
          <option value="name_asc">Name (A → Z)</option>
          <option value="name_desc">Name (Z → A)</option>
          <option value="branches_desc">Most Branches</option>
          <option value="devices_desc">Most Devices</option>
          <option value="status">Subscription Status</option>
        </select>

        {/* Clear Filters CTA if active */}
        {(search || statusFilter !== 'ALL' || planFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, color: 'var(--jv-accent)', fontWeight: 600 }}
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

        {/* View Toggle (Cards vs Table) */}
        <div className="view-toggle-group">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            title="SaaS Cards View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            title="Tabular View"
          >
            <List className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
        </div>

        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--jv-text-secondary)' }}>
          {filteredRestaurants.length} of {restaurants?.length ?? 0}
        </span>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={() => handleBulkAction('suspend')}>
          Suspend Selected
        </Button>
        <Button size="sm" variant="primary" disabled={bulkPending} onClick={() => handleBulkAction('reactivate')}>
          Activate Selected
        </Button>
      </BulkActionsBar>

      {/* Loading Skeletons */}
      {loading && !restaurants && (
        <div className="mgmt-card-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="mgmt-card-skeleton" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {restaurants && filteredRestaurants.length === 0 && (
        <Card>
          <EmptyState
            icon={<Store className="w-8 h-8 text-slate-400" />}
            title={restaurants.length === 0 ? 'No restaurants onboarded yet' : 'No matching restaurants found'}
            description={
              restaurants.length === 0
                ? 'Launch your first restaurant tenant using the 7-step onboarding wizard.'
                : 'Try adjusting your search terms or resetting the filter chips to view all records.'
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
                  Reset All Filters
                </Button>
              )
            }
          />
        </Card>
      )}

      {/* 3. Primary View: Square Grid Cards */}
      {restaurants && filteredRestaurants.length > 0 && viewMode === 'cards' && (
        <div className="mgmt-card-grid">
          {filteredRestaurants.map((r) => {
            const sub = r.subscriptions?.[0];
            const plan = sub?.plan;
            const owner = r.users?.[0];
            const isSuspended = r.status === 'SUSPENDED';
            const initials =
              r.name
                .split(' ')
                .map((w) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'R';
            const isMenuOpen = activeMenuId === r.id;
            const tierClass =
              plan?.tier === 'PRO' ? 'tier-pro' : plan?.tier === 'ENTERPRISE' ? 'tier-enterprise' : '';
            const avatarClass = getAvatarClass(r.name);

            // Clean plan display name to avoid "JAMANVAAR PRO · PRO"
            const planLabel = plan
              ? plan.name.toLowerCase().includes(plan.tier.toLowerCase())
                ? plan.name
                : `${plan.name} · ${plan.tier}`
              : null;

            return (
              <div
                key={r.id}
                className={`mgmt-card ${selectedIds.has(r.id) ? 'is-selected' : ''} ${isSuspended ? 'is-suspended' : ''}`}
                onClick={() => navigate(`/restaurants/${r.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/restaurants/${r.id}`)}
              >
                {/* ── TOP BAR: Checkbox / ID & Status / Actions ── */}
                <div className="mgmt-card-header-bar" onClick={(e) => e.stopPropagation()}>
                  <div className="mgmt-card-header-left">
                    <input
                      type="checkbox"
                      className="mgmt-card-checkbox"
                      checked={selectedIds.has(r.id)}
                      onClick={(e) => toggleSelected(r.id, e)}
                      onChange={() => {}}
                      title="Select restaurant"
                    />
                    <span
                      className="mgmt-card-id-pill"
                      title="Click to copy ID"
                      onClick={(e) => handleCopyId(e, r.id)}
                    >
                      {copiedId === r.id ? <Check className="w-3 h-3 text-emerald-600" /> : `#${r.id.slice(-6)}`}
                    </span>
                  </div>

                  <div className="mgmt-card-header-right">
                    <Badge tone={statusTone(r.status)} pulse={r.status === 'ACTIVE'}>
                      {r.status}
                    </Badge>
                    {sub && sub.status !== 'ACTIVE' && sub.status !== r.status && (
                      <Badge tone={statusTone(sub.status)}>
                        Sub: {sub.status}
                      </Badge>
                    )}

                    <div className="more-actions-menu-container">
                      <button
                        type="button"
                        className={`mgmt-card-corner-btn ${isMenuOpen ? 'is-active' : ''}`}
                        title="More actions"
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : r.id); }}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div className="actions-dropdown-menu">
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${r.id}`); }}>
                            <Store className="w-3.5 h-3.5 text-slate-500" /><span>Open Workspace</span>
                          </button>
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); setEditingRestaurant(r); }}>
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" /><span>Edit Restaurant</span>
                          </button>
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${r.id}?tab=subscription`); }}>
                            <Repeat className="w-3.5 h-3.5 text-slate-500" /><span>Manage Subscription</span>
                          </button>
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${r.id}?tab=branches`); }}>
                            <Building2 className="w-3.5 h-3.5 text-slate-500" /><span>Manage Branches</span>
                          </button>
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${r.id}?tab=devices`); }}>
                            <KeyRound className="w-3.5 h-3.5 text-slate-500" /><span>Devices & Keys</span>
                          </button>
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${r.id}?tab=audit`); }}>
                            <FileText className="w-3.5 h-3.5 text-slate-500" /><span>Audit Logs</span>
                          </button>
                          <div className="actions-dropdown-divider" />
                          <button type="button" className={`actions-dropdown-item ${r.status === 'ACTIVE' ? 'is-danger' : ''}`} onClick={() => { setActiveMenuId(null); setConfirmingStatusRestaurant(r); }}>
                            <ShieldAlert className="w-3.5 h-3.5" /><span>{r.status === 'ACTIVE' ? 'Suspend Restaurant' : 'Reactivate'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── IDENTITY ROW: Avatar + Names + Plan ── */}
                <div className="mgmt-card-identity">
                  <div className={`mgmt-card-avatar ${avatarClass} ${isSuspended ? 'is-suspended' : ''}`}>
                    {initials}
                  </div>
                  <div className="mgmt-card-identity-text">
                    <p className="mgmt-card-name" title={r.name}>{r.name}</p>
                    {r.legalName && r.legalName !== r.name && (
                      <p className="mgmt-card-subtitle" title={r.legalName}>{r.legalName}</p>
                    )}
                    <div className="mgmt-card-plan-wrap">
                      {plan ? (
                        <span className={`mgmt-card-plan-badge ${tierClass}`}>
                          {planLabel}
                        </span>
                      ) : (
                        <span className="mgmt-card-plan-badge no-plan">
                          No Plan Assigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── STATS: Branches + Terminals ── */}
                <div className="mgmt-card-stats">
                  <div className="mgmt-card-stat">
                    <span className="mgmt-card-stat-label">
                      <Building2 className="w-3 h-3 text-slate-400" /> Branches
                    </span>
                    <span className={`mgmt-card-stat-value ${r._count.branches > 0 ? 'has-data' : ''}`}>
                      {r._count.branches}
                    </span>
                  </div>
                  <div className="mgmt-card-stat">
                    <span className="mgmt-card-stat-label">
                      <Laptop2 className="w-3 h-3 text-slate-400" /> Terminals
                    </span>
                    <span className={`mgmt-card-stat-value ${r._count.devices > 0 ? 'has-data' : ''}`}>
                      {r._count.devices}
                    </span>
                  </div>
                </div>

                {/* ── INFO ROW: Location + Owner + Email ── */}
                <div className="mgmt-card-info-row">
                  {[r.city, r.state].filter(Boolean).length > 0 && (
                    <div className="mgmt-card-info-item">
                      <MapPin className="w-3 h-3" />
                      <span>{[r.city, r.state].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  <div className="mgmt-card-info-item">
                    <User className="w-3 h-3" />
                    <span className="mgmt-card-info-value">
                      {owner?.fullName || 'No Owner Assigned'}
                    </span>
                  </div>
                  {owner?.email && (
                    <div className="mgmt-card-info-item">
                      <Mail className="w-3 h-3" />
                      <span>{owner.email}</span>
                    </div>
                  )}
                </div>

                {/* ── FOOTER: CTA + Created Date ── */}
                <div className="mgmt-card-footer" onClick={(e) => e.stopPropagation()}>
                  <span
                    className="mgmt-card-cta"
                    onClick={() => navigate(`/restaurants/${r.id}`)}
                  >
                    <Store className="w-3.5 h-3.5" />
                    Manage Restaurant
                    <span className="mgmt-card-cta-arrow">
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--jv-text-muted)', fontWeight: 500 }}>
                    {new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* 4. Tabular View (Optional fallback) */}
      {restaurants && filteredRestaurants.length > 0 && viewMode === 'table' && (
        <Card>
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
                  <th>Owner</th>
                  <th>Plan</th>
                  <th>Subscription</th>
                  <th>Branches</th>
                  <th>Devices</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.map((r) => {
                  const sub = r.subscriptions[0];
                  const isPremiumTier = sub?.plan?.tier === 'PRO' || sub?.plan?.tier === 'ENTERPRISE';
                  const owner = r.users?.[0];
                  return (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={(e) => toggleSelected(r.id, e)}
                        />
                      </td>
                      <td>
                        <Link to={`/restaurants/${r.id}`} className="table-link" style={{ fontWeight: 700, fontSize: 14 }}>
                          {r.name}
                        </Link>
                        {r.legalName && r.legalName !== r.name && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {r.legalName}
                          </div>
                        )}
                      </td>
                      <td>{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                      <td>
                        {owner ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{owner.fullName}</div>
                            <div className="muted" style={{ fontSize: 11 }}>{owner.email}</div>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
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
                      <td>
                        {sub ? (
                          <Badge tone={statusTone(sub.status)} pulse={sub.status === 'ACTIVE'}>
                            {sub.status}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{r._count.branches}</td>
                      <td style={{ fontWeight: 600 }}>{r._count.devices}</td>
                      <td>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Link to={`/restaurants/${r.id}`} className="btn btn-ghost btn-sm">
                            Workspace
                          </Link>
                          <Button
                            size="sm"
                            variant={r.status === 'ACTIVE' ? 'ghost' : 'primary'}
                            onClick={() => setConfirmingStatusRestaurant(r)}
                          >
                            {r.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick Create Restaurant Modal */}
      {showCreate && (
        <CreateRestaurantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {/* Edit Restaurant Modal */}
      {editingRestaurant && (
        <EditRestaurantModal
          restaurant={editingRestaurant}
          onClose={() => setEditingRestaurant(null)}
          onUpdated={() => {
            setEditingRestaurant(null);
            showToast(`Restaurant "${editingRestaurant.name}" updated successfully`);
            load();
          }}
        />
      )}

      {/* Dangerous Action (Suspend / Reactivate) Confirmation Modal */}
      {confirmingStatusRestaurant && (
        <div className="modal-backdrop" onClick={() => setConfirmingStatusRestaurant(null)}>
          <div className="modal confirmation-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirmation-body">
              <div
                className={`confirmation-icon-wrap ${
                  confirmingStatusRestaurant.status === 'ACTIVE' ? 'is-danger' : 'is-success'
                }`}
              >
                {confirmingStatusRestaurant.status === 'ACTIVE' ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>

              <h2 className="confirmation-title">
                {confirmingStatusRestaurant.status === 'ACTIVE'
                  ? `Suspend "${confirmingStatusRestaurant.name}"?`
                  : `Reactivate "${confirmingStatusRestaurant.name}"?`}
              </h2>

              <p className="confirmation-desc">
                {confirmingStatusRestaurant.status === 'ACTIVE'
                  ? 'Suspending this restaurant tenant will immediately block all terminal logins, disconnect connected POS/Captain/KDS sessions, and halt order taking across all branches.'
                  : 'Reactivating this restaurant tenant will restore terminal logins, resume cloud data synchronization, and allow staff to resume operations across all branches.'}
              </p>

              <div className="confirmation-impact-box">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Consequences of this action:</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {confirmingStatusRestaurant.status === 'ACTIVE' ? (
                    <>
                      <li>All active POS and Captain terminals will be locked out immediately.</li>
                      <li>Cloud API will reject incoming sync payloads from this restaurant.</li>
                      <li>Historical sales, invoices, and audit logs are safely preserved.</li>
                    </>
                  ) : (
                    <>
                      <li>Terminals with valid activation tokens can log in again.</li>
                      <li>Sync engine resumes processing offline queues.</li>
                      <li>Audit trail will record the reactivation event with your operator ID.</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="confirmation-actions">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingStatusRestaurant(null)}
                  disabled={statusActionPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmingStatusRestaurant.status === 'ACTIVE' ? 'danger' : 'primary'}
                  disabled={statusActionPending}
                  onClick={handleConfirmStatusChange}
                >
                  {statusActionPending
                    ? 'Processing…'
                    : confirmingStatusRestaurant.status === 'ACTIVE'
                    ? 'Yes, Suspend Tenant'
                    : 'Yes, Reactivate Tenant'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
