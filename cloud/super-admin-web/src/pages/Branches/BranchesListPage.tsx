import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Branch } from '../../api/types';
import { useDebounced, usePagedList } from '../../hooks/usePagedList';
import { Pager } from '../../components/Pager';
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
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>('ALL');
  // BUG-047: searching, filtering and paging all happen on the server. Search also matches the
  // restaurant's name, so there is no need to load every restaurant into a dropdown.
  const debouncedSearch = useDebounced(search);
  const list = usePagedList<Branch, { statusCounts: { ACTIVE: number; INACTIVE: number } }>(
    '/api/v1/branches',
    { q: debouncedSearch, status: statusFilter },
    24
  );
  const { loading, error } = list;
  const load = list.reload;
  const branches: Branch[] | null = list.extra ? list.items : null;
  const filteredBranches = list.items;

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

  const activeCount = list.extra?.statusCounts.ACTIVE ?? 0;
  const inactiveCount = list.extra?.statusCounts.INACTIVE ?? 0;

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
      // One request for the whole selection, not one per branch.
      const res = await api.post<{ updated: number; skipped: number }>('/api/v1/branches/bulk-status', {
        ids,
        status: actionPath === 'activate' ? 'ACTIVE' : 'INACTIVE'
      });
      const verb = actionPath === 'activate' ? 'activated' : 'deactivated';
      showToast(res.skipped > 0 ? `${res.updated} branch(es) ${verb}, ${res.skipped} already were` : `${res.updated} branch(es) ${verb}`);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Bulk action failed');
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, color: 'var(--jv-text)', letterSpacing: '-0.02em' }}>
            Branches
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13.5, color: 'var(--jv-text-muted)', marginTop: 4 }}>
            Search and audit every branch across all restaurants. Day-to-day branch management lives inside each restaurant.
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
              { id: 'ALL', label: 'All', count: list.extra ? activeCount + inactiveCount : undefined },
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

        {(search || statusFilter !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, color: 'var(--jv-accent-text)', fontWeight: 600 }}
            onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--jv-text-secondary)' }}>
          {list.total} branch{list.total === 1 ? '' : 'es'}
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
      {loading && !list.extra && (
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
            title={!search && statusFilter === 'ALL' ? 'No branches yet' : 'No matching branches found'}
            description={
              !search && statusFilter === 'ALL'
                ? 'Every restaurant gets a primary branch on creation, and additional branches can be added here.'
                : 'Try clearing your search or status filter to view other branches.'
            }
            action={
              search || statusFilter !== 'ALL' ? (
                <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}>
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

      {list.extra && list.total > 0 && (
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} totalPages={list.totalPages} loading={loading} onPage={list.setPage} />
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
              : `Deactivating branch "${confirmTarget.branch.name}" locks the terminals assigned to it until it is activated again.`
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
