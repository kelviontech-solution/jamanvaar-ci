import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Check,
  Eye,
  Gauge,
  Info,
  QrCode,
  RefreshCw,
  Signal,
  Sliders,
  Store,
  X
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { PlatformQrMetrics, RestaurantQrStatusItem, RestaurantQrStatus } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterTabs,
  SearchBar,
  SkeletonTable
} from '../../components/ui';
import { QrRestaurantDetailPanel } from './QrRestaurantDetailPanel';
import {
  DOT,
  EM_DASH,
  NO_USAGE_LABEL,
  QR_STATUS_LABELS,
  formatCount,
  formatRelative,
  formatRupees,
  qrStatusTone
} from './qrFormat';
import '../../components/shared.css';

type StatusFilter = 'ALL' | RestaurantQrStatus;
type UsageFilter = 'ALL' | 'REPORTING' | 'NOT_REPORTING';

const RESTAURANTS_ENDPOINT = '/api/v1/qr-ordering/restaurants';
const METRICS_ENDPOINT = '/api/v1/qr-ordering/metrics';

/** Muted em-dash cell used everywhere a measurement genuinely does not exist. */
function NoUsageCell({ note = NO_USAGE_LABEL }: { note?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--jv-text-light)' }}>{EM_DASH}</span>
      <span style={{ fontSize: 10.5, color: 'var(--jv-text-muted)' }}>{note}</span>
    </div>
  );
}

/**
 * A platform KPI tile. Aggregates derived from restaurant-reported usage render
 * as an em dash when nothing has been reported, never as a zero that would read
 * like a real measurement.
 */
function StatTile({
  label,
  value,
  sub,
  icon,
  iconClass,
  measured = true
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconClass: string;
  /** False when this figure is usage-derived and no usage has been reported. */
  measured?: boolean;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-tile-icon ${iconClass}`}>{icon}</span>
      </div>
      <div>
        <div
          className="stat-value"
          style={measured ? undefined : { color: 'var(--jv-text-light)', fontSize: 22 }}
        >
          {measured ? value : EM_DASH}
        </div>
        <div className="stat-sub">{sub}</div>
      </div>
    </div>
  );
}

export function QrOrderingPage() {
  const [restaurants, setRestaurants] = useState<RestaurantQrStatusItem[] | null>(null);
  const [metrics, setMetrics] = useState<PlatformQrMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('ALL');

  const [panelTarget, setPanelTarget] = useState<{ row: RestaurantQrStatusItem; tab: 'overview' | 'entitlement' } | null>(
    null
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await api.get<PlatformQrMetrics>(METRICS_ENDPOINT);
      setMetrics(data);
      setMetricsError(null);
    } catch (err) {
      setMetrics(null);
      setMetricsError(err instanceof ApiError ? err.message : 'Failed to load platform QR metrics');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.get<RestaurantQrStatusItem[]>(RESTAURANTS_ENDPOINT);
      setRestaurants(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the QR ordering fleet');
    } finally {
      setLoading(false);
    }
    await loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const applyRowUpdate = useCallback((updated: RestaurantQrStatusItem) => {
    setRestaurants((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    setPanelTarget((prev) => (prev && prev.row.id === updated.id ? { ...prev, row: updated } : prev));
  }, []);

  const handleQuickToggle = useCallback(
    async (row: RestaurantQrStatusItem) => {
      const next = !row.qrOrderingEnabled;
      setTogglingId(row.id);
      try {
        const updated = await api.patch<RestaurantQrStatusItem>(
          `${RESTAURANTS_ENDPOINT}/${row.id}/entitlement`,
          { qrOrderingEnabled: next }
        );
        applyRowUpdate(updated);
        showToast(`QR ordering ${next ? 'enabled' : 'disabled'} for ${row.name}`);
        void loadMetrics();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to update QR entitlement');
      } finally {
        setTogglingId(null);
      }
    },
    [applyRowUpdate, showToast, loadMetrics]
  );

  const planTiers = useMemo(() => {
    if (!restaurants) return [];
    return Array.from(new Set(restaurants.map((r) => r.planTier).filter(Boolean))).sort();
  }, [restaurants]);

  const statusCounts = useMemo(() => {
    const counts: Record<RestaurantQrStatus, number> = {
      ACTIVE: 0,
      DISABLED: 0,
      LIMIT_REACHED: 0,
      NOT_ENTITLED: 0
    };
    for (const r of restaurants ?? []) counts[r.status] += 1;
    return counts;
  }, [restaurants]);

  const filtered = useMemo(() => {
    if (!restaurants) return [];
    const q = search.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (planFilter !== 'ALL' && r.planTier !== planFilter) return false;
      if (usageFilter === 'REPORTING' && !r.hasUsageData) return false;
      if (usageFilter === 'NOT_REPORTING' && r.hasUsageData) return false;
      if (q) {
        const haystack = [r.name, r.primaryBranchName, r.city ?? '', r.planName].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [restaurants, statusFilter, planFilter, usageFilter, search]);

  const filtersActive =
    Boolean(search.trim()) || statusFilter !== 'ALL' || planFilter !== 'ALL' || usageFilter !== 'ALL';

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setPlanFilter('ALL');
    setUsageFilter('ALL');
  };

  // Usage-derived aggregates are only meaningful if at least one restaurant reports.
  const anyUsageReported = (metrics?.restaurantsReportingUsage ?? 0) > 0;
  const reportingCoverage = metrics
    ? `${formatCount(metrics.restaurantsReportingUsage)} of ${formatCount(metrics.totalRestaurants)} restaurants reporting`
    : '';

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">QR Ordering Suite Control</h1>
            <Badge tone="gold">SaaS Fleet</Badge>
          </div>
          <p className="page-subtitle">
            Platform control for QR table ordering entitlements, quotas and fleet health. Usage figures are
            reported by each restaurant&apos;s POS; the platform never estimates them.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh fleet</span>
        </Button>
      </div>

      {toast && (
        <div
          style={{
            padding: '10px 16px',
            background: '#0B253A',
            color: '#fff',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {toast}
        </div>
      )}

      {/* -- Platform metrics -- */}
      {metricsError && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>Platform QR metrics unavailable: {metricsError}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadMetrics()}>
            Retry
          </Button>
        </div>
      )}

      {!metrics && !metricsError && loading && (
        <div className="stat-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="stat-tile">
              <div className="skeleton-shimmer" style={{ height: 14, width: '55%', borderRadius: 4 }} />
              <div className="skeleton-shimmer" style={{ height: 26, width: '40%', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {metrics && (
        <>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <StatTile
              label="Restaurants"
              value={formatCount(metrics.totalRestaurants)}
              sub={`${formatCount(metrics.activeQrRestaurants)} active ${DOT} ${formatCount(
                metrics.disabledQrRestaurants
              )} disabled or unentitled`}
              icon={<Store className="w-5 h-5" />}
              iconClass="stat-tile-icon-blue"
            />
            <StatTile
              label="Reporting usage"
              value={formatCount(metrics.restaurantsReportingUsage)}
              sub={`${formatCount(metrics.restaurantsWithoutUsageData)} have never reported QR usage`}
              icon={<Signal className="w-5 h-5" />}
              iconClass="stat-tile-icon-purple"
            />
            <StatTile
              label="Active QR tables"
              value={formatCount(metrics.totalActiveTables)}
              sub={anyUsageReported ? reportingCoverage : NO_USAGE_LABEL}
              icon={<QrCode className="w-5 h-5" />}
              iconClass="stat-tile-icon-amber"
              measured={anyUsageReported}
            />
            <StatTile
              label="QR orders today"
              value={formatCount(metrics.totalQrOrdersToday)}
              sub={anyUsageReported ? reportingCoverage : NO_USAGE_LABEL}
              icon={<Gauge className="w-5 h-5" />}
              iconClass="stat-tile-icon-green"
              measured={anyUsageReported}
            />
            <StatTile
              label="QR revenue today"
              value={formatRupees(metrics.qrRevenueToday)}
              sub={anyUsageReported ? reportingCoverage : NO_USAGE_LABEL}
              icon={<Gauge className="w-5 h-5" />}
              iconClass="stat-tile-icon-orange"
              measured={anyUsageReported}
            />
            <StatTile
              label="Approaching quota"
              value={formatCount(metrics.restaurantsApproachingLimit)}
              sub="Candidates for a table quota or plan upgrade"
              icon={<Sliders className="w-5 h-5" />}
              iconClass="stat-tile-icon-orange"
            />
          </div>

          {/* Legend explaining the em-dash convention. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 14px',
              marginBottom: 20,
              borderRadius: 'var(--jv-radius-md)',
              border: '1px solid var(--jv-border)',
              background: 'var(--jv-bg-muted)',
              color: 'var(--jv-text-secondary)',
              fontSize: 12.5,
              lineHeight: 1.55
            }}
          >
            <Info className="w-4 h-4" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong style={{ color: 'var(--jv-text)' }}>Reading this page:</strong> a{' '}
              <span style={{ fontWeight: 800, color: 'var(--jv-text)' }}>{EM_DASH}</span> means the restaurant
              has not reported that measurement yet, not that it is zero. Active tables, orders, revenue and
              last activity appear once the restaurant&apos;s POS reports QR usage to the platform. Entitlements
              and quotas below are platform configuration and are always accurate.
              {metrics.restaurantsWithoutUsageData > 0 && (
                <>
                  {' '}
                  <strong style={{ color: 'var(--jv-text)' }}>
                    {formatCount(metrics.restaurantsWithoutUsageData)}
                  </strong>{' '}
                  restaurant(s) currently report nothing, so the fleet totals above cover only the rest.
                </>
              )}
            </span>
          </div>
        </>
      )}

      {/* -- Toolbar -- */}
      <div className="toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search restaurant, branch, city or plan..."
          width="300px"
        />

        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: restaurants?.length },
            { id: 'ACTIVE', label: QR_STATUS_LABELS.ACTIVE, count: statusCounts.ACTIVE },
            { id: 'DISABLED', label: QR_STATUS_LABELS.DISABLED, count: statusCounts.DISABLED },
            { id: 'LIMIT_REACHED', label: QR_STATUS_LABELS.LIMIT_REACHED, count: statusCounts.LIMIT_REACHED },
            { id: 'NOT_ENTITLED', label: QR_STATUS_LABELS.NOT_ENTITLED, count: statusCounts.NOT_ENTITLED }
          ]}
        />

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          aria-label="Filter by plan tier"
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: 'var(--jv-surface)', color: 'var(--jv-text)' }}
        >
          <option value="ALL">All plan tiers</option>
          {planTiers.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>

        <select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as UsageFilter)}
          aria-label="Filter by usage reporting"
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: 'var(--jv-surface)', color: 'var(--jv-text)' }}
        >
          <option value="ALL">Any usage state</option>
          <option value="REPORTING">Reporting usage</option>
          <option value="NOT_REPORTING">No usage reported</option>
        </select>

        {filtersActive && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {formatCount(filtered.length)} of {formatCount(restaurants?.length ?? 0)} restaurants
        </span>
      </div>

      {/* -- Fleet table -- */}
      {loading && !restaurants && <SkeletonTable rows={7} cols={7} />}

      {error && !restaurants && <ErrorState message={error} onRetry={() => void loadData()} />}

      {error && restaurants && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      {restaurants && (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<QrCode className="w-6 h-6" />}
              title={restaurants.length === 0 ? 'No restaurants on the platform yet' : 'No restaurants match these filters'}
              description={
                restaurants.length === 0
                  ? 'Once a restaurant tenant is onboarded it appears here with its QR entitlement and quota.'
                  : 'Try a different search term, status tab, plan tier or usage state.'
              }
              action={
                restaurants.length > 0 ? (
                  <Button variant="ghost" onClick={resetFilters}>
                    Reset filters
                  </Button>
                ) : (
                  <Link to="/restaurants/onboard" className="btn btn-accent btn-sm">
                    Onboard a restaurant
                  </Link>
                )
              }
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant &amp; branch</th>
                    <th>Plan</th>
                    <th>Entitlement</th>
                    <th>Active tables</th>
                    <th>Reported today</th>
                    <th>Status</th>
                    <th>Last activity</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const quota = r.maxActiveTables ?? 0; // no limit configured: no usage bar
                    const usedPct = r.hasUsageData && quota > 0 ? Math.min(100, (r.activeQrTables / quota) * 100) : 0;
                    const barColor =
                      quota > 0 && r.activeQrTables >= quota
                        ? 'var(--jv-error)'
                        : quota > 0 && r.activeQrTables >= quota * 0.8
                          ? 'var(--jv-warning)'
                          : 'var(--jv-success)';
                    const isToggling = togglingId === r.id;

                    return (
                      <tr key={r.id}>
                        {/* Restaurant */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                width: 34,
                                height: 34,
                                flexShrink: 0,
                                borderRadius: 'var(--jv-radius-md)',
                                background: 'var(--jv-bg-muted)',
                                border: '1px solid var(--jv-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: 12,
                                color: 'var(--jv-text-secondary)'
                              }}
                            >
                              {r.name.charAt(0).toUpperCase()}
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                              <button
                                type="button"
                                className="table-link"
                                onClick={() => setPanelTarget({ row: r, tab: 'overview' })}
                                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}
                              >
                                {r.name}
                              </button>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color: 'var(--jv-text-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  flexWrap: 'wrap'
                                }}
                              >
                                <Building2 className="w-3 h-3" />
                                <span>{r.primaryBranchName || EM_DASH}</span>
                                {r.branchCount > 1 && <span>{`+${r.branchCount - 1}`}</span>}
                                {r.city && (
                                  <>
                                    <span>{DOT}</span>
                                    <span>{r.city}</span>
                                  </>
                                )}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Plan */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontWeight: 600 }}>{r.planName}</span>
                            <Badge tone={r.planTier === 'CORE' ? 'neutral' : 'gold'}>{r.planTier}</Badge>
                          </div>
                        </td>

                        {/* Entitlement */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Badge tone={r.qrEntitled ? 'success' : 'neutral'}>
                              {r.qrEntitled ? 'Entitled' : 'Not entitled'}
                            </Badge>
                            {r.qrEntitled && (
                              <span style={{ fontSize: 11, color: 'var(--jv-text-muted)' }}>
                                Service {r.qrOrderingEnabled ? 'on' : 'off'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Active tables */}
                        <td>
                          {r.hasUsageData ? (
                            <div>
                              <span className="mono" style={{ fontWeight: 700 }}>
                                {formatCount(r.activeQrTables)} / {formatCount(quota)}
                              </span>
                              <div
                                style={{
                                  width: 96,
                                  height: 5,
                                  marginTop: 5,
                                  borderRadius: 999,
                                  background: 'var(--jv-bg-muted)',
                                  overflow: 'hidden'
                                }}
                              >
                                <div style={{ width: `${usedPct}%`, height: '100%', background: barColor }} />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <NoUsageCell />
                              <span style={{ fontSize: 10.5, color: 'var(--jv-text-muted)' }}>
                                Quota {formatCount(quota)}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Reported today */}
                        <td>
                          {r.hasUsageData ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <span className="mono" style={{ fontWeight: 700 }}>
                                {formatCount(r.ordersToday)} orders
                              </span>
                              <span className="mono" style={{ fontSize: 11.5, color: 'var(--jv-text-secondary)' }}>
                                {formatRupees(r.revenueToday)}
                              </span>
                              <span style={{ fontSize: 10.5, color: 'var(--jv-text-muted)' }}>
                                Reported {formatRelative(r.usageReportedAt)}
                              </span>
                            </div>
                          ) : (
                            <NoUsageCell />
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          <Badge tone={qrStatusTone(r.status)} pulse={r.status === 'ACTIVE'}>
                            {QR_STATUS_LABELS[r.status]}
                          </Badge>
                        </td>

                        {/* Last activity */}
                        <td>
                          {r.lastActivityAt ? (
                            <span style={{ fontSize: 12.5 }}>{formatRelative(r.lastActivityAt)}</span>
                          ) : (
                            <NoUsageCell note="No activity reported" />
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="row-actions">
                            <Button size="sm" variant="ghost" onClick={() => setPanelTarget({ row: r, tab: 'overview' })}>
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPanelTarget({ row: r, tab: 'entitlement' })}
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Manage</span>
                            </Button>
                            <Button
                              size="sm"
                              variant={r.qrOrderingEnabled ? 'danger' : 'primary'}
                              disabled={!r.qrEntitled || isToggling}
                              title={
                                r.qrEntitled
                                  ? r.qrOrderingEnabled
                                    ? 'Disable QR ordering'
                                    : 'Enable QR ordering'
                                  : 'Grant the QR entitlement first'
                              }
                              onClick={() => void handleQuickToggle(r)}
                            >
                              {isToggling ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : r.qrOrderingEnabled ? (
                                <X className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {panelTarget && (
        <QrRestaurantDetailPanel
          key={panelTarget.row.id}
          restaurant={panelTarget.row}
          initialTab={panelTarget.tab}
          onClose={() => setPanelTarget(null)}
          onUpdated={(updated) => {
            applyRowUpdate(updated);
            void loadMetrics();
          }}
          onToast={showToast}
        />
      )}
    </div>
  );
}
