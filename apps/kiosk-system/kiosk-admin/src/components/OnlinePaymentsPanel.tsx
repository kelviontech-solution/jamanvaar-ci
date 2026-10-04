import { useCallback, useEffect, useState } from 'react';
import { Button } from '@jamanvaar/ui';
import { formatINR } from '@jamanvaar/utils';
import {
  getDayStatement,
  getRecentPayments,
  getStaffUser,
  markPaymentHandled,
  refundPayment,
  type DayStatement,
  type RecentPayment
} from '../cloud/cloudClient';

/** Business day in India (IST), as YYYY-MM-DD. */
const todayIst = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const rupees = (paise: number) => formatINR(paise / 100);

function statusLabel(p: RecentPayment): { text: string; cls: string } {
  if (p.needsAttention) return { text: 'Paid — no token issued', cls: 'bg-rose-100 text-rose-700' };
  switch (p.status) {
    case 'SUCCESS':
      return { text: 'Paid', cls: 'bg-green-100 text-green-700' };
    case 'PARTIALLY_REFUNDED':
      return { text: 'Partly refunded', cls: 'bg-amber-100 text-amber-700' };
    case 'REFUND_PENDING':
      return { text: 'Refund pending', cls: 'bg-amber-100 text-amber-700' };
    case 'REFUNDED':
      return { text: 'Refunded', cls: 'bg-slate-100 text-slate-600' };
    case 'FAILED':
    case 'USER_DROPPED':
    case 'CANCELLED':
      return { text: 'Not paid', cls: 'bg-slate-100 text-slate-600' };
    default:
      return { text: 'Waiting', cls: 'bg-slate-100 text-slate-600' };
  }
}

function downloadCsv(statement: DayStatement) {
  const header = ['Order', 'Paid at', 'Method', 'Amount (INR)', 'Platform commission (INR)', 'Restaurant share (INR)'];
  const lines = statement.rows.map((r) =>
    [r.externalOrderId, r.paidAt ?? '', r.method ?? '', (r.amount / 100).toFixed(2), (r.platformAmount / 100).toFixed(2), (r.restaurantAmount / 100).toFixed(2)]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(',')
  );
  const summary = [
    '',
    `"Gross collected","${(statement.grossVolume / 100).toFixed(2)}"`,
    `"Refunds","${(statement.refundedAmount / 100).toFixed(2)}"`,
    `"Razorpay fee (estimated 2%)","${(statement.razorpayFee / 100).toFixed(2)}"`,
    `"JAMANVAAR net commission (net of refunds)","${((statement.platformNetCommission - statement.commissionReversed) / 100).toFixed(2)}"`,
    `"Net payable to restaurant","${(statement.netPayableToRestaurant / 100).toFixed(2)}"`
  ];
  const blob = new Blob([[header.join(','), ...lines, ...summary].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `online-payments-${statement.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The restaurant's own view of its online (Razorpay) payments: what was paid, anything paid but never
 * served, refunds, and the day statement that should match the bank credit Razorpay makes.
 */
export function OnlinePaymentsPanel() {
  const staff = getStaffUser();
  const canRefund = staff?.role === 'OWNER' || staff?.role === 'MANAGER';

  const [rows, setRows] = useState<RecentPayment[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<RecentPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [date, setDate] = useState(todayIst());
  const [statement, setStatement] = useState<DayStatement | null>(null);
  const [statementError, setStatementError] = useState('');

  const load = useCallback(() => {
    getRecentPayments()
      .then((r) => {
        setRows(r);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load payments'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadStatement = useCallback((d: string) => {
    setStatementError('');
    getDayStatement(d)
      .then(setStatement)
      .catch((e) => {
        setStatement(null);
        setStatementError(e instanceof Error ? e.message : 'Could not load the statement');
      });
  }, []);

  async function handleMarkHandled(p: RecentPayment) {
    setBusyId(p.id);
    setMessage('');
    try {
      await markPaymentHandled(p.id);
      setMessage(`Order ${p.externalOrderId} marked as handled.`);
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update this payment');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefund() {
    if (!refundFor) return;
    const paise = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(paise) || paise < 1 || paise > refundFor.refundableAmount) {
      setMessage(`Enter an amount between ₹0.01 and ${rupees(refundFor.refundableAmount)}.`);
      return;
    }
    if (!refundReason.trim()) {
      setMessage('Please give a reason for the refund.');
      return;
    }
    setBusyId(refundFor.id);
    setMessage('');
    try {
      await refundPayment(refundFor.id, paise, refundReason.trim(), staff?.fullName ?? 'Kiosk Admin');
      setMessage(`Refund of ${rupees(paise)} requested. It shows as refunded once Razorpay confirms it.`);
      setRefundFor(null);
      setRefundReason('');
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The refund could not be started');
    } finally {
      setBusyId(null);
    }
  }

  const attentionCount = rows?.filter((r) => r.needsAttention).length ?? 0;

  return (
    <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
          <p className="text-xs text-[#4A5568]">Kiosk QR payments received through Razorpay</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
      </div>

      {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}
      {message && <div className="text-xs text-jaman-navy bg-jaman-ivory border border-jaman-border rounded-xl p-3">{message}</div>}

      {attentionCount > 0 && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {attentionCount} paid order{attentionCount === 1 ? '' : 's'} never got a token or kitchen ticket. Serve the customer, then choose “Mark handled”, or refund them.
        </div>
      )}

      {rows === null ? (
        <p className="text-xs text-[#8C9BAE]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[#8C9BAE]">No online payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#8C9BAE]">
                <th className="py-1.5 pr-3">Order</th>
                <th className="py-1.5 pr-3">Amount</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Refunded</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const label = statusLabel(p);
                return (
                  <tr key={p.id} className="border-t border-jaman-border">
                    <td className="py-2 pr-3 font-mono">{p.externalOrderId.slice(-10)}</td>
                    <td className="py-2 pr-3 font-bold">{rupees(p.amount)}</td>
                    <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full font-bold ${label.cls}`}>{label.text}</span></td>
                    <td className="py-2 pr-3">{p.refundedAmount > 0 ? rupees(p.refundedAmount) : '—'}</td>
                    <td className="py-2 text-right space-x-1.5 whitespace-nowrap">
                      {p.needsAttention && (
                        <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => handleMarkHandled(p)}>Mark handled</Button>
                      )}
                      {canRefund && p.refundableAmount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === p.id}
                          onClick={() => {
                            setRefundFor(p);
                            setRefundAmount((p.refundableAmount / 100).toFixed(2));
                            setRefundReason('');
                            setMessage('');
                          }}
                        >
                          Refund
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {refundFor && (
        <div className="p-4 bg-jaman-ivory rounded-xl border border-jaman-border space-y-2 text-xs">
          <div className="font-bold text-jaman-navy">Refund order {refundFor.externalOrderId.slice(-10)} (up to {rupees(refundFor.refundableAmount)})</div>
          <div className="flex gap-2">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-lg border border-jaman-border"
              aria-label="Refund amount in rupees"
            />
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason (required)"
              className="flex-1 px-2 py-1.5 rounded-lg border border-jaman-border"
              aria-label="Refund reason"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setRefundFor(null)}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={busyId === refundFor.id} onClick={handleRefund}>Confirm refund</Button>
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-jaman-border space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-jaman-navy">Day statement</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-2 py-1 rounded-lg border border-jaman-border" aria-label="Statement date" />
          <Button size="sm" variant="ghost" onClick={() => loadStatement(date)}>Show</Button>
          {statement && <Button size="sm" variant="ghost" onClick={() => downloadCsv(statement)}>Download CSV</Button>}
        </div>
        {statementError && <div className="text-xs text-rose-700">{statementError}</div>}
        {statement && (
          <div className="p-3 bg-jaman-ivory rounded-xl border border-jaman-border text-xs space-y-1">
            <div className="flex justify-between"><span className="text-[#8C9BAE]">Payments received ({statement.paymentCount})</span><span className="font-bold">{rupees(statement.grossVolume)}</span></div>
            <div className="flex justify-between"><span className="text-[#8C9BAE]">Refunds ({statement.refundCount})</span><span className="font-bold">− {rupees(statement.refundedAmount)}</span></div>
            <div className="flex justify-between"><span className="text-[#8C9BAE]">− Commission (3%)</span><span className="font-bold">{rupees(statement.platformCommission)}</span></div>
            <div className="flex justify-between"><span className="text-[#8C9BAE]">   of which Razorpay fee (est. 2%)</span><span className="font-bold">{rupees(statement.razorpayFee)}</span></div>
            <div className="flex justify-between"><span className="text-[#8C9BAE]">   Your net commission (1%, after refunds)</span><span className="font-bold">{rupees(statement.platformNetCommission - statement.commissionReversed)}</span></div>
            <div className="flex justify-between border-t border-jaman-border pt-1"><span className="font-bold text-jaman-navy">Net payable to you</span><span className="font-black text-jaman-navy">{rupees(statement.netPayableToRestaurant)}</span></div>
            <div className="text-[10px] text-[#8C9BAE] pt-1">{statement.settlementNote} Day = calendar day in India time.</div>
          </div>
        )}
      </div>
    </div>
  );
}
