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
  Button
} from '../../components/ui';
import {
  Database,
  HardDrive,
  Download,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
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
}

interface BackupFleetResponse {
  stats: {
    total: number;
    completed: number;
    failed: number;
    totalBytes: number;
    storageConfigured: boolean;
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
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
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
      window.open(res.url, '_blank');
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
            <Button
              variant="ghost"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={load}
            >
              Refresh
            </Button>
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
                <span className="kpi-sub">Encrypted tenant bucket storage</span>
              </div>
            </Card>

            <Card className="backups-kpi-card">
              <div className="kpi-icon-wrap kpi-icon-green">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="kpi-meta">
                <span className="kpi-label">Success Rate</span>
                <span className="kpi-value">
                  {data.stats.total > 0
                    ? `${Math.round((data.stats.completed / data.stats.total) * 100)}%`
                    : '100%'}
                </span>
                <span className="kpi-sub">Automated POS sync & manual</span>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={downloadingId === b.id || b.status !== 'COMPLETED'}
                          icon={<Download className="w-3.5 h-3.5" />}
                          onClick={() => handleDownload(b.restaurantId, b.id)}
                        >
                          {downloadingId === b.id ? 'Securing...' : 'Download'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trigger Snapshot Modal */}
      {showTriggerModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Trigger Operator Snapshot</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowTriggerModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleTriggerSnapshot} className="modal-form">
              {triggerError && <div className="modal-error-banner">{triggerError}</div>}
              <div className="modal-field">
                <label htmlFor="restaurant-select">Target Restaurant</label>
                <select
                  id="restaurant-select"
                  value={selectedRestaurantId}
                  onChange={(e) => setSelectedRestaurantId(e.target.value)}
                  className="modal-select"
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
                  This triggers an authoritative point-in-time snapshot. The encrypted payload will be
                  uploaded to tenant storage and audited under your Super Admin credentials.
                </span>
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={triggering}
                  onClick={() => setShowTriggerModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="accent" disabled={triggering}>
                  {triggering ? 'Creating Snapshot...' : 'Create Snapshot Now'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
