import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import { CreateRestaurantModal } from './CreateRestaurantModal';
import './restaurants.css';

export function RestaurantsListPage() {
  const [restaurants, setRestaurants] = useState<RestaurantListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    api
      .get<RestaurantListItem[]>('/api/v1/restaurants')
      .then(setRestaurants)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load restaurants'));
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurants</h1>
          <p className="page-subtitle">Every restaurant on the platform, across every branch.</p>
        </div>
        <Button variant="accent" onClick={() => setShowCreate(true)}>
          + Create restaurant
        </Button>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {restaurants && (
        <Card>
          {restaurants.length === 0 ? (
            <EmptyState
              title="No restaurants yet"
              description="Create the first restaurant to generate its owner account and default branch."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Location</th>
                  <th>Plan</th>
                  <th>Subscription</th>
                  <th>Branches</th>
                  <th>Devices</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => {
                  const sub = r.subscriptions[0];
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/restaurants/${r.id}`} className="table-link">
                          {r.name}
                        </Link>
                      </td>
                      <td>{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                      <td>{sub?.plan.name ?? '—'}</td>
                      <td>{sub ? <Badge tone={statusTone(sub.status)}>{sub.status}</Badge> : '—'}</td>
                      <td>{r._count.branches}</td>
                      <td>{r._count.devices}</td>
                      <td>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showCreate && (
        <CreateRestaurantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
