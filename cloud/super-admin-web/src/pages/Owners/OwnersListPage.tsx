import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TenantUser } from '../../api/types';
import {
  Badge,
  BulkActionsBar,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  FilterTabs,
  Modal,
  SearchBar,
  SkeletonTable,
  statusTone
} from '../../components/ui';
import { Users, Send, CheckCircle2, UserCheck, ShieldAlert, Download } from 'lucide-react';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';

type OwnerStatus = 'ALL' | 'ACTIVE' | 'DISABLED' | 'PENDING_ACTIVATION';

export function OwnersListPage() {
  const [owners, setOwners] = useState<TenantUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search and Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OwnerStatus>('ALL');

  // Selected owner for detail modal
  const [detailOwner, setDetailOwner] = useState<TenantUser | null>(null);

  // Confirm Modal state
  const [confirmTarget, setConfirmTarget] = useState<{
    owner: TenantUser;
    action: 'activate' | 'suspend';
  } | null>(null);
  const [pendingAction, setPendingAction] = useState(false);

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Owners</h1>
          <p className="page-subtitle">
            Master tenant users with the OWNER role — strictly isolated from platform Super Admin privileges.
          </p>
        </div>
        <Button variant="ghost" onClick={handleExportCsv} disabled={!owners || owners.length === 0}>
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
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
          placeholder="Search by owner name, email, phone, or restaurant…"
          width="340px"
        />

        <FilterTabs<OwnerStatus>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Owners', count: owners?.length },
            { id: 'ACTIVE', label: 'Active', count: activeCount },
            { id: 'PENDING_ACTIVATION', label: 'Pending Invite', count: pendingCount },
            { id: 'DISABLED', label: 'Suspended', count: disabledCount }
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
          {filteredOwners.length} of {owners?.length ?? 0} owners
        </span>
      </div>

      {loading && !owners && <SkeletonTable rows={6} cols={6} />}

      <BulkActionsBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button size="sm" variant="primary" disabled={bulkPending} onClick={() => handleBulkAction('activate')}>
          Activate Selected
        </Button>
        <Button size="sm" variant="danger" disabled={bulkPending} onClick={() => handleBulkAction('suspend')}>
          Suspend Selected
        </Button>
      </BulkActionsBar>

      {owners && (
        <Card>
          {filteredOwners.length === 0 ? (
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
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filteredOwners.length > 0 && selectedIds.size === filteredOwners.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Owner</th>
                    <th>Restaurant</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOwners.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelected(o.id)} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                          onClick={() => setDetailOwner(o)}
                        >
                          <strong style={{ fontSize: 14 }}>{o.fullName}</strong>
                          <div className="muted mono" style={{ fontSize: 11 }}>{o.email}</div>
                        </button>
                      </td>
                      <td>
                        {o.restaurant ? (
                          <Link to={`/restaurants/${o.restaurant.id}`} className="table-link" style={{ fontWeight: 600 }}>
                            {o.restaurant.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{o.phone || '—'}</td>
                      <td>
                        <Badge tone={statusTone(o.status)} pulse={o.status === 'ACTIVE'}>{o.status}</Badge>
                      </td>
                      <td>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                      <td>
                        <div className="row-actions">
                          <Button size="sm" variant="ghost" onClick={() => setDetailOwner(o)}>
                            Details
                          </Button>
                          {o.status === 'PENDING_ACTIVATION' ? (
                            <Button size="sm" variant="accent" onClick={() => handleResendInvite(o.id, o.email)}>
                              <Send className="w-3 h-3" />
                              <span>Resend Invite</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant={o.status === 'DISABLED' ? 'primary' : 'danger'}
                              onClick={() => setConfirmTarget({
                                owner: o,
                                action: o.status === 'DISABLED' ? 'activate' : 'suspend'
                              })}
                            >
                              {o.status === 'DISABLED' ? 'Activate' : 'Suspend'}
                            </Button>
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

      {/* Owner Detail Modal */}
      {detailOwner && (
        <Modal
          title={`Owner Profile — ${detailOwner.fullName}`}
          onClose={() => setDetailOwner(null)}
          footer={
            <Button variant="ghost" onClick={() => setDetailOwner(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <dl className="detail-list">
              <dt>Full Name</dt>
              <dd style={{ fontWeight: 700 }}>{detailOwner.fullName}</dd>
              <dt>Email Address</dt>
              <dd className="mono">{detailOwner.email}</dd>
              <dt>Contact Phone</dt>
              <dd>{detailOwner.phone || '—'}</dd>
              <dt>Account Status</dt>
              <dd><Badge tone={statusTone(detailOwner.status)}>{detailOwner.status}</Badge></dd>
              <dt>Associated Restaurant</dt>
              <dd>
                {detailOwner.restaurant ? (
                  <Link to={`/restaurants/${detailOwner.restaurant.id}`} style={{ fontWeight: 700, color: 'var(--jv-accent)' }}>
                    {detailOwner.restaurant.name} →
                  </Link>
                ) : 'None'}
              </dd>
              <dt>Created Timestamp</dt>
              <dd>{new Date(detailOwner.createdAt).toLocaleString('en-IN')}</dd>
            </dl>

            <div style={{ borderTop: '1px solid var(--jv-border)', paddingTop: 14, marginTop: 6, display: 'flex', gap: 10 }}>
              <Button
                variant="accent"
                onClick={() => {
                  handleResendInvite(detailOwner.id, detailOwner.email);
                }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Resend Activation Credentials</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Modal */}
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
