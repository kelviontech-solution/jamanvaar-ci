import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { SyncConflict, SyncEventLog, SyncMetrics } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Modal,
  SearchBar
} from '../../components/ui';
import {
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  GitMerge,
  ArrowRight,
  ShieldCheck,
  Server,
  Filter
} from 'lucide-react';
import '../../components/shared.css';

export function SyncMonitorPage() {
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [logs, setLogs] = useState<SyncEventLog[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [activeTab, setActiveTab] = useState<'LOGS' | 'CONFLICTS'>('LOGS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Selected conflict for inspection & resolution
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [resolving, setResolving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<SyncMetrics>('/api/v1/platform/telemetry/sync-metrics'),
      api.get<SyncEventLog[]>('/api/v1/platform/telemetry/sync-logs'),
      api.get<SyncConflict[]>('/api/v1/platform/telemetry/conflicts')
    ])
      .then(([m, l, c]) => {
        setMetrics(m);
        setLogs(l);
        setConflicts(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sync telemetry'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadData, [loadData]);

  async function handleResolveConflict(strategy: 'CLOUD_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE') {
    if (!selectedConflict) return;
    setResolving(true);
    try {
      await api.post(`/api/v1/platform/telemetry/conflicts/${selectedConflict.id}/resolve`, { strategy });
      showToast(`Conflict resolved with strategy: ${strategy}`);
      setSelectedConflict(null);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to resolve conflict');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Real-Time Telemetry & Sync Observability</h1>
          <p className="page-subtitle">
            Authoritative platform sync telemetry, order replication latency, LAN mesh health, and multi-version conflict resolution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      {/* Sync Operational Metric KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>24h Sync Events</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
            {metrics?.events24h ?? '—'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Replication Success Rate</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#15803d', marginTop: 4 }}>
            {metrics?.successRatePercent !== undefined ? `${metrics.successRatePercent}%` : '—'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* B2-026: "Active Reporting Terminals" read like a live online count (Device Fleet's own
              "ONLINE" tile, a 2-minute window) but this one counts anything that reported in the
              last 24h (see sync-observability.service.ts's own comment) — a real, different, and
              useful metric, just not labelled as covering a different window. An operator
              comparing the two pages saw "1 vs 9" with nothing explaining why. Named and grouped
              like the sibling "24h Sync Events" tile right next to it, which already says its own
              window in its own label. */}
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Terminals Reporting (24h)</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0369a1', marginTop: 4 }}>
            {metrics?.activeSyncingDevices ?? '—'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>Pending Conflicts</span>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#b91c1c', marginTop: 4 }}>
            {metrics?.pendingConflicts ?? 0}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 20 }}>
        <Button
          variant={activeTab === 'LOGS' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('LOGS')}
        >
          <Activity className="w-4 h-4 mr-1.5" /> Live Sync Event Stream ({logs.length})
        </Button>
        <Button
          variant={activeTab === 'CONFLICTS' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('CONFLICTS')}
        >
          <GitMerge className="w-4 h-4 mr-1.5" /> Sync Conflict Inspector ({conflicts.filter((c) => c.resolution === 'PENDING').length} Active)
        </Button>
      </div>

      {/* View 1: Live Event Stream */}
      {activeTab === 'LOGS' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Live Synchronization Stream</h3>
          {logs.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              No sync events reported in this period.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '12px 14px' }}>Entity & Action</th>
                    <th style={{ padding: '12px 14px' }}>Restaurant / Outlet</th>
                    <th style={{ padding: '12px 14px' }}>Device</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Latency</th>
                    <th style={{ padding: '12px 14px' }}>Payload</th>
                    <th style={{ padding: '12px 14px' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '14px' }}>
                        <strong style={{ color: '#0f172a' }}>{log.entityType}</strong>
                        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>
                          <code>{log.action}</code>
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {log.restaurant?.name || 'Central Platform'}
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        {log.device ? `${log.device.type} Terminal` : 'Cloud Bridge'}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <Badge tone={log.status === 'SUCCESS' ? 'success' : 'error'}>
                          {log.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '14px', color: log.latencyMs > 200 ? '#ea580c' : '#16a34a' }}>
                        {log.latencyMs} ms
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        {(log.payloadSize / 1024).toFixed(1)} KB
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* View 2: Conflict Inspector */}
      {activeTab === 'CONFLICTS' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Multi-Version Synchronization Conflicts</h3>
          {conflicts.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
              All data versions across Cloud and Edge terminals are currently in full sync.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '12px 14px' }}>Entity</th>
                    <th style={{ padding: '12px 14px' }}>Restaurant</th>
                    <th style={{ padding: '12px 14px' }}>Reason</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Detected At</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '14px' }}>
                        <strong style={{ color: '#0f172a' }}>{c.entityType}</strong>
                        <div style={{ color: '#94a3b8', fontSize: 11 }}>ID: {c.entityId}</div>
                      </td>
                      <td style={{ padding: '14px' }}>{c.restaurant?.name}</td>
                      <td style={{ padding: '14px', color: '#475569', maxWidth: 320 }}>
                        {c.reason}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <Badge tone={c.resolution === 'PENDING' ? 'warning' : 'success'}>
                          {c.resolution}
                        </Badge>
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        <Button variant="accent" size="sm" onClick={() => setSelectedConflict(c)}>
                          <GitMerge className="w-3.5 h-3.5 mr-1" /> Inspect & Resolve
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Conflict Resolution Modal */}
      {selectedConflict && (
        <Modal title={`Resolve Sync Conflict: ${selectedConflict.entityType}`} onClose={() => setSelectedConflict(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: 13, color: '#92400e' }}>
              <strong>Conflict Cause:</strong> {selectedConflict.reason}
            </div>

            {/* Side by side JSON Diff Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <strong style={{ display: 'block', fontSize: 13, color: '#0369a1', marginBottom: 6 }}>
                  📱 Local Edge Terminal Version
                </strong>
                <pre style={{ fontSize: 12, background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', overflowX: 'auto' }}>
                  {JSON.stringify(selectedConflict.localVersion, null, 2)}
                </pre>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <strong style={{ display: 'block', fontSize: 13, color: '#15803d', marginBottom: 6 }}>
                  ☁️ Authoritative Cloud Version
                </strong>
                <pre style={{ fontSize: 12, background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', overflowX: 'auto' }}>
                  {JSON.stringify(selectedConflict.cloudVersion, null, 2)}
                </pre>
              </div>
            </div>

            {/* Resolution Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Select Authoritative Resolution Strategy:
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  onClick={() => handleResolveConflict('CLOUD_WINS')}
                  disabled={resolving}
                >
                  Apply Cloud Wins
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleResolveConflict('LOCAL_WINS')}
                  disabled={resolving}
                >
                  Accept Terminal Version (Local Wins)
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleResolveConflict('MANUAL_MERGE')}
                  disabled={resolving}
                >
                  Manual Merge & Overwrite
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
