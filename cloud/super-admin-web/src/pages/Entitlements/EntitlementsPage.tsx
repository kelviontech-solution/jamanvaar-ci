import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS, type Plan } from '../../api/types';
import { Card, EmptyState } from '../../components/ui';
import '../../components/shared.css';

export function EntitlementsPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Plan[]>('/api/v1/plans')
      .then(setPlans)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plans'));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Feature Entitlements</h1>
          <p className="page-subtitle">
            What each plan unlocks — read directly from <code className="mono">Plan.entitlements</code>. Edit a
            plan's checkboxes from the <Link to="/plans">Plans</Link> page to change this.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {plans && (
        <Card>
          {plans.length === 0 ? (
            <EmptyState title="No plans yet" description="Create a plan to see its feature matrix here." />
          ) : (
            <div className="entitlement-matrix">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    {plans.map((p) => (
                      <th key={p.id}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTITLEMENT_KEYS.map((key) => (
                    <tr key={key}>
                      <td>{ENTITLEMENT_LABELS[key]}</td>
                      {plans.map((p) => (
                        <td key={p.id}>
                          {p.entitlements[key] ? <span className="check-yes">✓</span> : <span className="check-no">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
