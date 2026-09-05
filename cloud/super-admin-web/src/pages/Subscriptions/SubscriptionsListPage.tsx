import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { SubscriptionListItem } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import { AssignSubscriptionModal } from './AssignSubscriptionModal';

export function SubscriptionsListPage() {
  const [subs, setSubs] = useState<SubscriptionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(() => {
    api
      .get<SubscriptionListItem[]>('/api/v1/subscriptions')
      .then(setSubs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load subscriptions'));
  }, []);

  useEffect(load, [load]);

  async function renew(id: string) {
    const days = window.prompt('Extend expiry by how many days?', '30');
    if (!days) return;
    try {
      const expiresAt = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
      await api.patch(`/api/v1/subscriptions/${id}/renew`, { expiresAt });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Renew failed');
    }
  }

  async function toggleStatus(sub: SubscriptionListItem) {
    try {
      const action = sub.status === 'SUSPENDED' ? 'reactivate' : 'suspend';
      await api.patch(`/api/v1/subscriptions/${sub.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <p className="page-subtitle">Every restaurant's subscription — assigned, renewed, and suspended from here, no payment gateway required.</p>
        </div>
        <Button variant="accent" onClick={() => setShowAssign(true)}>
          + Assign subscription
        </Button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {subs && (
        <Card>
          {subs.length === 0 ? (
            <EmptyState title="No subscriptions yet" description="Assign a plan to a restaurant to get started." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/restaurants/${s.restaurant.id}`} className="table-link">
                        {s.restaurant.name}
                      </Link>
                    </td>
                    <td>{s.plan.name}</td>
                    <td>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </td>
                    <td>{new Date(s.startDate).toLocaleDateString()}</td>
                    <td>{new Date(s.expiresAt).toLocaleDateString()}</td>
                    <td>
                      <div className="row-actions">
                        <Button variant="ghost" onClick={() => renew(s.id)}>
                          Renew
                        </Button>
                        <Button variant={s.status === 'SUSPENDED' ? 'primary' : 'danger'} onClick={() => toggleStatus(s)}>
                          {s.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showAssign && (
        <AssignSubscriptionModal
          onClose={() => setShowAssign(false)}
          onSaved={() => {
            setShowAssign(false);
            load();
          }}
        />
      )}
    </div>
  );
}
