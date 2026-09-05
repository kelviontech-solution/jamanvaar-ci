import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AuditLogPage } from '../../api/types';
import { Card, EmptyState } from '../../components/ui';
import '../../components/shared.css';

const LIMIT = 25;

export function AuditLogsPage() {
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get<Array<{ category: string }>>('/api/v1/audit-logs/categories')
      .then((rows) => setCategories(rows.map((r) => r.category)))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (category) params.set('category', category);
    if (actorType) params.set('actorType', actorType);
    if (action) params.set('action', action);
    api
      .get<AuditLogPage>(`/api/v1/audit-logs?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load audit logs'));
  }, [page, category, actorType, action]);

  useEffect(load, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Every platform action, searchable — never includes passwords or tokens.</p>
        </div>
      </div>

      <div className="toolbar">
        <select
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={actorType}
          onChange={(e) => {
            setPage(1);
            setActorType(e.target.value);
          }}
        >
          <option value="">All actors</option>
          <option value="PLATFORM">Platform</option>
          <option value="TENANT">Tenant</option>
          <option value="SYSTEM">System</option>
        </select>
        <input
          type="text"
          placeholder="Search action…"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        />
      </div>

      {error && <div className="page-error">{error}</div>}

      {data && (
        <Card>
          {data.rows.length === 0 ? (
            <EmptyState title="No matching audit events" description="Try clearing a filter." />
          ) : (
            <>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Category</th>
                      <th>Actor</th>
                      <th>Restaurant</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="mono" style={{ fontWeight: 600, color: 'var(--jv-primary)' }}>
                          {row.action}
                        </td>
                        <td>
                          <span className="badge badge-neutral">{row.category}</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              row.actorType === 'PLATFORM'
                                ? 'badge-accent'
                                : row.actorType === 'SYSTEM'
                                ? 'badge-neutral'
                                : 'badge-gold'
                            }`}
                          >
                            {row.actorType}
                          </span>
                        </td>
                        <td className="mono">{row.restaurantId ? row.restaurantId.slice(0, 8) : '—'}</td>
                        <td>
                          {new Date(row.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <button
                  className="btn btn-ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {data.page} of {totalPages} ({data.total} events)
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
