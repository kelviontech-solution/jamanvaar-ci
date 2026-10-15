import { useEffect, useState } from 'react';
import { useDialogFocus } from '@jamanvaar/ui';
import { qrApi } from '../../cloud/cloudClient';
import { QrAdminApi, type QrOverview } from '../../cloud/qrAdminClient';

type Access = { state: 'ON' | 'LOCKED' | 'OFF'; remainingToday: number | null; limitReached: boolean; questions: Array<{intent:string}> };
/** QR owners receive canonical branch metrics, never another terminal's local/demo database. */
export function QrAiAssistant() {
  const [access, setAccess] = useState<Access | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ title: string; text: string } | null>(null);
  const { cardRef } = useDialogFocus<HTMLDivElement>(open, () => setOpen(false));
  useEffect(() => {
    let live = true;
    const refresh = () => { void qrApi<Access>('/api/v1/devices/me/ai-config').then(a => { if (live) {setAccess(a); if (a.state === 'OFF') setOpen(false);} }).catch(() => { if (live) setAccess(null); }); };
    refresh(); const timer = setInterval(refresh, 60_000); window.addEventListener('focus', refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  async function ask(kind: 'SALES' | 'ORDERS' | 'SETUP') {
    setBusy(true); setError(''); setResult(null);
    const start = performance.now();
    try {
      const overview: QrOverview = await QrAdminApi.overview();
      const intent = kind === 'SALES' ? 'TODAY_SALES' : kind === 'ORDERS' ? 'TODAY_ORDERS' : 'END_OF_DAY';
      // Server validates access and the restaurant-wide quota on every query.
      await qrApi('/api/v1/devices/me/ai-telemetry', { method: 'POST', body: JSON.stringify({intent, latencyMs: Math.round(performance.now() - start)}) });
      const money = (n: number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n);
      setResult(kind === 'SALES' ? {title:'QR sales today',text:`Placed orders: ${money(overview.today.sales)}. Paid sales: ${money(overview.today.paidSales)}. Average order value: ${money(overview.today.averageOrderValue)}.`}
        : kind === 'ORDERS' ? {title:'QR orders today',text:`${overview.today.ordersPlaced} placed, ${overview.today.ordersPending} pending and ${overview.today.ordersCompleted} completed. ${overview.today.failedAttempts} failed ordering attempts.`}
        : {title:'QR setup snapshot',text:`${overview.activeCodes} active QR codes and ${overview.activeTables} active tables. ${overview.publicBaseUrlConfigured ? 'Public QR address configured.' : 'Configure the public QR address before printing.'} Use the setup health check for menu, payment and kitchen readiness.`});
      setAccess(await qrApi<Access>('/api/v1/devices/me/ai-config'));
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load QR insights.'); }
    finally { setBusy(false); }
  }
  if (!access || access.state === 'OFF') return null;
  return <>
    <button type="button" data-testid="qr-ai-open" className="qr-btn secondary" onClick={() => {setOpen(true);setError('');}}>✦ JAMAN AI</button>
    {open && <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="qr-ai-title" className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90dvh] overflow-auto space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3"><h2 id="qr-ai-title">JAMAN AI · QR insights</h2><button type="button" className="qr-btn secondary" aria-label="Close JAMAN AI" onClick={() => setOpen(false)}>Close</button></div>
        <p>Insights use server records for the selected branch scope. These are calculated business insights.</p>
        {access.state === 'LOCKED' ? <p role="status">JAMAN AI is not included in your current access. Contact your platform administrator.</p> : <>
          <p>{access.remainingToday === null ? 'No daily query cap.' : `${access.remainingToday} restaurant queries remaining today.`}</p>
          <div className="flex flex-wrap gap-2">{(['SALES','ORDERS','SETUP'] as const).map((kind,i) => access.questions.some(q=>q.intent===['TODAY_SALES','TODAY_ORDERS','END_OF_DAY'][i]) && <button key={kind} type="button" className="qr-btn secondary" disabled={busy || access.limitReached} onClick={() => void ask(kind)}>{['QR sales today','QR orders today','QR setup snapshot'][i]}</button>)}</div>
          {access.limitReached && <p role="status">Daily query limit reached.</p>}
          {busy && <p role="status">Checking current QR records…</p>}
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {result && <section aria-live="polite" className="rounded-xl border p-4"><h3>{result.title}</h3><p>{result.text}</p></section>}
        </>}
      </div>
    </div>}
  </>;
}
