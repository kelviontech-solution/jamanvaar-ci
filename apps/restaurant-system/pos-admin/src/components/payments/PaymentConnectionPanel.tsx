import { useEffect, useRef, useState } from 'react';
import { Button } from '@jamanvaar/ui';
import { SessionPersistence } from '@jamanvaar/business';
import {
  getPaymentConnection, requestPlatformPayments, saveSettlementBankDetails, setDirectSettlementRequest,
  type PaymentConnectionStatus, type SettlementBankDetails
} from '../../cloud/cloudClient';

const emptyBank: SettlementBankDetails = {
  settlementAccountName: '', settlementBankName: '', settlementAccountNumber: '', settlementIfsc: '', settlementBankAccountType: 'CURRENT'
};

export function PaymentConnectionPanel({ onStatusChange }: { onStatusChange?: (status: PaymentConnectionStatus) => void }) {
  const admin = SessionPersistence.load('admin');
  const canManage = admin?.roleId === 'role-admin' || admin?.roleId === 'role-manager';
  const [status, setStatus] = useState<PaymentConnectionStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [bank, setBank] = useState<SettlementBankDetails>(emptyBank);
  const sequence = useRef(0);
  const callback = useRef(onStatusChange);
  callback.current = onStatusChange;

  const accept = (value: PaymentConnectionStatus) => { setStatus(value); callback.current?.(value); };
  const load = () => {
    const current = ++sequence.current;
    setError('');
    getPaymentConnection().then(value => {
      if (current === sequence.current) accept(value);
    }).catch(e => { if (current === sequence.current) setError(e instanceof Error ? e.message : 'Could not load payment settings'); });
  };
  useEffect(() => {
    if (canManage) load();
    return () => { sequence.current++; };
  }, [canManage]);

  async function change(action: () => Promise<PaymentConnectionStatus>, success: string) {
    if (busy) return;
    ++sequence.current;
    setBusy(true); setError(''); setMessage('');
    try { accept(await action()); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save payment settings'); }
    finally { setBusy(false); }
  }

  function editBank() {
    setBank({ ...emptyBank, settlementAccountName: status?.settlementAccountName ?? '', settlementBankName: status?.settlementBankName ?? '',
      settlementIfsc: status?.settlementIfsc ?? '', settlementBankAccountType: status?.settlementBankAccountType === 'SAVINGS' ? 'SAVINGS' : 'CURRENT' });
    setEditingBank(true); setError('');
  }

  async function submitBank(e: React.FormEvent) {
    e.preventDefault();
    await change(async () => {
      const updated = await saveSettlementBankDetails(bank);
      setBank(emptyBank); setEditingBank(false);
      return updated;
    }, 'Bank details saved for Super Admin verification.');
  }

  if (!canManage) return <p className="text-sm p-6">Ask your restaurant owner or manager to manage kiosk payment settings.</p>;

  const inputClass = 'w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm';
  return (
    <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-jaman-navy">Kiosk payment settings</h3>
        <Button variant="ghost" size="sm" onClick={load} disabled={busy}>Refresh</Button>
      </div>
      {error && <div role="alert" className="text-xs text-rose-700 bg-rose-50 rounded-xl p-3">{error}</div>}
      {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
      {!status && !error && <p className="text-xs">Loading payment settings...</p>}
      {status && <>
        <p className="text-xs text-[#4A5568]">Kiosk QR payments collect into Jamanvaar's account. Your net payable is transferred manually after your bank details are verified.</p>
        <div className="text-xs bg-jaman-ivory rounded-xl p-3 space-y-1">
          <p>Online payments: <strong>{status.status.replaceAll('_', ' ')}</strong></p>
          <p>Jamanvaar Fee: <strong>{((status.effectiveCommissionBps ?? 300) / 100).toFixed(2)}%</strong> on kiosk QR payments only. Super Admin controls this rate.</p>
          <p>Current collection account: <strong>Jamanvaar</strong></p>
          <p>Current payout mode: <strong>Manual bank transfer</strong></p>
        </div>
        {['NOT_CONNECTED', 'DISCONNECTED'].includes(status.status) &&
          <Button size="sm" variant="accent" disabled={busy} onClick={() => change(requestPlatformPayments, 'Online payment activation requested. Super Admin will review it.')}>Request online payment activation</Button>}
        {status.status === 'PENDING_VERIFICATION' && <p className="text-xs text-amber-700">Online payment activation is awaiting Super Admin approval.</p>}
        {status.status === 'SUSPENDED' && <p className="text-xs text-rose-700">Online payments are suspended. Contact Jamanvaar support.</p>}
        <label className="flex items-center gap-3 text-sm font-bold text-jaman-navy">
          <input type="checkbox" role="switch" aria-label="Request direct settlement to restaurant bank" checked={status.directSettlementRequested ?? false} disabled={busy}
            onChange={e => { const requested = e.target.checked; void change(() => setDirectSettlementRequest(requested), requested ? 'Direct settlement requested. Manual payouts continue while Route is pending.' : 'Direct settlement request cancelled. Jamanvaar collection continues.'); }} />
          Request direct settlement to my bank
        </label>
        <p className="text-xs text-[#4A5568]">Razorpay Route is pending. This toggle saves your request for later activation; payments continue through Jamanvaar with manual payouts. Save your bank details before enabling it.</p>
        {status.directSettlementRequested && <p className="text-xs text-amber-700 font-bold">Direct settlement requested - awaiting Route activation and linked account verification.</p>}
        <div className="flex items-center justify-between border-t border-jaman-border pt-3">
          <div className="text-xs">
            <strong>Payout bank: {status.bankVerificationStatus ?? 'NOT_ADDED'}</strong>
            {status.settlementAccountNumberMasked && <p>{status.settlementAccountName} | {status.settlementBankName} | {status.settlementAccountNumberMasked} | {status.settlementIfsc}</p>}
            {status.settlementUpiVpa && <p>Existing payout destination: {status.settlementUpiVpa}</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={editBank} disabled={busy}>Update bank details</Button>
        </div>
        {status.bankVerificationStatus === 'REJECTED' && <p className="text-xs text-rose-700">Bank details were rejected. Check and resubmit them.</p>}
        {editingBank && <form onSubmit={submitBank} className="space-y-3 border-t border-jaman-border pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs">Account holder name<input required maxLength={120} className={inputClass} value={bank.settlementAccountName} onChange={e => setBank(b => ({ ...b, settlementAccountName: e.target.value }))} /></label>
            <label className="text-xs">Bank name<input required maxLength={120} className={inputClass} value={bank.settlementBankName} onChange={e => setBank(b => ({ ...b, settlementBankName: e.target.value }))} /></label>
            <label className="text-xs">Account number<input required autoComplete="off" inputMode="numeric" pattern="[0-9]{6,34}" className={inputClass} value={bank.settlementAccountNumber} onChange={e => setBank(b => ({ ...b, settlementAccountNumber: e.target.value }))} /></label>
            <label className="text-xs">IFSC<input required pattern="[A-Z]{4}0[A-Z0-9]{6}" maxLength={11} className={inputClass} value={bank.settlementIfsc} onChange={e => setBank(b => ({ ...b, settlementIfsc: e.target.value.toUpperCase() }))} /></label>
            <label className="text-xs">Account type<select className={inputClass} value={bank.settlementBankAccountType} onChange={e => setBank(b => ({ ...b, settlementBankAccountType: e.target.value as 'SAVINGS' | 'CURRENT' }))}><option value="CURRENT">Current</option><option value="SAVINGS">Savings</option></select></label>
          </div>
          <p className="text-xs">Saving a new account requires bank verification again. An unpaid payout batch must be reconciled before changing its destination.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditingBank(false); setBank(emptyBank); }}>Cancel</Button>
            <Button type="submit" size="sm" variant="accent" disabled={busy}>{busy ? 'Saving...' : 'Save for verification'}</Button>
          </div>
        </form>}
      </>}
    </div>
  );
}
