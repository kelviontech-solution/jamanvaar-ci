import { RefreshButton } from '../../components/RefreshButton';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Branch, Device, OfflineExtension, RestaurantListItem } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Modal
} from '../../components/ui';
import {
  ShieldAlert,
  Clock,
  KeyRound,
  CheckCircle2,
  Plus,
  AlertTriangle,
  FileCheck2,
  XCircle
} from 'lucide-react';
import '../../components/shared.css';

export function OfflinePolicyPage() {
  const [extensions, setExtensions] = useState<OfflineExtension[]>([]);
  const [approachingExpiry, setApproachingExpiry] = useState<Device[]>([]);
  const [lockedOffline, setLockedOffline] = useState<Device[]>([]);
  const [policy, setPolicy] = useState<{ offlineGraceDays: number; warnAfterDays: number }>({ offlineGraceDays: 7, warnAfterDays: 4 });
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  // null until the check returns; only a definite "not configured" blocks issuing.
  const [signing, setSigning] = useState<{ configured: boolean; reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Grant Extension Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [targetRestaurantId, setTargetRestaurantId] = useState('');
  const [targetDays, setTargetDays] = useState('14');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [granting, setGranting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<OfflineExtension[]>('/api/v1/platform/offline-policy/extensions'),
      api.get<Device[]>('/api/v1/platform/offline-policy/approaching-expiry'),
      api.get<Device[]>('/api/v1/platform/offline-policy/approaching-expiry?state=locked').catch(() => [] as Device[]),
      api.get<{ offlineGraceDays: number; warnAfterDays: number }>('/api/v1/platform/offline-policy/policy').catch(() => null),
      api.get<RestaurantListItem[]>('/api/v1/restaurants'),
      api.get<Branch[]>('/api/v1/branches').catch(() => [] as Branch[]),
      api.get<{ configured: boolean; reason?: string }>('/api/v1/platform/offline-policy/signing-status').catch(() => null)
    ])
      .then(([exts, appDevs, lockedDevs, policyData, rests, allBranches, signingStatus]) => {
        if (policyData) setPolicy(policyData);
        setLockedOffline(lockedDevs);
        setSigning(signingStatus);
        setExtensions(exts);
        setApproachingExpiry(appDevs);
        setRestaurants(rests);
        setBranches(allBranches);
        if (rests.length > 0 && !targetRestaurantId) {
          setTargetRestaurantId(rests[0].id);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load offline policies'))
      .finally(() => setLoading(false));
  }, [targetRestaurantId]);

  useEffect(loadData, [loadData]);

  async function handleGrantExtension() {
    if (!targetRestaurantId || !grantReason.trim() || !requestedBy.trim()) return;
    setGranting(true);
    try {
      const granted = await api.post<OfflineExtension>('/api/v1/platform/offline-policy/grant', {
        restaurantId: targetRestaurantId,
        branchId: targetBranchId || undefined,
        extensionDays: parseInt(targetDays, 10) || 14,
        reason: grantReason.trim(),
        requestedBy: requestedBy.trim(),
        ticketRef: ticketRef.trim() || undefined
      });
      showToast(
        `Emergency offline extension granted for ${targetDays} days.${granted.warnings?.length ? ' ' + granted.warnings.join(' ') : ''}`
      );
      setModalOpen(false);
      setGrantReason('');
      setRequestedBy('');
      setTicketRef('');
      setTargetBranchId('');
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? (err.issues?.map((i) => i.message).join(' ') || err.message) : 'Failed to grant extension');
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api.patch(`/api/v1/platform/offline-policy/extensions/${id}/revoke`);
      showToast('Offline extension certificate revoked');
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to revoke');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency Offline Policy & Licensing</h1>
          <p className="page-subtitle">
            Cryptographically signed offline extensions (ECDSA P-256), offline grace period management, and tamper-resistant terminal authorization.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <RefreshButton loading={loading} onRefresh={loadData} />
          <Button variant="accent" onClick={() => setModalOpen(true)} disabled={signing?.configured === false}>
            <Plus className="w-4 h-4 mr-1" /> Grant Emergency Extension
          </Button>
        </div>
      </div>

      {toast && <div className="floating-toast">{toast}</div>}

      {signing?.configured === false && (
        <div className="banner banner-error" role="alert" style={{ marginBottom: 16 }}>
          <strong>Signing is not ready, so extensions cannot be issued.</strong> {signing.reason}{' '}
          Set a P-256 private key (base64-encoded PEM) in the API environment and restart it. The matching public key must be the one built into the apps.
        </div>
      )}
      {signing?.configured === true && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <KeyRound className="w-4 h-4" style={{ display: 'inline', marginRight: 6 }} /> Signing key: ready
        </div>
      )}

      {/* Approaching Expiry Warning Section */}
      {approachingExpiry.length > 0 && (
        <div style={{ background: 'var(--jv-warning-soft)', border: '1.5px solid #fde68a', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <strong style={{ color: '#92400e', fontSize: 14 }}>
              {approachingExpiry.length} terminal(s) approaching the {policy.offlineGraceDays}-day offline limit
            </strong>
          </div>
          <p style={{ margin: '0 0 12px', color: '#b45309', fontSize: 13 }}>
            A terminal locks itself after {policy.offlineGraceDays} days without reaching JAMANVAAR. These have been silent for {policy.warnAfterDays} days or more. Once the terminal reconnects it resets; if the outage will continue, grant an emergency extension now (it is delivered when the terminal next checks in, or entered as a code).
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {approachingExpiry.map((d) => (
              <div
                key={d.id}
                style={{
                  background: 'var(--jv-surface-card)',
                  border: '1px solid #fed7aa',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span><strong>{d.restaurant?.name}</strong> ({d.type})</span>
                <span style={{ color: 'var(--jv-accent-text)' }}>Last seen {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleDateString() : 'Never'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lockedOffline.length > 0 && (
        <div className="banner banner-error" role="alert" style={{ marginBottom: 24 }}>
          <strong>{lockedOffline.length} terminal(s) are past the {policy.offlineGraceDays}-day offline limit and locked</strong> (no extension covers them):{' '}
          {lockedOffline.slice(0, 8).map((d) => `${d.restaurant?.name ?? 'Unknown'} (${d.name ?? d.type}, last seen ${d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleDateString() : 'never'})`).join('; ')}
          {lockedOffline.length > 8 ? ` and ${lockedOffline.length - 8} more` : ''}.
        </div>
      )}

      {/* Active Offline Extensions Table */}
      <Card>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>
          Emergency Extensions ({extensions.filter((e) => e.status === 'ACTIVE').length} active, {extensions.length} total)
        </h3>
        {extensions.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--jv-text-light)' }}>
            <FileCheck2 className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            No emergency offline extensions are currently active.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--jv-border-subtle)', textAlign: 'left', color: 'var(--jv-text-muted)' }}>
                  <th style={{ padding: '12px 14px' }}>Restaurant / Terminal</th>
                  <th style={{ padding: '12px 14px' }}>Duration</th>
                  <th style={{ padding: '12px 14px' }}>Approved Reason</th>
                  <th style={{ padding: '12px 14px' }}>Security Signature</th>
                  <th style={{ padding: '12px 14px' }}>Validity Window</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {extensions.map((ext) => (
                  <tr key={ext.id} style={{ borderBottom: '1px solid var(--jv-border-subtle)' }}>
                    <td style={{ padding: '14px' }}>
                      <strong style={{ color: 'var(--jv-text)' }}>{ext.restaurant?.name}</strong>
                      <div style={{ color: 'var(--jv-text-muted)', fontSize: 11 }}>
                        {ext.device
                          ? `${ext.device.type} Terminal`
                          : ext.branchId
                            ? `Branch: ${branches.find((b) => b.id === ext.branchId)?.name ?? 'one branch'}`
                            : 'Fleet Wide'}
                      </div>
                      <div style={{ color: 'var(--jv-text-light)', fontSize: 11 }}>
                        Asked by {ext.requestedBy}{ext.ticketRef ? ` · ${ext.ticketRef}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '14px', fontWeight: 800, color: '#0369a1' }}>
                      +{ext.extensionDays} Days
                    </td>
                    <td style={{ padding: '14px', color: 'var(--jv-text-secondary)', maxWidth: 280 }}>
                      {ext.reason}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <code style={{ fontSize: 11, background: 'var(--jv-bg-muted)', padding: '2px 6px', borderRadius: 4 }}>
                        ECDSA: {ext.certificateSignature.slice(0, 14)}…
                      </code>
                    </td>
                    <td style={{ padding: '14px', color: 'var(--jv-text-muted)', fontSize: 12 }}>
                      Valid until {new Date(ext.validUntil).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <Badge tone={ext.status === 'ACTIVE' ? 'success' : 'error'}>
                        {ext.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right' }}>
                      {ext.status === 'ACTIVE' && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(ext.id)}>
                          <XCircle className="w-3.5 h-3.5 mr-1 text-red-500" /> Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Grant Extension Modal */}
      {modalOpen && (
        <Modal title="Issue Signed Emergency Offline Extension" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, fontSize: 13, color: '#166534' }}>
              <strong>Cryptographic Protection:</strong> This issues an authentic ECDSA P-256 signed certificate. The local POS and Captain runtimes verify this certificate mathematically even when 100% disconnected from the internet.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Target Restaurant *
              </label>
              <select
                value={targetRestaurantId}
                onChange={(e) => {
                  setTargetRestaurantId(e.target.value);
                  setTargetBranchId('');
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.city || 'India'})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Applies to</label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                <option value="">Every branch of this restaurant</option>
                {branches.filter((b) => b.restaurantId === targetRestaurantId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {extensions.some((e) => e.restaurantId === targetRestaurantId && e.status === 'ACTIVE') && (
              <div style={{ background: 'var(--jv-warning-soft)', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                This restaurant already has an active extension. Issuing another does not replace it: revoke the earlier one if it should no longer apply.
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Who asked for this? *
              </label>
              <input
                type="text"
                placeholder="e.g. Asha Rao (owner), by phone"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Support ticket reference
              </label>
              <input
                type="text"
                placeholder="e.g. TCK-1042 (optional)"
                value={ticketRef}
                onChange={(e) => setTicketRef(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Extension Duration (Days) *
              </label>
              <select
                value={targetDays}
                onChange={(e) => setTargetDays(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              >
                <option value="7">7 Days (Emergency Short)</option>
                <option value="14">14 Days (Standard Grace)</option>
                <option value="30">30 Days (Extended Regional Outage)</option>
                <option value="60">60 Days (Remote Location)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Operational Justification & Audit Note *
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Major fiber cut at shopping mall; verified via regional manager"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--jv-border-hover)', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                variant="accent"
                onClick={handleGrantExtension}
                disabled={granting || grantReason.trim().length < 5 || requestedBy.trim().length < 2}
              >
                {granting ? 'Signing…' : 'Sign & Issue Certificate'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
