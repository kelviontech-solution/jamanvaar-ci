import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Badge, Button, Card, EmptyState, FilterTabs, SearchBar, SkeletonTable } from '../../components/ui';
import { Wallet } from 'lucide-react';
import '../../components/shared.css';

interface PayoutOverview {
  grossCollection: number;
  platformFee: number;
  restaurantPayable: number;
  pendingPayout: number;
  paidPayout: number;
  heldPayable: number;
  unallocatedCollection: number;
}

interface Payout {
  id: string;
  restaurantId: string;
  restaurant: { id: string; name: string };
  businessDate: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'ON_HOLD' | 'FAILED';
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentCount: number;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  utr: string | null;
  paidAt: string | null;
  holdReason: string | null;
  createdAt: string;
}

type StatusFilter = 'ALL' | Payout['status'];
type ModalAction = { payout: Payout; kind: 'mark-paid' | 'hold' | 'release' };

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function statusTone(status: Payout['status']): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'ON_HOLD' || status === 'FAILED') return 'error';
  return 'warning';
}

export function PayoutsListPage() {
  const [overview, setOverview] = useState<PayoutOverview | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [runningEod, setRunningEod] = useState(false);
  const [modal, setModal] = useState<ModalAction | null>(null);
  const [utr, setUtr] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [password, setPassword] = useState('');
  const [actionPending, setActionPending] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadOverview = useCallback(() => {
    api.get<PayoutOverview>('/api/v1/payments/payouts/overview').then(setOverview).catch(() => {});
  }, []);

  const loadPayouts = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));
    api
      .get<{ rows: Payout[]; total: number }>(`/api/v1/payments/payouts?${params.toString()}`)
      .then((d) => {
        setPayouts(d.rows);
        setTotal(d.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load payouts'))
      .finally(() => setLoading(false));
  }, [statusFilter, page, limit]);

  useEffect(loadOverview, [loadOverview]);
  useEffect(loadPayouts, [loadPayouts]);

  const refreshAll = useCallback(() => {
    loadOverview();
    loadPayouts();
  }, [loadOverview, loadPayouts]);

  async function handleRunEod() {
    setRunningEod(true);
    try {
      const result = await api.post<{ restaurantsConsidered: number; payoutsCreated: number }>('/api/v1/payments/payouts/run-eod', {});
      showToast(`Considered ${result.restaurantsConsidered} restaurant(s), created ${result.payoutsCreated} new payout(s). Nothing was transferred — mark each PAID after you actually send the bank transfer.`);
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not run the EOD batch');
    } finally {
      setRunningEod(false);
    }
  }

  async function handleExecuteModal() {
    if (!modal) return;
    if (modal.kind === 'mark-paid' && !transferConfirmed) { showToast('Confirm that the bank transfer was completed'); return; }
    setActionPending(true);
    try {
      if (modal.kind === 'mark-paid') {
        if (!utr.trim()) {
          showToast('A UTR / transfer reference is required');
          setActionPending(false);
          return;
        }
        await api.patch(`/api/v1/payments/payouts/${modal.payout.id}/mark-paid`, { utr: utr.trim(), password });
        showToast(`${modal.payout.restaurant.name}: payout marked PAID`);
      } else if (modal.kind === 'hold') {
        if (!holdReason.trim()) {
          showToast('A reason is required to put a payout on hold');
          setActionPending(false);
          return;
        }
        await api.patch(`/api/v1/payments/payouts/${modal.payout.id}/hold`, { reason: holdReason.trim(), password });
        showToast(`${modal.payout.restaurant.name}: payout put on hold`);
      } else {
        await api.patch(`/api/v1/payments/payouts/${modal.payout.id}/release`, { password });
        showToast(`${modal.payout.restaurant.name}: payout released back to pending`);
      }
      setModal(null);
      setUtr(''); setTransferConfirmed(false);
      setHoldReason('');
      setPassword('');
      refreshAll();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${modal.kind} failed`);
    } finally {
      setActionPending(false);
    }
  }

  const filtered = useMemo(() => {
    if (!payouts) return [];
    if (!search.trim()) return payouts;
    const q = search.toLowerCase();
    return payouts.filter((p) => p.restaurant.name.toLowerCase().includes(q) || p.businessDate.includes(q));
  }, [payouts, search]);

  const tile = (label: string, value: string, tone?: 'good' | 'warn') => (
    <Card>
      <div style={{ padding: 16 }}>
        <div className="muted" style={{ fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: tone === 'good' ? '#16a34a' : tone === 'warn' ? '#ea580c' : undefined }}>{value}</div>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restaurant Payouts</h1>
          <p className="page-subtitle">
            Razorpay Route is pending, so Jamanvaar collects every restaurant's online payments and pays its net share out manually.
            Running the EOD batch only calculates and creates PENDING payouts — nothing is ever transferred automatically. Mark a
            payout PAID only after you have actually sent the bank transfer and have a real UTR.
          </p>
        </div>
        <Button variant="accent" disabled={runningEod} onClick={handleRunEod}>{runningEod ? 'Running…' : 'Run EOD batch now'}</Button>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadPayouts}>Retry</Button>
        </div>
      )}
      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 16 }}>
          {tile('Gross Collection', formatRupees(overview.grossCollection))}
          {tile('Jamanvaar Fee', formatRupees(overview.platformFee), 'good')}
          {tile('Net Payable after holds (all time)', formatRupees(overview.restaurantPayable))}
          {tile('Held for review', formatRupees(overview.heldPayable), 'warn')}
          {tile('Historical collection needing split review', formatRupees(overview.unallocatedCollection), 'warn')}
          {tile('Pending payout', formatRupees(overview.pendingPayout), 'warn')}
          {tile('Paid out', formatRupees(overview.paidPayout), 'good')}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by restaurant or business date (YYYYMMDD)…" width="340px" />
        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[
            { id: 'ALL', label: 'All' },
            { id: 'PENDING', label: 'Pending' },
            { id: 'ON_HOLD', label: 'On hold' },
            { id: 'PAID', label: 'Paid' }
          ]}
        />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{total} total</span>
      </div>

      {loading && !payouts && <SkeletonTable rows={5} cols={6} />}

      {payouts && (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-6 h-6 text-slate-400" />}
              title="No payouts yet"
              description="Run the EOD batch to claim any verified restaurant's unpaid, unrefunded collections into a payout."
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Business date</th>
                    <th>Net amount</th>
                    <th>Status</th>
                    <th>Bank / UTR</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/restaurants/${p.restaurantId}`} className="table-link" style={{ fontWeight: 600 }}>
                          {p.restaurant.name}
                        </Link>
                      </td>
                      <td style={{ fontSize: 12 }}>{p.businessDate}</td>
                      <td style={{ fontWeight: 700 }}>
                        {formatRupees(p.netAmount)}
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          gross {formatRupees(p.grossAmount)} − fee {formatRupees(p.feeAmount)} · {p.paymentCount} payment{p.paymentCount === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(p.status)}>{p.status.replace('_', ' ')}</Badge>
                        {p.holdReason && <div className="muted" style={{ fontSize: 11 }}>{p.holdReason}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.bankAccountMasked ? `${p.bankAccountMasked} (${p.bankIfsc ?? ''})` : '—'}
                        {p.utr && <div className="muted" style={{ fontSize: 11 }}>UTR {p.utr}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(p.status === 'PENDING' || p.status === 'APPROVED' || p.status === 'ON_HOLD') && (
                            <Button size="sm" variant="accent" onClick={() => { setModal({ payout: p, kind: 'mark-paid' }); setUtr(''); setTransferConfirmed(false); setPassword(''); }}>Mark paid</Button>
                          )}
                          {p.status === 'ON_HOLD' ? (
                            <Button size="sm" variant="ghost" onClick={() => { setModal({ payout: p, kind: 'release' }); setPassword(''); }}>Release</Button>
                          ) : p.status !== 'PAID' ? (
                            <Button size="sm" variant="danger" onClick={() => { setModal({ payout: p, kind: 'hold' }); setHoldReason(''); setPassword(''); }}>Hold</Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12 }}>
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Page {page} of {Math.ceil(total / limit)}</span>
              <Button size="sm" variant="ghost" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </Card>
      )}

      {modal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 360 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {modal.kind === 'mark-paid' ? 'Mark payout PAID' : modal.kind === 'hold' ? 'Put payout on hold' : 'Release payout'}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {modal.payout.restaurant.name} — {formatRupees(modal.payout.netAmount)} ({modal.payout.businessDate})
              {modal.kind === 'mark-paid' && ' — only confirm this after you have actually sent the bank transfer.'}
            </div>
            {modal.kind === 'mark-paid' && (
              <input
                placeholder="UTR / transfer reference"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                style={{ width: '100%', marginBottom: 10 }}
                autoFocus
              />
            )}
            {modal.kind === 'mark-paid' && <label style={{ display: 'block', fontSize: 12, marginBottom: 12 }}>
              <input type="checkbox" checked={transferConfirmed} onChange={e => setTransferConfirmed(e.target.checked)} /> I have completed the bank transfer for this amount.
            </label>}
            {modal.kind === 'hold' && (
              <input
                placeholder="Reason (required)"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                style={{ width: '100%', marginBottom: 10 }}
                autoFocus
              />
            )}
            <input
              type="password"
              placeholder="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button size="sm" variant={modal.kind === 'hold' ? 'danger' : 'primary'} disabled={actionPending || (modal.kind === 'mark-paid' && !transferConfirmed)} onClick={handleExecuteModal}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
