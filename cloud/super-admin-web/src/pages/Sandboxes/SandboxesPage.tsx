import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem, RestaurantSandbox } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Modal
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
import '../../components/shared.css';

export function SandboxesPage() {
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
      showToast(`Staging sandbox "${sandboxName}" provisioned successfully`);
      setModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Sandbox clone failed');
    } finally {
      setCloning(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/platform/sandboxes/${id}`);
      showToast('Sandbox environment deleted');
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">1-Click Staging Sandbox Clones</h1>
          <p className="page-subtitle">
            Isolated training and testing environments provisioned from production restaurant topologies without exposing secrets or customer PII.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="accent" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Clone New Sandbox
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      <Card>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Active Staging Sandboxes ({sandboxes.length})</h3>
        {sandboxes.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>
            <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            No staging sandboxes currently deployed. Click "Clone New Sandbox" to spawn an isolated demo or training environment.
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
                      <div style={{ color: 'var(--jv-text-muted)', fontSize: 11 }}>Isolated Sandbox</div>
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
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(sbx.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" /> Destroy
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Clone Modal */}
      {modalOpen && (
        <Modal title="1-Click Staging Sandbox Clone" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, fontSize: 13, color: '#166534' }}>
              <strong>Zero Leakage Guarantee:</strong> Sandboxes clone menu architecture, floor tables, and configuration. Password hashes, live payment credentials, and real customer order history are never cloned.
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
                Environment Expiry
              </label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                <option value="7">7 Days (Short Pilot)</option>
                <option value="14">14 Days (Standard Staff Training)</option>
                <option value="30">30 Days (Comprehensive Testing)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                variant="accent"
                onClick={handleCreateSandbox}
                disabled={cloning || !sandboxName.trim()}
              >
                {cloning ? 'Cloning Topology…' : 'Spawn Staging Sandbox'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
