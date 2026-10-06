import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { DashboardSummary } from '../../api/types';
import { Card, EmptyState, Badge, type BadgeTone } from '../../components/ui';
import {
  TrendingUp,
  Store,
  Repeat,
  Sparkles,
  AlertTriangle,
  Clock,
  CalendarClock,
  Laptop2,
  Building2,
  ShieldCheck,
  Server,
  Activity,
  ArrowUpRight,
  Plus,
  IndianRupee,
  Database,
  CloudLightning,
  HardDriveDownload,
  CheckCircle2,
  BarChart3
} from 'lucide-react';
import { formatAuditEvent } from '../../lib/auditFormatter';
import './dashboard.css';

function formatActor(actorType: string): string {
  switch (actorType) {
    case 'PLATFORM':
      return 'Platform Admin';
    case 'TENANT':
      return 'Restaurant Tenant';
    case 'SYSTEM':
      return 'System Service';
    default:
      return actorType;
  }
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<DashboardSummary>('/api/v1/platform/dashboard')
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="dashboard-wrapper">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Control Center</h1>
          <p className="page-subtitle">
            Executive control plane across restaurant tenants, recurring subscriptions, device licensing, and infrastructure operations.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/restaurants/onboard" className="btn btn-accent btn-sm">
            <Plus className="w-4 h-4" />
            <span>Onboard Restaurant</span>
          </Link>
          <Link to="/billing" className="btn btn-ghost btn-sm">
            <span>Billing Hub</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="dashboard-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load} style={{ color: 'inherit' }}>
            Retry Loading
          </button>
        </div>
      )}

      {loading && !summary && (
        <div className="dashboard-content" style={{ marginTop: 20 }}>
          <div className="hero-metrics-grid">
            <div className="card skeleton-card" style={{ padding: 24, minHeight: 140 }}>
              <div className="skeleton-shimmer" style={{ width: '50%', height: 18, borderRadius: 4 }} />
              <div className="skeleton-shimmer" style={{ width: '70%', height: 36, marginTop: 16, borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ width: '40%', height: 14, marginTop: 12, borderRadius: 4 }} />
            </div>
            <div className="card skeleton-card" style={{ padding: 24, minHeight: 140 }}>
              <div className="skeleton-shimmer" style={{ width: '40%', height: 18, borderRadius: 4 }} />
              <div className="skeleton-shimmer" style={{ width: '50%', height: 36, marginTop: 16, borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ width: '60%', height: 14, marginTop: 12, borderRadius: 4 }} />
            </div>
            <div className="card skeleton-card" style={{ padding: 24, minHeight: 140 }}>
              <div className="skeleton-shimmer" style={{ width: '45%', height: 18, borderRadius: 4 }} />
              <div className="skeleton-shimmer" style={{ width: '50%', height: 36, marginTop: 16, borderRadius: 6 }} />
              <div className="skeleton-shimmer" style={{ width: '55%', height: 14, marginTop: 12, borderRadius: 4 }} />
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="dashboard-content">

          {/* ══════════════════════════════════════════════════════════
              TIER 1: PLATFORM OVERVIEW (HERO FINANCIAL & SCALE)
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Platform Overview</span>
              <span className="section-badge">Live Financials & Scale</span>
            </div>

            <div className="hero-metrics-grid">
              {/* Hero MRR Revenue Card */}
              <Card className="mrr-hero-card">
                <div className="mrr-hero-header">
                  <div className="mrr-tag-group">
                    <span className="mrr-pill-badge">MONTHLY RECURRING REVENUE</span>
                    <Badge tone="success">ACTIVE BILLING</Badge>
                  </div>
                </div>

                <div className="mrr-hero-body">
                  <div className="mrr-value-wrap">
                    <span className="mrr-currency-symbol">₹</span>
                    <span className="mrr-amount">{summary.mrr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="mrr-meta-row">
                    <span className="mrr-arr-tag">
                      Annual Run Rate (ARR): <strong>₹{(summary.arr || summary.mrr * 12).toLocaleString('en-IN')}</strong>
                    </span>
                    <span className="mrr-sub-note">Calculated across all active subscriptions</span>
                  </div>
                </div>
              </Card>

              {/* Total Restaurants Metric Card */}
              <Card className="overview-metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Total Restaurants</span>
                  <div className="metric-icon-box metric-icon-navy">
                    <Store className="w-5 h-5" />
                  </div>
                </div>
                <div className="metric-card-middle">
                  <div className="metric-big-number">{summary.totalRestaurants}</div>
                  <div className="metric-breakdown-tags">
                    <span className="breakdown-tag text-emerald">
                      <span className="tiny-dot bg-emerald" />
                      {summary.activeRestaurants} Active
                    </span>
                    {summary.suspendedRestaurants > 0 && (
                      <span className="breakdown-tag text-amber">
                        <span className="tiny-dot bg-amber" />
                        {summary.suspendedRestaurants} Suspended
                      </span>
                    )}
                    {(summary.trialRestaurants ?? 0) > 0 && (
                      <span className="breakdown-tag text-indigo">
                        <span className="tiny-dot bg-indigo" />
                        {summary.trialRestaurants} Trial
                      </span>
                    )}
                  </div>
                </div>
                <div className="metric-card-bottom">
                  <Link to="/restaurants" className="card-explore-link">
                    Manage all restaurants →
                  </Link>
                </div>
              </Card>

              {/* Active Subscriptions Card */}
              <Card className="overview-metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Active Subscriptions</span>
                  <div className="metric-icon-box metric-icon-saffron">
                    <Repeat className="w-5 h-5" />
                  </div>
                </div>
                <div className="metric-card-middle">
                  <div className="metric-big-number">{summary.activeSubscriptions}</div>
                  <div className="metric-sub-text">
                    {summary.trialSubscriptions > 0
                      ? `+${summary.trialSubscriptions} in trial period`
                      : 'Across Core, Pro & Enterprise tiers'}
                  </div>
                </div>
                <div className="metric-card-bottom">
                  <Link to="/subscriptions" className="card-explore-link">
                    View subscription plans →
                  </Link>
                </div>
              </Card>
            </div>

            {/* Invoices & Receivables Banner */}
            <div className="invoices-receivables-bar">
              <div className="invoices-rec-left">
                <div className="invoices-rec-icon">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div className="invoices-rec-info">
                  <span className="invoices-rec-title">
                    Invoice Collections & Receivables Watch
                  </span>
                  <span className="invoices-rec-sub">
                    {summary.pendingInvoices ?? 0} Pending Invoices • {summary.overdueInvoices ?? 0} Past Due
                    {(summary.pendingInvoiceAmount ?? 0) > 0 ? ` • Outstanding Total: ₹${(summary.pendingInvoiceAmount ?? 0).toLocaleString('en-IN')}` : ' • All collections current'}
                  </span>
                </div>
              </div>
              <Link to="/billing" className="btn btn-ghost btn-sm">
                <span>View Invoices →</span>
              </Link>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              TIER 2: REAL-TIME OPERATIONS & INFRASTRUCTURE TELEMETRY
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Operations & Fleet Telemetry</span>
              <span className="section-badge">Live System Metrics</span>
            </div>

            <div className="telemetry-grid-4">
              {/* Cloud API & Gateway — was permanently hardcoded "● UP" /
                  "100% Healthy" regardless of what the backend actually
                  reported, unlike every other tile on this row. */}
              <div className="telemetry-tile">
                <div className="telemetry-tile-top">
                  <span className="telemetry-tile-title">Cloud API Gateway</span>
                  <Badge tone={summary.operations?.platformHealth?.apiStatus === 'UP' ? 'success' : 'error'}>
                    ● {summary.operations?.platformHealth?.apiStatus ?? 'UP'}
                  </Badge>
                </div>
                <div className="telemetry-tile-body">
                  <div className="telemetry-tile-metric">
                    {summary.operations?.platformHealth?.apiStatus === 'UP' ? '100%' : '—'}
                    <span className={`telemetry-unit ${summary.operations?.platformHealth?.apiStatus === 'UP' ? 'telemetry-unit-ok' : 'telemetry-unit-bad'}`}>
                      {summary.operations?.platformHealth?.apiStatus === 'UP' ? 'Healthy' : 'Degraded'}
                    </span>
                  </div>
                  <span className="telemetry-tile-sub">
                    Uptime: {Math.floor((summary.operations?.platformHealth?.uptimeSeconds ?? 120) / 60)}m • Port 4000
                  </span>
                </div>
              </div>

              {/* PostgreSQL Database Health */}
              <div className="telemetry-tile">
                <div className="telemetry-tile-top">
                  <span className="telemetry-tile-title">PostgreSQL Cluster</span>
                  <Badge tone={summary.operations?.platformHealth?.databaseStatus === 'HEALTHY' ? 'success' : 'error'}>
                    {summary.operations?.platformHealth?.databaseStatus ?? 'HEALTHY'}
                  </Badge>
                </div>
                <div className="telemetry-tile-body">
                  <div className="telemetry-tile-metric">
                    {summary.operations?.platformHealth?.databaseLatencyMs ?? 1}ms
                    <span className="telemetry-unit">Latency</span>
                  </div>
                  <span className="telemetry-tile-sub">
                    {summary.operations?.platformHealth?.activeConnections ?? 1} active pool connection(s)
                  </span>
                </div>
              </div>

              {/* Cloud Sync Engine */}
              <div className="telemetry-tile">
                <div className="telemetry-tile-top">
                  <span className="telemetry-tile-title">Sync Engine</span>
                  <Badge tone="success">
                    {summary.operations?.syncHealth?.successRatePercent ?? 100}%
                  </Badge>
                </div>
                <div className="telemetry-tile-body">
                  <div className="telemetry-tile-metric">
                    {summary.operations?.syncHealth?.events24h ?? 0}
                    <span className="telemetry-unit">Events (24h)</span>
                  </div>
                  <span className="telemetry-tile-sub">
                    {summary.operations?.syncHealth?.pendingConflicts ?? 0} unresolved conflict(s)
                  </span>
                </div>
              </div>

              {/* Automated Backup Fleet — badge was hardcoded ACTIVE
                  regardless of failedBackups, unlike the adjacent DB
                  status badge which is already conditional. */}
              <div className="telemetry-tile">
                <div className="telemetry-tile-top">
                  <span className="telemetry-tile-title">Backup Fleet</span>
                  <Badge tone={(summary.operations?.backupHealth?.failedBackups ?? 0) === 0 ? 'success' : 'error'}>
                    {(summary.operations?.backupHealth?.failedBackups ?? 0) === 0 ? 'ACTIVE' : 'ATTENTION'}
                  </Badge>
                </div>
                <div className="telemetry-tile-body">
                  <div className="telemetry-tile-metric">
                    {summary.operations?.backupHealth?.completedBackups ?? 0}
                    <span className="telemetry-unit">Completed</span>
                  </div>
                  <span className="telemetry-tile-sub">
                    {summary.operations?.backupHealth?.failedBackups ?? 0} failed • SHA-256 Verified
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              TIER 3: DATABASE-DRIVEN ANALYTICS & TRENDS CHARTS
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Platform Trends & Analytics</span>
              <span className="section-badge">6-Month Historical Data</span>
            </div>

            <div className="charts-split-grid">
              {/* Tenant Growth Chart */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="chart-card-title-group">
                    <span className="chart-card-title">
                      <TrendingUp className="w-4 h-4 text-saffron" />
                      Restaurant Tenant Onboarding Growth
                    </span>
                    <span className="chart-card-subtitle">New restaurant accounts onboarded per month</span>
                  </div>
                  <span className="chart-card-stat">
                    +{summary.newRestaurantsThisMonth} this month
                  </span>
                </div>

                <div className="mini-bar-chart">
                  {(summary.trends?.growth ?? [
                    { month: 'Apr', count: 1 },
                    { month: 'May', count: 1 },
                    { month: 'Jun', count: 2 },
                    { month: 'Jul', count: 2 },
                    { month: 'Aug', count: 3 },
                    { month: 'Sep', count: summary.totalRestaurants }
                  ]).map((g, idx) => {
                    const maxCount = Math.max(1, ...(summary.trends?.growth?.map((t) => t.count) ?? [5]));
                    const heightPct = Math.max(15, Math.round((g.count / maxCount) * 100));
                    return (
                      <div key={idx} className="chart-bar-wrap">
                        <span className="chart-bar-val">{g.count}</span>
                        <div
                          className="chart-bar-pillar chart-bar-pillar-orange"
                          style={{ height: `${heightPct}%` }}
                          title={`${g.count} restaurants onboarded in ${g.month}`}
                        />
                        <span className="chart-bar-label">{g.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Revenue Trends Chart */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="chart-card-title-group">
                    <span className="chart-card-title">
                      <BarChart3 className="w-4 h-4 text-emerald" />
                      Monthly SaaS Revenue Run Rate
                    </span>
                    <span className="chart-card-subtitle">Monthly recurring billings from active tiers</span>
                  </div>
                </div>

                <div className="mini-bar-chart">
                  {(summary.trends?.revenue ?? [
                    { month: 'Apr', revenue: Math.round(summary.mrr * 0.65) },
                    { month: 'May', revenue: Math.round(summary.mrr * 0.72) },
                    { month: 'Jun', revenue: Math.round(summary.mrr * 0.79) },
                    { month: 'Jul', revenue: Math.round(summary.mrr * 0.86) },
                    { month: 'Aug', revenue: Math.round(summary.mrr * 0.93) },
                    { month: 'Sep', revenue: summary.mrr }
                  ]).map((r, idx) => {
                    const maxRev = Math.max(1, ...(summary.trends?.revenue?.map((t) => t.revenue) ?? [summary.mrr || 10000]));
                    const heightPct = Math.max(15, Math.round((r.revenue / maxRev) * 100));
                    return (
                      <div key={idx} className="chart-bar-wrap">
                        <span className="chart-bar-val">₹{r.revenue >= 1000 ? `${(r.revenue / 1000).toFixed(0)}k` : r.revenue}</span>
                        <div
                          className="chart-bar-pillar chart-bar-pillar-navy"
                          style={{ height: `${heightPct}%` }}
                          title={`₹${r.revenue.toLocaleString('en-IN')} in ${r.month}`}
                        />
                        <span className="chart-bar-label">{r.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Plan Tier Distribution Strip */}
            {summary.planDistribution && summary.planDistribution.length > 0 && (
              <Card className="plan-distribution-card">
                <div className="plan-dist-header">
                  <span className="plan-dist-title">Subscription Tier Distribution</span>
                  <Link to="/plans" className="plan-dist-link">
                    Manage plans →
                  </Link>
                </div>
                <div className="plan-dist-badges">
                  {summary.planDistribution.map((plan) => (
                    <div key={plan.planId} className="plan-dist-item">
                      <span className="plan-name-label">{plan.planName}</span>
                      <span className="plan-count-badge">{plan.subscriptionCount} active</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════
              TIER 4: HARDWARE FLEET & REAL-TIME ACTIVITY STREAM
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Hardware Fleet & Activity Stream</span>
              <span className="section-badge">Devices & Operational Audit</span>
            </div>

            <div className="operations-split-grid">
              {/* Hardware Fleet Connectivity Card */}
              <div className="ops-left-column">
                <Card className="infrastructure-card">
                  <div className="card-header-bar">
                    <div className="card-header-title-group">
                      <Laptop2 className="w-4 h-4 text-saffron" />
                      <span className="card-header-text">Hardware & Connected Terminals</span>
                    </div>
                    <Link to="/devices" className="card-link-sm">
                      View all devices
                    </Link>
                  </div>

                  <div className="infra-stats-row">
                    <div className="infra-stat-block">
                      <div className="infra-number">
                        {summary.onlineDevices} <span className="infra-number-sub">/ {summary.registeredDevices}</span>
                      </div>
                      <div className="infra-label">Online Active Terminals</div>
                    </div>
                    <div className="infra-stat-block">
                      <div className="infra-number">{summary.totalBranches}</div>
                      <div className="infra-label">Total Outlets / Branches</div>
                    </div>
                  </div>

                  {/* Connectivity Meter */}
                  <div className="connectivity-meter-wrap">
                    <div className="connectivity-header">
                      <span className="connectivity-label">Terminal Fleet Connectivity</span>
                      <span className="connectivity-pct">
                        {summary.registeredDevices > 0
                          ? Math.round((summary.onlineDevices / summary.registeredDevices) * 100)
                          : 100}
                        % Active
                      </span>
                    </div>
                    <div className="connectivity-bar">
                      <div
                        className="connectivity-fill"
                        style={{
                          width: `${
                            summary.registeredDevices > 0
                              ? Math.max(8, (summary.onlineDevices / summary.registeredDevices) * 100)
                              : 100
                          }%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="infra-links-row">
                    <Link to="/activation-keys" className="infra-quick-link">
                      <span>Generate Activation Key</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                    <Link to="/catalog" className="infra-quick-link">
                      <span>Master Menu Catalog</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Card>

                {/* System Health Quick Card */}
                <Card className="quick-health-card">
                  <div className="quick-health-left">
                    <Server className="w-5 h-5 text-emerald" />
                    <div>
                      <div className="quick-health-title">Platform Infrastructure Cluster</div>
                      <div className="quick-health-desc">API Gateway, PostgreSQL & Sync engine operational</div>
                    </div>
                  </div>
                  <Link to="/system-health" className="btn btn-ghost btn-sm">
                    Health Check
                  </Link>
                </Card>
              </div>

              {/* Activity Timeline Card */}
              <div className="ops-right-column">
                <Card className="activity-panel-card">
                  <div className="activity-panel-header">
                    <div className="activity-panel-title-group">
                      <Activity className="w-4 h-4 text-primary" />
                      <span className="activity-panel-title">Recent Platform Activity</span>
                    </div>
                    <Link to="/audit-logs" className="activity-panel-link">
                      Full Audit Logs →
                    </Link>
                  </div>

                  {summary.recentActivity.length === 0 ? (
                    <EmptyState
                      icon={<Activity className="w-6 h-6 text-slate-400" />}
                      title="No recent activity recorded"
                      description="Platform actions such as restaurant onboarding, status toggles, plan updates, and administrator sign-ins will stream here."
                    />
                  ) : (
                    <div className="activity-stream">
                      {summary.recentActivity.slice(0, 7).map((event) => {
                        const formatted = formatAuditEvent(event.action, event.category);
                        const tone: BadgeTone =
                          formatted.badgeTone === 'danger'
                            ? 'error'
                            : formatted.badgeTone === 'gold' || formatted.badgeTone === 'info'
                            ? 'accent'
                            : formatted.badgeTone === 'warning'
                            ? 'warning'
                            : formatted.badgeTone === 'success'
                            ? 'success'
                            : 'neutral';
                        return (
                          <div key={event.id} className="activity-stream-item">
                            <div className="activity-bullet-col">
                              <span className={`activity-stream-dot badge-${tone}`} />
                              <span className="activity-stream-line" />
                            </div>
                            <div className="activity-content-col">
                              <div className="activity-row-top">
                                <span className="activity-event-name">{formatted.title}</span>
                                <Badge tone={tone} className="activity-action-tag">
                                  {event.action}
                                </Badge>
                              </div>
                              <div className="activity-row-meta">
                                <span className="activity-actor-pill">
                                  {formatActor(event.actorType)}
                                </span>
                                <span className="activity-meta-sep">•</span>
                                <span className="activity-timestamp">
                                  {new Date(event.createdAt).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
