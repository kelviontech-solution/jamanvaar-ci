import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { SystemHealth } from '../../api/types';
import { Badge, Card } from '../../components/ui';
import '../../components/shared.css';

export function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  function check() {
    api
      .get<SystemHealth>('/api/v1/platform/system-health')
      .then((h) => {
        setHealth(h);
        setCheckedAt(new Date());
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Health check failed'));
  }

  useEffect(check, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">
            Only facts this process can verify right now — no synthetic uptime percentages. Sync and device health
            will appear here once the sync engine and device fleet exist.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={check}>
          Re-check
        </button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {health && (
        <div className="detail-grid">
          <Card className="detail-card">
            <div className="detail-card-title">
              Cloud API <Badge tone="success">{health.api}</Badge>
            </div>
            <dl className="detail-list">
              <dt>Uptime</dt>
              <dd>{Math.floor(health.uptimeSeconds / 60)}m {health.uptimeSeconds % 60}s</dd>
              <dt>Node version</dt>
              <dd className="mono">{health.nodeVersion}</dd>
            </dl>
          </Card>

          <Card className="detail-card">
            <div className="detail-card-title">
              PostgreSQL <Badge tone={health.database === 'UP' ? 'success' : 'error'}>{health.database}</Badge>
            </div>
            <dl className="detail-list">
              <dt>Ping latency</dt>
              <dd>{health.databaseLatencyMs !== null ? `${health.databaseLatencyMs}ms` : '—'}</dd>
            </dl>
          </Card>

          <Card className="detail-card">
            <div className="detail-card-title">
              Local runtime sync <Badge tone="neutral">Coming Soon</Badge>
            </div>
            <p className="muted">
              No offline-runtime sync engine exists yet — this section activates once devices actually sync (see
              architecture doc §09).
            </p>
          </Card>
        </div>
      )}

      {checkedAt && <p className="muted" style={{ marginTop: 16 }}>Last checked {checkedAt.toLocaleTimeString()}</p>}
    </div>
  );
}
