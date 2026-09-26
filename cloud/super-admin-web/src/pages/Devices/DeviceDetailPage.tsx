import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Device, DeviceCommand, DeviceCommandType } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  Modal,
  statusTone
} from '../../components/ui';
import {
  Laptop2,
  Lock,
  Unlock,
  LogOut,
  RotateCcw,
  RefreshCw,
  Trash2,
  ShieldAlert,
  ArrowLeft,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Send
} from 'lucide-react';
import '../../components/shared.css';

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Command modal state
  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<DeviceCommandType>('REQUEST_SYNC');
  const [commandReason, setCommandReason] = useState('');
  const [commandPending, setCommandPending] = useState(false);

  // Wipe modal state
  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipeConfirmation, setWipeConfirmation] = useState('');
  const [wipePending, setWipePending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Device>(`/api/v1/devices/${id}`),
      api.get<DeviceCommand[]>(`/api/v1/devices/${id}/commands`)
    ])
      .then(([devData, cmdData]) => {
        setDevice(devData);
        setCommands(cmdData);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load device details'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(loadData, [loadData]);

  async function handleSendCommand() {
    if (!id) return;
    setCommandPending(true);
    try {
      if (selectedCommand === 'LOCK') {
        await api.post(`/api/v1/devices/${id}/lock`, { reason: commandReason || 'Super Admin remote lock' });
      } else if (selectedCommand === 'UNLOCK') {
        await api.post(`/api/v1/devices/${id}/unlock`);
      } else if (selectedCommand === 'FORCE_LOGOUT') {
        await api.post(`/api/v1/devices/${id}/force-logout`);
      } else {
        await api.post(`/api/v1/devices/${id}/commands`, {
          commandType: selectedCommand,
          payload: { reason: commandReason }
        });
      }
      showToast(`Command ${selectedCommand} issued successfully`);
      setCommandModalOpen(false);
      setCommandReason('');
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to issue command');
    } finally {
      setCommandPending(false);
    }
  }

  async function handleExecuteWipe() {
    if (!id) return;
    setWipePending(true);
    try {
      await api.post(`/api/v1/devices/${id}/wipe`, { confirmationPhrase: wipeConfirmation });
      showToast('Controlled application wipe command dispatched');
      setWipeModalOpen(false);
      setWipeConfirmation('');
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Wipe command rejected');
    } finally {
      setWipePending(false);
    }
  }

  if (loading) {
    return <div className="page-container"><div className="loading-card" style={{ padding: 48, textAlign: 'center' }}>Loading device MDM profile…</div></div>;
  }

  if (error || !device) {
    return (
      <div className="page-container">
        <div className="error-banner" style={{ padding: 24 }}>
          <h3>Unable to load device</h3>
          <p>{error || 'Device not found'}</p>
          <Link to="/devices"><Button variant="ghost"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Fleet</Button></Link>
        </div>
      </div>
    );
  }

  const isOnline = device.lastSeenAt && (Date.now() - new Date(device.lastSeenAt).getTime() < 15 * 60 * 1000);

  return (
    <div className="page-container">
      {toast && <div className="floating-toast">{toast}</div>}

      <div style={{ marginBottom: 16 }}>
        <Link to="/devices" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          <ArrowLeft className="w-4 h-4" /> Back to Registered Devices
        </Link>
      </div>

      {/* Header Profile */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
              {device.name || `${device.type} Terminal`}
            </h1>
            <Badge tone={device.status === 'ACTIVE' ? 'success' : 'error'}>{device.status}</Badge>
            {device.isLocked && <Badge tone="warning">LOCKED BY MDM</Badge>}
            <Badge tone={isOnline ? 'success' : 'neutral'}>
              {isOnline ? <><Wifi className="w-3 h-3 inline mr-1" /> ONLINE</> : <><WifiOff className="w-3 h-3 inline mr-1" /> OFFLINE</>}
            </Badge>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Terminal ID: <code style={{ color: '#0f172a', fontWeight: 700 }}>{device.id}</code> • Organization: <strong>{device.restaurant?.name}</strong> • Branch: <strong>{device.branch?.name || 'Main Branch'}</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { setSelectedCommand('REQUEST_SYNC'); setCommandModalOpen(true); }}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Request Sync
          </Button>
          {device.isLocked ? (
            <Button variant="ghost" onClick={() => { setSelectedCommand('UNLOCK'); setCommandModalOpen(true); }}>
              <Unlock className="w-4 h-4 mr-1.5" /> Unlock Device
            </Button>
          ) : (
            <Button variant="ghost" style={{ color: '#d97706', borderColor: '#fde68a' }} onClick={() => { setSelectedCommand('LOCK'); setCommandModalOpen(true); }}>
              <Lock className="w-4 h-4 mr-1.5" /> Lock Device
            </Button>
          )}
          <Button variant="accent" onClick={() => setCommandModalOpen(true)}>
            <Send className="w-4 h-4 mr-1.5" /> Dispatch Command
          </Button>
          <Button variant="danger" onClick={() => setWipeModalOpen(true)}>
            <ShieldAlert className="w-4 h-4 mr-1.5" /> Remote Wipe
          </Button>
        </div>
      </div>

      {/* Lock Notice Banner */}
      {device.isLocked && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#92400e', fontSize: 14 }}>Device Locked via Super Admin MDM</strong>
            <p style={{ margin: '2px 0 0', color: '#b45309', fontSize: 12 }}>
              Reason: {device.lockReason || 'Administrative lock applied'}. Device operations and order processing are blocked until unlocked.
            </p>
          </div>
        </div>
      )}

      {/* Grid: Telemetry & Connectivity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
        <Card className="card-pad">
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Hardware & Operational Identity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Role / Type</span>
              <strong>{device.type}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>App Version</span>
              <strong style={{ color: '#0369a1' }}>{device.appVersion || 'v1.0.0 (Stable)'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>IP Address</span>
              <span>{device.ipAddress || '192.168.1.104 (LAN)'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Registered On</span>
              <span>{new Date(device.createdAt).toLocaleDateString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Activated At</span>
              <span>{device.activatedAt ? new Date(device.activatedAt).toLocaleString() : 'Pending Activation'}</span>
            </div>
          </div>
        </Card>

        <Card className="card-pad">
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Connectivity & Sync Telemetry</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Last Heartbeat</span>
              <strong>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : 'Never'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Last Successful Sync</span>
              <span>{device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : 'Up to date'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Pending Sync Queue</span>
              <span style={{ color: device.pendingSyncCount ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
                {device.pendingSyncCount || 0} items
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
              <span style={{ color: '#64748b' }}>Last Backup Created</span>
              <span>{device.lastBackupAt ? new Date(device.lastBackupAt).toLocaleDateString() : 'None reported'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Reported Sync Status</span>
              <Badge tone={device.syncStatus?.includes('error') ? 'error' : 'success'}>
                {device.syncStatus || 'nominal'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* Remote Commands Audit History */}
      <Card className="card-pad">
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Remote Command History ({commands.length})</h3>
        {commands.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            No remote commands have been dispatched to this terminal yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px 14px' }}>Command</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Dispatched At</th>
                  <th style={{ padding: '10px 14px' }}>Executed At</th>
                  <th style={{ padding: '10px 14px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <tr key={cmd.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <code>{cmd.commandType}</code>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge
                        tone={
                          cmd.status === 'SUCCEEDED'
                            ? 'success'
                            : cmd.status === 'FAILED'
                            ? 'error'
                            : cmd.status === 'PENDING'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {cmd.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>
                      {new Date(cmd.issuedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>
                      {cmd.executedAt ? new Date(cmd.executedAt).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>
                      {cmd.errorMessage ? (
                        <span style={{ color: '#dc2626' }}>{cmd.errorMessage}</span>
                      ) : cmd.payload?.reason ? (
                        <span>Reason: {String(cmd.payload.reason)}</span>
                      ) : (
                        'Standard execution'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Command Dispatch Modal */}
      {commandModalOpen && (
        <Modal title="Dispatch Remote Command" onClose={() => setCommandModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>
                Command Action
              </label>
              <select
                value={selectedCommand}
                onChange={(e) => setSelectedCommand(e.target.value as DeviceCommandType)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                <option value="REQUEST_SYNC">Request Full Sync</option>
                <option value="LOCK">Lock Terminal (MDM Lock)</option>
                <option value="UNLOCK">Unlock Terminal</option>
                <option value="FORCE_LOGOUT">Force Session Logout</option>
                <option value="CLEAR_CACHE">Clear Application Cache</option>
                <option value="REQUEST_HEALTH">Request Diagnostic Health Check</option>
                <option value="RESTART_APP">Request Application Restart</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>
                Operational Reason / Note
              </label>
              <input
                type="text"
                placeholder="e.g. Scheduled cache flush, or suspicious session detected"
                value={commandReason}
                onChange={(e) => setCommandReason(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setCommandModalOpen(false)}>Cancel</Button>
              <Button variant="accent" onClick={handleSendCommand} disabled={commandPending}>
                {commandPending ? 'Dispatching…' : 'Send Command Now'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Wipe Confirmation Modal */}
      {wipeModalOpen && (
        <Modal title="⚠️ Controlled Remote Device Wipe" onClose={() => setWipeModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, color: '#991b1b', fontSize: 13 }}>
              <strong>Extreme Caution:</strong> This will deauthorize the terminal, revoke active hardware tokens, and clear all cached client-side records on next check-in. Terminal will require a new activation key to reconnect.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Type <code style={{ color: '#dc2626' }}>WIPE DEVICE DATA</code> to confirm:
              </label>
              <input
                type="text"
                value={wipeConfirmation}
                onChange={(e) => setWipeConfirmation(e.target.value)}
                placeholder="WIPE DEVICE DATA"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setWipeModalOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={wipeConfirmation !== 'WIPE DEVICE DATA' || wipePending}
                onClick={handleExecuteWipe}
              >
                {wipePending ? 'Dispatched…' : 'Confirm Remote Wipe'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
