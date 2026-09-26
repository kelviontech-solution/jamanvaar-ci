import { RESTAURANT_ADMIN_URL, KIOSK_ADMIN_URL } from '../../lib/appUrls';
import { RefreshButton } from '../../components/RefreshButton';
import { CopyButton } from '../../components/CopyButton';
import { RestaurantSalesPanel } from './RestaurantSalesPanel';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type {
  AuditLogPage,
  RestaurantDetail,
  Invoice,
  RestaurantDiagnostics,
  Plan,
  Backup,
  RestaurantReport,
  PlatformPayment,
  PlatformPaymentPage
} from '../../api/types';
import { ENTITLEMENT_LABELS, type EntitlementKey } from '../../api/types';
import { APP_CODES, APP_CODE_LABELS, type AppCode, type ApplicationEntitlement, type FeatureCatalog } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  FilterTabs,
  Modal,
  SkeletonCard,
  SkeletonTable,
  statusTone
} from '../../components/ui';
import { formatAuditEvent } from '../../lib/auditFormatter';
import { exportRowsToCsv } from '../../lib/csvExport';
import '../../components/shared.css';
import './restaurants.css';
import { parseMenuCsv, type MenuCsvEntity } from '../../lib/menuCsv';
import { EditRestaurantModal } from './EditRestaurantModal';
import { CreateBranchModal } from '../Branches/CreateBranchModal';
import { GenerateActivationKeyModal } from '../ActivationKeys/GenerateActivationKeyModal';
import { AssignSubscriptionModal } from '../Subscriptions/AssignSubscriptionModal';
import { ChangePlanModal } from '../Subscriptions/ChangePlanModal';
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
  Phone,
  KeyRound,
  Copy,
  Database,
  BarChart3,
  Lock,
  Unlock,
  Download,
  Eye,
  Check,
  ShieldAlert,
  Activity,
  HardDrive,
  Grid3x3,
  Power,
  PowerOff,
  Wallet,
  Upload,
  Utensils
} from 'lucide-react';

type Tab =
  | 'overview'
  | 'owner'
  | 'branches'
  | 'subscription'
  | 'applications'
  | 'plan'
  | 'entitlements'
  | 'devices'
  | 'billing'
  | 'payments'
  | 'reports'
  | 'activity'
  | 'support'
  | 'backups'
  | 'menu';

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: Store },
  { key: 'owner', label: 'Owner & Users', icon: Users },
  { key: 'branches', label: 'Branches', icon: Building2 },
  { key: 'subscription', label: 'Subscription', icon: Repeat },
  // Previously the only place any application appeared was as a static,
  // read-only pill on the Feature Entitlements tab (and only if the plan's
  // JSON happened to have a matching boolean — Kiosk/Kiosk Admin never did).
  // This is the real per-application enable/disable + device-count tab.
  { key: 'applications', label: 'Applications', icon: Grid3x3 },
  { key: 'plan', label: 'Plan Quotas', icon: Package },
  { key: 'entitlements', label: 'Feature Entitlements', icon: ShieldCheck },
  { key: 'devices', label: 'Devices & Keys', icon: Laptop2 },
  { key: 'billing', label: 'Billing & Invoices', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { key: 'activity', label: 'Audit Logs', icon: FileText },
  { key: 'support', label: 'Support & Diagnostics', icon: LifeBuoy },
  { key: 'backups', label: 'Backup & Recovery', icon: Database },
  { key: 'menu', label: 'Menu', icon: Utensils }
];

export function formatDeviceTypeLabel(type: string): string {
  switch (type) {
    case 'ANY':
    case 'POS_ADMIN':
      return 'RESTAURANT ADMIN CONSOLE';
    case 'POS':
      return 'BILLING COUNTER POS';
    case 'CAPTAIN':
      return 'CAPTAIN ORDER TABLET';
    case 'KDS':
      return 'KITCHEN DISPLAY (KDS)';
    case 'KIOSK':
      return 'SELF-ORDER KIOSK';
    case 'KIOSK_ADMIN':
      return 'KIOSK ADMIN CONSOLE';
    default:
      return `${type} TERMINAL`;
  }
}

// Page-local, not added to the shared statusTone() in components/ui.tsx —
// that function's SUCCESS-shaped strings only recognize 'PAID'/'VERIFIED'
// as success-like, and widening it would silently change badge colors on
// every other page that already calls it.
function paymentStatusTone(status: PlatformPayment['status']): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
    case 'USER_DROPPED':
    case 'CANCELLED':
      return 'error';
    case 'PENDING':
    case 'CREATED':
    case 'AUTHORIZED':
    case 'REFUND_PENDING':
    case 'PARTIALLY_REFUNDED':
      return 'warning';
    case 'REFUNDED':
    default:
      return 'neutral';
  }
}

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The open tab lives in the URL (?tab=backups), so a notification or a shared link lands on the exact section.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: Tab = TABS.some((t) => t.key === requestedTab) ? (requestedTab as Tab) : 'overview';
  const setTab = useCallback(
    (next: Tab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'overview') params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [modal, setModal] = useState<'edit' | 'branch' | 'activation' | 'subscription' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Secondary tab data
  const [activity, setActivity] = useState<AuditLogPage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<PlatformPaymentPage | null>(null);
  const [paymentsStatusFilter, setPaymentsStatusFilter] = useState<PlatformPayment['status'] | 'ALL'>('ALL');
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RestaurantDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const refreshDiagnostics = () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    api
      .get<RestaurantDiagnostics>(`/api/v1/support/diagnostics/${id}`)
      .then(setDiagnostics)
      .catch((err) => setDiagnosticsError(err instanceof ApiError ? err.message : 'Failed to load diagnostics'))
      .finally(() => setDiagnosticsLoading(false));
  };
  const [backups, setBackups] = useState<Backup[] | null>(null);
  // B2-052: a 403 (Finance has no Backup & Recovery access) was silently swallowed into an empty
  // array, rendering as "Multi-Tenant Cloud Backup Snapshots (0) ... No backups recorded" - a
  // refusal that looks exactly like a restaurant that genuinely has zero backups, for a role that
  // is allowed to see this page but not this data. Same honest-error pattern already used for
  // Support & Diagnostics (`diagnosticsError` above) - the actual server message, not a fake zero.
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [reportsData, setReportsData] = useState<RestaurantReport | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [appEntitlements, setAppEntitlements] = useState<ApplicationEntitlement[] | null>(null);
  const [savingAppCode, setSavingAppCode] = useState<AppCode | null>(null);
  const [impactPrompt, setImpactPrompt] = useState<{ appCode: AppCode; message: string } | null>(null);
  const [featureCatalog, setFeatureCatalog] = useState<FeatureCatalog | null>(null);

  // Password reset modal state
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Backup & Recovery state
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);

  // Menu tab state (BUG-014/015)
  const [menu, setMenu] = useState<{ categories: Array<{ externalId: string; payload: any }>; items: Array<{ externalId: string; payload: any }>; selfUploadEnabled: boolean } | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuImporting, setMenuImporting] = useState(false);
  const [menuPermissionSaving, setMenuPermissionSaving] = useState(false);
  const menuCsvInputRef = React.useRef<HTMLInputElement>(null);

  const loadMenu = useCallback(() => {
    if (!id) return;
    setMenuLoading(true);
    api
      .get<typeof menu>(`/api/v1/restaurants/${id}/menu`)
      .then(setMenu)
      .catch(() => showToast('Failed to load the menu'))
      .finally(() => setMenuLoading(false));
  }, [id]);

  const handleMenuCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    file.text().then((text) => {
      const parsed = parseMenuCsv(text);
      if (parsed.categories.length === 0 && parsed.items.length === 0) {
        const firstErrors = parsed.errors.slice(0, 3).map((er) => 'Row ' + er.row + ': ' + er.message).join(' | ');
        showToast('Nothing valid to import.' + (firstErrors ? ' ' + firstErrors : ''));
        return;
      }
      setMenuImporting(true);
      api
        .post<{ categoriesImported: number; itemsImported: number }>(`/api/v1/restaurants/${id}/menu/import`, {
          categories: parsed.categories as MenuCsvEntity[],
          items: parsed.items as MenuCsvEntity[]
        })
        .then((res) => {
          const errNote = parsed.errors.length > 0 ? (' ' + parsed.errors.length + ' row(s) were skipped.') : '';
          showToast('Imported ' + res.itemsImported + ' dish(es) into ' + res.categoriesImported + ' categor' + (res.categoriesImported === 1 ? 'y' : 'ies') + '.' + errNote);
          loadMenu();
        })
        .catch((err) => showToast(err instanceof ApiError ? err.message : 'Menu import failed'))
        .finally(() => setMenuImporting(false));
    });
  };

  const handleDownloadMenuCsvTemplate = () => {
    const rows = [
      'Category,Item Name,SKU,Price,Dietary Type,Spice Level,Description,Image URL',
      '"Starters","Veg Spring Roll","STR-001",180,VEG,MEDIUM,"Crispy vegetable rolls",""'
    ];
    const csvText = rows.join(String.fromCharCode(10));
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jamanvaar-menu-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleMenuPermission = () => {
    if (!id || !menu) return;
    const next = !menu.selfUploadEnabled;
    setMenuPermissionSaving(true);
    api
      .patch<{ selfUploadEnabled: boolean }>(`/api/v1/restaurants/${id}/menu/permission`, { enabled: next })
      .then((res) => {
        setMenu((m) => (m ? { ...m, selfUploadEnabled: res.selfUploadEnabled } : m));
        showToast(res.selfUploadEnabled ? 'Restaurant Admin can upload their own menu again.' : 'Restaurant Admin can no longer upload their own menu.');
      })
      .catch(() => showToast('Failed to change the permission'))
      .finally(() => setMenuPermissionSaving(false));
  };

  // Audit log details modal
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

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
        // Invalidate the cached application list — a plan change resyncs
        // ApplicationEntitlement rows server-side (see subscriptions.service.ts
        // changePlan), so a stale cached read here would show the old set.
        setAppEntitlements(null);
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
    if (tab === 'payments') {
      const params = new URLSearchParams({ restaurantId: id, page: String(paymentsPage), limit: '25' });
      if (paymentsStatusFilter !== 'ALL') params.set('status', paymentsStatusFilter);
      api
        .get<PlatformPaymentPage>(`/api/v1/payments?${params.toString()}`)
        .then(setPayments)
        .catch(() => setPayments({ rows: [], total: 0, page: 1, limit: 25 }));
    }
    if (tab === 'support' && !diagnostics) {
      refreshDiagnostics();
    }
    if (tab === 'backups' && !backups) {
      api.get<Backup[]>(`/api/v1/restaurants/${id}/backups`)
        .then((res) => { setBackups(res); setBackupsError(null); })
        .catch((err) => { setBackups([]); setBackupsError(err instanceof ApiError ? err.message : 'Failed to load backups'); });
    }
    if (tab === 'reports' && !reportsData) {
      setReportsLoading(true);
      api
        .get<RestaurantReport>(`/api/v1/platform/reports/restaurants/${id}`)
        .then(setReportsData)
        .catch(() => {})
        .finally(() => setReportsLoading(false));
    }
    if (tab === 'applications' && !appEntitlements) {
      api
        .get<ApplicationEntitlement[]>(`/api/v1/restaurants/${id}/applications`)
        .then(setAppEntitlements)
        .catch(() => setAppEntitlements([]));
    }
    if (tab === 'applications' && !featureCatalog) {
      // Degrades gracefully: if this call fails, category/description/source badges are just
      // omitted — the enable/disable toggles below read from appEntitlements alone and keep working.
      api.get<FeatureCatalog>('/api/v1/application-entitlements/catalog').then(setFeatureCatalog).catch(() => {});
    }
    if (tab === 'menu' && !menu) {
      loadMenu();
    }
  }, [tab, id, activity, invoices, diagnostics, backups, reportsData, appEntitlements, featureCatalog, menu, loadMenu, paymentsStatusFilter, paymentsPage]);

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setActionPending(true);
    try {
      await confirmAction.action();
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActionPending(false);
    }
  }

  function handleToggleStatus() {
    if (!restaurant) return;
    const isActivating = restaurant.status === 'SUSPENDED';
    const actionVerb = isActivating ? 'reactivate' : 'suspend';
    setConfirmAction({
      title: `${isActivating ? 'Reactivate' : 'Suspend'} "${restaurant.name}"?`,
      message: isActivating ? (
        'Reactivating this restaurant will re-enable console logins, license certificates, and POS/Captain order syncing.'
      ) : (
        <span style={{ color: '#dc2626' }}>
          Suspending will immediately block all terminal logins, cloud backups, and order routing across all branches.
        </span>
      ),
      tone: isActivating ? 'primary' : 'danger',
      action: async () => {
        await api.patch(`/api/v1/restaurants/${restaurant.id}/${actionVerb}`);
        showToast(`Restaurant ${isActivating ? 'reactivated' : 'suspended'}`);
        load();
      }
    });
  }

  // Activation key actions (BUG-128): revoke, activate again, delete - each says what will happen.
  function handleRevokeActivationKey(keyId: string, code: string, inUse = false) {
    if (!restaurant) return;
    setConfirmAction({
      title: `Revoke Activation Key "${code}"?`,
      message: inUse
        ? 'This key is in use. Revoking it also revokes the terminal that used it, and that terminal stops working. You can bring both back with "Activate again".'
        : 'This key can no longer be used to activate a terminal. You can bring it back with "Activate again", or delete it.',
      tone: 'danger',
      action: async () => {
        await api.patch(`/api/v1/activation-keys/${keyId}/revoke`);
        showToast('Activation key revoked');
        load();
      }
    });
  }

  function handleReactivateActivationKey(keyId: string, code: string, hadTerminal: boolean) {
    if (!restaurant) return;
    setConfirmAction({
      title: `Activate Key "${code}" Again?`,
      message: hadTerminal
        ? 'This key had been used by a terminal. That terminal is switched back on and signs in again, exactly as before the revoke.'
        : 'The key becomes available to activate a terminal again. If its expiry date has passed it gets 30 more days.',
      tone: 'primary',
      action: async () => {
        await api.patch(`/api/v1/activation-keys/${keyId}/reactivate`, {});
        showToast('Activation key activated again');
        load();
      }
    });
  }

  function handleDeleteActivationKey(keyId: string, code: string) {
    if (!restaurant) return;
    setConfirmAction({
      title: `Delete Activation Key "${code}"?`,
      message: 'The key is permanently removed and its code can never be redeemed. This is recorded in the audit log. It cannot be undone.',
      tone: 'danger',
      action: async () => {
        await api.delete(`/api/v1/activation-keys/${keyId}`);
        showToast('Activation key deleted');
        load();
      }
    });
  }

  /** Revoke / Activate again / Delete for one key: what is offered depends on what state the key is in. */
  function renderKeyActions(k: { id: string; status: string; code?: string | null; codeLast4?: string | null; redeemedAt?: string | null }) {
    const label = k.code ?? `•••• ${k.codeLast4 ?? ''}`;
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(k.status === 'ACTIVE' || k.status === 'REDEEMED') && (
          <Button size="sm" variant="danger" onClick={() => handleRevokeActivationKey(k.id, label, k.status === 'REDEEMED')}>Revoke</Button>
        )}
        {k.status === 'REVOKED' && (
          <Button size="sm" variant="primary" onClick={() => handleReactivateActivationKey(k.id, label, !!k.redeemedAt)}>Activate again</Button>
        )}
        {k.status !== 'REDEEMED' && (
          <Button size="sm" variant="ghost" onClick={() => handleDeleteActivationKey(k.id, label)}>Delete</Button>
        )}
      </div>
    );
  }

  function handleRevokeDevice(deviceId: string, type: string) {
    if (!restaurant) return;
    setConfirmAction({
      title: `Revoke ${type} Terminal?`,
      message: 'This terminal session will be disconnected. The cashier will be logged out and cannot operate until re-activated.',
      tone: 'danger',
      action: async () => {
        await api.delete(`/api/v1/devices/${deviceId}`);
        showToast('Device terminal revoked');
        load();
      }
    });
  }

  function handleToggleDeviceLock(deviceId: string, currentLocked: boolean) {
    if (!restaurant) return;
    const isLocking = !currentLocked;
    setConfirmAction({
      title: `${isLocking ? 'Lock' : 'Unlock'} Terminal?`,
      message: isLocking ? (
        'Remotely locks the POS/Captain display screen. Staff will see a security lock banner and cannot ring orders until unlocked.'
      ) : (
        'Clears the security lock and restores active operation on this terminal.'
      ),
      tone: isLocking ? 'danger' : 'primary',
      action: async () => {
        await api.patch(`/api/v1/devices/${deviceId}/lock`, {
          locked: isLocking,
          reason: isLocking ? 'Remote locked from Super Admin Control Center' : undefined
        });
        showToast(`Terminal ${isLocking ? 'locked' : 'unlocked'}`);
        load();
      }
    });
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPasswordUser || !newPasswordInput.trim()) return;
    setResettingPassword(true);
    try {
      await api.post(`/api/v1/owners/${resetPasswordUser.id}/reset-password`, {
        password: newPasswordInput.trim()
      });
      showToast(`Password successfully reset for ${resetPasswordUser.email}`);
      setResetPasswordUser(null);
      setNewPasswordInput('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleTriggerManualBackup() {
    if (!id) return;
    setTriggeringBackup(true);
    try {
      await api.post(`/api/v1/platform/backups/${id}/trigger`);
      showToast('Cloud backup snapshot triggered successfully!');
      const updatedBackups = await api.get<Backup[]>(`/api/v1/restaurants/${id}/backups`);
      setBackups(updatedBackups);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to trigger backup');
    } finally {
      setTriggeringBackup(false);
    }
  }

  async function handleVerifyBackup(backupId: string) {
    setVerifyingBackupId(backupId);
    try {
      const res = await api.post<{ isValid: boolean; sha256Hex: string }>(`/api/v1/platform/backups/${backupId}/verify`);
      showToast(`Backup verified! Checksum: ${res.sha256Hex?.slice(0, 16)}… Valid: ${res.isValid}`);
      if (id) {
        const updated = await api.get<Backup[]>(`/api/v1/restaurants/${id}/backups`);
        setBackups(updated);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Integrity verification failed');
    } finally {
      setVerifyingBackupId(null);
    }
  }

  async function handlePreviewRestore(backupId: string) {
    setRestoringBackupId(backupId);
    try {
      const res = await api.post(`/api/v1/platform/backups/${backupId}/preview-restore`, {
        targetType: 'STAGING_PREVIEW'
      });
      setRestorePreview(res);
      showToast('Staging restore preview generated!');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to generate restore preview');
    } finally {
      setRestoringBackupId(null);
    }
  }

  async function handleExtendSubscription() {
    if (!restaurant || !restaurant.subscriptions[0]) return;
    const sub = restaurant.subscriptions[0];
    setActionPending(true);
    try {
      await api.patch(`/api/v1/subscriptions/${sub.id}/extend`, { days: 30 });
      showToast('Subscription extended by 30 days.');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to extend subscription');
    } finally {
      setActionPending(false);
    }
  }

  async function handleImpersonateOwner() {
    if (!restaurant) return;
    setActionPending(true);
    try {
      const res = await api.post<{ accessToken: string; owner: { email: string } }>(
        `/api/v1/support/impersonate/${restaurant.id}`,
        { reason: 'Super Admin troubleshooting and audit inspection' }
      );
      showToast(`Support session minted for ${res.owner.email}. Launching console…`);
      window.open(`${RESTAURANT_ADMIN_URL}?impersonationToken=${encodeURIComponent(res.accessToken)}`, '_blank');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Impersonation token generation failed');
    } finally {
      setActionPending(false);
    }
  }

  if (loading && !restaurant) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}><SkeletonCard rows={2} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
        </div>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="page-error">
        <span>{error || 'Restaurant not found'}</span>
        <Link to="/restaurants" className="btn btn-ghost btn-sm">
          Return to restaurants list
        </Link>
      </div>
    );
  }

  const owner = restaurant.users.find((u) => u.role === 'OWNER') ?? restaurant.users[0];
  const activeSub =
    restaurant.subscriptions.find(
      (s) => s.status === 'ACTIVE' || s.status === 'TRIAL'
    ) ?? restaurant.subscriptions[0];
  const effectiveTier = (activeSub?.plan.tier as 'CORE' | 'PRO') || 'CORE';
  const isPro = effectiveTier === 'PRO';
  // Phase 2/5: a restaurant may hold one active subscription per productFamily concurrently —
  // a RESTAURANT-family base plan plus a separate KIOSK-family add-on. `activeSub` above stays
  // the single "primary" one every other tab's logic keys off of (backward compatible); this is
  // every subscription currently ACTIVE or TRIAL, for the overview's combined summary.
  const allActiveSubs = restaurant.subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL');
  const familyLabel = (family: string | undefined) => (family === 'KIOSK' ? 'Kiosk Add-on' : 'Restaurant Plan');

  async function handleToggleApplication(appCode: AppCode, nextEnabled: boolean, acknowledgeDeviceImpact = false) {
    if (!activeSub) return;
    setSavingAppCode(appCode);
    try {
      await api.patch<ApplicationEntitlement>(
        `/api/v1/subscriptions/${activeSub.id}/applications/${appCode}`,
        { enabled: nextEnabled, ...(acknowledgeDeviceImpact ? { acknowledgeDeviceImpact: true } : {}) }
      );
      // Refetch rather than splice in the PATCH response directly: the PATCH endpoint returns the
      // raw entitlement row with no `source` field (only the GET list endpoints compute PLAN vs
      // MANUAL_OVERRIDE), so merging it in-place would silently drop this row's source badge
      // until the next full reload.
      const refreshed = await api.get<ApplicationEntitlement[]>(`/api/v1/restaurants/${id}/applications`);
      setAppEntitlements(refreshed);
      showToast(`${APP_CODE_LABELS[appCode]} ${nextEnabled ? 'enabled' : 'disabled'} for this restaurant.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.message.includes('acknowledgeDeviceImpact')) {
        setImpactPrompt({ appCode, message: err.message });
      } else {
        showToast(err instanceof ApiError ? err.message : `Failed to update ${APP_CODE_LABELS[appCode]}`);
      }
    } finally {
      setSavingAppCode(null);
    }
  }

  return (
    <div>
      <Link to="/restaurants" className="back-link">
        ← Back to restaurants
      </Link>

      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">{restaurant.name}</h1>
            <Badge tone={statusTone(restaurant.status)} pulse={restaurant.status === 'ACTIVE'}>
              {restaurant.status}
            </Badge>
            <Badge tone={isPro ? 'gold' : 'neutral'}>
              {isPro ? 'PRO PLAN (₹7,000)' : 'CORE PLAN (₹5,000)'}
            </Badge>
            {restaurant.activationKeys.some((k) => k.status === 'ACTIVE') && (
              <span
                onClick={() => setTab('devices')}
                style={{ cursor: 'pointer' }}
                title="Click to view activation keys"
              >
                <Badge tone="accent">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <KeyRound className="w-3 h-3" />
                    {restaurant.activationKeys.filter((k) => k.status === 'ACTIVE').length} Active Key{restaurant.activationKeys.filter((k) => k.status === 'ACTIVE').length !== 1 ? 's' : ''}
                  </span>
                </Badge>
              </span>
            )}
          </div>
          <p className="page-subtitle">
            {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')} • {restaurant.branches.length} Branch{restaurant.branches.length > 1 ? 'es' : ''} • {restaurant.devices.length} Registered Terminal{restaurant.devices.length > 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {restaurant.restaurantCode ? (
              <>
                <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Restaurant ID:</span>
                <code className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#0B253A' }}>{restaurant.restaurantCode}</code>
                <CopyButton text={restaurant.restaurantCode} label="Copy" title="Copy the Restaurant ID" />
              </>
            ) : (
              <Badge tone="warning">Restaurant ID not yet assigned — add a mobile number to generate one</Badge>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="accent" onClick={() => setModal('activation')}>
            <KeyRound className="w-4 h-4 mr-1" />
            <span>Generate Key</span>
          </Button>
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

      {/* 12-Tab Navigation Bar */}
      <div className="tabs" style={{ overflowX: 'auto', whiteSpace: 'nowrap', marginBottom: 20 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="detail-grid">
            <Card className="detail-card">
              <div className="detail-card-title">Commercial &amp; Legal Profile</div>
              <dl className="detail-list">
                <dt>Restaurant ID</dt>
                <dd>
                  {restaurant.restaurantCode ? (
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{restaurant.restaurantCode}</span>
                  ) : (
                    <span className="muted">Not yet assigned</span>
                  )}
                </dd>
                <dt>Registered Mobile</dt>
                <dd>{restaurant.mobile || '—'}</dd>
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
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                  Advanced / Internal IDs
                </summary>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="muted" style={{ fontSize: 11 }}>Internal UUID:</span>
                  <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{restaurant.id}</span>
                  <CopyButton text={restaurant.id} label="Copy" title="Copy the internal UUID" />
                </div>
              </details>
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

          {/* HARDWARE & DEVICE ACTIVATION KEYS CARD */}
          <Card style={{ padding: 22, border: '1px solid #fed7aa', background: 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#0B253A' }}>
                    Hardware &amp; Terminal Activation Keys ({restaurant.activationKeys.length})
                  </h3>
                  <Badge tone={restaurant.activationKeys.some((k) => k.status === 'ACTIVE') ? 'success' : 'neutral'}>
                    {restaurant.activationKeys.filter((k) => k.status === 'ACTIVE').length} Available to Redeem
                  </Badge>
                </div>
                <div style={{ margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: '#0B253A' }}>
                  <strong>Restaurant ID</strong>
                  <code
                    className="mono"
                    style={{ fontSize: 12, background: '#fff', border: '1px solid #FDBA74', borderRadius: 8, padding: '3px 8px', wordBreak: 'break-all', userSelect: 'all' }}
                  >
                    {restaurant.restaurantCode ?? 'Not yet assigned'}
                  </code>
                  {restaurant.restaurantCode && (
                    <CopyButton text={restaurant.restaurantCode} label="Copy ID" title="Copy the Restaurant ID" />
                  )}
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#64748b' }}>
                  <strong>Kiosk Admin</strong> and <strong>Captain</strong> ask for this Restaurant ID together with the restaurant owner's login before they take a key.
                  {' '}Relay these keys to the restaurant owner. On first login at <strong>Restaurant Admin ({RESTAURANT_ADMIN_URL})</strong>, <strong>POS</strong>, or <strong>Captain</strong>, entering this key registers and binds the device.
                  {restaurant.activationKeys.some((k) => k.allowedDeviceType === 'KIOSK_ADMIN') && (
                    <>
                      {' '}
                      A <strong>KIOSK_ADMIN</strong> key must instead be entered at the{' '}
                      <strong>Kiosk Admin console ({KIOSK_ADMIN_URL})</strong>.
                    </>
                  )}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="accent" size="sm" onClick={() => setModal('activation')}>
                  <Plus className="w-4 h-4 mr-1" />
                  <span>Generate Activation Key</span>
                </Button>
              </div>
            </div>

            {restaurant.activationKeys.length === 0 ? (
              <EmptyState
                title="No activation keys generated yet"
                description="Click Generate Activation Key above to mint a key for Restaurant Admin, POS, or Captain tablets."
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {restaurant.activationKeys.map((k) => {
                  const isAvailable = k.status === 'ACTIVE';
                  return (
                    <div
                      key={k.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: isAvailable ? '1.5px solid #FDBA74' : '1px solid #E2E8F0',
                        background: isAvailable ? '#FFFDF9' : '#F8FAFC',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: isAvailable ? '#E66817' : '#64748B' }}>
                          ● {formatDeviceTypeLabel(k.allowedDeviceType)}
                        </span>
                        <Badge tone={statusTone(k.status)}>{k.status}</Badge>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px' }}>
                        <span className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#0B253A', letterSpacing: '0.04em' }}>
                          {k.code ?? `•••• ${k.codeLast4 ?? ''}`}
                        </span>
                        {k.code && (
                          <CopyButton
                            text={k.code}
                            onResult={(ok) => showToast(ok ? `Copied key "${k.code}" to clipboard!` : 'Could not copy automatically. Select the key and press Ctrl+C.')}
                          />
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B' }}>
                        <span>Expires: {new Date(k.expiresAt).toLocaleDateString('en-IN')}</span>
                        {k.redeemedAt && (
                          <span style={{ color: '#16A34A', fontWeight: 600 }}>
                            ✓ Redeemed {new Date(k.redeemedAt).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>

                      {renderKeyActions(k)}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: OWNER & USERS */}
      {tab === 'owner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Master Restaurant Owner</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Primary tenant administrator holding full billing and management authority.
                </p>
              </div>
              {owner && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setResetPasswordUser({ id: owner.id, name: owner.fullName, email: owner.email });
                      setNewPasswordInput('');
                    }}
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1" />
                    <span>Reset Password</span>
                  </Button>
                  <Button size="sm" variant="accent" onClick={handleImpersonateOwner}>
                    <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                    <span>Impersonate Owner</span>
                  </Button>
                </div>
              )}
            </div>

            {owner ? (
              <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Full Name</span>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{owner.fullName}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Email Address</span>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{owner.email}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Phone</span>
                  <div style={{ fontSize: 14, marginTop: 2 }}>{owner.phone || '—'}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Account Status</span>
                  <div style={{ marginTop: 4 }}><Badge tone={statusTone(owner.status)}>{owner.status}</Badge></div>
                </div>
              </div>
            ) : (
              <EmptyState title="No owner on record" description="Create an owner account below to grant administrative access." />
            )}
          </Card>

          {/* Restaurant Staff & Terminal Users */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>All Restaurant Users &amp; Terminal Logins ({restaurant.users.length})</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Store managers, cashiers, and kitchen accounts associated with this restaurant.
                </p>
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {restaurant.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{u.fullName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                    </td>
                    <td><Badge tone={u.role === 'OWNER' ? 'gold' : 'neutral'}>{u.role}</Badge></td>
                    <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                    <td>{u.phone || '—'}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResetPasswordUser({ id: u.id, name: u.fullName, email: u.email });
                          setNewPasswordInput('');
                        }}
                      >
                        Reset Password
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* TAB 3: BRANCHES */}
      {tab === 'branches' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            <div>
              <span>Restaurant Outlets &amp; Branches ({restaurant.branches.length})</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Manage physical store locations, billing counters, and local sync hubs.
              </p>
            </div>
            <Button variant="accent" onClick={() => setModal('branch')}>
              <Plus className="w-4 h-4 mr-1" />
              <span>Create Branch</span>
            </Button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Branch Name</th>
                <th>Branch Code</th>
                <th>Address</th>
                <th>Timezone</th>
                <th>Terminals</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {restaurant.branches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 700 }}>{b.name}</td>
                  <td><span className="mono" style={{ fontWeight: 700 }}>{b.code}</span></td>
                  <td>{b.address || '—'}</td>
                  <td>{b.timezone}</td>
                  <td>{restaurant.devices.filter((d) => d.branchId === b.id).length} Terminals</td>
                  <td><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* TAB 4: SUBSCRIPTION */}
      {tab === 'subscription' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0B253A' }}>
                  Current SaaS Subscription Plan
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Governs feature flags, maximum allowed POS terminals, and cloud sync policies.
                  {allActiveSubs.length > 1 && ` This restaurant holds ${allActiveSubs.length} active subscriptions — see the Applications tab for their combined entitlements.`}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={handleExtendSubscription} disabled={actionPending || !activeSub}>
                  {activeSub?.status === 'TRIAL' ? 'Extend Trial (+30 Days)' : 'Extend Subscription (+30 Days)'}
                </Button>
                <Button variant="accent" onClick={() => setModal('subscription')}>
                  Change Plan
                </Button>
              </div>
            </div>

            {activeSub ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, background: '#FFFDF9', border: '1px solid var(--jv-border)', borderRadius: 10, padding: 18 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Plan Name</span>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{activeSub.plan.name}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>SaaS Tier</span>
                  <div style={{ marginTop: 4 }}><Badge tone={activeSub.plan.tier === 'PRO' ? 'gold' : 'neutral'}>{activeSub.plan.tier}</Badge></div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Price (Monthly)</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#E66817', marginTop: 4 }}>
                    ₹{(activeSub.plan.priceMonthly / 100).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Subscription Status</span>
                  <div style={{ marginTop: 4 }}><Badge tone={statusTone(activeSub.status)} pulse={activeSub.status === 'ACTIVE'}>{activeSub.status}</Badge></div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Expires At</span>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{new Date(activeSub.expiresAt).toLocaleDateString('en-IN')}</div>
                </div>
              </div>
            ) : (
              <EmptyState title="No active subscription" description="Assign a plan to enable features and issue licensing certificates." />
            )}
          </Card>

          {allActiveSubs.filter((s) => s.id !== activeSub?.id).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {allActiveSubs.filter((s) => s.id !== activeSub?.id).map((s) => (
                <Card key={s.id} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
                      {familyLabel((s.plan as { productFamily?: string }).productFamily)}
                    </span>
                    <Badge tone={statusTone(s.status)} pulse={s.status === 'ACTIVE'}>{s.status}</Badge>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.plan.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.plan.tier} · ₹{(s.plan.priceMonthly / 100).toLocaleString('en-IN')}/mo · expires {new Date(s.expiresAt).toLocaleDateString('en-IN')}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Cryptographic Offline License Certificate */}
          <LicenseCertificatePanel restaurantId={restaurant.id} />
        </div>
      )}

      {/* TAB: APPLICATIONS — real per-application provisioning, not a
          read-only reflection of the plan's entitlements JSON. Each row is
          an actual ApplicationEntitlement DB row; toggling it here is what
          activation-key generation/redemption is gated against. */}
      {tab === 'applications' && (
        <Card style={{ padding: 22 }}>
          <div className="detail-card-title">
            <div>
              <span>Applications Provisioned</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                What this restaurant can actually activate a device for — enabling an app here is what lets a
                new activation key be generated or redeemed for it.
              </p>
            </div>
            {activeSub && <Badge tone={isPro ? 'gold' : 'neutral'}>Plan: {activeSub.plan.name}</Badge>}
          </div>

          {!activeSub ? (
            <EmptyState
              title="No subscription assigned"
              description="Assign a plan first — applications are provisioned per subscription."
            />
          ) : appEntitlements === null ? (
            <SkeletonTable rows={6} cols={2} />
          ) : appEntitlements.length === 0 ? (
            <EmptyState
              title="No application rows yet"
              description="This subscription predates per-application entitlements. Change the plan (even to the same plan) to backfill them."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 4 }}>
              {APP_CODES.map((code) => {
                const row = appEntitlements.find((e) => e.appCode === code);
                const enabled = row?.enabled ?? false;
                const deviceCount = restaurant.devices.filter((d) => {
                  // POS_ADMIN/KIOSK_ADMIN device rows use those exact type
                  // strings — the same values as AppCode for every entry.
                  return (d as { type: string }).type === code;
                }).length;
                const saving = savingAppCode === code;
                return (
                  <div
                    key={code}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: enabled ? '1px solid #86efac' : '1px solid #e2e8f0',
                      background: enabled ? '#f0fdf4' : '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: enabled ? '#166534' : '#0B253A' }}>
                            {APP_CODE_LABELS[code]}
                          </span>
                          {featureCatalog?.[code] && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '1px 6px' }}>
                              {featureCatalog[code].category}
                            </span>
                          )}
                        </div>
                        {featureCatalog?.[code] && (
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{featureCatalog[code].description}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {deviceCount} device{deviceCount === 1 ? '' : 's'} active
                          {row?.deviceQuota ? ` · quota ${row.deviceQuota}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                        {row?.source === 'MANUAL_OVERRIDE' && <Badge tone="warning">Manual override</Badge>}
                      </div>
                    </div>
                    <Button
                      variant={enabled ? 'ghost' : 'primary'}
                      disabled={saving}
                      onClick={() => handleToggleApplication(code, !enabled)}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                      {saving ? 'Saving…' : enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 5: PLAN QUOTAS */}
      {tab === 'plan' && (
        <Card style={{ padding: 22 }}>
          <div className="detail-card-title">
            <div>
              <span>Platform Quotas &amp; Usage Limits</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Real-time consumption meters against subscription quotas.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 10 }}>
            <div style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Branches Allowed</span>
                <span style={{ fontWeight: 800, color: '#0B253A' }}>
                  {restaurant.branches.length} / {activeSub?.plan.maxBranches || 1}
                </span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, (restaurant.branches.length / (activeSub?.plan.maxBranches || 1)) * 100)}%`,
                    height: '100%',
                    background: '#0B253A'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Devices &amp; Terminals</span>
                <span style={{ fontWeight: 800, color: '#E66817' }}>
                  {restaurant.devices.length} / {activeSub?.plan.maxDevices || 3}
                </span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, (restaurant.devices.length / (activeSub?.plan.maxDevices || 3)) * 100)}%`,
                    height: '100%',
                    background: '#E66817'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Staff &amp; Terminal Users</span>
                <span style={{ fontWeight: 800, color: '#16a34a' }}>
                  {restaurant.users.length} / {activeSub?.plan.maxUsers || 10}
                </span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, (restaurant.users.length / (activeSub?.plan.maxUsers || 10)) * 100)}%`,
                    height: '100%',
                    background: '#16a34a'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Offline Validity Tolerance</span>
                <Badge tone="success">30 Days</Badge>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                ECDSA P-256 cryptographically signed token valid for offline mesh operations.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 6: FEATURE ENTITLEMENTS */}
      {tab === 'entitlements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ padding: 22 }}>
            <div className="detail-card-title">
              <div>
                <span>Feature Flag Entitlements Matrix</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Comparing ₹5,000 CORE vs ₹7,000 PRO vs this restaurant's assigned plan tier.
                </p>
              </div>
              <Badge tone={isPro ? 'gold' : 'neutral'}>
                Current Active: {activeSub?.plan.tier || 'CORE'}
              </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {Object.entries(ENTITLEMENT_LABELS).map(([key, label]) => {
                const planEnts = activeSub?.plan?.entitlements as Record<string, boolean> | undefined;
                const isEnabled = Boolean(planEnts?.[key]);
                return (
                  <div
                    key={key}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: isEnabled ? '1px solid #86efac' : '1px solid #e2e8f0',
                      background: isEnabled ? '#f0fdf4' : '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: isEnabled ? '#166534' : '#64748b' }}>
                      {label}
                    </span>
                    <Badge tone={isEnabled ? 'success' : 'neutral'}>
                      {isEnabled ? 'Included' : 'Pro Gated'}
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
          {/* Activation Keys */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyRound className="w-4 h-4 text-orange-600" />
                  <span>Hardware Activation Keys ({restaurant.activationKeys.length})</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 4 }}>
                  Use these keys to onboard and bind terminals (Restaurant Admin, POS Counter, Captain Tablet, KDS).
                </div>
              </div>
              <Button variant="accent" onClick={() => setModal('activation')}>
                <Plus className="w-4 h-4 mr-1" />
                <span>Generate Key</span>
              </Button>
            </div>
            {restaurant.activationKeys.length === 0 ? (
              <EmptyState title="No activation keys" description="Generate an activation key to hand over for device setup." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Activation Code</th>
                    <th>Designated Terminal</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.activationKeys.map((k) => (
                    <tr key={k.id}>
                      <td className="mono" style={{ fontWeight: 800, color: '#0B253A' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{k.code ?? `•••• ${k.codeLast4 ?? ''}`}</span>
                          {k.code && (
                            <CopyButton
                              text={k.code}
                              title="Copy activation code"
                              onResult={(ok) => showToast(ok ? `Copied activation key "${k.code}" to clipboard!` : 'Could not copy automatically. Select the key and press Ctrl+C.')}
                            />
                          )}
                        </div>
                      </td>
                      <td><Badge tone="accent">{formatDeviceTypeLabel(k.allowedDeviceType)}</Badge></td>
                      <td><Badge tone={statusTone(k.status)} pulse={k.status === 'ACTIVE'}>{k.status}</Badge></td>
                      <td>{new Date(k.expiresAt).toLocaleDateString('en-IN')}</td>
                      <td>
                        {k.status === 'REDEEMED' && (
                          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>
                            ✓ Redeemed {k.redeemedAt ? new Date(k.redeemedAt).toLocaleDateString('en-IN') : ''}
                          </div>
                        )}
                        {renderKeyActions(k)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Registered Devices */}
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Registered Terminal Fleet ({restaurant.devices.length})</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Live operational state and remote MDM controls.
                </p>
              </div>
            </div>
            {restaurant.devices.length === 0 ? (
              <EmptyState title="No terminals registered yet" description="Generate an activation key above to connect POS or Captain devices." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                    <th>Sync Status</th>
                    <th>MDM Lock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.devices.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>
                        <Link to={`/devices/${d.id}`} className="table-link">
                          {d.type}
                        </Link>
                      </td>
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
                      <td>
                        {d.isLocked ? (
                          <Badge tone="error">LOCKED</Badge>
                        ) : (
                          <Badge tone="success">UNLOCKED</Badge>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleDeviceLock(d.id, Boolean(d.isLocked))}
                          >
                            {d.isLocked ? <Unlock className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                            <span>{d.isLocked ? 'Unlock' : 'Lock'}</span>
                          </Button>
                          {d.status !== 'REVOKED' && (
                            <Button size="sm" variant="danger" onClick={() => handleRevokeDevice(d.id, d.type)}>
                              Revoke
                            </Button>
                          )}
                        </div>
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
            <div>
              <span>Tax Invoices &amp; Billing Ledger ({invoices?.length || 0})</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                GST compliant invoices issued for subscription licenses and renewals.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!invoices) return;
                  exportRowsToCsv(`invoices_${restaurant.name}.csv`, invoices, [
                    { header: 'Invoice Number', value: (i) => i.invoiceNumber },
                    { header: 'Amount', value: (i) => (i.amount / 100).toFixed(2) },
                    { header: 'Tax Amount', value: (i) => (i.taxAmount / 100).toFixed(2) },
                    { header: 'Total', value: (i) => (i.totalAmount / 100).toFixed(2) },
                    { header: 'Status', value: (i) => i.status },
                    { header: 'Due Date', value: (i) => i.dueDate }
                  ]);
                }}
                disabled={!invoices || invoices.length === 0}
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </Button>
              <Link to="/billing" className="btn btn-sm btn-accent">
                <Plus className="w-4 h-4" />
                <span>Issue Invoice</span>
              </Link>
            </div>
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

      {/* TAB: PAYMENTS */}
      {tab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {payments && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Transactions (this page)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0B253A', marginTop: 4 }}>{payments.total}</div>
              </div>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Successful Amount</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                  ₹{(payments.rows.filter((p) => p.status === 'SUCCESS').reduce((sum, p) => sum + p.amount, 0) / 100).toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Refunded Amount</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', marginTop: 4 }}>
                  ₹{(payments.rows.flatMap((p) => p.refunds).filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount, 0) / 100).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          )}

          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Payments &amp; Refunds ({payments?.total ?? 0})</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Real Cashfree-backed payment transactions and refunds for this restaurant.
                </p>
              </div>
            </div>
            <div style={{ padding: '0 22px 14px' }}>
              <FilterTabs<PlatformPayment['status'] | 'ALL'>
                value={paymentsStatusFilter}
                onChange={(val) => { setPaymentsStatusFilter(val); setPaymentsPage(1); }}
                options={[
                  { id: 'ALL', label: 'All' },
                  { id: 'SUCCESS', label: 'Success' },
                  { id: 'FAILED', label: 'Failed' },
                  { id: 'PENDING', label: 'Pending' },
                  { id: 'REFUND_PENDING', label: 'Refund Pending' },
                  { id: 'PARTIALLY_REFUNDED', label: 'Partially Refunded' },
                  { id: 'REFUNDED', label: 'Refunded' }
                ]}
              />
            </div>
            {!payments ? (
              <div style={{ padding: 20 }}><SkeletonTable rows={4} cols={5} /></div>
            ) : payments.rows.length === 0 ? (
              <EmptyState title="No payments yet" description="Real orders and payments from this restaurant's kiosks and POS will appear here." />
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Order</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Refunded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.rows.map((p) => {
                      const refundedAmount = p.refunds.filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount, 0);
                      const expanded = expandedPaymentId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr>
                            <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                              {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              <button
                                type="button"
                                className="table-link"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                                onClick={() => setExpandedPaymentId(expanded ? null : p.id)}
                              >
                                {p.order.externalOrderId}
                              </button>
                            </td>
                            <td style={{ fontWeight: 700 }}>₹{(p.amount / 100).toLocaleString('en-IN')}</td>
                            <td>{p.method ?? '—'}</td>
                            <td><Badge tone={paymentStatusTone(p.status)}>{p.status.replace('_', ' ')}</Badge></td>
                            <td>{refundedAmount > 0 ? `₹${(refundedAmount / 100).toLocaleString('en-IN')}` : '—'}</td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={6} style={{ background: '#f8fafc', padding: '14px 22px', fontSize: 12.5 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                                  <div><strong>Cashfree Order ID:</strong> {p.providerOrderId}</div>
                                  <div><strong>Cashfree Payment ID:</strong> {p.providerPaymentId ?? '—'}</div>
                                  {p.failureReason && <div><strong>Failure Reason:</strong> {p.failureReason}</div>}
                                </div>
                                {p.refunds.length > 0 && (
                                  <div style={{ marginTop: 10 }}>
                                    <strong>Refunds:</strong>
                                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                      {p.refunds.map((r) => (
                                        <li key={r.id}>
                                          ₹{(r.amount / 100).toLocaleString('en-IN')} — <Badge tone={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'error' : 'warning'}>{r.status}</Badge>
                                          {r.reason ? ` — ${r.reason}` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '14px 22px' }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Page {payments.page} of {Math.max(1, Math.ceil(payments.total / payments.limit))}</span>
                  <Button size="sm" variant="ghost" disabled={payments.page <= 1} onClick={() => setPaymentsPage((p) => p - 1)}>Prev</Button>
                  <Button size="sm" variant="ghost" disabled={payments.page * payments.limit >= payments.total} onClick={() => setPaymentsPage((p) => p + 1)}>Next</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* TAB 9: REPORTS & ANALYTICS */}
      {tab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {id && <RestaurantSalesPanel restaurantId={id} />}
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0B253A' }}>
                  Platform billing &amp; fleet
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  What JAMANVAAR bills this restaurant (invoice totals include 18% GST; a plan's listed price does not), and the health of its terminals.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!id) return;
                  setReportsLoading(true);
                  api
                    .get<RestaurantReport>(`/api/v1/platform/reports/restaurants/${id}`)
                    .then(setReportsData)
                    .finally(() => setReportsLoading(false));
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reportsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh Analytics</span>
              </Button>
            </div>

            {reportsData ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Billed</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0B253A', marginTop: 4 }}>
                    ₹{reportsData.metrics.totalBilled.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#16a34a', marginTop: 2, fontWeight: 600 }}>
                    ₹{reportsData.metrics.collectedRevenue.toLocaleString('en-IN')} collected
                  </div>
                </div>

                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Outstanding Receivables</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', marginTop: 4 }}>
                    ₹{reportsData.metrics.outstandingReceivables.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    From {reportsData.metrics.totalInvoices} invoice(s)
                  </div>
                </div>

                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Terminal Fleet Health</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                    {reportsData.metrics.activeDevices} / {reportsData.metrics.devicesCount} Online
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    {reportsData.metrics.offlineDevices} offline / standby
                  </div>
                </div>

                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Data Resilience</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0B253A', marginTop: 4 }}>
                    {reportsData.metrics.backupsCount} Backups
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    {reportsData.metrics.syncEventsCount} sync events logged
                  </div>
                </div>
              </div>
            ) : (
              <SkeletonCard rows={3} />
            )}
          </Card>
        </div>
      )}

      {/* TAB 10: AUDIT LOGS */}
      {tab === 'activity' && (
        <Card>
          <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
            <div>
              <span>Enterprise Operational Audit Trail ({activity?.total || 0})</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Human-readable chronological activity log for this restaurant tenant.
              </p>
            </div>
            {activity && activity.rows.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  exportRowsToCsv(`audit_logs_${restaurant.name}.csv`, activity.rows, [
                    { header: 'Action', value: (r) => r.action },
                    { header: 'Category', value: (r) => r.category },
                    { header: 'Actor Type', value: (r) => r.actorType },
                    { header: 'Timestamp', value: (r) => r.createdAt }
                  ]);
                }}
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </Button>
            )}
          </div>
          {!activity ? (
            <div style={{ padding: 20 }}><SkeletonTable rows={4} cols={4} /></div>
          ) : activity.rows.length === 0 ? (
            <EmptyState title="No audit records yet" description="Operational events for this restaurant will appear here." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 320 }}>Event &amp; Activity</th>
                  <th>Category</th>
                  <th>Actor</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.rows.map((row) => {
                  const event = formatAuditEvent(row.action, row.category);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="table-link"
                              style={{ fontWeight: 700, fontSize: 13.5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                              onClick={() => setSelectedLog(row)}
                            >
                              {event.title}
                            </button>
                            <span className="mono" style={{ fontSize: 9.5, color: 'var(--jv-text-secondary)', background: 'var(--jv-bg-muted)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--jv-border)' }}>
                              {row.action}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--jv-text-secondary)', lineHeight: 1.35 }}>
                            {event.description}
                          </span>
                        </div>
                      </td>
                      <td><span className={`badge badge-${event.badgeTone}`}>{event.category}</span></td>
                      <td><span className="badge badge-accent">{row.actorType}</span></td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {new Date(row.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedLog(row)}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          <span>Inspect</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* TAB 11: SUPPORT & DIAGNOSTICS */}
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
              <RefreshButton loading={diagnosticsLoading} onRefresh={refreshDiagnostics} label="Refresh Diagnostics" />
            </div>

            {diagnosticsError && (
              <div className="form-error" style={{ marginBottom: 12 }}>{diagnosticsError}</div>
            )}

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

      {/* TAB 12: BACKUP & RECOVERY */}
      {tab === 'backups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Multi-Tenant Cloud Backup Snapshots {backupsError ? '' : `(${backups?.length ?? 0})`}</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Isolated point-in-time database snapshots with cryptographic SHA-256 verification.
                </p>
              </div>
              {!backupsError && (
                <Button
                  variant="accent"
                  onClick={handleTriggerManualBackup}
                  disabled={triggeringBackup}
                >
                  <HardDrive className={`w-4 h-4 mr-1 ${triggeringBackup ? 'animate-spin' : ''}`} />
                  <span>{triggeringBackup ? 'Triggering…' : 'Trigger Cloud Backup'}</span>
                </Button>
              )}
            </div>

            {backups === null ? (
              <div style={{ padding: 22 }}><SkeletonTable rows={3} cols={5} /></div>
            ) : backupsError ? (
              <EmptyState
                title="Your role does not have access to this area"
                description={backupsError}
              />
            ) : backups.length === 0 ? (
              <EmptyState
                title="No backups recorded yet"
                description="Click Trigger Cloud Backup above to generate an immediate encrypted snapshot of this tenant's orders, menu, and configuration."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Created At</th>
                    <th>Method</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Integrity Verification</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => {
                    const isVerifying = verifyingBackupId === b.id;
                    const isRestoring = restoringBackupId === b.id;
                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{new Date(b.createdAt).toLocaleString('en-IN')}</div>
                          <div className="mono muted" style={{ fontSize: 11 }}>{b.id}</div>
                        </td>
                        <td><Badge tone="neutral">{b.method}</Badge></td>
                        <td>{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                        <td>
                          <Badge tone={b.status === 'COMPLETED' ? 'success' : 'error'}>
                            {b.status}
                          </Badge>
                        </td>
                        <td>
                          {b.verificationStatus === 'VERIFIED' ? (
                            <Badge tone="success">✓ SHA-256 VERIFIED</Badge>
                          ) : (
                            <Badge tone="neutral">UNCHECKED</Badge>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVerifyBackup(b.id)}
                              disabled={isVerifying}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              <span>{isVerifying ? 'Checking…' : 'Verify'}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePreviewRestore(b.id)}
                              disabled={isRestoring}
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-1" />
                              <span>{isRestoring ? 'Previewing…' : 'Staging Preview'}</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* MODALS */}
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
        activeSub ? (
          <ChangePlanModal
            subscription={{ ...activeSub, restaurant: { id: restaurant.id, name: restaurant.name, status: restaurant.status } }}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              load();
            }}
          />
        ) : (
          <AssignSubscriptionModal
            restaurantId={restaurant.id}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              load();
            }}
          />
        )
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <Modal
          title={`Reset Password for ${resetPasswordUser.name}`}
          onClose={() => setResetPasswordUser(null)}
        >
          <form onSubmit={handleResetPasswordSubmit} className="modal-form">
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
              Enter a new secure password for <strong>{resetPasswordUser.email}</strong>. This immediately updates the PostgreSQL credentials and marks the account as ACTIVE.
            </p>

            <div className="field">
              <label>New Password *</label>
              <input
                type="text"
                className="mono"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="At least 4 characters…"
                required
                autoFocus
              />
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <Button type="button" variant="ghost" onClick={() => setResetPasswordUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={resettingPassword || newPasswordInput.trim().length < 4}>
                {resettingPassword ? 'Saving…' : 'Set New Password'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {tab === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div className="detail-card-title" style={{ padding: '18px 22px 0' }}>
              <div>
                <span>Menu ({menu ? menu.items.length : 0} dishes, {menu ? menu.categories.length : 0} categories)</span>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Upload this restaurant's menu directly, on the owner's behalf. It reaches POS, Captain, KDS and Kiosk
                  the same way a Restaurant Admin upload does.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <RefreshButton loading={menuLoading} onRefresh={loadMenu} />
                <Button variant="ghost" onClick={handleDownloadMenuCsvTemplate}>
                  <Download className="w-4 h-4 mr-1" />
                  <span>Download Template</span>
                </Button>
                <input ref={menuCsvInputRef} type="file" accept=".csv,text/csv" onChange={handleMenuCsvFile} style={{ display: 'none' }} />
                <Button variant="accent" onClick={() => menuCsvInputRef.current?.click()} disabled={menuImporting}>
                  <Upload className="w-4 h-4 mr-1" />
                  <span>{menuImporting ? 'Importing…' : 'Upload CSV'}</span>
                </Button>
              </div>
            </div>

            <div style={{ padding: '18px 22px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 16px',
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  marginBottom: 16
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#0B253A' }}>Restaurant Admin self-upload</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {menu?.selfUploadEnabled === false
                      ? "This restaurant's own admin currently cannot upload their own menu CSV. Only Super Admin can."
                      : 'The restaurant admin may upload their own menu CSV from Restaurant Admin → Menu & Catalog.'}
                  </div>
                </div>
                <Button variant={menu?.selfUploadEnabled === false ? 'accent' : 'ghost'} onClick={handleToggleMenuPermission} disabled={!menu || menuPermissionSaving}>
                  {menuPermissionSaving ? 'Saving…' : menu?.selfUploadEnabled === false ? 'Allow Self-Upload' : 'Revoke Self-Upload'}
                </Button>
              </div>

              {menuLoading && !menu ? (
                <SkeletonCard rows={4} />
              ) : !menu || menu.items.length === 0 ? (
                <EmptyState
                  title="This restaurant has no menu yet"
                  description="Upload a CSV to give it one — it reaches every terminal automatically."
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {menu.items.slice(0, 60).map((it) => (
                    <div key={it.externalId} style={{ padding: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0B253A' }}>{String(it.payload.name ?? it.externalId)}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {it.payload.price != null ? '₹' + it.payload.price : ''} {it.payload.dietaryType ? '· ' + it.payload.dietaryType : ''}
                      </div>
                    </div>
                  ))}
                  {menu.items.length > 60 && (
                    <div style={{ padding: 12, color: '#64748b', fontSize: 12, alignSelf: 'center' }}>
                      +{menu.items.length - 60} more dish(es)
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Audit Log Detail Modal */}
      {selectedLog && (
        <Modal
          title="Operational Audit Event Details"
          onClose={() => setSelectedLog(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#0B253A' }}>
                {formatAuditEvent(selectedLog.action, selectedLog.category).title}
              </span>
              <span className="mono" style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                {selectedLog.action}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              {formatAuditEvent(selectedLog.action, selectedLog.category).description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12 }}>
              <div><strong>Category:</strong> {selectedLog.category}</div>
              <div><strong>Actor Type:</strong> {selectedLog.actorType}</div>
              <div><strong>Actor ID:</strong> <span className="mono">{selectedLog.actorId || '—'}</span></div>
              <div><strong>Timestamp:</strong> {new Date(selectedLog.createdAt).toLocaleString('en-IN')}</div>
            </div>

            {selectedLog.metadata && (
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                  Event Payload &amp; Details
                </span>
                <pre style={{ background: '#0B253A', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', marginTop: 4 }}>
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="primary" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Restore Preview Modal */}
      {restorePreview && (
        <Modal
          title="Staging Restore Preview"
          onClose={() => setRestorePreview(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              Safe staging preview dry-run: this inspection validates the backup archive structure without overwriting production records.
            </p>
            <pre style={{ background: '#0B253A', color: '#e2e8f0', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto' }}>
              {JSON.stringify(restorePreview, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="primary" size="sm" onClick={() => setRestorePreview(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={impactPrompt !== null}
        title={`Disable ${impactPrompt ? APP_CODE_LABELS[impactPrompt.appCode] : ''}?`}
        message={impactPrompt?.message.replace(' Resend with acknowledgeDeviceImpact: true to confirm.', '') ?? ''}
        confirmLabel="Disable anyway"
        tone="danger"
        onConfirm={() => {
          const p = impactPrompt;
          setImpactPrompt(null);
          if (p) void handleToggleApplication(p.appCode, false, true);
        }}
        onClose={() => setImpactPrompt(null)}
      />

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
