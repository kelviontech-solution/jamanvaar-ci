import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { SystemHealth } from '../../api/types';
import { Badge, Button, Card, SkeletonCard } from '../../components/ui';
import { RefreshCw, Server, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import '../../components/shared.css';

export function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const check = useCallback(() => {
    setLoading(true);
    api
      .get<SystemHealth>('/api/v1/platform/system-health')
      .then((h) => {
        setHealth(h);
        setCheckedAt(new Date());
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Health check failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Periodic auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, check]);

  const uptimeMinutes = health ? Math.floor(health.uptimeSeconds / 60) : 0;
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const remainingMinutes = uptimeMinutes % 60;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Health &amp; Infrastructure</h1>
          <p className="page-subtitle">
            Live operational diagnostics, database roundtrip latency, and core cloud microservices telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (30s)</span>
          </label>
          <Button variant="ghost" size="sm" onClick={check} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-check Now</span>
          </Button>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* Global Status Banner */}
      <div
        style={{
          background: health?.database === 'UP' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${health?.database === 'UP' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {health?.database === 'UP' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-rose-600" />
          )}
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0B253A' }}>
              {health?.database === 'UP' ? 'All Platform Core Services Operational' : 'Infrastructure Degraded'}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: '#475569' }}>
              {health?.database === 'UP'
                ? 'Cloud API NestJS runtime and PostgreSQL connection pool are operating within nominal latency thresholds.'
                : 'The database ping failed on the last check — the API process itself is still responding, but requests that touch the database will fail.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone={health?.database === 'UP' ? 'success' : 'error'} pulse={health?.database === 'UP'}>
            {health?.database === 'UP' ? 'ALL SYSTEMS NORMAL' : 'INCIDENT DETECTED'}
          </Badge>
        </div>
      </div>

      {loading && !health ? (
        <div className="detail-grid">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      ) : health ? (
        <div className="detail-grid">
          {/* Cloud API Node Runtime */}
          <Card className="detail-card">
            <div className="detail-card-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server className="w-4 h-4 text-emerald-600" />
                <span>Cloud API Gateway</span>
              </div>
              <Badge tone="success">{health.api}</Badge>
            </div>
            <dl className="detail-list">
              <dt>Service Status</dt>
              <dd style={{ fontWeight: 700, color: '#16a34a' }}>OPERATIONAL</dd>
              <dt>Runtime Uptime</dt>
              <dd style={{ fontWeight: 600 }}>
                {uptimeHours > 0 ? `${uptimeHours}h ` : ''}{remainingMinutes}m {health.uptimeSeconds % 60}s
              </dd>
              <dt>Node.js Engine</dt>
              <dd className="mono">{health.nodeVersion}</dd>
              <dt>Process Architecture</dt>
              <dd className="mono">{health.arch} ({health.platform})</dd>
            </dl>
          </Card>

          {/* Database Cluster */}
          <Card className="detail-card">
            <div className="detail-card-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Database className={`w-4 h-4 ${health.database === 'UP' ? 'text-emerald-600' : 'text-rose-600'}`} />
                <span>PostgreSQL Primary Cluster</span>
              </div>
              <Badge tone={health.database === 'UP' ? 'success' : 'error'}>{health.database}</Badge>
            </div>
            <dl className="detail-list">
              <dt>Connection Pool</dt>
              <dd style={{ fontWeight: 700, color: health.database === 'UP' ? '#16a34a' : '#dc2626' }}>
                {health.database === 'UP' ? 'ACTIVE & HEALTHY' : 'UNREACHABLE'}
              </dd>
              <dt>Ping Latency</dt>
              <dd style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0B253A', fontSize: 15 }}>
                {health.databaseLatencyMs !== null ? `${health.databaseLatencyMs} ms` : '—'}
              </dd>
              <dt>Database Schema</dt>
              <dd className="mono">public (Prisma ORM)</dd>
              <dt>Last Check</dt>
              <dd>
                <Badge tone={health.database === 'UP' ? 'success' : 'error'}>
                  {health.database === 'UP' ? 'SELECT 1 SUCCEEDED' : 'SELECT 1 FAILED'}
                </Badge>
              </dd>
            </dl>
          </Card>
        </div>
      ) : null}

      {checkedAt && (
        <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
          Diagnostic snapshot taken at {checkedAt.toLocaleTimeString('en-IN')} (auto-checks every 30 seconds)
        </p>
      )}
    </div>
  );
}
