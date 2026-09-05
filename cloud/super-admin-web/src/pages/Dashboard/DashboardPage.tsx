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
  Plus
} from 'lucide-react';
import './dashboard.css';

function formatAuditEvent(action: string): { title: string; tone: BadgeTone } {
  switch (action) {
    case 'RESTAURANT_CREATED':
      return { title: 'New Restaurant Onboarded', tone: 'success' };
    case 'RESTAURANT_ACTIVE':
      return { title: 'Restaurant Activated', tone: 'success' };
    case 'RESTAURANT_SUSPENDED':
      return { title: 'Restaurant Suspended', tone: 'error' };
    case 'RESTAURANT_UPDATED':
      return { title: 'Restaurant Details Updated', tone: 'neutral' };
    case 'PLAN_CREATED':
      return { title: 'New SaaS Plan Created', tone: 'accent' };
    case 'PLAN_UPDATED':
      return { title: 'SaaS Plan Updated', tone: 'neutral' };
    case 'SUBSCRIPTION_CREATED':
      return { title: 'Subscription Activated', tone: 'success' };
    case 'SUBSCRIPTION_EXTENDED':
      return { title: 'Subscription Renewed', tone: 'success' };
    case 'SUBSCRIPTION_CANCELLED':
      return { title: 'Subscription Cancelled', tone: 'error' };
    case 'ACTIVATION_KEY_GENERATED':
      return { title: 'Activation Key Generated', tone: 'accent' };
    case 'DEVICE_REGISTERED':
      return { title: 'POS Device Registered', tone: 'success' };
    case 'PLATFORM_LOGIN':
      return { title: 'Platform Admin Sign-In', tone: 'neutral' };
    default:
      return {
        title: action
          .toLowerCase()
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        tone: 'neutral'
      };
  }
}

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>('/api/v1/platform/dashboard')
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
  }, []);

  return (
    <div className="dashboard-wrapper">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Control Center</h1>
          <p className="page-subtitle">
            Executive overview across restaurant tenants, recurring subscriptions, device licensing, and operations.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/restaurants" className="btn btn-accent btn-sm">
            <Plus className="w-4 h-4" />
            <span>Onboard Restaurant</span>
          </Link>
          <Link to="/billing" className="btn btn-ghost btn-sm">
            <span>View Invoices</span>
          </Link>
        </div>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

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
                    <Badge tone="success" pulse>
                      ACTIVE BILLING
                    </Badge>
                  </div>
                  <Link to="/billing" className="mrr-link-action" title="Open Billing Management">
                    <span>Billing Hub</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
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
          </section>

          {/* ══════════════════════════════════════════════════════════
              TIER 2: BUSINESS & SUBSCRIPTION HEALTH
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Business & Lifecycle Health</span>
              <span className="section-badge">Tenant Dynamics</span>
            </div>

            <div className="health-grid">
              {/* New This Month */}
              <Card className="health-tile">
                <div className="health-icon-box bg-saffron-soft text-saffron">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="health-info">
                  <div className="health-number">+{summary.newRestaurantsThisMonth}</div>
                  <div className="health-label">New This Month</div>
                  <div className="health-note">Restaurant tenant growth</div>
                </div>
              </Card>

              {/* Suspended Restaurants */}
              <Card className="health-tile">
                <div
                  className={`health-icon-box ${
                    summary.suspendedRestaurants > 0
                      ? 'bg-rose-soft text-rose'
                      : 'bg-slate-soft text-slate'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="health-info">
                  <div className="health-number">{summary.suspendedRestaurants}</div>
                  <div className="health-label">Suspended Accounts</div>
                  <div className="health-note">
                    {summary.suspendedRestaurants > 0 ? 'Requires operational review' : 'No suspended tenants'}
                  </div>
                </div>
              </Card>

              {/* Trial Subscriptions */}
              <Card className="health-tile">
                <div className="health-icon-box bg-amber-soft text-amber">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="health-info">
                  <div className="health-number">{summary.trialSubscriptions}</div>
                  <div className="health-label">Trial Subscriptions</div>
                  <div className="health-note">Conversion pipeline</div>
                </div>
              </Card>

              {/* Expiring Within 30 Days */}
              <Card className="health-tile">
                <div
                  className={`health-icon-box ${
                    summary.expiringSubscriptions > 0
                      ? 'bg-amber-soft text-amber'
                      : 'bg-emerald-soft text-emerald'
                  }`}
                >
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div className="health-info">
                  <div className="health-number">{summary.expiringSubscriptions}</div>
                  <div className="health-label">Expiring in 30 Days</div>
                  <div className="health-note">
                    {summary.expiringSubscriptions > 0 ? 'Upcoming renewal watch' : 'Zero expiring soon'}
                  </div>
                </div>
              </Card>
            </div>

            {/* Plan Distribution Strip */}
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
              TIER 3: INFRASTRUCTURE & ACTIVITY TIMELINE
             ══════════════════════════════════════════════════════════ */}
          <section className="dashboard-section">
            <div className="section-heading">
              <span className="section-title">Operations & Platform Activity</span>
              <span className="section-badge">Hardware & Event Stream</span>
            </div>

            <div className="operations-split-grid">
              {/* Hardware & Platform Ops Card */}
              <div className="ops-left-column">
                <Card className="infrastructure-card">
                  <div className="card-header-bar">
                    <div className="card-header-title-group">
                      <Laptop2 className="w-4 h-4 text-saffron" />
                      <span className="card-header-text">Hardware & Terminals</span>
                    </div>
                    <Link to="/devices" className="card-link-sm">
                      View all
                    </Link>
                  </div>

                  <div className="infra-stats-row">
                    <div className="infra-stat-block">
                      <div className="infra-number">
                        {summary.onlineDevices} <span className="infra-number-sub">/ {summary.registeredDevices}</span>
                      </div>
                      <div className="infra-label">Online POS Devices</div>
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
                    <Link to="/branches" className="infra-quick-link">
                      <span>Explore Branches</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Card>

                {/* System Health Quick Card */}
                <Card className="quick-health-card">
                  <div className="quick-health-left">
                    <Server className="w-5 h-5 text-emerald" />
                    <div>
                      <div className="quick-health-title">Cloud Infrastructure</div>
                      <div className="quick-health-desc">API Gateway & Database cluster fully operational</div>
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
                        const { title, tone } = formatAuditEvent(event.action);
                        return (
                          <div key={event.id} className="activity-stream-item">
                            <div className="activity-bullet-col">
                              <span className={`activity-stream-dot badge-${tone}`} />
                              <span className="activity-stream-line" />
                            </div>
                            <div className="activity-content-col">
                              <div className="activity-row-top">
                                <span className="activity-event-name">{title}</span>
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
