import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Device } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';

export function DevicesListPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Device[]>('/api/v1/devices')
      .then(setDevices)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load devices'));
  }, []);

  useEffect(load, [load]);

  async function revoke(id: string) {
    if (!window.confirm('Revoke this device? It will no longer be able to sync or authenticate.')) return;
    try {
      await api.patch(`/api/v1/devices/${id}/revoke`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Revoke failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Registered Devices</h1>
          <p className="page-subtitle">
            POS, Captain, KDS and Kiosk terminals that have completed device activation. Real registrations only —
            none are fabricated here.
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {devices && (
        <Card>
          {devices.length === 0 ? (
            <EmptyState
              title="No devices registered yet"
              description="Devices appear here once the keypair-based activation flow (a later phase) registers one — nothing is shown until that's real."
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Restaurant</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th>App version</th>
                    <th>Last seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="badge badge-neutral">{d.type}</span>
                      </td>
                      <td>
                        {d.restaurant ? (
                          <Link to={`/restaurants/${d.restaurant.id}`} className="table-link">
                            {d.restaurant.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{d.branch?.name ?? '—'}</td>
                      <td>
                        <Badge tone={statusTone(d.status)} pulse={d.status === 'ACTIVE'}>
                          {d.status}
                        </Badge>
                      </td>
                      <td>{d.appVersion ?? '—'}</td>
                      <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}</td>
                      <td>
                        {d.status !== 'REVOKED' && (
                          <Button variant="danger" size="sm" onClick={() => revoke(d.id)}>
                            Revoke
                          </Button>
                        )}
                      </td>
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
