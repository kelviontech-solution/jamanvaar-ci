import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Branch } from '../../api/types';
import {
  Badge,
  BulkActionsBar,
  Button,
  ConfirmModal,
  EmptyState,
  statusTone
} from '../../components/ui';
import {
  Building2,
  Plus,
  Store,
  MapPin,
  Laptop2,
  Users,
  ArrowRight,
  Hash,
  Search,
  X,
  MoreVertical,
  ShieldAlert
} from 'lucide-react';
import '../../components/card-grid.css';
import '../../components/shared.css';
import { CreateBranchModal } from './CreateBranchModal';

function getAvatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `mgmt-avatar-c${Math.abs(hash) % 8}`;
}

type BranchStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function BranchesListPage() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>('ALL');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('ALL');

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    branch: Branch;
    action: 'activate' | 'deactivate';
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.more-actions-menu-container')) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Branch[]>('/api/v1/branches')
      .then((data) => {
        setBranches(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load branches'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Unique restaurants list for filter dropdown
  const uniqueRestaurants = useMemo(() => {
    if (!branches) return [];
    const map = new Map<string, string>();
    branches.forEach((b) => {
      if (b.restaurant) {
        map.set(b.restaurant.id, b.restaurant.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [branches]);

  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    return branches.filter((b) => {
      if (statusFilter !== 'ALL') {
        const isAct = b.status === 'ACTIVE';
        if (statusFilter === 'ACTIVE' && !isAct) return false;
        if (statusFilter === 'INACTIVE' && isAct) return false;
      }
      if (selectedRestaurantId !== 'ALL' && b.restaurant?.id !== selectedRestaurantId) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = b.name.toLowerCase().includes(q);
        const matchCode = b.code.toLowerCase().includes(q);
        const matchRest = (b.restaurant?.name || '').toLowerCase().includes(q);
        const matchAddr = (b.address || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchRest && !matchAddr) return false;
      }
      return true;
    });
  }, [branches, statusFilter, selectedRestaurantId, search]);

  async function handleExecuteConfirm() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/branches/${confirmTarget.branch.id}/${confirmTarget.action}`);
      showToast(`Branch "${confirmTarget.branch.name}" ${confirmTarget.action === 'activate' ? 'activated' : 'deactivated'}`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  const activeCount = useMemo(() => branches?.filter((b) => b.status === 'ACTIVE').length || 0, [branches]);
  const inactiveCount = useMemo(() => branches?.filter((b) => b.status !== 'ACTIVE').length || 0, [branches]);

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
      prev.size === filteredBranches.length ? new Set() : new Set(filteredBranches.map((b) => b.id))
    );
  }

  async function handleBulkAction(actionPath: 'activate' | 'deactivate') {
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.patch(`/api/v1/branches/${id}/${actionPath}`)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} branch(es) ${actionPath === 'activate' ? 'activated' : 'deactivated'}`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, color: '#0B253A', letterSpacing: '-0.02em' }}>
            Branches
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13.5, color: '#64748B', marginTop: 4 }}>
            Every operational branch across all restaurant tenants — managed independently with localized hardware limits.
          </p>
        </div>
        <Button variant="accent" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          <span>Add Branch</span>
        </Button>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>Retry</button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '12px 18px', background: 'var(--jv-surface)', color: 'var(--jv-text)', border: '1px solid var(--jv-border)', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="mgmt-toolbar">
        {/* Search */}
        <div style={{ position: 'relative', width: 300 }}>
          <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            type="text"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, restaurant…"
            style={{ paddingLeft: 34, height: 38, fontSize: 13 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, top: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jv-text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(
            [
              { id: 'ALL', label: 'All', count: branches?.length },
              { id: 'ACTIVE', label: 'Active', count: activeCount },
              { id: 'INACTIVE', label: 'Inactive', count: inactiveCount }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id)}
              className={`filter-chip-btn ${statusFilter === t.id ? 'active' : ''}`}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 12.5,
                fontWeight: statusFilter === t.id ? 700 : 500,
                border: '1px solid var(--jv-border)',
                background: statusFilter === t.id ? '#0b253a' : 'var(--jv-bg)',
                color: statusFilter === t.id ? '#fff' : 'var(--jv-text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: statusFilter === t.id ? 'rgba(255,255,255,0.25)' : 'var(--jv-border)', color: statusFilter === t.id ? '#fff' : 'var(--jv-text-secondary)' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Restaurant filter */}
        <select
          value={selectedRestaurantId}
          onChange={(e) => setSelectedRestaurantId(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: 'var(--jv-bg)', fontWeight: 500, color: 'var(--jv-text)' }}
        >
          <option value="ALL">All Restaurants ({uniqueRestaurants.length})</option>
          {uniqueRestaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        {(search || statusFilter !== 'ALL' || selectedRestaurantId !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, color: 'var(--jv-accent)', fontWeight: 600 }}
            onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedRestaurantId('ALL'); }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--jv-text-secondary)' }}>
          {filteredBranches.length} of {branches?.length ?? 0}
        </span>
      </div>

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="primary" disabled={bulkPending} onClick={() => handleBulkAction('activate')}>
          Activate Selected
        </Button>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={() => handleBulkAction('deactivate')}>
          Deactivate Selected
        </Button>
      </BulkActionsBar>

      {/* Loading skeletons */}
      {loading && !branches && (
        <div className="mgmt-card-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="mgmt-card-skeleton" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {branches && filteredBranches.length === 0 && (
        <div style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: 40 }}>
          <EmptyState
            icon={<Building2 className="w-6 h-6 text-slate-400" />}
            title={branches.length === 0 ? 'No branches yet' : 'No matching branches found'}
            description={
              branches.length === 0
                ? 'Every restaurant gets a primary branch on creation, and additional branches can be added here.'
                : 'Try clearing your search query or restaurant filter to view other outlets.'
            }
            action={
              branches.length > 0 ? (
                <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedRestaurantId('ALL'); }}>
                  Reset Filters
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Branch Cards Grid */}
      {branches && filteredBranches.length > 0 && (
        <div className="mgmt-card-grid">
          {filteredBranches.map((b) => {
            const isActive = b.status === 'ACTIVE';
            const initials =
              b.name
                .split(' ')
                .map((w) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'B';
            const terminalCount = b._count?.devices ?? 0;
            const staffCount = b._count?.users ?? 0;
            const isMenuOpen = activeMenuId === b.id;
            const avatarClass = getAvatarClass(b.name);

            return (
              <div
                key={b.id}
                className={`mgmt-card ${selectedIds.has(b.id) ? 'is-selected' : ''} ${!isActive ? 'is-suspended' : ''}`}
                onClick={() => navigate(`/branches/${b.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/branches/${b.id}`)}
              >
                {/* ── TOP BAR: Checkbox / Code & Status / Actions ── */}
                <div className="mgmt-card-header-bar" onClick={(e) => e.stopPropagation()}>
                  <div className="mgmt-card-header-left">
                    <input
                      type="checkbox"
                      className="mgmt-card-checkbox"
                      checked={selectedIds.has(b.id)}
                      onClick={() => toggleSelected(b.id)}
                      onChange={() => {}}
                      title="Select branch"
                    />
                    <span className="mgmt-card-id-pill" title="Branch code">
                      <Hash className="w-2.5 h-2.5 inline" />
                      {b.code}
                    </span>
                  </div>

                  <div className="mgmt-card-header-right">
                    <Badge tone={statusTone(b.status)} pulse={isActive}>
                      {b.status}
                    </Badge>

                    <div className="more-actions-menu-container">
                      <button
                        type="button"
                        className={`mgmt-card-corner-btn ${isMenuOpen ? 'is-active' : ''}`}
                        title="More actions"
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : b.id); }}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div className="actions-dropdown-menu">
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/branches/${b.id}`); }}>
                            <Building2 className="w-3.5 h-3.5 text-slate-500" /><span>Branch Workspace</span>
                          </button>
                          {b.restaurant && (
                            <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${b.restaurant!.id}`); }}>
                              <Store className="w-3.5 h-3.5 text-slate-500" /><span>Parent Restaurant</span>
                            </button>
                          )}
                          <div className="actions-dropdown-divider" />
                          <button
                            type="button"
                            className={`actions-dropdown-item ${isActive ? 'is-danger' : ''}`}
                            onClick={() => {
                              setActiveMenuId(null);
                              setConfirmTarget({ branch: b, action: isActive ? 'deactivate' : 'activate' });
                            }}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>{isActive ? 'Deactivate Branch' : 'Activate Branch'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── IDENTITY ROW: Avatar + Names + Code ── */}
                <div className="mgmt-card-identity">
                  <div className={`mgmt-card-avatar ${avatarClass} ${!isActive ? 'is-suspended' : ''}`}>
                    {initials}
                  </div>
                  <div className="mgmt-card-identity-text">
                    <p className="mgmt-card-name" title={b.name}>{b.name}</p>
                    {b.restaurant && (
                      <p className="mgmt-card-subtitle" title={b.restaurant.name}>
                        <Store style={{ display: 'inline', width: 11, height: 11, marginRight: 4, verticalAlign: 'middle' }} />
                        {b.restaurant.name}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── STATS: Terminals + Staff ── */}
                <div className="mgmt-card-stats">
                  <div className="mgmt-card-stat">
                    <span className="mgmt-card-stat-label">
                      <Laptop2 className="w-3 h-3 text-slate-400" /> Terminals
                    </span>
                    <span className={`mgmt-card-stat-value ${terminalCount > 0 ? 'has-data' : ''}`}>
                      {terminalCount}
                    </span>
                  </div>
                  <div className="mgmt-card-stat">
                    <span className="mgmt-card-stat-label">
                      <Users className="w-3 h-3 text-slate-400" /> Staff
                    </span>
                    <span className={`mgmt-card-stat-value ${staffCount > 0 ? 'has-data' : ''}`}>
                      {staffCount}
                    </span>
                  </div>
                </div>

                {/* ── INFO ROW: Address + Timezone ── */}
                <div className="mgmt-card-info-row">
                  {b.address && (
                    <div className="mgmt-card-info-item">
                      <MapPin className="w-3 h-3" />
                      <span>{b.address}</span>
                    </div>
                  )}
                  <div className="mgmt-card-info-item">
                    <Laptop2 className="w-3 h-3" />
                    <span>{b.timezone || 'Asia/Kolkata'}</span>
                  </div>
                </div>

                {/* ── FOOTER: CTA + Meta ── */}
                <div className="mgmt-card-footer" onClick={(e) => e.stopPropagation()}>
                  <span className="mgmt-card-cta">
                    <Building2 className="w-3.5 h-3.5" />
                    Manage Branch
                    <span className="mgmt-card-cta-arrow">
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--jv-text-muted)', fontWeight: 500 }}>
                    {b.code}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateBranchModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={confirmTarget.action === 'activate' ? 'Activate Branch?' : 'Deactivate Branch?'}
          message={
            confirmTarget.action === 'activate'
              ? `Restore active operational status for branch "${confirmTarget.branch.name}"?`
              : `Deactivating branch "${confirmTarget.branch.name}" will pause order routing for its terminals.`
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
