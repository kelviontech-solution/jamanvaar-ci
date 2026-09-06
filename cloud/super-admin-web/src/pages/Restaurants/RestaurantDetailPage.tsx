import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type {
  AuditLogPage,
  RestaurantDetail,
  Invoice,
  RestaurantDiagnostics,
  Plan,
  Backup
} from '../../api/types';
import { ENTITLEMENT_LABELS, type EntitlementKey } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  SkeletonCard,
  SkeletonTable,
  statusTone
} from '../../components/ui';
import '../../components/shared.css';
import './restaurants.css';
import { EditRestaurantModal } from './EditRestaurantModal';
import { CreateBranchModal } from '../Branches/CreateBranchModal';
import { GenerateActivationKeyModal } from '../ActivationKeys/GenerateActivationKeyModal';
import { AssignSubscriptionModal } from '../Subscriptions/AssignSubscriptionModal';
import { LicenseCertificatePanel } from './LicenseCertificatePanel';
import {
  Store,
  Users,
  Building2,
  Repeat,
  Package,
  ShieldCheck,
  Laptop2,
  Receipt,
  FileText,
  LifeBuoy,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  RefreshCw,
  UserRound,
  Mail,
  Phone
} from 'lucide-react';

type Tab =
  | 'overview'
  | 'owner'
  | 'branches'
  | 'subscription'
  | 'plan'
  | 'entitlements'
  | 'devices'
  | 'billing'
  | 'activity'
  | 'support';

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: Store },
  { key: 'owner', label: 'Owner & Users', icon: Users },
  { key: 'branches', label: 'Branches', icon: Building2 },
  { key: 'subscription', label: 'Subscription', icon: Repeat },
  { key: 'plan', label: 'Plan Quotas', icon: Package },
  { key: 'entitlements', label: 'Feature Entitlements', icon: ShieldCheck },
  { key: 'devices', label: 'Devices & Keys', icon: Laptop2 },
  { key: 'billing', label: 'Billing & Invoices', icon: Receipt },
  { key: 'activity', label: 'Audit Logs', icon: FileText },
  { key: 'support', label: 'Support & Diagnostics', icon: LifeBuoy }
];

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'edit' | 'branch' | 'activation' | 'subscription' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Data for secondary tabs
  const [activity, setActivity] = useState<AuditLogPage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<RestaurantDiagnostics | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);

  // Confirm Modal state for actions
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: React.ReactNode;
    tone?: 'danger' | 'primary';
    action: () => Promise<void>;
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<RestaurantDetail>(`/api/v1/restaurants/${id}`)
      .then((res) => {
        setRestaurant(res);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 404 ? 'Restaurant not found' : 'Failed to load restaurant')
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  // Lazy load tab data
  useEffect(() => {
    if (!id) return;
    if (tab === 'activity' && !activity) {
      api.get<AuditLogPage>(`/api/v1/audit-logs?restaurantId=${id}&limit=50`).then(setActivity).catch(() => {});
    }
    if (tab === 'billing' && !invoices) {
      api.get<Invoice[]>(`/api/v1/invoices?restaurantId=${id}`).then(setInvoices).catch(() => {});
    }
    if (tab === 'support' && !diagnostics) {
      api.get<RestaurantDiagnostics>(`/api/v1/support/diagnostics/${id}`).then(setDiagnostics).catch(() => {});
    }
    if (tab === 'devices' && !backups) {
      api.get<Backup[]>(`/api/v1/restaurants/${id}/backups`).then(setBackups).catch(() => setBackups([]));
    }
  }, [tab, id, activity, invoices, diagnostics, backups]);

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setActionPending(true);
    try {
      await confirmAction.action();
      setConfirmAction(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  function handleToggleStatus() {
    if (!restaurant) return;
    const isAct = restaurant.status === 'ACTIVE';
    setConfirmAction({
      title: isAct ? 'Suspend Restaurant Account?' : 'Reactivate Restaurant Account?',
      message: isAct
        ? `Are you sure you want to suspend "${restaurant.name}"? Cloud sync and ordering will pause for this tenant.`
        : `Reactivate "${restaurant.name}" to restore full SaaS services immediately.`,
      tone: isAct ? 'danger' : 'primary',
      action: async () => {
        const action = isAct ? 'suspend' : 'reactivate';
        await api.patch(`/api/v1/restaurants/${restaurant.id}/${action}`);
        showToast(isAct ? 'Restaurant suspended' : 'Restaurant activated');
      }
    });
  }

  function handleToggleBranch(branchId: string, current: string, branchName: string) {
    const isAct = current === 'ACTIVE';
    setConfirmAction({
      title: isAct ? `Deactivate Branch ${branchName}?` : `Activate Branch ${branchName}?`,
      message: isAct
        ? `Terminals in branch "${branchName}" will be prevented from taking new cloud orders.`
        : `Branch "${branchName}" will be restored to active operational status.`,
      tone: isAct ? 'danger' : 'primary',
      action: async () => {
        const action = isAct ? 'deactivate' : 'activate';
        await api.patch(`/api/v1/branches/${branchId}/${action}`);
        showToast(`Branch ${isAct ? 'deactivated' : 'activated'}`);
      }
    });
  }

  function handleRevokeActivationKey(keyId: string, code: string) {
    setConfirmAction({
      title: 'Revoke Activation Key?',
      message: `Revoking key "${code}" will immediately invalidate it. It can never be used to activate another terminal.`,
      tone: 'danger',
      action: async () => {
        await api.patch(`/api/v1/activation-keys/${keyId}/revoke`);
        showToast('Activation key revoked');
      }
    });
  }

  function handleRevokeDevice(deviceId: string, type: string) {
    setConfirmAction({
      title: `Revoke Terminal Device?`,
      message: `Device (${type}) will be unlinked and unable to authenticate or sync.`,
      tone: 'danger',
      action: async () => {
        await api.patch(`/api/v1/devices/${deviceId}/revoke`);
        showToast('Device revoked successfully');
      }
    });
  }

  async function handleAllotPlan(targetTier: 'CORE' | 'PRO') {
    if (!restaurant) return;
    try {
      const plans = await api.get<Plan[]>('/api/v1/plans');
      const targetPlan = plans.find((p) => p.tier === targetTier && p.status === 'ACTIVE') || plans.find((p) => p.tier === targetTier);
      if (!targetPlan) {
        showToast(`Error: ${targetTier} plan not found in plan catalog.`);
        return;
      }

      const activeSub = restaurant.subscriptions[0];
      if (activeSub) {
        await api.patch(`/api/v1/subscriptions/${activeSub.id}/change-plan`, { planId: targetPlan.id });
      } else {
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        await api.post('/api/v1/subscriptions', {
          restaurantId: restaurant.id,
          planId: targetPlan.id,
          status: 'ACTIVE',
          expiresAt
        });
      }

      showToast(`Successfully allotted ${targetPlan.name} (₹${targetPlan.priceMonthly / 100}/mo)!`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to allot plan');
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/restaurants" className="back-link">
          ← Back to restaurants
        </Link>
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  if (loading || !restaurant) {
    return (
      <div>
        <Link to="/restaurants" className="back-link">
          ← Back to restaurants
        </Link>
        <div style={{ marginTop: 20 }}>
          <SkeletonCard rows={3} />
          <div style={{ marginTop: 20 }}>
            <SkeletonTable rows={4} cols={5} />
          </div>
        </div>
      </div>
    );
  }

  const owner = restaurant.users.find((u) => u.role === 'OWNER');
  // `subscriptions` is ordered by createdAt desc, so [0] is only the MOST
  // RECENTLY CREATED row — not necessarily the currently active one (a
  // restaurant with an EXPIRED sub sitting after a still-live older ACTIVE
  // one, or a SUSPENDED newest row, would otherwise be shown as "active").
  // Mirrors the same real-status check cloud/api's own getEntitlements uses.
  const now = new Date();
  const activeSub =
    restaurant.subscriptions.find(
      (s) => (s.status === 'ACTIVE' || s.status === 'TRIAL') && new Date(s.expiresAt) > now
    ) ?? restaurant.subscriptions[0];
  const effectiveTier = (activeSub?.plan.tier as 'CORE' | 'PRO') || 'CORE';
  const isPro = effectiveTier === 'PRO';

  return (
    <div>
      <Link to="/restaurants" className="back-link">
        ← Back to restaurants
      </Link>

      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">{restaurant.name}</h1>
            <Badge tone={statusTone(restaurant.status)} pulse={restaurant.status === 'ACTIVE'}>
              {restaurant.status}
            </Badge>
            <Badge tone={isPro ? 'gold' : 'neutral'}>
              {isPro ? 'PRO PLAN (₹7,000)' : 'CORE PLAN (₹5,000)'}
            </Badge>
          </div>
          <p className="page-subtitle">
            {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')} • {restaurant.branches.length} Branch{restaurant.branches.length > 1 ? 'es' : ''} • {restaurant.devices.length} Registered Terminal{restaurant.devices.length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="ghost" onClick={() => setModal('edit')}>
            Edit Restaurant
          </Button>
          <Button
            variant={restaurant.status === 'ACTIVE' ? 'danger' : 'primary'}
            onClick={handleToggleStatus}
            disabled={actionPending}
          >
            {restaurant.status === 'ACTIVE' ? 'Suspend Restaurant' : 'Reactivate Restaurant'}
          </Button>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* 10-Tab Navigation Bar */}
      <div className="tabs" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {TABS.map((t) => {
          const IconComponent = t.icon;
          return (
            <button
              key={t.key}
              className={`tab-btn${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconComponent className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="detail-grid">
          <Card className="detail-card">
            <div className="detail-card-title">Commercial &amp; Legal Profile</div>
            <dl className="detail-list">
              <dt>Legal Name</dt>
              <dd>{restaurant.legalName || '—'}</dd>
              <dt>GSTIN</dt>
              <dd className="mono">{restaurant.gstin || '—'}</dd>
              <dt>FSSAI</dt>
              <dd className="mono">{restaurant.fssaiNumber || '—'}</dd>
              <dt>Address</dt>
              <dd>{restaurant.address || '—'}</dd>
              <dt>City / State</dt>
              <dd>{[restaurant.city, restaurant.state].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Timezone</dt>
              <dd>{restaurant.timezone}</dd>
              <dt>Currency</dt>
              <dd>{restaurant.currency}</dd>
              <dt>Onboarded</dt>
              <dd>{new Date(restaurant.createdAt).toLocaleDateString('en-IN')}</dd>
            </dl>
          </Card>

          <Card className="detail-card">
            <div className="detail-card-title">At a Glance Summary</div>
            <dl className="detail-list">
              <dt>Active Plan</dt>
              <dd>
                <strong>{activeSub?.plan.name || 'No Active Subscription'}</strong>
                {activeSub?.plan && <span className="muted"> ({activeSub.plan.tier})</span>}
              </dd>
              <dt>Subscription Status</dt>
              <dd>{activeSub ? <Badge tone={statusTone(activeSub.status)}>{activeSub.status}</Badge> : '—'}</dd>
              <dt>Branches</dt>
              <dd style={{ fontWeight: 700 }}>{restaurant.branches.length}</dd>
              <dt>Registered Terminals</dt>
              <dd style={{ fontWeight: 700 }}>{restaurant.devices.length}</dd>
              <dt>Master Owner</dt>
              <dd>{owner ? `${owner.fullName} (${owner.email})` : 'No owner on record'}</dd>
              <dt>Platform Authority</dt>
              <dd><Badge tone="success">SaaS Managed</Badge></dd>
            </dl>
          </Card>
        </div>
      )}

      {/* TAB 2: OWNER */}
      {tab === 'owner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!owner && (
            <Card className="detail-card">
              <EmptyState title="No owner assigned" description="Create an owner account from the Restaurant Owners page." />
            </Card>
          )}

          <div className="user-card-grid">
            {restaurant.users.map((u) => {
              const isOwner = u.role === 'OWNER';
              return (
                <Card key={u.id} className="user-card">
                  <div className="user-card-top">
                    <div className={`user-avatar${isOwner ? ' user-avatar-owner' : ''}`}>
                      <UserRound className="w-4 h-4" />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="user-card-name">{u.fullName}</div>
                      <div className="user-card-role">
                        {isOwner ? 'RESTAURANT OWNER' : u.role === 'MANAGER' ? 'Manager' : 'Staff / Device Login'}
                      </div>
                    </div>
                    <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                  </div>

                  <div className="user-card-detail">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="mono">{u.email}</span>
                  </div>
                  {u.phone && (
                    <div className="user-card-detail">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{u.phone}</span>
                    </div>
                  )}
                  <div className="user-card-detail muted">
                    Created {new Date(u.createdAt).toLocaleDateString('en-IN')}
                    {u.activatedAt && ` • Activated ${new Date(u.activatedAt).toLocaleDateString('en-IN')}`}
                  </div>

                  {isOwner && (
                    <div style={{ marginTop: 14 }}>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const res = await api.post<{ emailSent: boolean; activationToken: string }>(
                              '/api/v1/support/resend-invite',
                              { userId: u.id, reason: 'Super Admin manual invitation dispatch' }
                            );
                            if (res.emailSent) {
                              showToast(`New invitation emailed to ${u.email}`);
                            } else {
                              navigator.clipboard?.writeText(res.activationToken).catch(() => {});
                              showToast(`Email could not be sent — new token copied to clipboard, relay it to ${u.email} manually`);
                            }
                          } catch (err) {
                            showToast(err instanceof ApiError ? err.message : 'Failed to resend invite');
                          }
                        }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Resend Invite / Activation Email</span>
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div>
            <Link to="/owners" className="btn btn-ghost">
              View All Platform Owners →
            </Link>
          </div>
        </div>
      )}

      {/* TAB 3: BRANCHES */}
      {tab === 'branches' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Outlets &amp; Branches ({restaurant.branches.length})
            <Button variant="accent" onClick={() => setModal('branch')}>
              <Plus className="w-4 h-4" />
              <span>Add Branch</span>
            </Button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Branch Name</th>
                <th>Branch Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {restaurant.branches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 700 }}>{b.name}</td>
                  <td className="mono">{b.code}</td>
                  <td>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant={b.status === 'ACTIVE' ? 'danger' : 'primary'}
                      onClick={() => handleToggleBranch(b.id, b.status, b.name)}
                    >
                      {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* TAB 4: SUBSCRIPTION */}
      {tab === 'subscription' && (
        <Card className="detail-card">
          <div className="detail-card-title">
            Active SaaS Subscription
            {!activeSub && (
              <Button variant="accent" onClick={() => setModal('subscription')}>
                Assign Plan
              </Button>
            )}
          </div>
          {activeSub ? (
            <div>
              <dl className="detail-list">
                <dt>Plan Name</dt>
                <dd style={{ fontWeight: 700, color: '#0B253A', fontSize: 15 }}>
                  {activeSub.plan.name} <Badge tone={isPro ? 'gold' : 'neutral'}>{activeSub.plan.tier}</Badge>
                </dd>
                <dt>Subscription Status</dt>
                <dd><Badge tone={statusTone(activeSub.status)} pulse={activeSub.status === 'ACTIVE'}>{activeSub.status}</Badge></dd>
                <dt>Monthly Price</dt>
                <dd style={{ fontFamily: 'monospace', fontWeight: 800 }}>₹{(activeSub.plan.priceMonthly / 100).toLocaleString('en-IN')}</dd>
                <dt>Billing Start</dt>
                <dd>{new Date(activeSub.startDate).toLocaleDateString('en-IN')}</dd>
                <dt>Renewal / Expiry</dt>
                <dd style={{ fontWeight: 700 }}>{new Date(activeSub.expiresAt).toLocaleDateString('en-IN')}</dd>
              </dl>

              <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                <Button variant="accent" onClick={() => setModal('subscription')}>
                  Change Plan
                </Button>
                <Link to="/subscriptions" className="btn btn-ghost">
                  Manage in Subscriptions Hub →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState title="No active subscription" description="Assign a plan to unlock branch, device, and software capabilities." />
          )}
        </Card>
      )}

      {/* Offline License Certificate — the ENT-001 fix's issuing side. A restaurant
          with no live cloud connection can't call the tenant entitlements endpoint,
          so this is the only legitimate way for it to receive a Super-Admin-authorized
          plan change: a signed, portable certificate the local app verifies itself. */}
      {tab === 'subscription' && activeSub && (
        <div style={{ marginTop: 16 }}>
          <Card className="detail-card">
            <div className="detail-card-title">Offline License Certificate</div>
            <p style={{ fontSize: 13, color: '#5c6773', marginTop: -8, marginBottom: 12 }}>
              For a restaurant running fully offline (no cloud connection): generate a signed certificate
              reflecting its current plan and paste it into that restaurant's Settings → Subscription Plan
              screen. It's cryptographically signed — it cannot be forged or edited locally.
            </p>
            <LicenseCertificatePanel restaurantId={id!} />
          </Card>
        </div>
      )}

      {/* TAB 5: PLAN QUOTAS */}
      {tab === 'plan' && (
        <Card className="detail-card">
          <div className="detail-card-title">Plan Quotas &amp; Commercial Terms</div>
          {activeSub ? (
            <dl className="detail-list">
              <dt>Assigned Plan</dt>
              <dd>{activeSub.plan.name} ({activeSub.plan.tier})</dd>
              <dt>Max Physical Branches</dt>
              <dd>{activeSub.plan.maxBranches} Outlet{activeSub.plan.maxBranches > 1 ? 's' : ''} allowed</dd>
              <dt>Max Terminals Fleet</dt>
              <dd>{activeSub.plan.maxDevices} Hardware devices (POS, Captain, KDS)</dd>
              <dt>Max Staff Users</dt>
              <dd>{activeSub.plan.maxUsers} Staff &amp; Operator credentials</dd>
              <dt>Monthly Rate</dt>
              <dd style={{ fontFamily: 'monospace', fontWeight: 800 }}>₹{(activeSub.plan.priceMonthly / 100).toLocaleString('en-IN')}</dd>
              <dt>Annual Rate</dt>
              <dd style={{ fontFamily: 'monospace' }}>
                {activeSub.plan.priceYearly ? `₹${(activeSub.plan.priceYearly / 100).toLocaleString('en-IN')}` : '—'}
              </dd>
            </dl>
          ) : (
            <EmptyState title="No plan assigned" description="Assign a plan to enforce quotas." />
          )}
        </Card>
      )}

      {/* TAB 6: FEATURE ENTITLEMENTS */}
      {tab === 'entitlements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Plan Switcher Banner */}
          <Card style={{ padding: 20, border: isPro ? '2px solid #ea580c' : '2px solid #cbd5e1', background: isPro ? 'linear-gradient(135deg, #fffaf5, #ffffff)' : '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: isPro ? '#ea580c' : '#64748b' }}>
                    Authoritative SaaS Plan
                  </span>
                  <Badge tone={isPro ? 'gold' : 'neutral'}>
                    {isPro ? 'PRO (₹7,000/mo) — All Features Unlocked' : 'CORE (₹5,000/mo) — Essential POS'}
                  </Badge>
                </div>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 17, fontWeight: 900, color: '#0f172a' }}>
                  {isPro ? 'JAMANVAAR PRO: Complete Restaurant OS Allotted' : 'JAMANVAAR CORE: Essential Counter POS Allotted'}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
                  {isPro
                    ? 'All features including Captain Wireless App, QR Table Ordering, KDS, Multi-device sync, and Advanced Analytics are fully enabled.'
                    : 'Captain App, QR Table Ordering, KDS, and Kiosk are locked. Super Admin can allot the PRO plan below to unlock instantly.'}
                </p>
              </div>

              <div>
                {!isPro ? (
                  <Button variant="accent" onClick={() => handleAllotPlan('PRO')}>
                    ⚡ Allot ₹7,000 PRO Plan (Unlock All Features)
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => handleAllotPlan('CORE')}>
                    Switch to CORE (₹5,000) [Lock PRO Features]
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Entitlements Grid */}
          <Card style={{ padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
              Effective Feature Entitlements
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {Object.entries(ENTITLEMENT_LABELS).map(([key, label]) => {
                const planEnts = activeSub?.plan?.entitlements as Record<string, boolean> | undefined;
                const isEnabled = Boolean(planEnts?.[key]);
                return (
                  <div
                    key={key}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: isEnabled ? '1px solid #86efac' : '1px solid #e2e8f0',
                      background: isEnabled ? '#f0fdf4' : '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: isEnabled ? '#166534' : '#94a3b8' }}>
                      {label}
                    </span>
                    <Badge tone={isEnabled ? 'success' : 'neutral'}>
                      {isEnabled ? 'Included' : 'Locked'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 7: DEVICES & KEYS */}
      {tab === 'devices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Registered Devices */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              Registered Terminal Fleet ({restaurant.devices.length})
            </div>
            {restaurant.devices.length === 0 ? (
              <EmptyState title="No terminals registered yet" description="Generate an activation key below to connect POS or Captain devices." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                    <th>Sync Status</th>
                    <th>Last Backup</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.devices.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>{d.type}</td>
                      <td>{d.branch?.name || '—'}</td>
                      <td><Badge tone={statusTone(d.status)} pulse={d.status === 'ACTIVE'}>{d.status}</Badge></td>
                      <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('en-IN') : 'Never'}</td>
                      <td>
                        {d.syncStatus ? (
                          <Badge tone={d.syncStatus === 'ok' ? 'success' : 'warning'}>{d.syncStatus}</Badge>
                        ) : (
                          <span style={{ color: '#8b93a0', fontSize: 12 }}>Not reported</span>
                        )}
                      </td>
                      <td>{d.lastBackupAt ? new Date(d.lastBackupAt).toLocaleString('en-IN') : 'Never'}</td>
                      <td>
                        {d.status !== 'REVOKED' && (
                          <Button size="sm" variant="danger" onClick={() => handleRevokeDevice(d.id, d.type)}>
                            Revoke Device
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Backup History — real off-device backups, see modules/backups in cloud/api */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              Backup History {backups ? `(${backups.length})` : ''}
            </div>
            {backups === null ? (
              <div style={{ padding: 22 }}><SkeletonTable rows={2} cols={4} /></div>
            ) : backups.length === 0 ? (
              <EmptyState
                title="No backups yet"
                description="The restaurant hasn't backed up to JAMANVAAR Cloud from its Restaurant Admin console yet. This is separate from the local JSON export, which stays on the restaurant's own device."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Method</th>
                    <th>Source Device</th>
                    <th>Status</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td>{new Date(b.createdAt).toLocaleString('en-IN')}</td>
                      <td>{b.method === 'AUTOMATIC' ? 'Automatic (device)' : 'Manual'}</td>
                      <td>{b.device ? b.device.type : '—'}</td>
                      <td><Badge tone={b.status === 'COMPLETED' ? 'success' : 'error'}>{b.status}</Badge></td>
                      <td>{(b.sizeBytes / 1024).toFixed(0)} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Activation Keys */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              Activation Keys ({restaurant.activationKeys.length})
              <Button variant="accent" onClick={() => setModal('activation')}>
                <Plus className="w-4 h-4" />
                <span>Generate Key</span>
              </Button>
            </div>
            {restaurant.activationKeys.length === 0 ? (
              <EmptyState title="No activation keys" description="Generate an activation key to hand over for device setup." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Device Type</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.activationKeys.map((k) => (
                    <tr key={k.id}>
                      <td className="mono" style={{ fontWeight: 700, color: '#0B253A' }}>{k.code}</td>
                      <td><Badge tone="accent">{k.allowedDeviceType}</Badge></td>
                      <td><Badge tone={statusTone(k.status)}>{k.status}</Badge></td>
                      <td>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                      <td>
                        {k.status === 'ACTIVE' && (
                          <Button size="sm" variant="danger" onClick={() => handleRevokeActivationKey(k.id, k.code)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 8: BILLING */}
      {tab === 'billing' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Tax Invoices &amp; Billing Ledger ({invoices?.length || 0})
            <Link to="/billing" className="btn btn-sm btn-accent">
              <Plus className="w-4 h-4" />
              <span>Issue Invoice</span>
            </Link>
          </div>
          {!invoices ? (
            <div style={{ padding: 20 }}><SkeletonTable rows={3} cols={5} /></div>
          ) : invoices.length === 0 ? (
            <EmptyState title="No invoices issued for this restaurant" description="Generate an invoice or let subscription renewals trigger automated GST billing." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Amount</th>
                  <th>GST (18%)</th>
                  <th>Total</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono" style={{ fontWeight: 700 }}>{inv.invoiceNumber}</td>
                    <td>₹{(inv.amount / 100).toLocaleString('en-IN')}</td>
                    <td>₹{(inv.taxAmount / 100).toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 800 }}>₹{(inv.totalAmount / 100).toLocaleString('en-IN')}</td>
                    <td>{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                    <td><Badge tone={statusTone(inv.status)}>{inv.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* TAB 9: AUDIT LOGS */}
      {tab === 'activity' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            Restaurant Audit Trail ({activity?.total || 0})
          </div>
          {!activity ? (
            <div style={{ padding: 20 }}><SkeletonTable rows={4} cols={4} /></div>
          ) : activity.rows.length === 0 ? (
            <EmptyState title="No audit records yet" description="Operational events for this restaurant will appear here." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Category</th>
                  <th>Actor</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {activity.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--jv-primary)' }}>{row.action}</td>
                    <td><Badge tone="neutral">{row.category}</Badge></td>
                    <td><span className="badge badge-accent">{row.actorType}</span></td>
                    <td>{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* TAB 10: SUPPORT & DIAGNOSTICS */}
      {tab === 'support' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0B253A' }}>
                  Live Diagnostic Telemetry
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Real-time terminal connectivity and tenant operational state.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDiagnostics(null);
                  api.get<RestaurantDiagnostics>(`/api/v1/support/diagnostics/${id}`).then(setDiagnostics);
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Diagnostics</span>
              </Button>
            </div>

            {diagnostics ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tenant Status</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0B253A', marginTop: 4 }}>{diagnostics.restaurant.status}</div>
                </div>
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Online Terminals</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                    {diagnostics.onlineDevicesCount} / {diagnostics.devices.length} Online
                  </div>
                </div>
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Plan Tier</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#ea580c', marginTop: 4 }}>
                    {diagnostics.activeSubscription?.plan?.name || 'No Active Plan'}
                  </div>
                </div>
              </div>
            ) : (
              <SkeletonCard rows={2} />
            )}
          </Card>
        </div>
      )}

      {/* Modals */}
      {modal === 'edit' && (
        <EditRestaurantModal
          restaurant={restaurant}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'branch' && (
        <CreateBranchModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'activation' && (
        <GenerateActivationKeyModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'subscription' && (
        <AssignSubscriptionModal
          restaurantId={restaurant.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          tone={confirmAction.tone}
          isPending={actionPending}
          onConfirm={executeConfirmedAction}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
