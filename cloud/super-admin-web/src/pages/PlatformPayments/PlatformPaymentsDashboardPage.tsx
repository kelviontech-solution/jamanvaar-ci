import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Badge, Button, Card } from '../../components/ui';
import '../../components/shared.css';

interface PlatformSummary {
  grossVolume: number;
  platformCommission: number;
  restaurantShare: number;
  refundedAmount: number;
  successfulCount: number;
  statusCounts: Record<string, number>;
}

interface AttentionRow {
  id: string;
  restaurant: { id: string; name: string };
  externalOrderId: string;
  amount: number;
  paidAt: string | null;
  minutesWaiting: number;
}

interface DayStatement {
  date: string;
  paymentCount: number;
  refundCount: number;
  grossVolume: number;
  refundedAmount: number;
  platformCommission: number;
  commissionReversed: number | null;
  restaurantGross: number;
  restaurantRefundImpact: number | null;
  heldPayable: number;
  unallocatedCollection: number;
  netPayableToRestaurant: number;
  settlementNote: string;
  rows: Array<{ id: string; externalOrderId: string; amount: number; platformAmount: number; restaurantAmount: number | null; method: string | null; paidAt: string | null }>;
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const todayIst = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

function statementCsv(s: DayStatement, restaurantId: string) {
  const lines = [
    ['Order', 'Paid at', 'Method', 'Amount (INR)', 'Platform commission (INR)', 'Restaurant share (INR)'],
    ...s.rows.map((r) => [r.externalOrderId, r.paidAt ?? '', r.method ?? '', (r.amount / 100).toFixed(2), (r.platformAmount / 100).toFixed(2), r.restaurantAmount === null ? '' : (r.restaurantAmount / 100).toFixed(2)]),
    [],
    ['Gross', (s.grossVolume / 100).toFixed(2)],
    ['Refunds', (s.refundedAmount / 100).toFixed(2)],
    ['Jamanvaar Fee (recorded snapshot)', (s.platformCommission / 100).toFixed(2)],
    ['Held for refund review', (s.heldPayable / 100).toFixed(2)],
    ['Historical collection needing split review', (s.unallocatedCollection / 100).toFixed(2)],
    ['Net payable to restaurant', (s.netPayableToRestaurant / 100).toFixed(2)]
  ];
  const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `statement-${restaurantId.slice(0, 8)}-${s.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlatformPaymentsDashboardPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [attention, setAttention] = useState<AttentionRow[] | null>(null);
  const [refundTarget, setRefundTarget] = useState<AttentionRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundPassword, setRefundPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const [statementDate, setStatementDate] = useState(todayIst());
  const [statement, setStatement] = useState<DayStatement | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (restaurantId.trim()) params.set('restaurantId', restaurantId.trim());
    if (status) params.set('status', status);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    setError(null);
    api
      .get<PlatformSummary>(`/api/v1/payments/platform-summary?${params.toString()}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load platform payments summary'));
  }, [restaurantId, status, from, to]);

  const loadAttention = useCallback(() => {
    api
      .get<{ rows: AttentionRow[] }>('/api/v1/payments/attention')
      .then((r) => setAttention(r.rows))
      .catch(() => setAttention([]));
  }, []);

  useEffect(loadAttention, [loadAttention]);

  async function handleMarkHandled(row: AttentionRow) {
    setBusy(true);
    try {
      await api.post(`/api/v1/payments/${row.id}/admin-fulfilled`);
      showToast(`${row.restaurant.name}: order ${row.externalOrderId.slice(-10)} marked handled`);
      loadAttention();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update this payment');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    if (!refundTarget) return;
    const paise = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(paise) || paise < 1 || paise > refundTarget.amount) {
      showToast(`Enter an amount between ₹0.01 and ${formatRupees(refundTarget.amount)}`);
      return;
    }
    if (!refundReason.trim()) {
      showToast('A reason is required');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/v1/payments/${refundTarget.id}/admin-refund`, { amountPaise: paise, reason: refundReason.trim(), password: refundPassword });
      showToast(`Refund of ${formatRupees(paise)} requested; it completes when Razorpay confirms it`);
      setRefundTarget(null);
      setRefundPassword('');
      setRefundReason('');
      loadAttention();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'The refund could not be started');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatement() {
    if (!restaurantId.trim()) {
      showToast('Enter the Restaurant ID above to see its statement');
      return;
    }
    try {
      setStatement(await api.get<DayStatement>(`/api/v1/payments/statement?restaurantId=${encodeURIComponent(restaurantId.trim())}&date=${statementDate}`));
    } catch (err) {
      setStatement(null);
      showToast(err instanceof ApiError ? err.message : 'Could not load the statement');
    }
  }

  const tile = (label: string, value: string | number, tone?: 'good' | 'warn') => (
    <Card>
      <div style={{ padding: 16 }}>
        <div className="muted" style={{ fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: tone === 'good' ? '#16a34a' : tone === 'warn' ? '#ea580c' : undefined }}>{value}</div>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Payments</h1>
          <p className="page-subtitle">Cross-restaurant Razorpay payment volume, commission, and what needs attention.</p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}
      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Restaurant ID (optional)" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} style={{ width: 280 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIALLY_REFUNDED">Partially refunded</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {tile('Gross Volume', formatRupees(summary.grossVolume))}
            {tile('Platform Commission', formatRupees(summary.platformCommission), 'good')}
            {tile('Restaurant Share', formatRupees(summary.restaurantShare))}
            {tile('Refunded', formatRupees(summary.refundedAmount), 'warn')}
            {tile('Successful Payments', summary.successfulCount)}
            <Card>
              <div style={{ padding: 16 }}>
              </div>
            </Card>
          </div>
          <Card>
            <div style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Payments by status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(summary.statusCounts).length === 0 && <span className="muted">No payments match these filters.</span>}
                {Object.entries(summary.statusCounts).map(([s, n]) => (
                  <Badge key={s} tone="neutral">{s.replace(/_/g, ' ')}: {n}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}

      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Paid, but no token was issued ({attention?.length ?? 0})</div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
            The customer paid but the kiosk never confirmed a token/KOT (crash, no internet, or a payment that landed after the QR expired). Refund it, or mark it handled once the customer was served.
          </p>
          {attention === null ? (
            <span className="muted">Loading…</span>
          ) : attention.length === 0 ? (
            <span className="muted">Nothing needs attention.</span>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Restaurant</th><th>Order</th><th>Amount</th><th>Waiting</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {attention.map((row) => (
                    <tr key={row.id}>
                      <td>{row.restaurant.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.externalOrderId.slice(-10)}</td>
                      <td style={{ fontWeight: 700 }}>{formatRupees(row.amount)}</td>
                      <td>{row.minutesWaiting} min</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleMarkHandled(row)}>Mark handled</Button>
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => { setRefundTarget(row); setRefundAmount((row.amount / 100).toFixed(2)); setRefundReason(''); setRefundPassword(''); }}>Refund</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {refundTarget && (
            <div style={{ marginTop: 16, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Refund {refundTarget.restaurant.name} — order {refundTarget.externalOrderId.slice(-10)} (up to {formatRupees(refundTarget.amount)})</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="number" min={0.01} step={0.01} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} style={{ width: 110 }} aria-label="Refund amount in rupees" />
                <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason (required)" style={{ width: 240 }} aria-label="Refund reason" />
                <input type="password" value={refundPassword} onChange={(e) => setRefundPassword(e.target.value)} placeholder="Your password" style={{ width: 180 }} aria-label="Confirm your password" />
                <Button size="sm" variant="danger" disabled={busy} onClick={handleRefund}>Confirm refund</Button>
                <Button size="sm" variant="ghost" onClick={() => setRefundTarget(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Restaurant day statement</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: 12 }}>Uses the Restaurant ID typed above.</span>
            <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} aria-label="Statement date" />
            <Button size="sm" variant="ghost" onClick={handleStatement}>Show statement</Button>
            {statement && <Button size="sm" variant="ghost" onClick={() => statementCsv(statement, restaurantId.trim())}>Download CSV</Button>}
          </div>
          {statement && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {tile(`Payments (${statement.paymentCount})`, formatRupees(statement.grossVolume))}
              {tile(`Refunds (${statement.refundCount})`, formatRupees(statement.refundedAmount), 'warn')}
              {tile('Jamanvaar Fee (recorded snapshot)', formatRupees(statement.platformCommission), 'good')}
              {tile('Held for refund review', formatRupees(statement.heldPayable), 'warn')}
              {tile('Historical collection needing split review', formatRupees(statement.unallocatedCollection), 'warn')}
              {tile('Net payable to restaurant', formatRupees(statement.netPayableToRestaurant))}
              <div className="muted" style={{ fontSize: 12, gridColumn: '1 / -1' }}>{statement.settlementNote} Day = calendar day in India time.</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
