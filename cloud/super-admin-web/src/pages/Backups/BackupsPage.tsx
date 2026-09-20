import { RefreshButton } from '../../components/RefreshButton';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import {
  PageHeader,
  Card,
  Badge,
  SearchBar,
  FilterTabs,
  SkeletonCard,
  SkeletonTable,
  EmptyState,
  ErrorState,
  Button,
  Modal
} from '../../components/ui';
import {
  Database,
  HardDrive,
  Download,
  AlertTriangle,
  CheckCircle2,
  Plus
} from 'lucide-react';
import './backups.css';

interface BackupItem {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantCity: string | null;
  deviceId: string | null;
  deviceType: string;
  method: 'MANUAL' | 'AUTOMATIC';
  status: 'COMPLETED' | 'FAILED';
  sizeBytes: number;
  errorMessage: string | null;
  createdAt: string;
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'CORRUPT';
  sha256Checksum?: string;
}

interface BackupFleetResponse {
  stats: {
    total: number;
    completed: number;
    failed: number;
    totalBytes: number;
    storageConfigured: boolean;
    successRatePercent?: number | null;
    lastSuccessfulAt?: string | null;
    storageMode?: 's3' | 'local';
    offsite?: boolean;
    encryptionEnabled?: boolean;
    storageNote?: string;
  };
  backups: BackupItem[];
}

interface RestaurantOption {
  id: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function BackupsPage() {
  const [data, setData] = useState<BackupFleetResponse | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'FAILED'>('ALL');

  // Trigger Snapshot Modal
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Restore Preview & Confirmation State
  const [restoreModalTarget, setRestoreModalTarget] = useState<any | null>(null);
  const [restorePreviewJob, setRestorePreviewJob] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingId(backupId);
    try {
      const res = await api.post<any>(`/api/v1/platform/backups/${backupId}/verify`, {});
      showToast(res.verificationStatus === 'VERIFIED' ? `Backup verified. ${res.verificationNote ?? ''}` : `Backup is CORRUPT. ${res.verificationNote ?? ''}`);
      load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const [restoring, setRestoring] = useState(false);
  const handleConfirmRestore = async () => {
    if (!restorePreviewJob) return;
    setRestoring(true);
    try {
      const res = await api.post<{ restored: { syncedEntities: number; syncedOrders: number } }>(
        `/api/v1/platform/backups/restore-jobs/${restorePreviewJob.id}/confirm`,
        { confirmed: true }
      );
      showToast(`Restored ${res.restored.syncedEntities} menu/data records and ${res.restored.syncedOrders} orders. A safety snapshot of the previous state was taken first.`);
      setRestoreModalTarget(null);
      setRestorePreviewJob(null);
      load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleOpenRestorePreview = async (backup: any) => {
    setRestoreModalTarget(backup);
    setPreviewLoading(true);
    setRestorePreviewJob(null);
    try {
      const job = await api.post<any>(`/api/v1/platform/backups/${backup.id}/preview-restore`, {
        targetType: 'STAGING_PREVIEW'
      });
      setRestorePreviewJob(job);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to generate restore preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<BackupFleetResponse>('/api/v1/platform/backups'),
      api.get<RestaurantOption[]>('/api/v1/restaurants')
    ])
      .then(([fleet, rests]) => {
        setData(fleet);
        setRestaurants(rests.map((r) => ({ id: r.id, name: r.name })));
        if (rests.length > 0 && !selectedRestaurantId) {
          setSelectedRestaurantId(rests[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load fleet backups');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDownload = async (restaurantId: string, backupId: string) => {
    setDownloadingId(backupId);
    try {
      const res = await api.get<{ url: string }>(`/api/v1/restaurants/${restaurantId}/backups/${backupId}/download`);
      if (res.url.startsWith('/')) {
        // Stored encrypted or on this server's disk: the API decrypts it, so it must be fetched with our session.
        const file = await api.download(res.url);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file.blob);
        link.download = file.filename ?? `backup-${backupId.slice(0, 8)}.json`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        }, 200);
      } else {
        window.open(res.url, '_blank');
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to generate download link');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleTriggerSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestaurantId) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      await api.post(`/api/v1/platform/backups/${selectedRestaurantId}/trigger`, {});
      setShowTriggerModal(false);
      load();
    } catch (e) {
      setTriggerError(e instanceof ApiError ? e.message : 'Failed to trigger snapshot');
    } finally {
      setTriggering(false);
    }
  };

  const filtered = (data?.backups ?? []).filter((b) => {
    const matchesSearch =
      search === '' ||
      b.restaurantName.toLowerCase().includes(search.toLowerCase()) ||
      b.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="backups-page-container">
      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
      <PageHeader
        title="Fleet Backups & Data Recovery"
        subtitle="Centralized tenant snapshot ledger, offline-first transaction sync backups, and emergency recovery downloads."
        actions={
          <div className="backups-header-actions">
            <RefreshButton loading={loading} onRefresh={load} />
            <Button
              variant="accent"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowTriggerModal(true)}
            >
              Trigger Snapshot
            </Button>
          </div>
        }
      />

      {data?.stats.storageNote && (
        <div className={data.stats.offsite && data.stats.encryptionEnabled ? 'banner' : 'banner banner-error'} role="note" style={{ marginBottom: 12 }}>
          <strong>Backup storage:</strong> {data.stats.storageNote}
          {data.stats.encryptionEnabled ? ' Backups are encrypted (AES-256-GCM).' : ''}
        </div>
      )}

      {/* KPI Overview Grid */}
      <div className="backups-kpi-grid">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <Card className="backups-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-blue">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Total Snapshots</span>
                <span className="kpi-value">{data.stats.total}</span>
                <span className="kpi-sub">{data.stats.completed} Completed successfully</span>
              </div>
            </Card>

            <Card className="backups-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-purple">
                <HardDrive className="w-5 h-5 text-purple-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Storage Consumed</span>
                <span className="kpi-value">{formatBytes(data.stats.totalBytes)}</span>
                <span className="kpi-sub">Compressed (gzip) in the storage bucket</span>
              </div>
            </Card>

            <Card className="backups-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-green">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Success Rate</span>
                <span className="kpi-value">
                  {data.stats.successRatePercent != null ? `${data.stats.successRatePercent}%` : '—'}
                </span>
                <span className="kpi-sub">
                  {data.stats.lastSuccessfulAt ? `Last good backup ${new Date(data.stats.lastSuccessfulAt).toLocaleString('en-IN')}` : 'No successful backup yet'}
                </span>
              </div>
            </Card>

            <Card className="backups-kpi-card">
              <div className={`kpi-icon-wrap ${data.stats.failed > 0 ? 'kpi-icon-orange' : 'kpi-icon-green'}`}>
                <AlertTriangle className={`w-5 h-5 ${data.stats.failed > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Failed Alerts</span>
                <span className="kpi-value">{data.stats.failed}</span>
                <span className="kpi-sub">Requires operator investigation</span>
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="backups-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by restaurant name or snapshot ID..."
          className="backups-search"
        />
        <FilterTabs
          options={[
            { id: 'ALL', label: 'All Snapshots', count: data?.backups.length },
            {
              id: 'COMPLETED',
              label: 'Completed',
              count: data?.backups.filter((b) => b.status === 'COMPLETED').length
            },
            {
              id: 'FAILED',
              label: 'Failed',
              count: data?.backups.filter((b) => b.status === 'FAILED').length
            }
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="backups-table-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Snapshot ID</th>
                  <th>Restaurant</th>
                  <th>Device / Origin</th>
                  <th>Method</th>
                  <th>Payload Size</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Integrity Verification</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        icon={<Database className="w-8 h-8 text-secondary" />}
                        title="No Backups Found"
                        description={
                          search || statusFilter !== 'ALL'
                            ? 'No backups match your search or filter criteria.'
                            : 'No restaurant database snapshots have been recorded yet.'
                        }
                        action={
                          <Button variant="accent" onClick={() => setShowTriggerModal(true)}>
                            Trigger First Snapshot
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono text-xs font-semibold">{b.id.slice(0, 13)}…</td>
                      <td>
                        <div className="restaurant-cell">
                          <span className="font-bold">{b.restaurantName}</span>
                          <span className="text-secondary text-xs">{b.restaurantCity ?? 'Main Location'}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone="neutral">{b.deviceType}</Badge>
                      </td>
                      <td>
                        <span className="text-sm font-medium">{b.method}</span>
                      </td>
                      <td className="font-mono text-sm">{formatBytes(b.sizeBytes)}</td>
                      <td className="text-secondary text-sm">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <Badge tone={b.status === 'COMPLETED' ? 'success' : 'error'}>
                          {b.status}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={b.verificationStatus === 'VERIFIED' ? 'success' : b.verificationStatus === 'CORRUPT' ? 'error' : 'neutral'}>
                          {b.verificationStatus ?? 'UNVERIFIED'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={verifyingId === b.id}
                            onClick={() => handleVerifyBackup(b.id)}
                          >
                            {verifyingId === b.id ? 'Checking…' : 'Verify SHA'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenRestorePreview(b)}
                          >
                            Preview restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={downloadingId === b.id || b.status !== 'COMPLETED'}
                            icon={<Download className="w-3.5 h-3.5" />}
                            onClick={() => handleDownload(b.restaurantId, b.id)}
                          >
                            {downloadingId === b.id ? 'Securing...' : 'Download'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restore preview: what is inside the backup. Restoring from the cloud is not available yet (BUG-073). */}
      {restoreModalTarget && (
        <Modal
          title="Restore backup"
          onClose={() => setRestoreModalTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRestoreModalTarget(null)}>Close</Button>
              {restorePreviewJob?.previewSummary?.restorableInCloud && (
                <Button variant="accent" disabled={restoring} onClick={handleConfirmRestore}>
                  {restoring ? 'Restoring…' : 'Restore this data'}
                </Button>
              )}
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {restorePreviewJob?.previewSummary?.restorableInCloud ? (
              <div className="banner" role="note">
                <strong>What restoring does:</strong> it first takes a fresh snapshot of the restaurant as it is now, then puts the
                menu/data records and orders listed below back into the cloud. The restaurant&apos;s terminals pick them up on their next sync.
                {' '}It does <strong>not</strong> touch: {(restorePreviewJob.previewSummary.notRestored as string[]).join(', ')}.
              </div>
            ) : restorePreviewJob ? (
              <div className="banner banner-error" role="note">
                {(restorePreviewJob.previewSummary?.notRestored as string[] | undefined)?.[0] ?? 'This backup cannot be restored from the cloud.'}
              </div>
            ) : null}

            {previewLoading ? (
              <div className="page-loading">Reading the backup…</div>
            ) : restorePreviewJob ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Restaurant:</span>
                  <strong>{restoreModalTarget.restaurantName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Backup taken:</span>
                  <span>{new Date(restoreModalTarget.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: '#64748b' }}>Size (compressed):</span>
                  <span>{formatBytes(restoreModalTarget.sizeBytes)}</span>
                </div>
                <div style={{ color: '#64748b', marginBottom: 4 }}>Contents</div>
                {Object.keys(restorePreviewJob.previewSummary?.counts ?? {}).length === 0 ? (
                  <div style={{ color: '#94a3b8' }}>No record lists found in this backup.</div>
                ) : (
                  Object.entries(restorePreviewJob.previewSummary.counts as Record<string, number>).map(([name, count]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {/* Trigger Snapshot Modal */}
      {showTriggerModal && (
        <Modal
          title="Trigger Operator Snapshot"
          onClose={() => setShowTriggerModal(false)}
          footer={
            <>
              <Button type="button" variant="ghost" disabled={triggering} onClick={() => setShowTriggerModal(false)}>
                Cancel
              </Button>
              {/* Inside the form via the `form` attribute so Enter and the button both submit it. */}
              <Button type="submit" form="trigger-snapshot-form" variant="accent" disabled={triggering || data?.stats.storageConfigured === false}>
                {triggering ? 'Creating Snapshot...' : 'Create Snapshot Now'}
              </Button>
            </>
          }
        >
          <form id="trigger-snapshot-form" onSubmit={handleTriggerSnapshot} className="modal-form" style={{ padding: 0 }}>
            {/* BUG-070/071: say so up front instead of letting the operator hit an error. */}
            {data?.stats.storageConfigured === false && (
              <div className="banner-error" role="alert">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Backup storage is not configured on the server, so snapshots cannot be created yet. Set the
                  BACKUP_S3_* environment variables (bucket, region, access key, secret) and restart the API.
                </span>
              </div>
            )}
            {triggerError && <div className="banner-error" role="alert">{triggerError}</div>}
            <div className="form-field">
              <label htmlFor="restaurant-select">Target Restaurant</label>
              <select
                id="restaurant-select"
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                required
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="snapshot-warning-notice">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                This exports the restaurant's cloud-side data (restaurant, branches, staff, devices, subscriptions, synced
                menu/orders) as a compressed snapshot, uploaded to backup storage and audited under your Super Admin
                credentials. Passwords and device credentials are never included.
              </span>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
