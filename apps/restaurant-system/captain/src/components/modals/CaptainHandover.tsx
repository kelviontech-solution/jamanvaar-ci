import { useState } from 'react';
import { captainDb } from '@jamanvaar/database';
import { formatINR, outstandingBillAmount } from '@jamanvaar/utils';
import { useCaptainStore } from '../../store/captainStore';

export function CaptainHandover({onDone}: {onDone:()=>void}) {
  const {currentCaptain,handover,loginError} = useCaptainStore();
  const [pin,setPin] = useState(''),[note,setNote] = useState(''),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const tables = captainDb.tables.filter(t => t.openedById === currentCaptain?.id && (t.status !== 'AVAILABLE' || !!t.currentOrderId));
  const orders = captainDb.orders.filter(o => tables.some(t => t.currentOrderId === o.id));
  const ready = captainDb.kots.filter(k => orders.some(o => o.id === k.orderId) && k.status === 'READY').length;
  const outstanding = orders.reduce((sum,o) => sum+outstandingBillAmount(o),0);
  const accept = async () => {setBusy(true);setError('');try {if (await handover(pin,note)) {setPin('');onDone();} else setError(useCaptainStore.getState().loginError ?? 'Handover was not accepted.');} catch(e) {setError(e instanceof Error ? e.message : 'Could not hand over.');} finally {setBusy(false);}};
  return <section className="rounded-2xl border border-jaman-border bg-white p-4 space-y-3">
    <h3 className="font-bold text-jaman-navy">Hand over my floor</h3>
    <p className="text-sm text-slate-600">The next captain reviews these tasks and enters their own PIN to accept. Bills and kitchen progress stay unchanged.</p>
    <p className="font-semibold text-sm">{tables.length} tables · {ready} ready tickets · {formatINR(outstanding)} outstanding</p>
    <p className="text-sm">Tables: {tables.map(t => t.tableNumber).join(', ') || 'No active tables'}</p>
    <label className="block text-sm">Handover note<textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} className="block w-full border rounded-xl p-2 mt-1" placeholder="Guest requests or follow-up needed"/></label>
    <label className="block text-sm">Receiving captain's PIN<input type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={8} onChange={e => setPin(e.target.value.replace(/\D/g,''))} className="block w-full min-h-12 border rounded-xl p-2 mt-1"/></label>
    <div className="grid grid-cols-3 gap-2">{['1','2','3','4','5','6','7','8','9','Clear','0','⌫'].map(key => <button key={key} type="button" disabled={busy} onClick={() => setPin(value => key === 'Clear' ? '' : key === '⌫' ? value.slice(0,-1) : (value+key).slice(0,8))} className="min-h-11 rounded-xl border bg-jaman-cream font-bold">{key}</button>)}</div>
    {(error || loginError) && <p role="alert" className="text-rose-700 text-sm">{error || loginError}</p>}
    <button type="button" disabled={busy || pin.length < 4} onClick={() => void accept()} className="min-h-12 w-full rounded-xl bg-jaman-navy text-white font-bold disabled:opacity-50">{busy ? 'Checking acceptance…' : 'Accept handover & switch captain'}</button>
  </section>;
}
