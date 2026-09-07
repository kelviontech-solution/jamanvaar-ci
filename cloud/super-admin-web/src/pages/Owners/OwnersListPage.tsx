import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TenantUser } from '../../api/types';
import {
  Badge,
  BulkActionsBar,
  Button,
  ConfirmModal,
  EmptyState,
  statusTone
} from '../../components/ui';
import {
  Users,
  Send,
  CheckCircle2,
  ShieldAlert,
  Download,
  Mail,
  Phone,
  Store,
  ArrowRight,
  Search,
  X,
  Building2,
  MoreVertical
} from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/card-grid.css';
import '../../components/shared.css';

function getAvatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `mgmt-avatar-c${Math.abs(hash) % 8}`;
}

type OwnerStatus = 'ALL' | 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';

export function OwnersListPage() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState<TenantUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OwnerStatus>('ALL');

  const [confirmTarget, setConfirmTarget] = useState<{
    owner: TenantUser;
    action: 'activate' | 'suspend';
  } | null>(null);
  const [pendingAction, setPendingAction] = useState(false);

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
      .get<TenantUser[]>('/api/v1/owners')
      .then((data) => {
        setOwners(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load owners'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filteredOwners = useMemo(() => {
    if (!owners) return [];
    return owners.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = o.fullName.toLowerCase().includes(q);
        const matchEmail = o.email.toLowerCase().includes(q);
        const matchPhone = (o.phone || '').toLowerCase().includes(q);
        const matchRest = (o.restaurant?.name || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPhone && !matchRest) return false;
      }
      return true;
    });
  }, [owners, statusFilter, search]);

  async function handleExecuteConfirm() {
    if (!confirmTarget) return;
    setPendingAction(true);
    try {
      await api.patch(`/api/v1/owners/${confirmTarget.owner.id}/${confirmTarget.action}`);
      showToast(`Owner account ${confirmTarget.action === 'activate' ? 'activated' : 'suspended'}`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setPendingAction(false);
    }
  }

  async function handleResendInvite(ownerId: string, email: string) {
    try {
      const res = await api.post<{ emailSent: boolean; activationToken: string }>('/api/v1/support/resend-invite', {
        userId: ownerId,
        reason: 'Super Admin owner credentials invitation'
      });
      if (res.emailSent) {
        showToast(`New invitation emailed to ${email}`);
      } else {
        navigator.clipboard?.writeText(res.activationToken).catch(() => {});
        showToast(`Email could not be sent — new token copied to clipboard, relay it to ${email} manually`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to resend invite');
    }
  }

  const activeCount = useMemo(() => owners?.filter((o) => o.status === 'ACTIVE').length || 0, [owners]);
  const pendingCount = useMemo(() => owners?.filter((o) => o.status === 'PENDING_ACTIVATION').length || 0, [owners]);
  const disabledCount = useMemo(() => owners?.filter((o) => o.status === 'DISABLED').length || 0, [owners]);

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
      prev.size === filteredOwners.length ? new Set() : new Set(filteredOwners.map((o) => o.id))
    );
  }

  async function handleBulkAction(actionPath: 'activate' | 'suspend') {
    const ids = Array.from(selectedIds);
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api.patch(`/api/v1/owners/${id}/${actionPath}`)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      showToast(
        failed === 0
          ? `${ids.length} owner account(s) ${actionPath === 'activate' ? 'activated' : 'suspended'}`
          : `${ids.length - failed} of ${ids.length} succeeded — ${failed} failed`
      );
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkPending(false);
    }
  }

  function handleExportCsv() {
    exportRowsToCsv(`jamanvaar_owners_${new Date().toISOString().slice(0, 10)}.csv`, filteredOwners, [
      { header: 'Full Name', value: (o) => o.fullName },
      { header: 'Email', value: (o) => o.email },
      { header: 'Phone', value: (o) => o.phone || '' },
      { header: 'Status', value: (o) => o.status },
      { header: 'Restaurant', value: (o) => o.restaurant?.name || '' },
      { header: 'Registered', value: (o) => new Date(o.createdAt).toISOString().slice(0, 10) }
    ]);
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 800, color: '#0B253A', letterSpacing: '-0.02em' }}>
            Restaurant Owners
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13.5, color: '#64748B', marginTop: 4 }}>
            Master tenant users with the OWNER role — strictly isolated from platform Super Admin privileges.
          </p>
        </div>
        <Button variant="ghost" onClick={handleExportCsv} disabled={!owners || owners.length === 0}>
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </Button>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>Retry</button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '12px 18px', background: 'var(--jv-surface)', color: 'var(--jv-text)', border: '1px solid var(--jv-border)', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="mgmt-toolbar">
        {/* Search */}
        <div style={{ position: 'relative', width: 320 }}>
          <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            type="text"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, restaurant…"
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
              { id: 'ALL', label: 'All', count: owners?.length },
              { id: 'ACTIVE', label: 'Active', count: activeCount },
              { id: 'PENDING_ACTIVATION', label: 'Pending', count: pendingCount },
              { id: 'DISABLED', label: 'Suspended', count: disabledCount }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id)}
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
            style={{ fontSize: 12, color: 'var(--jv-accent)', fontWeight: 600 }}
            onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--jv-text-secondary)' }}>
          {filteredOwners.length} of {owners?.length ?? 0}
        </span>
      </div>

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="primary" disabled={bulkPending} onClick={() => handleBulkAction('activate')}>
          Activate Selected
        </Button>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={() => handleBulkAction('suspend')}>
          Suspend Selected
        </Button>
      </BulkActionsBar>

      {/* Loading skeletons */}
      {loading && !owners && (
        <div className="mgmt-card-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="mgmt-card-skeleton" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {owners && filteredOwners.length === 0 && (
        <div style={{ background: 'var(--jv-surface-card)', border: '1px solid var(--jv-border)', borderRadius: 14, padding: 40 }}>
          <EmptyState
            icon={<Users className="w-6 h-6 text-slate-400" />}
            title={owners.length === 0 ? 'No owners registered' : 'No matching owners found'}
            description={
              owners.length === 0
                ? 'Owners are automatically provisioned when you onboard a restaurant.'
                : 'Try clearing your search or switching status tabs to inspect other records.'
            }
            action={
              owners.length > 0 ? (
                <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}>
                  Reset Filters
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Owner Cards Grid */}
      {owners && filteredOwners.length > 0 && (
        <div className="mgmt-card-grid">
          {filteredOwners.map((o) => {
            const isActive = o.status === 'ACTIVE';
            const isPending = o.status === 'PENDING_ACTIVATION';
            const initials = o.fullName
              .split(' ')
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase() || 'O';
            const isMenuOpen = activeMenuId === o.id;
            const avatarClass = getAvatarClass(o.fullName);

            return (
              <div
                key={o.id}
                className={`mgmt-card ${selectedIds.has(o.id) ? 'is-selected' : ''} ${o.status === 'DISABLED' ? 'is-suspended' : ''}`}
                onClick={() => navigate(`/owners/${o.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/owners/${o.id}`)}
              >
                {/* ── TOP BAR: Checkbox / Role & Status / Actions ── */}
                <div className="mgmt-card-header-bar" onClick={(e) => e.stopPropagation()}>
                  <div className="mgmt-card-header-left">
                    <input
                      type="checkbox"
                      className="mgmt-card-checkbox"
                      checked={selectedIds.has(o.id)}
                      onClick={() => toggleSelected(o.id)}
                      onChange={() => {}}
                      title="Select owner"
                    />
                    <span className="mgmt-card-id-pill" title="Role">
                      {o.role}
                    </span>
                  </div>

                  <div className="mgmt-card-header-right">
                    <Badge tone={statusTone(o.status)} pulse={isActive}>
                      {o.status === 'PENDING_ACTIVATION' ? 'PENDING' : o.status}
                    </Badge>

                    <div className="more-actions-menu-container">
                      <button
                        type="button"
                        className={`mgmt-card-corner-btn ${isMenuOpen ? 'is-active' : ''}`}
                        title="More actions"
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : o.id); }}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div className="actions-dropdown-menu">
                          <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/owners/${o.id}`); }}>
                            <Users className="w-3.5 h-3.5 text-slate-500" /><span>Owner Profile</span>
                          </button>
                          {o.restaurant && (
                            <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); navigate(`/restaurants/${o.restaurant!.id}`); }}>
                              <Store className="w-3.5 h-3.5 text-slate-500" /><span>Assigned Restaurant</span>
                            </button>
                          )}
                          {isPending && (
                            <button type="button" className="actions-dropdown-item" onClick={() => { setActiveMenuId(null); handleResendInvite(o.id, o.email); }}>
                              <Send className="w-3.5 h-3.5 text-slate-500" /><span>Resend Invite</span>
                            </button>
                          )}
                          <div className="actions-dropdown-divider" />
                          <button
                            type="button"
                            className={`actions-dropdown-item ${isActive ? 'is-danger' : ''}`}
                            onClick={() => {
                              setActiveMenuId(null);
                              setConfirmTarget({ owner: o, action: isActive ? 'suspend' : 'activate' });
                            }}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>{isActive ? 'Suspend Owner' : 'Reactivate Owner'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── IDENTITY ROW: Avatar + Names + Restaurant Tag ── */}
                <div className="mgmt-card-identity">
                  <div className={`mgmt-card-avatar ${avatarClass} ${o.status === 'DISABLED' ? 'is-suspended' : ''}`}>
                    {initials}
                  </div>
                  <div className="mgmt-card-identity-text">
                    <p className="mgmt-card-name" title={o.fullName}>{o.fullName}</p>
                    {o.restaurant && (
                      <div className="mgmt-card-plan-wrap">
                        <span className="mgmt-card-plan-badge" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                          <Store style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />
                          {o.restaurant.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── INFO ROW: Email + Phone + Joined Date ── */}
                <div className="mgmt-card-info-row">
                  <div className="mgmt-card-info-item">
                    <Mail className="w-3 h-3" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: 11 }}>{o.email}</span>
                  </div>
                  {o.phone && (
                    <div className="mgmt-card-info-item">
                      <Phone className="w-3 h-3" />
                      <span>{o.phone}</span>
                    </div>
                  )}
                  <div className="mgmt-card-info-item">
                    <Building2 className="w-3 h-3" />
                    <span>Joined {new Date(o.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* ── FOOTER: CTA + Status / Action ── */}
                <div className="mgmt-card-footer" onClick={(e) => e.stopPropagation()}>
                  <span className="mgmt-card-cta">
                    <Users className="w-3.5 h-3.5" />
                    Manage Owner
                    <span className="mgmt-card-cta-arrow">
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--jv-text-muted)', fontWeight: 500 }}>
                    {new Date(o.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={confirmTarget.action === 'activate' ? 'Activate Owner Account?' : 'Suspend Owner Account?'}
          message={
            confirmTarget.action === 'activate'
              ? `Restore full access for ${confirmTarget.owner.fullName} (${confirmTarget.owner.email})?`
              : `Suspending ${confirmTarget.owner.fullName} will prevent them from signing in to Restaurant Admin.`
          }
          tone={confirmTarget.action === 'activate' ? 'primary' : 'danger'}
          isPending={pendingAction}
          onConfirm={handleExecuteConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
