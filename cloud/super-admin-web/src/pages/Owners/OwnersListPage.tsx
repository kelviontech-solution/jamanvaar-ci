import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TenantUser } from '../../api/types';
import {
  Badge,
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
import { Users, Send, CheckCircle2, UserCheck, ShieldAlert } from 'lucide-react';
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
      await api.post('/api/v1/support/resend-invite', {
        userId: ownerId,
        reason: 'Super Admin owner credentials invitation'
      });
      showToast(`Invitation resent to ${email}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to resend invite');
    }
  }

  const activeCount = useMemo(() => owners?.filter((o) => o.status === 'ACTIVE').length || 0, [owners]);
  const pendingCount = useMemo(() => owners?.filter((o) => o.status === 'PENDING_ACTIVATION').length || 0, [owners]);
  const disabledCount = useMemo(() => owners?.filter((o) => o.status === 'DISABLED').length || 0, [owners]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Owners</h1>
          <p className="page-subtitle">
            Master tenant users with the OWNER role — strictly isolated from platform Super Admin privileges.
          </p>
        </div>
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
