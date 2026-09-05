import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS, type PlanDetail } from '../../api/types';
import { Badge, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';

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

  if (error) return <div className="page-error">{error}</div>;
  if (!plan) return <div className="layout-loading">Loading…</div>;

  const enabledEntitlements = ENTITLEMENT_KEYS.filter((k) => plan.entitlements[k]);

  return (
    <div>
      <Link to="/plans" className="back-link">
        ← Back to plans
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{plan.name}</h1>
          <p className="page-subtitle">{plan.description || `${plan.tier} tier plan`}</p>
        </div>
        <Badge tone={statusTone(plan.status)}>{plan.status}</Badge>
      </div>

      <div className="detail-grid">
        <Card className="detail-card">
          <div className="detail-card-title">Pricing &amp; limits</div>
          <dl className="detail-list">
            <dt>Monthly</dt>
            <dd>₹{(plan.priceMonthly / 100).toLocaleString('en-IN')}</dd>
            <dt>Yearly</dt>
            <dd>{plan.priceYearly ? `₹${(plan.priceYearly / 100).toLocaleString('en-IN')}` : '—'}</dd>
            <dt>Max branches</dt>
            <dd>{plan.maxBranches}</dd>
            <dt>Max devices</dt>
            <dd>{plan.maxDevices}</dd>
            <dt>Max users</dt>
            <dd>{plan.maxUsers}</dd>
          </dl>
        </Card>

        <Card className="detail-card">
          <div className="detail-card-title">Included features ({enabledEntitlements.length})</div>
          {enabledEntitlements.length === 0 ? (
            <p className="muted">No features enabled yet — edit this plan to turn some on.</p>
          ) : (
            <ul className="simple-list">
              {enabledEntitlements.map((k) => (
                <li key={k}>{ENTITLEMENT_LABELS[k]}</li>
              ))}
            </ul>
          )}
        </Card>

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
