import { useCallback, useEffect, useRef, useState } from 'react';
import { QrAdminApi } from '../../cloud/qrAdminClient';

type Readiness = Awaited<ReturnType<typeof QrAdminApi.paymentReadiness>>;

export function QrOnlinePaymentSetup({ branch, onSaved }: { branch: string; onSaved: () => void }) {
  const [data, setData] = useState<Readiness | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [acknowledged, setAcknowledged] = useState(false), [requestPrompt, setRequestPrompt] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setChecking(true);
    try { const result = await QrAdminApi.paymentReadiness(branch); if (id === sequence.current) { setData(result); setError(''); } }
    catch (e) { if (id === sequence.current) { setData(null); setError((e as Error).message); } }
    finally { if (id === sequence.current) setChecking(false); }
  }, [branch]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { ++sequence.current; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  const saveToggle = async (enabled: boolean) => {
    setNotice('');
    if (enabled && !data?.available) { setRequestPrompt(true); return; }
    setBusy(true); setError('');
    try { await QrAdminApi.saveSettings({ allowOnlinePayment: enabled }, branch); await load(); onSaved(); setNotice(enabled ? 'Online payment is turned on for this scope.' : 'Online payment is turned off for new checkouts. Existing payments can still finish.'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const pending = !!data?.ticketNumber;
  const checked = !!data && (data.available || pending) && data.enabled;
  return <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-4" aria-label="QR online payment setup">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-jaman-navy">Online payment</h2><button type="button" className="qr-btn secondary" disabled={checking || busy} onClick={() => void load()}>{checking ? 'Checking…' : 'Check payment status'}</button></div>
    <p className="text-sm text-slate-600">Guests pay through Jamanvaar’s secure checkout. A 2% Jamanvaar commission is deducted from each new QR online collection.</p>
    <div className="rounded-xl bg-slate-50 p-4 text-sm"><strong>₹100 collected → ₹2 Jamanvaar commission + ₹98 restaurant share</strong><p className="mt-1 text-slate-600">The guest pays the bill total. Gateway fees and taxes are separate from Jamanvaar’s gross commission. Refunds and payout holds remain visible in the payment ledger.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {data && <>
      <div className="rounded-xl border p-4">
        <label className="flex items-center justify-between gap-4 font-bold"><span>Allow online payment</span>
          <span className="relative inline-flex shrink-0">
            <input className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed" style={{ width: '100%', height: '100%' }} type="checkbox" role="switch" aria-label="Allow online payment" checked={checked} disabled={busy || checking || (!checked && data.planAllowed === false)} onChange={e => void saveToggle(e.target.checked)} />
            <span aria-hidden="true" className="pointer-events-none h-7 w-12 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-700 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-700 peer-focus-visible:ring-offset-2 peer-disabled:opacity-40" />
            <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
        <p className="mt-2 text-sm" role="status">{data.guestAvailable ? 'Live: guests can pay online.' : pending ? data.enabled ? 'Activation pending: guests cannot pay online yet.' : 'Online payment is off. Your activation request is still being reviewed.' : data.available ? 'Ready: use the switch to turn online payment on.' : 'Activation required: turn on the switch or request activation below.'}</p>
      </div>
      <p className="text-sm text-slate-600">{data.message}</p>
      {data.planAllowed === false && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your QR payment access needs Super Admin review. The activation request below includes this check.</p>}
      {!data.available && !pending && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <h3 className="font-bold">{requestPrompt ? 'Finish online payment activation' : 'Request activation from Super Admin'}</h3><p className="text-sm">The restaurant owner can send this request here. Super Admin receives a ticket with a direct approval action.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} /><span>I accept the 2% Jamanvaar commission on new QR online collections.</span></label>
        <button type="button" className="qr-btn" disabled={busy || !acknowledged} onClick={async () => {
          setBusy(true); setError('');
          try { const result = await QrAdminApi.requestPaymentActivation(branch); setNotice(`Activation requested as TKT-${String(result.ticketNumber).padStart(6, '0')}. Super Admin can approve it from this ticket.`); setAcknowledged(false); await load(); onSaved(); }
          catch (e) { setError((e as Error).message); }
          finally { setBusy(false); }
        }}>{busy ? 'Sending request…' : 'Send activation request'}</button>
      </div>}
      {pending && <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Request TKT-{String(data.ticketNumber).padStart(6, '0')} is with Super Admin. Track it in Help & Support. This page checks for approval automatically.</p>}
      <p className="text-xs text-slate-500">Restaurant shares are tracked for payouts to your verified bank account. Collection approval and bank verification are separate; an unverified bank keeps payouts pending.</p>
    </>}
    {!data && !error && <p role="status">Loading payment setup…</p>}
  </section>;
}
