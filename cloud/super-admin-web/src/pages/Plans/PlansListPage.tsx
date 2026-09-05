import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Plan } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import { PlanFormModal } from './PlanFormModal';

export function PlansListPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'create' | Plan | null>(null);

  const load = useCallback(() => {
    api
      .get<Plan[]>('/api/v1/plans')
      .then(setPlans)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load plans'));
  }, []);

  useEffect(load, [load]);

  async function toggleStatus(plan: Plan) {
    try {
      const action = plan.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await api.patch(`/api/v1/plans/${plan.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans</h1>
          <p className="page-subtitle">SaaS plans available to restaurants — managed centrally, never hardcoded in a frontend.</p>
        </div>
        <Button variant="accent" onClick={() => setModal('create')}>
          + Create plan
        </Button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {plans && (
        <Card>
          {plans.length === 0 ? (
            <EmptyState title="No plans yet" description="Create your first plan to start assigning subscriptions." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Monthly</th>
                  <th>Yearly</th>
                  <th>Restaurants</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/plans/${p.id}`} className="table-link">
                        {p.name}
                      </Link>
                      <div className="muted">{p.tier}</div>
                    </td>
                    <td>₹{(p.priceMonthly / 100).toLocaleString('en-IN')}</td>
                    <td>{p.priceYearly ? `₹${(p.priceYearly / 100).toLocaleString('en-IN')}` : '—'}</td>
                    <td>{p._count?.subscriptions ?? 0}</td>
                    <td>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button variant="ghost" onClick={() => setModal(p)}>
                          Edit
                        </Button>
                        <Button variant={p.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleStatus(p)}>
                          {p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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

      {modal && (
        <PlanFormModal
          plan={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
