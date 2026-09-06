import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AuditLogPage } from '../../api/types';
import { Badge, Button, Card, EmptyState, Modal, SearchBar, SkeletonTable } from '../../components/ui';
import { FileText, Eye } from 'lucide-react';
import '../../components/shared.css';

const LIMIT = 25;

export function AuditLogsPage() {
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  // Detail inspection modal
  const [selectedLog, setSelectedLog] = useState<{
    id: string;
    action: string;
    category: string;
    actorType: string;
    actorId?: string | null;
    restaurantId?: string | null;
    createdAt: string;
    metadata?: any;
  } | null>(null);

  useEffect(() => {
    api
      .get<Array<{ category: string }>>('/api/v1/audit-logs/categories')
      .then((rows) => setCategories(rows.map((r) => r.category)))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (category) params.set('category', category);
    if (actorType) params.set('actorType', actorType);
    if (action.trim()) params.set('action', action.trim());
    api
      .get<AuditLogPage>(`/api/v1/audit-logs?${params.toString()}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, [page, category, actorType, action]);

  useEffect(load, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Audit Logs</h1>
          <p className="page-subtitle">
            Immutable, cryptographically anchored operational event trail — tracking every platform action across all tenants.
          </p>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar
          value={action}
          onChange={(val) => {
            setPage(1);
            setAction(val);
          }}
          placeholder="Search by action keyword…"
          width="280px"
        />

        <select
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="">All Categories</option>
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
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="">All Actors</option>
          <option value="PLATFORM">Platform Admin</option>
          <option value="TENANT">Tenant Staff</option>
          <option value="SYSTEM">System Process</option>
        </select>

        {(action || category || actorType) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAction('');
              setCategory('');
              setActorType('');
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}

        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {data ? `${data.total} recorded events` : 'Loading events…'}
        </span>
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading && !data && <SkeletonTable rows={10} cols={5} />}

      {data && (
        <Card>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-6 h-6 text-slate-400" />}
              title="No matching audit events"
              description="Try modifying search keywords or resetting your category filters."
              action={
                (action || category || actorType) ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAction('');
                      setCategory('');
                      setActorType('');
                      setPage(1);
                    }}
                  >
                    Reset Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action Event</th>
                      <th>Category</th>
                      <th>Actor</th>
                      <th>Restaurant ID</th>
                      <th>Timestamp</th>
                      <th>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            className="table-link mono"
                            style={{ fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                            onClick={() => setSelectedLog(row)}
                          >
                            {row.action}
                          </button>
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
                        <td className="mono muted">{row.restaurantId ? row.restaurantId.slice(0, 10) + '…' : '—'}</td>
                        <td>
                          {new Date(row.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td>
                          <Button size="sm" variant="ghost" onClick={() => setSelectedLog(row)}>
                            <Eye className="w-3 h-3" />
                            <span>Details</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontSize: 13 }}>
                  Page <strong>{data.page}</strong> of <strong>{totalPages}</strong> ({data.total} events)
                </span>
                <button
                  className="btn btn-ghost btn-sm"
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

      {/* Audit Detail Modal */}
      {selectedLog && (
        <Modal
          title={`Audit Event Details — ${selectedLog.action}`}
          onClose={() => setSelectedLog(null)}
          footer={
            <Button variant="ghost" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <dl className="detail-list">
              <dt>Action</dt>
              <dd className="mono" style={{ fontWeight: 700, color: '#0B253A' }}>{selectedLog.action}</dd>
              <dt>Category</dt>
              <dd><Badge tone="neutral">{selectedLog.category}</Badge></dd>
              <dt>Actor Type</dt>
              <dd><span className="badge badge-accent">{selectedLog.actorType}</span></dd>
              <dt>Actor ID</dt>
              <dd className="mono">{selectedLog.actorId || 'Platform Service'}</dd>
              <dt>Target Restaurant</dt>
              <dd className="mono">{selectedLog.restaurantId || 'Platform Global'}</dd>
              <dt>Event Timestamp</dt>
              <dd>{new Date(selectedLog.createdAt).toLocaleString('en-IN')}</dd>
            </dl>

            {selectedLog.metadata && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-text-secondary)', marginBottom: 6 }}>
                  Event Payload Metadata:
                </div>
                <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--jv-border)' }}>
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
