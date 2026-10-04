import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { PaymentConnection } from '../../api/types';
import { Badge, Button, Card, ConfirmModal, EmptyState, FilterTabs, SearchBar, SkeletonTable, statusTone } from '../../components/ui';
import { CreditCard } from 'lucide-react';
import '../../components/shared.css';

type StatusFilter = 'ALL' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' | 'NOT_CONNECTED';
type PendingAction = { connection: PaymentConnection; action: 'approve' | 'suspend' | 'reactivate' | 'disconnect' };

export function PaymentConnectionsListPage() {
  const [connections, setConnections] = useState<PaymentConnection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [confirmTarget, setConfirmTarget] = useState<PendingAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [defaultBps, setDefaultBps] = useState<number | null>(null);
  const [defaultBpsInput, setDefaultBpsInput] = useState('');
  const [defaultLoaded, setDefaultLoaded] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [overrideEdits, setOverrideEdits] = useState<Record<string, string>>({});
  const [savingOverrideId, setSavingOverrideId] = useState<string | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const STEP_UP_ACTIONS: PendingAction['action'][] = ['approve', 'suspend', 'disconnect'];

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<PaymentConnection[]>('/api/v1/payment-connections')
      .then((data) => setConnections(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load payment connections'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api.get<{ defaultBps: number }>('/api/v1/payments/commission-config').then((d) => {
      setDefaultBps(d.defaultBps);
      setDefaultBpsInput(String(d.defaultBps / 100));
      setDefaultLoaded(true);
    }).catch(() => {});
  }, []);

  async function handleSaveDefaultCommission() {
    const percent = Number(defaultBpsInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      showToast('Enter a percentage between 0 and 100');
      return;
    }
    const password = window.prompt('Confirm your password to change the platform default commission') ?? '';
    if (!password) return;
    setSavingDefault(true);
    try {
      const result = await api.patch<{ defaultBps: number }>('/api/v1/payments/commission-config', { defaultBps: Math.round(percent * 100), password });
      setDefaultBps(result.defaultBps);
      showToast(`Platform default commission set to ${percent}%`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save default commission');
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleSaveOverride(c: PaymentConnection) {
    const raw = overrideEdits[c.id];
    const overrideBps = raw === undefined || raw === '' ? null : Math.round(Number(raw) * 100);
    if (overrideBps !== null && (!Number.isFinite(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      showToast('Enter a percentage between 0 and 100, or leave blank to use the platform default');
      return;
    }
    const password = window.prompt(`Confirm your password to change ${c.restaurant.name}'s commission`) ?? '';
    if (!password) return;
    setSavingOverrideId(c.id);
    try {
      await api.patch(`/api/v1/restaurants/${c.restaurantId}/payment-connection/commission`, { overrideBps, password });
      showToast(`${c.restaurant.name}: commission override saved`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save commission override');
    } finally {
      setSavingOverrideId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!connections) return [];
    return connections.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.restaurant.name.toLowerCase().includes(q) && !(c.contactEmail ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [connections, statusFilter, search]);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    connections?.forEach((c) => { counts[c.status] = (counts[c.status] ?? 0) + 1; });
    return counts;
  }, [connections]);

  async function handleExecuteAction() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      const body = STEP_UP_ACTIONS.includes(confirmTarget.action) ? { password: stepUpPassword } : undefined;
      await api.patch(`/api/v1/restaurants/${confirmTarget.connection.restaurantId}/payment-connection/${confirmTarget.action}`, body);
      showToast(`${confirmTarget.connection.restaurant.name}: ${confirmTarget.action} succeeded`);
      setConfirmTarget(null);
      setStepUpPassword('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${confirmTarget.action} failed`);
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Gateways</h1>
          <p className="page-subtitle">Review restaurants' settlement connections. Approval needs Razorpay Route, which is not enabled yet.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Platform default commission</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={defaultBpsInput}
            onChange={(e) => setDefaultBpsInput(e.target.value)}
            style={{ width: 70 }}
          />
          <span className="muted" style={{ fontSize: 12 }}>%</span>
          <Button size="sm" variant="ghost" disabled={savingDefault || !defaultLoaded} onClick={handleSaveDefaultCommission}>Save</Button>
        </div>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by restaurant or contact email…" width="340px" />
        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: connections?.length },
            { id: 'PENDING_VERIFICATION', label: 'Pending Review', count: countsByStatus.PENDING_VERIFICATION },
            { id: 'ACTIVE', label: 'Active', count: countsByStatus.ACTIVE },
            { id: 'SUSPENDED', label: 'Suspended', count: countsByStatus.SUSPENDED },
            { id: 'DISCONNECTED', label: 'Disconnected', count: countsByStatus.DISCONNECTED }
          ]}
        />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{filtered.length} of {connections?.length ?? 0}</span>
      </div>

      {loading && !connections && <SkeletonTable rows={5} cols={6} />}

      {connections && (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="w-6 h-6 text-slate-400" />}
              title={connections.length === 0 ? 'No payment connections yet' : 'No matching connections'}
              description="Restaurants submit their settlement details from Kiosk Admin's Payment Gateway settings."
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Settlement</th>
                    <th>Commission</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/restaurants/${c.restaurantId}`} className="table-link" style={{ fontWeight: 600 }}>
                          {c.restaurant.name}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Badge>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{c.contactName ?? '—'}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{c.contactEmail ?? ''}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.settlementUpiVpaMasked ? c.settlementUpiVpaMasked : c.settlementAccountNumberMasked ? `${c.settlementAccountNumberMasked} (${c.settlementIfsc ?? ''})` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            placeholder={defaultBps !== null ? `${defaultBps / 100}% default` : '—'}
                            value={overrideEdits[c.id] ?? (c.commissionOverrideBps !== null ? String(c.commissionOverrideBps / 100) : '')}
                            onChange={(e) => setOverrideEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            style={{ width: 60 }}
                          />
                          <Button size="sm" variant="ghost" disabled={savingOverrideId === c.id} onClick={() => handleSaveOverride(c)}>Save</Button>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.status === 'PENDING_VERIFICATION' && (
                            <Button size="sm" variant="accent" onClick={() => setConfirmTarget({ connection: c, action: 'approve' })}>Approve</Button>
                          )}
                          {c.status === 'ACTIVE' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmTarget({ connection: c, action: 'suspend' })}>Suspend</Button>
                              <Button size="sm" variant="danger" onClick={() => setConfirmTarget({ connection: c, action: 'disconnect' })}>Disconnect</Button>
                            </>
                          )}
                          {c.status === 'SUSPENDED' && (
                            <>
                              <Button size="sm" variant="accent" onClick={() => setConfirmTarget({ connection: c, action: 'reactivate' })}>Reactivate</Button>
                              <Button size="sm" variant="danger" onClick={() => setConfirmTarget({ connection: c, action: 'disconnect' })}>Disconnect</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={`${confirmTarget.action[0].toUpperCase()}${confirmTarget.action.slice(1)} payment connection?`}
          message={
            <>
              {confirmTarget.action === 'approve'
                ? `Approving "${confirmTarget.connection.restaurant.name}" needs Razorpay Route linked accounts, which are not enabled yet, so the server will refuse it.`
                : `This will ${confirmTarget.action} "${confirmTarget.connection.restaurant.name}"'s payment connection.`}
              {STEP_UP_ACTIONS.includes(confirmTarget.action) && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Confirm your password</label>
                  <input
                    type="password"
                    value={stepUpPassword}
                    onChange={(e) => setStepUpPassword(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                    autoFocus
                  />
                </div>
              )}
            </>
          }
          tone={confirmTarget.action === 'disconnect' ? 'danger' : 'primary'}
          isPending={actionPending}
          onConfirm={handleExecuteAction}
          onClose={() => { setConfirmTarget(null); setStepUpPassword(''); }}
        />
      )}
    </div>
  );
}
