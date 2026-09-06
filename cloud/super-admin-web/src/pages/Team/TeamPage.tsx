import React, { useEffect, useState, useMemo } from 'react';
import { api, ApiError } from '../../api/client';
import type { PlatformTeamUser, PlatformRole } from '../../api/types';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  BadgeTone,
  EmptyState,
  ErrorState,
  SearchBar,
  FilterTabs,
  ConfirmModal,
  Modal
} from '../../components/ui';
import { InviteTeammateModal } from './InviteTeammateModal';
import { useAuth } from '../../auth/AuthContext';
import {
  Users,
  UserPlus,
  RotateCcw
} from 'lucide-react';
import '../../components/shared.css';

const ROLE_META: Record<
  PlatformRole,
  { label: string; tone: BadgeTone; desc: string }
> = {
  PLATFORM_OWNER: {
    label: 'Platform Owner',
    tone: 'gold',
    desc: 'Ultimate platform authority & root management'
  },
  SUPER_ADMIN: {
    label: 'Super Admin',
    tone: 'accent',
    desc: 'Full administrative access across all modules'
  },
  PLATFORM_OPS: {
    label: 'Platform Ops',
    tone: 'gold',
    desc: 'Manages hardware, releases, and edge sync'
  },
  SUPPORT_ADMIN: {
    label: 'Support Admin',
    tone: 'accent',
    desc: 'Diagnostics, session recovery, and customer support'
  },
  FINANCE_ADMIN: {
    label: 'Finance Admin',
    tone: 'success',
    desc: 'Subscription plans, billing, and invoice auditing'
  },
  READ_ONLY: {
    label: 'Read-Only Auditor',
    tone: 'neutral',
    desc: 'Telemetry and reports visibility without mutations'
  }
};

export function TeamPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<PlatformTeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [userToToggleStatus, setUserToToggleStatus] = useState<PlatformTeamUser | null>(null);
  const [userToChangeRole, setUserToChangeRole] = useState<PlatformTeamUser | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<PlatformRole>('SUPER_ADMIN');
  const [actionInProgress, setActionInProgress] = useState(false);

  const canManage = hasPermission('SUPER_ADMIN');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function loadUsers() {
    setLoading(true);
    api
      .get<PlatformTeamUser[]>('/api/v1/platform-users')
      .then((data) => {
        setUsers(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform team members'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [users, roleFilter, search]);

  // Counts for Stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'ACTIVE').length;
    const pending = users.filter((u) => u.status === 'PENDING_ACTIVATION').length;
    const superAdmins = users.filter((u) => u.role === 'SUPER_ADMIN' || u.role === 'PLATFORM_OWNER').length;
    return { total, active, pending, superAdmins };
  }, [users]);

  async function handleToggleStatus() {
    if (!userToToggleStatus) return;
    setActionInProgress(true);
    const isEnabling = userToToggleStatus.status === 'DISABLED';
    const endpoint = `/api/v1/platform-users/${userToToggleStatus.id}/${isEnabling ? 'enable' : 'disable'}`;

    try {
      await api.patch(endpoint);
      showToast(`User ${userToToggleStatus.fullName} ${isEnabling ? 'enabled' : 'disabled'}`);
      setUserToToggleStatus(null);
      loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Status update failed');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleChangeRole(e: React.FormEvent) {
    e.preventDefault();
    if (!userToChangeRole) return;
    setActionInProgress(true);

    try {
      await api.patch(`/api/v1/platform-users/${userToChangeRole.id}/role`, {
        role: newSelectedRole
      });
      showToast(`Role updated for ${userToChangeRole.fullName}`);
      setUserToChangeRole(null);
      loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Role change failed');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleResendInvite(u: PlatformTeamUser) {
    setActionInProgress(true);
    try {
      const res = await api.post<{ emailSent: boolean; activationUrl?: string }>(
        `/api/v1/platform-users/${u.id}/resend-invite`
      );
      if (res.emailSent) {
        showToast(`Invitation resent to ${u.email}`);
      } else if (res.activationUrl) {
        navigator.clipboard.writeText(res.activationUrl);
        showToast('Activation link copied to clipboard!');
      } else {
        showToast('Invitation re-generated successfully');
      }
      loadUsers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to resend invite');
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <div className="page-container">
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: '#0B253A',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 9999,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {toast}
        </div>
      )}

      <PageHeader
        title="Platform Team & RBAC"
        subtitle="Manage administrators, operators, and platform roles across the JAMANVAAR control plane"
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setInviteModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <UserPlus className="w-4 h-4" />
              Invite Teammate
            </Button>
          ) : undefined
        }
      />

      {/* KPI Stats Strip */}
      <div className="kpi-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', textTransform: 'uppercase' }}>
            Total Teammates
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--jv-text)', marginTop: 4 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>Platform accounts</div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', textTransform: 'uppercase' }}>
            Active Admins
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {stats.active}
          </div>
          <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>Enabled accounts</div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', textTransform: 'uppercase' }}>
            Pending Activation
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {stats.pending}
          </div>
          <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>Awaiting first login</div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', textTransform: 'uppercase' }}>
            Super Administrators
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--jv-primary)', marginTop: 4 }}>
            {stats.superAdmins}
          </div>
          <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', marginTop: 2 }}>Root & Super Admin tier</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <FilterTabs
          options={[
            { id: 'ALL', label: `All (${users.length})` },
            { id: 'SUPER_ADMIN', label: 'Super Admins' },
            { id: 'PLATFORM_OPS', label: 'Operations' },
            { id: 'SUPPORT_ADMIN', label: 'Support' },
            { id: 'FINANCE_ADMIN', label: 'Finance' },
            { id: 'READ_ONLY', label: 'Auditors' }
          ]}
          value={roleFilter}
          onChange={setRoleFilter}
        />

        <div style={{ width: 280 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search teammate by name or email…"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-muted)' }}>
          Loading platform team…
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={loadUsers} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8 text-slate-400" />}
          title="No team members found"
          description={search || roleFilter !== 'ALL' ? 'Try adjusting your search or role filters.' : 'No team members registered yet.'}
          action={
            canManage ? (
              <Button variant="primary" onClick={() => setInviteModalOpen(true)}>
                Invite First Teammate
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Teammate</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Invited / Created</th>
                  {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const roleMeta = ROLE_META[u.role] || {
                    label: u.role,
                    tone: 'neutral' as const,
                    desc: ''
                  };
                  const isSelf = currentUser?.id === u.id;

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: '#0B253A',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 700
                            }}
                          >
                            {u.fullName?.[0]?.toUpperCase() ?? 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--jv-text)' }}>
                              {u.fullName} {isSelf && <span style={{ fontSize: 11, color: 'var(--jv-accent)', marginLeft: 4 }}>(You)</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--jv-text-muted)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div>
                          <Badge tone={roleMeta.tone}>{roleMeta.label}</Badge>
                          <div style={{ fontSize: 11, color: 'var(--jv-text-muted)', marginTop: 2 }}>
                            {roleMeta.desc}
                          </div>
                        </div>
                      </td>

                      <td>
                        {u.status === 'ACTIVE' ? (
                          <Badge tone="success">Active</Badge>
                        ) : u.status === 'PENDING_ACTIVATION' ? (
                          <Badge tone="warning">Pending Activation</Badge>
                        ) : (
                          <Badge tone="error">Disabled</Badge>
                        )}
                      </td>

                      <td style={{ fontSize: 13, color: 'var(--jv-text-secondary)' }}>
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>

                      <td style={{ fontSize: 13, color: 'var(--jv-text-secondary)' }}>
                        {u.invitedAt
                          ? `Invited ${new Date(u.invitedAt).toLocaleDateString()}`
                          : new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {canManage && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {u.status === 'PENDING_ACTIVATION' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendInvite(u)}
                                disabled={actionInProgress}
                                title="Resend activation invite email/link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Resend
                              </Button>
                            )}

                            {!isSelf && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUserToChangeRole(u);
                                    setNewSelectedRole(u.role);
                                  }}
                                  disabled={actionInProgress}
                                >
                                  Role
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setUserToToggleStatus(u)}
                                  disabled={actionInProgress}
                                  style={{
                                    color: u.status === 'DISABLED' ? '#059669' : '#dc2626'
                                  }}
                                >
                                  {u.status === 'DISABLED' ? 'Enable' : 'Disable'}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <InviteTeammateModal
          onClose={() => setInviteModalOpen(false)}
          onSuccess={() => {
            showToast('Invitation processed');
            loadUsers();
          }}
        />
      )}

      {/* Change Role Modal */}
      {userToChangeRole && (
        <Modal
          title={`Update Role for ${userToChangeRole.fullName}`}
          onClose={() => setUserToChangeRole(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setUserToChangeRole(null)} disabled={actionInProgress}>
                Cancel
              </Button>
              <Button variant="primary" type="button" onClick={handleChangeRole} disabled={actionInProgress}>
                Save Role
              </Button>
            </>
          }
        >
          <form onSubmit={handleChangeRole} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(ROLE_META).map(([rKey, rVal]) => {
                if (rKey === 'PLATFORM_OWNER' && currentUser?.role !== 'PLATFORM_OWNER') {
                  return null; // Only owner can promote to owner
                }
                return (
                  <label
                    key={rKey}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${newSelectedRole === rKey ? '#0B253A' : '#e2e8f0'}`,
                      background: newSelectedRole === rKey ? '#f8fafc' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="updateRoleSelect"
                      value={rKey}
                      checked={newSelectedRole === rKey}
                      onChange={() => setNewSelectedRole(rKey as PlatformRole)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{rVal.label}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{rVal.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm Disable / Enable Modal */}
      {userToToggleStatus && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setUserToToggleStatus(null)}
          onConfirm={handleToggleStatus}
          title={userToToggleStatus.status === 'DISABLED' ? 'Enable Administrator' : 'Disable Administrator'}
          message={
            userToToggleStatus.status === 'DISABLED'
              ? `Are you sure you want to re-enable access for ${userToToggleStatus.fullName}? They will regain access immediately.`
              : `Are you sure you want to disable ${userToToggleStatus.fullName}? Their active sessions will be terminated and they will not be able to log in.`
          }
          confirmLabel={userToToggleStatus.status === 'DISABLED' ? 'Enable Account' : 'Disable Account'}
          tone={userToToggleStatus.status === 'DISABLED' ? 'primary' : 'danger'}
        />
      )}
    </div>
  );
}
