import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_LABELS, type EntitlementKey, type PlanDetail } from '../../api/types';
import {
  CORE_PLAN_FEATURE_GROUPS,
  PRO_PLAN_FEATURE_GROUPS,
  OPERATIONAL_MODULE_CATEGORIES,
  countFeatures,
  type PlanFeatureGroup
} from '@jamanvaar/types';
import { Badge, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import './plans.css';

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .get<PlanDetail>(`/api/v1/plans/${id}`)
      .then(setPlan)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plan'));
  }, [id]);

  useEffect(load, [load]);

  const allFeatureGroups: PlanFeatureGroup[] = useMemo(() => {
    return [...CORE_PLAN_FEATURE_GROUPS, ...PRO_PLAN_FEATURE_GROUPS];
  }, []);

  const featureMetrics = useMemo(() => {
    if (!plan) return { enabledModules: 0, totalFeatures: 0 };
    const enabledGroups = allFeatureGroups.filter((g) =>
      g.entitlementKeys.some((k) => plan.entitlements[k as keyof typeof plan.entitlements])
    );
    return {
      enabledModules: enabledGroups.length,
      totalFeatures: countFeatures(enabledGroups)
    };
  }, [plan, allFeatureGroups]);

  if (error) return <div className="page-error">{error}</div>;
  if (!plan) return <div className="layout-loading">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link to="/plans" className="back-link">
        ← Back to plans
      </Link>

      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">{plan.name}</h1>
            <Badge tone={plan.tier === 'PRO' ? 'success' : 'neutral'}>{plan.tier}</Badge>
          </div>
          <p className="page-subtitle">
            {plan.description || `${plan.tier} tier plan licensing by KELVIONTECH`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={statusTone(plan.status)}>{plan.status}</Badge>
        </div>
      </div>

      <div className="detail-grid">
        {/* CARD 1: PRICING & LIMITS */}
        <Card className="detail-card">
          <div className="detail-card-title">Commercial Terms &amp; Quotas</div>
          <dl className="detail-list">
            <dt>Monthly Fee</dt>
            <dd style={{ fontWeight: 800, color: 'var(--jv-text)', fontSize: 16, fontFamily: 'monospace' }}>
              ₹{(plan.priceMonthly / 100).toLocaleString('en-IN')}
            </dd>
            <dt>Yearly Fee</dt>
            <dd>{plan.priceYearly ? `₹${(plan.priceYearly / 100).toLocaleString('en-IN')}` : '—'}</dd>
            <dt>Max Branches</dt>
            <dd>{plan.maxBranches} outlet{plan.maxBranches > 1 ? 's' : ''}</dd>
            <dt>Max Terminals</dt>
            <dd>{plan.maxDevices} devices (POS/Captain/KDS)</dd>
            <dt>Max Staff Users</dt>
            <dd>{plan.maxUsers} user accounts</dd>
            <dt>Granular Features</dt>
            <dd style={{ color: 'var(--jv-accent-text)', fontWeight: 800 }}>{featureMetrics.totalFeatures} Capabilities</dd>
          </dl>
        </Card>

        {/* CARD 2: MODULAR CAPABILITIES BREAKDOWN */}
        <Card className="detail-card">
          <div className="detail-card-title">
            <span>Modular Entitlements ({featureMetrics.enabledModules} Categories Active)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {OPERATIONAL_MODULE_CATEGORIES.map((cat) => {
              const activeCount = cat.entitlementKeys.filter((k) => plan.entitlements[k as EntitlementKey]).length;
              const hasAny = activeCount > 0;
              if (!hasAny) return null;

              const relatedGroups = allFeatureGroups.filter((g) => cat.catalogGroupIds.includes(g.id));
              const catFeatsCount = countFeatures(relatedGroups);

              return (
                <div
                  key={cat.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--jv-border)',
                    background: cat.isProExclusive ? '#fffaf5' : '#fafafa'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: 'var(--jv-text)' }}>
                      <span style={{ color: '#16a34a' }}>✓</span>
                      <span>{cat.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--jv-text-muted)' }}>
                      {catFeatsCount} Features
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {cat.entitlementKeys.map((k) => {
                      const on = plan.entitlements[k as EntitlementKey];
                      return (
                        <span
                          key={k}
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: on ? '#f0fdf4' : 'var(--jv-bg-muted)',
                            color: on ? '#166534' : 'var(--jv-text-light)',
                            border: `1px solid ${on ? '#86efac' : 'var(--jv-border)'}`,
                            fontWeight: 600
                          }}
                        >
                          {on ? '✓ ' : '— '}{ENTITLEMENT_LABELS[k as EntitlementKey] || k}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* CARD 3: SUBSCRIBED RESTAURANTS */}
        <Card className="detail-card detail-card-full">
          <div className="detail-card-title">Restaurants on this plan ({plan.subscriptions.length})</div>
          {plan.subscriptions.length === 0 ? (
            <EmptyState title="No subscriptions yet" description="Assign this plan to a restaurant from the Subscriptions page." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {plan.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/restaurants/${s.restaurant.id}`} className="table-link">
                        {s.restaurant.name}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </td>
                    <td>{new Date(s.expiresAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
