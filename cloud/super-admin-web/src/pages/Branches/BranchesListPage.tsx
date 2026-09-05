import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Branch } from '../../api/types';
import { Badge, Button, Card, EmptyState, statusTone } from '../../components/ui';
import '../../components/shared.css';
import { CreateBranchModal } from './CreateBranchModal';

export function BranchesListPage() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    api
      .get<Branch[]>('/api/v1/branches')
      .then(setBranches)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load branches'));
  }, []);

  useEffect(load, [load]);

  async function toggleStatus(branch: Branch) {
    try {
      const action = branch.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await api.patch(`/api/v1/branches/${branch.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-subtitle">Every branch across every restaurant — a restaurant is never assumed to have just one.</p>
        </div>
        <Button variant="accent" onClick={() => setShowCreate(true)}>
          + Add branch
        </Button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {branches && (
        <Card>
          {branches.length === 0 ? (
            <EmptyState title="No branches yet" description="Every restaurant gets a default branch on creation." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Restaurant</th>
                  <th>Devices</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.name} <span className="muted mono">{b.code}</span>
                    </td>
                    <td>
                      {b.restaurant ? (
                        <Link to={`/restaurants/${b.restaurant.id}`} className="table-link">
                          {b.restaurant.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{b._count?.devices ?? 0}</td>
                    <td>{b._count?.users ?? 0}</td>
                    <td>
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </td>
                    <td>
                      <Button variant={b.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleStatus(b)}>
                        {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {showCreate && (
        <CreateBranchModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
