import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem, RestaurantSandbox } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Modal,
  ConfirmModal
} from '../../components/ui';
import {
  Boxes,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import '../../components/shared.css';

export function SandboxesPage() {
  const { can } = useAuth();
  const canWrite = can('ops', 'write');
  const [sandboxes, setSandboxes] = useState<RestaurantSandbox[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Clone Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [sandboxName, setSandboxName] = useState('');
  const [durationDays, setDurationDays] = useState('14');
  const [cloning, setCloning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RestaurantSandbox | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<RestaurantSandbox[]>('/api/v1/platform/sandboxes'),
      api.get<RestaurantListItem[]>('/api/v1/restaurants')
    ])
      .then(([sbx, rests]) => {
        setSandboxes(sbx);
        setRestaurants(rests);
        if (rests.length > 0 && !sourceId) {
          setSourceId(rests[0].id);
          setSandboxName(`${rests[0].name} Training Sandbox`);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sandboxes'))
      .finally(() => setLoading(false));
  }, [sourceId]);

  useEffect(loadData, [loadData]);

  async function handleCreateSandbox() {
    if (!sourceId || !sandboxName.trim()) return;
    setCloning(true);
    try {
      await api.post('/api/v1/platform/sandboxes', {
        sourceRestaurantId: sourceId,
        name: sandboxName.trim(),
        durationDays: parseInt(durationDays, 10) || 14
      });
      showToast(`Snapshot "${sandboxName}" saved`);
      setModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Sandbox clone failed');
    } finally {
      setCloning(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/platform/sandboxes/${id}`);
      showToast('Sandbox configuration deleted');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Configuration Snapshots</h1>
          <p className="page-subtitle">
            Saves a restaurant's menu/branch configuration for reference or future use — no passwords, payment credentials
            or customer order history. This does not create a runnable test environment yet: there is no login, no
            terminal, and no way to place a real or simulated order against it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="accent" disabled={!canWrite} title={canWrite ? undefined : "You don't have permission to save snapshots"} onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Save New Snapshot
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      <Card>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Saved Configuration Snapshots ({sandboxes.length})</h3>
        {sandboxes.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>
            <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            No configuration snapshots saved yet. Click "Save New Snapshot" to save a restaurant's current menu and branch setup for reference.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--jv-border-subtle)', textAlign: 'left', color: 'var(--jv-text-muted)' }}>
                  <th style={{ padding: '12px 14px' }}>Sandbox Environment</th>
                  <th style={{ padding: '12px 14px' }}>Source Restaurant</th>
                  <th style={{ padding: '12px 14px' }}>Environment Key</th>
                  <th style={{ padding: '12px 14px' }}>Expiry</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sandboxes.map((sbx) => (
                  <tr key={sbx.id} style={{ borderBottom: '1px solid var(--jv-border-subtle)' }}>
                    <td style={{ padding: '14px' }}>
                      <strong style={{ color: 'var(--jv-text)', fontSize: 14 }}>{sbx.name}</strong>
                      <div style={{ color: 'var(--jv-text-muted)', fontSize: 11 }}>Configuration snapshot (not a running environment)</div>
                    </td>
                    <td style={{ padding: '14px' }}>
                      {sbx.sourceRestaurant?.name || 'Production Tenant'}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <code style={{ background: 'var(--jv-bg-muted)', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {sbx.environmentKey}
                      </code>
                    </td>
                    <td style={{ padding: '14px', color: 'var(--jv-text-muted)' }}>
                      {new Date(sbx.expiresAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <Badge tone={sbx.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {sbx.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" disabled={!canWrite} title={canWrite ? undefined : "You don't have permission to delete snapshots"} onClick={() => setDeleteTarget(sbx)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Snapshot Modal */}
      {modalOpen && (
        <Modal title="Save Configuration Snapshot" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--jv-success-soft)', border: '1px solid var(--jv-ok-line)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--jv-success-text)' }}>
              <strong>What this saves:</strong> Menu/branch configuration and structure only — never password hashes, live payment
              credentials, or real customer order history. <strong>What this does not do:</strong> create a running, loggable-into test
              restaurant. It is a reference snapshot, not a live clone.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Source Restaurant *
              </label>
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  const selected = restaurants.find((r) => r.id === e.target.value);
                  if (selected) setSandboxName(`${selected.name} Training Sandbox`);
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.city || 'India'})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Sandbox Name *
              </label>
              <input
                type="text"
                value={sandboxName}
                onChange={(e) => setSandboxName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Keep until
              </label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
              <p style={{ fontSize: 11.5, color: 'var(--jv-text-muted)', marginTop: 4 }}>
                Informational only for now — the snapshot isn't automatically deleted when this date passes.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                variant="accent"
                onClick={handleCreateSandbox}
                disabled={cloning || !sandboxName.trim()}
              >
                {cloning ? 'Saving…' : 'Save Snapshot'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        message="This permanently deletes the saved configuration snapshot. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        isPending={deleting}
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget.id); }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
