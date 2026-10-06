import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  ExternalLink,
  Info,
  RefreshCw,
  ScrollText,
  Sliders,
  X
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import {
  ENTITLEMENT_LABELS,
  type EntitlementKey,
  type QrAuditEntry,
  type QrEntitlement,
  type QrUsageSnapshot,
  type RestaurantQrDetail,
  type RestaurantQrStatusItem
} from '../../api/types';
import { Badge, Button, EmptyState, SkeletonLine } from '../../components/ui';
import { QrEntitlementEditor, type QrEntitlementDraft } from './QrEntitlementEditor';
import {
  DOT,
  EM_DASH,
  NO_USAGE_HINT,
  NO_USAGE_LABEL,
  QR_STATUS_DESCRIPTIONS,
  QR_STATUS_LABELS,
  formatCount,
  formatDateTime,
  formatRelative,
  formatRupees,
  humanizeAction,
  humanizeKey,
  qrStatusTone
} from './qrFormat';
import '../../components/shared.css';

type PanelTab = 'overview' | 'entitlement' | 'audit';

/** Load outcome for each of the three optional endpoints backing this panel. */
type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 501);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Builds the editable draft from the authoritative detail payload, or from the
 * three fields the list endpoint carries when detail is unreachable.
 */
function draftFromEntitlement(e: QrEntitlement): QrEntitlementDraft {
  return {
    qrEntitled: e.qrEntitled,
    qrOrderingEnabled: e.qrOrderingEnabled,
    maxActiveTables: e.maxActiveTables,
    maxOrdersPerDay: e.maxOrdersPerDay,
    digitalMenu: e.digitalMenu,
    guestCustomization: e.guestCustomization,
    liveOrderTracking: e.liveOrderTracking,
    qrAnalytics: e.qrAnalytics,
    onlinePayments: e.onlinePayments
  };
}

function draftFromRow(row: RestaurantQrStatusItem): QrEntitlementDraft {
  return {
    qrEntitled: row.qrEntitled,
    qrOrderingEnabled: row.qrOrderingEnabled,
    maxActiveTables: row.maxActiveTables,
    maxOrdersPerDay: null,
    digitalMenu: false,
    guestCustomization: false,
    liveOrderTracking: false,
    qrAnalytics: false,
    onlinePayments: false
  };
}

/** Only the keys the operator actually changed are sent to the PATCH endpoint. */
function diffDraft(
  base: QrEntitlementDraft,
  next: QrEntitlementDraft,
  limitedFields: boolean
): Partial<QrEntitlementDraft> {
  const editable: Array<keyof QrEntitlementDraft> = limitedFields
    ? ['qrEntitled', 'qrOrderingEnabled', 'maxActiveTables']
    : (Object.keys(next) as Array<keyof QrEntitlementDraft>);

  const patch: Partial<QrEntitlementDraft> = {};
  for (const key of editable) {
    if (base[key] !== next[key]) {
      (patch as Record<string, unknown>)[key] = next[key];
    }
  }
  return patch;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--jv-text-muted)'
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--jv-text)' }}>{children}</span>
    </div>
  );
}

function PanelSection({
  title,
  icon,
  action,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--jv-border)',
        borderRadius: 'var(--jv-radius-lg)',
        background: 'var(--jv-surface)',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--jv-border)',
          background: 'var(--jv-surface-subtle)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800 }}>
          {icon}
          <span>{title}</span>
        </span>
        {action}
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function InlineNote({ tone = 'info', children }: { tone?: 'info' | 'error'; children: React.ReactNode }) {
  const isError = tone === 'error';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 'var(--jv-radius-md)',
        border: `1px solid ${isError ? 'var(--jv-error)' : 'var(--jv-border)'}`,
        background: isError ? 'var(--jv-error-soft)' : 'var(--jv-bg-muted)',
        color: isError ? 'var(--jv-error)' : 'var(--jv-text-secondary)',
        fontSize: 12,
        lineHeight: 1.5
      }}
    >
      <Info className="w-3.5 h-3.5" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

/** Renders one usage metric, or an explicit "not reported" marker. */
function UsageMetric({
  label,
  value,
  reported
}: {
  label: string;
  value: string;
  reported: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--jv-border)',
        borderRadius: 'var(--jv-radius-md)',
        background: reported ? 'var(--jv-surface-subtle)' : 'var(--jv-bg-muted)'
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--jv-text-muted)'
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: reported ? 20 : 15,
          fontWeight: 800,
          fontFamily: reported ? "'IBM Plex Mono', ui-monospace, monospace" : 'inherit',
          color: reported ? 'var(--jv-text)' : 'var(--jv-text-light)'
        }}
      >
        {reported ? value : EM_DASH}
      </div>
      {!reported && (
        <div style={{ fontSize: 11, color: 'var(--jv-text-muted)', marginTop: 2 }}>{NO_USAGE_LABEL}</div>
      )}
    </div>
  );
}

function planEntitlementLabel(key: string): string {
  const known = ENTITLEMENT_LABELS[key as EntitlementKey];
  return known ?? humanizeKey(key);
}

function PlanEntitlementValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') {
    return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Included' : 'Excluded'}</Badge>;
  }
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--jv-text-light)' }}>{EM_DASH}</span>;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return <span className="mono">{String(value)}</span>;
  }
  return <span className="mono">{JSON.stringify(value)}</span>;
}

export function QrRestaurantDetailPanel({
  restaurant,
  initialTab = 'overview',
  onClose,
  onUpdated,
  onToast
}: {
  restaurant: RestaurantQrStatusItem;
  initialTab?: PanelTab;
  onClose: () => void;
  onUpdated: (updated: RestaurantQrStatusItem) => void;
  onToast: (message: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>(initialTab);

  const [detail, setDetail] = useState<LoadState<RestaurantQrDetail>>({ kind: 'loading' });
  const [audit, setAudit] = useState<LoadState<QrAuditEntry[]>>({ kind: 'loading' });
  const [usage, setUsage] = useState<QrUsageSnapshot | null>(null);
  const [usageRefreshing, setUsageRefreshing] = useState(false);

  const [baseDraft, setBaseDraft] = useState<QrEntitlementDraft>(() => draftFromRow(restaurant));
  const [draft, setDraft] = useState<QrEntitlementDraft>(() => draftFromRow(restaurant));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const restaurantId = restaurant.id;

  const loadDetail = useCallback(async () => {
    setDetail({ kind: 'loading' });
    try {
      const data = await api.get<RestaurantQrDetail>(`/api/v1/qr-ordering/restaurants/${restaurantId}`);
      setDetail({ kind: 'ready', data });
      setUsage(data.usage ?? null);
      const next = draftFromEntitlement(data.entitlement);
      setBaseDraft(next);
      setDraft(next);
    } catch (err) {
      if (isNotFound(err)) {
        setDetail({ kind: 'unavailable' });
      } else {
        setDetail({ kind: 'error', message: errorMessage(err, 'Failed to load QR detail') });
      }
    }
  }, [restaurantId]);

  const loadAudit = useCallback(async () => {
    setAudit({ kind: 'loading' });
    try {
      const data = await api.get<QrAuditEntry[]>(`/api/v1/qr-ordering/restaurants/${restaurantId}/audit`);
      setAudit({ kind: 'ready', data: Array.isArray(data) ? data : [] });
    } catch (err) {
      if (isNotFound(err)) {
        setAudit({ kind: 'unavailable' });
      } else {
        setAudit({ kind: 'error', message: errorMessage(err, 'Failed to load QR audit log') });
      }
    }
  }, [restaurantId]);

  useEffect(() => {
    void loadDetail();
    void loadAudit();
  }, [loadDetail, loadAudit]);

  // Close on Escape, matching the rest of the console's overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const detailUnavailable = detail.kind === 'unavailable' || detail.kind === 'error';
  const limitedFields = detailUnavailable;

  const refreshUsage = useCallback(async () => {
    setUsageRefreshing(true);
    try {
      const res = await api.get<{ usage: QrUsageSnapshot | null }>(
        `/api/v1/qr-ordering/restaurants/${restaurantId}/usage`
      );
      setUsage(res?.usage ?? null);
      onToast(res?.usage ? 'Usage snapshot refreshed' : 'Restaurant has still not reported QR usage');
    } catch (err) {
      onToast(isNotFound(err) ? 'Usage endpoint is not available yet' : errorMessage(err, 'Failed to read usage'));
    } finally {
      setUsageRefreshing(false);
    }
  }, [restaurantId, onToast]);

  const patch = useMemo(() => diffDraft(baseDraft, draft, limitedFields), [baseDraft, draft, limitedFields]);
  const isDirty = Object.keys(patch).length > 0;

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.patch<RestaurantQrStatusItem>(
        `/api/v1/qr-ordering/restaurants/${restaurantId}/entitlement`,
        patch
      );
      onUpdated(updated);
      onToast(`QR entitlement saved for ${updated.name || restaurant.name}`);
      setBaseDraft(draft);
      // Re-read so `source` and any server-side clamping are reflected.
      void loadDetail();
      void loadAudit();
    } catch (err) {
      setSaveError(errorMessage(err, 'Failed to save QR entitlement'));
    } finally {
      setSaving(false);
    }
  }, [isDirty, patch, restaurantId, draft, onUpdated, onToast, restaurant.name, loadDetail, loadAudit]);

  const row = detail.kind === 'ready' ? detail.data.restaurant : restaurant;
  const usageReported = usage !== null;
  const planEntitlements = detail.kind === 'ready' ? detail.data.planEntitlements : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{row.name}</span>
              <Badge tone={qrStatusTone(row.status)}>{QR_STATUS_LABELS[row.status]}</Badge>
            </h2>
            <span style={{ fontSize: 12, color: 'var(--jv-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span>{row.planName}</span>
              <span>{DOT}</span>
              <span>{row.primaryBranchName}</span>
              {row.branchCount > 1 && (
                <>
                  <span>{DOT}</span>
                  <span>{row.branchCount} branches</span>
                </>
              )}
              {row.city && (
                <>
                  <span>{DOT}</span>
                  <span>{row.city}</span>
                </>
              )}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '12px 24px 0' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`tab-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'entitlement' ? 'active' : ''}`}
              onClick={() => setTab('entitlement')}
            >
              Entitlement{isDirty ? ' *' : ''}
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              Audit log
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {detail.kind === 'unavailable' && (
            <InlineNote>
              The per-restaurant QR detail endpoint is not available on this API build. Everything below is
              limited to what the fleet list endpoint returns.
            </InlineNote>
          )}
          {detail.kind === 'error' && (
            <InlineNote tone="error">
              {detail.message}{' '}
              <button
                type="button"
                onClick={() => void loadDetail()}
                style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
              >
                Retry
              </button>
            </InlineNote>
          )}

          {/* -- OVERVIEW -- */}
          {tab === 'overview' && (
            <>
              <PanelSection
                title="Usage snapshot"
                icon={<ClipboardList className="w-3.5 h-3.5" />}
                action={
                  <Button size="sm" variant="ghost" onClick={() => void refreshUsage()} disabled={usageRefreshing}>
                    <RefreshCw className={`w-3.5 h-3.5 ${usageRefreshing ? 'animate-spin' : ''}`} />
                    <span>Check usage</span>
                  </Button>
                }
              >
                {detail.kind === 'loading' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SkeletonLine width="60%" height="16px" />
                    <SkeletonLine width="90%" height="48px" />
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: 10
                      }}
                    >
                      <UsageMetric
                        label="Active tables"
                        value={usage ? formatCount(usage.activeTables) : EM_DASH}
                        reported={usageReported}
                      />
                      <UsageMetric
                        label="Orders today"
                        value={usage ? formatCount(usage.ordersToday) : EM_DASH}
                        reported={usageReported}
                      />
                      <UsageMetric
                        label="Revenue today"
                        value={usage ? formatRupees(usage.revenueToday) : EM_DASH}
                        reported={usageReported}
                      />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {usage ? (
                        <p className="form-note">
                          Reported by the restaurant POS at {formatDateTime(usage.reportedAt)} (
                          {formatRelative(usage.reportedAt)}).
                        </p>
                      ) : (
                        <InlineNote>{NO_USAGE_HINT}</InlineNote>
                      )}
                    </div>
                  </>
                )}
              </PanelSection>

              <PanelSection title="Account" icon={<Building2 className="w-3.5 h-3.5" />}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 14
                  }}
                >
                  <Field label="Primary branch">{row.primaryBranchName || EM_DASH}</Field>
                  <Field label="Branches">{formatCount(row.branchCount)}</Field>
                  <Field label="City">{row.city || EM_DASH}</Field>
                  <Field label="Plan">
                    {row.planName} ({row.planTier})
                  </Field>
                  <Field label="Table quota">{row.maxActiveTables === null ? "No limit" : formatCount(row.maxActiveTables)}</Field>
                  <Field label="Last QR activity">{formatRelative(row.lastActivityAt)}</Field>
                </div>
                <p className="form-note" style={{ marginTop: 12 }}>
                  {QR_STATUS_DESCRIPTIONS[row.status]}
                </p>
                <div style={{ marginTop: 12 }}>
                  <Link to={`/restaurants/${row.id}`} className="btn btn-ghost btn-sm">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open restaurant record</span>
                  </Link>
                </div>
              </PanelSection>

              <PanelSection title="Plan entitlements" icon={<Sliders className="w-3.5 h-3.5" />}>
                {detail.kind === 'loading' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SkeletonLine width="80%" />
                    <SkeletonLine width="65%" />
                    <SkeletonLine width="72%" />
                  </div>
                ) : !planEntitlements || Object.keys(planEntitlements).length === 0 ? (
                  <p className="form-note">
                    Plan entitlements are not available{detailUnavailable ? ' from this API build' : ' for this plan'}.
                  </p>
                ) : (
                  <div className="data-table-container">
                    <table className="data-table">
                      <tbody>
                        {Object.entries(planEntitlements).map(([key, value]) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 600 }}>{planEntitlementLabel(key)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <PlanEntitlementValue value={value} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PanelSection>
            </>
          )}

          {/* -- ENTITLEMENT -- */}
          {tab === 'entitlement' && (
            <PanelSection title="QR entitlement" icon={<Sliders className="w-3.5 h-3.5" />}>
              {detail.kind === 'loading' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SkeletonLine width="45%" height="16px" />
                  <SkeletonLine width="100%" height="56px" />
                  <SkeletonLine width="100%" height="56px" />
                  <SkeletonLine width="70%" height="40px" />
                </div>
              ) : (
                <>
                  {saveError && (
                    <div className="page-error" style={{ marginBottom: 14 }}>
                      {saveError}
                    </div>
                  )}
                  <QrEntitlementEditor
                    draft={draft}
                    source={detail.kind === 'ready' ? detail.data.entitlement.source : undefined}
                    saving={saving}
                    limitedFields={limitedFields}
                    onChange={(p) => setDraft((prev) => ({ ...prev, ...p }))}
                  />
                  <div className="modal-actions" style={{ marginTop: 18 }}>
                    <Button
                      variant="ghost"
                      disabled={!isDirty || saving}
                      onClick={() => {
                        setDraft(baseDraft);
                        setSaveError(null);
                      }}
                    >
                      Discard changes
                    </Button>
                    <Button variant="accent" disabled={!isDirty || saving} onClick={() => void handleSave()}>
                      {saving ? 'Saving...' : 'Save entitlement'}
                    </Button>
                  </div>
                </>
              )}
            </PanelSection>
          )}

          {/* -- AUDIT -- */}
          {tab === 'audit' && (
            <PanelSection
              title="QR audit log"
              icon={<ScrollText className="w-3.5 h-3.5" />}
              action={
                <Button size="sm" variant="ghost" onClick={() => void loadAudit()} disabled={audit.kind === 'loading'}>
                  <RefreshCw className={`w-3.5 h-3.5 ${audit.kind === 'loading' ? 'animate-spin' : ''}`} />
                  <span>Reload</span>
                </Button>
              }
            >
              {audit.kind === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SkeletonLine width="85%" height="18px" />
                  <SkeletonLine width="70%" height="18px" />
                  <SkeletonLine width="78%" height="18px" />
                </div>
              )}

              {audit.kind === 'unavailable' && (
                <InlineNote>
                  The QR audit endpoint is not available on this API build, so entitlement history cannot be
                  shown yet.
                </InlineNote>
              )}

              {audit.kind === 'error' && <InlineNote tone="error">{audit.message}</InlineNote>}

              {audit.kind === 'ready' && audit.data.length === 0 && (
                <EmptyState
                  icon={<ScrollText className="w-6 h-6" />}
                  title="No QR entitlement changes recorded"
                  description="Every platform change to this restaurant's QR entitlement will be listed here."
                />
              )}

              {audit.kind === 'ready' && audit.data.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {audit.data.map((entry) => {
                    const detailKeys = Object.keys(entry.details ?? {});
                    return (
                      <li
                        key={entry.id}
                        style={{
                          border: '1px solid var(--jv-border)',
                          borderRadius: 'var(--jv-radius-md)',
                          padding: '10px 12px',
                          background: 'var(--jv-surface-subtle)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            flexWrap: 'wrap'
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{humanizeAction(entry.action)}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--jv-text-muted)' }}>
                            {formatDateTime(entry.createdAt)} {DOT} {formatRelative(entry.createdAt)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--jv-text-muted)', marginTop: 3 }}>
                          Actor: {entry.actorId ? <span className="mono">{entry.actorId}</span> : 'System'}
                        </div>
                        {detailKeys.length > 0 && (
                          <div
                            style={{
                              marginTop: 8,
                              display: 'grid',
                              gridTemplateColumns: 'auto 1fr',
                              gap: '4px 14px',
                              fontSize: 12
                            }}
                          >
                            {detailKeys.map((key) => (
                              <Fragment key={`${entry.id}-${key}`}>
                                <span style={{ color: 'var(--jv-text-muted)' }}>{humanizeKey(key)}</span>
                                <span className="mono" style={{ wordBreak: 'break-word' }}>
                                  {typeof entry.details[key] === 'object'
                                    ? JSON.stringify(entry.details[key])
                                    : String(entry.details[key])}
                                </span>
                              </Fragment>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </PanelSection>
          )}
        </div>
      </div>
    </div>
  );
}
