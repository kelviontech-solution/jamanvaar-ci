import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TenantUser } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';

export function OwnersListPage() {
  const [owners, setOwners] = useState<TenantUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TenantUser[]>('/api/v1/owners')
      .then(setOwners)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load owners'));
  }, []);

  useEffect(load, [load]);

  async function toggleStatus(owner: TenantUser) {
    try {
      const action = owner.status === 'DISABLED' ? 'activate' : 'suspend';
      await api.patch(`/api/v1/owners/${owner.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Owners</h1>
          <p className="page-subtitle">
            Tenant users with the OWNER role — structurally separate from Super Admin, always. An owner can never
            become platform staff through a role change.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {owners && (
        <Card>
          {owners.length === 0 ? (
            <EmptyState title="No owners yet" description="Owners are created automatically when you create a restaurant." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Restaurant</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.fullName}
                      <div className="muted">{o.email}</div>
                    </td>
                    <td>
                      {o.restaurant ? (
                        <Link to={`/restaurants/${o.restaurant.id}`} className="table-link">
                          {o.restaurant.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{o.phone ?? '—'}</td>
                    <td>
                      <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    </td>
                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td>
                      {o.status !== 'PENDING_ACTIVATION' && (
                        <Button variant={o.status === 'DISABLED' ? 'primary' : 'danger'} onClick={() => toggleStatus(o)}>
                          {o.status === 'DISABLED' ? 'Activate' : 'Suspend'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
