import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { ActivationKey } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import { GenerateActivationKeyModal } from './GenerateActivationKeyModal';

export function ActivationKeysListPage() {
  const [keys, setKeys] = useState<ActivationKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const load = useCallback(() => {
    api
      .get<ActivationKey[]>('/api/v1/activation-keys')
      .then(setKeys)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load activation keys'));
  }, []);

  useEffect(load, [load]);

  async function revoke(id: string) {
    if (!window.confirm('Revoke this activation key? It can never be redeemed after this.')) return;
    try {
      await api.patch(`/api/v1/activation-keys/${id}/revoke`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Revoke failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activation Keys</h1>
          <p className="page-subtitle">
            One-time setup codes for device activation — never a permanent device identity (see the device keypair
            flow, a later phase).
          </p>
        </div>
        <Button variant="accent" onClick={() => setShowGenerate(true)}>
          + Generate key
        </Button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {keys && (
        <Card>
          {keys.length === 0 ? (
            <EmptyState title="No activation keys yet" description="Generate one for a restaurant to hand off for device setup." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Restaurant</th>
                  <th>Device type</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="mono">{k.code}</td>
                    <td>
                      {k.restaurant ? (
                        <Link to={`/restaurants/${k.restaurant.id}`} className="table-link">
                          {k.restaurant.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{k.allowedDeviceType}</td>
                    <td>
                      <Badge tone={statusTone(k.status)}>{k.status}</Badge>
                    </td>
                    <td>{new Date(k.expiresAt).toLocaleDateString()}</td>
                    <td>
                      {k.status === 'ACTIVE' && (
                        <Button variant="danger" onClick={() => revoke(k.id)}>
                          Revoke
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

      {showGenerate && (
        <GenerateActivationKeyModal
          onClose={() => setShowGenerate(false)}
          onSaved={() => {
            setShowGenerate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
