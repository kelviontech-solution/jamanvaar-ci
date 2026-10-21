import { useEffect, useRef, useState } from 'react';
import { cloudQrAccount, getPaymentConnection, saveSettlementBankDetails, type PaymentConnectionStatus, type SettlementBankDetails } from '../../cloud/cloudClient';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';

const empty: SettlementBankDetails = { settlementAccountName: '', settlementBankName: '', settlementAccountNumber: '', settlementIfsc: '', settlementBankAccountType: 'CURRENT' };
const input = 'mt-1 w-full min-w-0 rounded-xl border border-jaman-border p-3 text-sm';

/** The existing encrypted, restaurant-wide payout destination, accessible to QR-only owners. */
export function QrPayoutBank() {
  const [data, setData] = useState<PaymentConnectionStatus | null>(null), [bank, setBank] = useState<SettlementBankDetails>(empty), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [allowed, setAllowed] = useState(false), [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  useQrUnsavedChanges(editing && !!(bank.settlementAccountNumber || bank.settlementAccountName || bank.settlementBankName || bank.settlementIfsc));
  const load = async () => {
    const id = ++sequence.current;
    setLoading(true); setError('');
    try {
      const account = await cloudQrAccount();
      const canManage = ['OWNER', 'MANAGER'].includes(account.role);
      const result = canManage ? await getPaymentConnection() : null;
      if (id === sequence.current) { setAllowed(canManage); setData(result); }
    } catch (e) { if (id === sequence.current) { setData(null); setError((e as Error).message); } }
    finally { if (id === sequence.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, []);
  return <section aria-label="Restaurant payout bank" className="rounded-2xl border border-jaman-border bg-white p-5 space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-bold">Payout bank account</h2><button type="button" className="qr-btn secondary" disabled={busy || loading} onClick={() => void load()}>{loading ? 'Checking…' : 'Refresh bank status'}</button></div>
    <p className="text-sm text-slate-600">Add the restaurant’s bank account for payout of its share. This account is shared across branches. Super Admin verifies it before manual payouts; collection activation is separate.</p>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {data && <><p className="text-sm"><strong>Bank status: {(data.bankVerificationStatus ?? 'NOT_ADDED').replaceAll('_', ' ').toLowerCase()}</strong>{data.settlementAccountNumberMasked && <span className="block mt-1">{data.settlementAccountName} · {data.settlementBankName} · {data.settlementAccountNumberMasked}</span>}</p>
      {!editing && <button type="button" className="qr-btn secondary" disabled={busy} onClick={() => { setBank(empty); setNotice(''); setEditing(true); }}>{data.settlementAccountNumberMasked ? 'Update payout bank' : 'Add payout bank'}</button>}
    </>}
    {!loading && !error && !allowed && <p className="text-sm">Sign in as the restaurant owner or manager to manage the payout bank.</p>}
    {editing && allowed && <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      ++sequence.current; setBusy(true); setError(''); setNotice('');
      try { setData(await saveSettlementBankDetails(bank)); setBank(empty); setEditing(false); setNotice('Bank details saved. Super Admin must verify the bank before payouts.'); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm">Account holder name<input required maxLength={120} className={input} value={bank.settlementAccountName} disabled={busy} onChange={e => setBank(b => ({ ...b, settlementAccountName: e.target.value }))} /></label>
        <label className="text-sm">Bank name<input required maxLength={120} className={input} value={bank.settlementBankName} disabled={busy} onChange={e => setBank(b => ({ ...b, settlementBankName: e.target.value }))} /></label>
        <label className="text-sm">Account number<input required autoComplete="off" inputMode="numeric" pattern="[0-9]{6,34}" maxLength={34} className={input} value={bank.settlementAccountNumber} disabled={busy} onChange={e => setBank(b => ({ ...b, settlementAccountNumber: e.target.value }))} /></label>
        <label className="text-sm">IFSC<input required pattern="[A-Z]{4}0[A-Z0-9]{6}" maxLength={11} className={input} value={bank.settlementIfsc} disabled={busy} onChange={e => setBank(b => ({ ...b, settlementIfsc: e.target.value.toUpperCase() }))} /></label>
        <label className="text-sm">Account type<select className={input} value={bank.settlementBankAccountType} disabled={busy} onChange={e => setBank(b => ({ ...b, settlementBankAccountType: e.target.value as 'SAVINGS' | 'CURRENT' }))}><option value="CURRENT">Current</option><option value="SAVINGS">Savings</option></select></label>
      </div>
      <p className="text-xs text-slate-500">The account number is encrypted and only its masked version is displayed. Changing bank details requires verification again; pending payout batches must be reconciled first.</p>
      <div className="flex flex-wrap gap-3"><button className="qr-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save bank for verification'}</button><button className="qr-btn secondary" type="button" disabled={busy} onClick={() => { setBank(empty); setEditing(false); setError(''); }}>Cancel bank changes</button></div>
    </form>}
  </section>;
}
