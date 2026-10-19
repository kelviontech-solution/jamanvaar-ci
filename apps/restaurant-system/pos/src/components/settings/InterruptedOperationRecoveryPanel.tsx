import React, { useEffect, useState } from 'react';
import { db, type PendingFinancialRecovery } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { usePosStore } from '../../store/posStore';
import { reviewInterruptedOperation, finishInterruptedOperation, type InterruptedOperationReview } from '../../services/interruptedOperationRecovery';

export function InterruptedOperationRecoveryPanel() {
  const [pending, setPending] = useState<PendingFinancialRecovery | null>(null);
  const [review, setReview] = useState<InterruptedOperationReview | null>(null);
  const [draft, setDraft] = useState<'RECOVERED_BILL' | 'SEPARATE_WORK' | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => { try { setPending(db.getPendingFinancialRecovery()); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Recovery needs review.'); } };
    refresh(); return db.subscribe(refresh);
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Keep the bill and retry recovery.'); }
    finally { setBusy(false); }
  };
  if (!pending && !review && !message && !error) return null;
  return <section aria-label="Interrupted operation recovery" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-4 min-w-0">
    <div><h3 className="text-lg font-bold text-jaman-navy">Finish an interrupted save</h3>
      <p className="text-sm text-slate-700 mt-1">Review the original bill before collecting again. Recovery restores its saved local operation; it does not send money, print a receipt or open the cash drawer.</p></div>
    {pending && <p className="text-sm break-all">Original bill reference: <strong>{pending.orderId}</strong></p>}
    <fieldset disabled={busy} className="space-y-4 min-w-0">
      {pending && <button type="button" onClick={() => void run(async () => {
        const result = await reviewInterruptedOperation(pending.operationId); setReview(result); setDraft(''); setConfirmed(false); setError('');
      })} className="rounded-xl bg-jaman-navy text-white min-h-11 px-4 font-bold">Restore and review original bill</button>}
      {review && <div className="rounded-xl border border-amber-200 bg-white p-4 space-y-3">
        <h4 className="font-bold break-words">Recovered bill {review.orderNumber}</h4>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Bill total</dt><dd>{formatINR(review.totalAmount)}</dd>
          <dt>Recorded collection</dt><dd>{formatINR(review.collectedAmount)}</dd><dt>Recorded return</dt><dd>{formatINR(review.refundedAmount)}</dd>
          <dt>Balance due</dt><dd className="font-bold">{formatINR(review.outstandingAmount)}</dd>
          <dt>Payment status</dt><dd className="break-words">{({ SUCCESS: 'Paid', PAID: 'Paid', PENDING: 'Awaiting payment', FAILED: 'Payment failed', CANCELLED: 'Payment cancelled', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded', PARTIALLY_PAID: 'Partly paid' } as Record<string, string>)[review.paymentStatus] ?? review.paymentStatus.replaceAll('_', ' ').toLowerCase()}</dd>
          <dt>Order status</dt><dd>{review.orderStatus.replaceAll('_', ' ').toLowerCase()}</dd></dl>
        {(review.cartItems > 0 || review.savedDraftItems > 0) && <label className="block text-sm font-semibold">Current cart: {review.cartItems} items. Saved draft: {review.savedDraftItems} items.
          <select aria-label="How to handle the current cart" value={draft} onChange={event => { setDraft(event.target.value as typeof draft); setConfirmed(false); }} className="block w-full min-h-11 rounded-xl border border-jaman-border mt-1 px-2">
            <option value="">Choose after checking the bill</option>
            <option value="RECOVERED_BILL">These belong to this bill — clear old drafts</option>
            <option value="SEPARATE_WORK">All are separate new work — keep drafts</option>
          </select>
        </label>}
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>
          I checked this bill, cart and any saved draft. I will collect only its outstanding balance.</label>
        <button type="button" disabled={!confirmed || ((review.cartItems > 0 || review.savedDraftItems > 0) && !draft)} onClick={() => void run(async () => {
          await finishInterruptedOperation(review.operationId, review.cartItems > 0 || review.savedDraftItems > 0 ? draft as 'RECOVERED_BILL' | 'SEPARATE_WORK' : 'EMPTY');
          setPending(null); setReview(null); setMessage('Recovery finished. The original bill is available in Bills & Invoices. No payment or print was repeated.');
        })} className="rounded-xl bg-jaman-navy text-white min-h-11 px-4 font-bold disabled:opacity-40">Finish reviewed recovery</button>
      </div>}
    </fieldset>
    {busy && <p role="status" className="text-sm">Saving the original operation…</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 text-rose-800 p-3 text-sm">{error}</p>}
    {message && <div role="status" className="text-sm space-y-3"><p>{message}</p><button type="button" onClick={() => usePosStore.getState().setActiveTab('BILLS')} className="min-h-11 rounded-xl border border-jaman-border bg-white px-4 font-semibold">Open Bills & Invoices</button></div>}
  </section>;
}
