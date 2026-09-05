import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { DashboardSummary } from '../../api/types';
import { Card, EmptyState } from '../../components/ui';
import '../../components/shared.css';
import '../Dashboard/dashboard.css';

export function BillingPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>('/api/v1/platform/dashboard')
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load billing data'));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">
            Computed directly from active subscriptions × their plan's real price — no payment gateway wired up yet,
            so this is recognized revenue, not collected revenue.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {summary && (
        <>
          <div className="stat-grid">
            <Card className="stat-tile">
              <div className="stat-value">₹{summary.mrr.toLocaleString('en-IN')}</div>
              <div className="stat-label">Monthly Recurring Revenue</div>
            </Card>
            <Card className="stat-tile">
              <div className="stat-value">₹{summary.arr.toLocaleString('en-IN')}</div>
              <div className="stat-label">Annual Recurring Revenue (MRR × 12)</div>
            </Card>
            <Card className="stat-tile">
              <div className="stat-value">{summary.activeSubscriptions}</div>
              <div className="stat-label">Paying subscriptions</div>
            </Card>
            <Card className="stat-tile">
              <div className="stat-value">{summary.trialSubscriptions}</div>
              <div className="stat-label">Trial subscriptions (not in MRR)</div>
            </Card>
          </div>

          <Card className="activity-card">
            <div className="activity-header">Revenue by plan</div>
            {summary.planDistribution.length === 0 ? (
              <EmptyState title="No subscriptions yet" description="MRR appears once a restaurant is on a paid, active subscription." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Subscriptions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.planDistribution.map((p) => (
                    <tr key={p.planId}>
                      <td>{p.planName}</td>
                      <td>{p.subscriptionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
