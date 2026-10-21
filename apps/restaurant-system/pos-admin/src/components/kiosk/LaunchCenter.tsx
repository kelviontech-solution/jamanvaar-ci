import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { ops } from '../operations/operationsClient';
import type { PosAdminTab } from '../../navigation/adminTabs';
import { ChannelMenuPreview } from './CustomerExperience';
export interface LaunchState {
  branch: { id: string; name: string };
  preferences: { version: number; tableService: boolean; printedReceipts: boolean };
  products: { appCode: string; purchased: boolean; enabled: boolean; configured: boolean; ready: boolean; reason: string; nextAction: string }[];
  channels: string[];
  publishedMenuVersion: number;
  unpublishedChanges: boolean;
  checks: { id: string; label: string; done: boolean; page: string }[];
  delivery: {
    id: string;
    name: string;
    online: boolean;
    isLocked: boolean;
    menuReceived: boolean;
    menuVersion: number | null;
    configurationReceived: boolean;
    configurationStatus: string;
    error: string | null;
  }[];
  handovers: { acceptedAt?: string; updatedAt?: string; notes?: string }[];
  paymentNote: string;
}
export function LaunchCenter({ branchId, onNavigate }: { branchId: string; onNavigate: (page: PosAdminTab) => void }) {
  const [data, setData] = useState<LaunchState>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),[menuOpen,setMenuOpen]=useState(false);
  // U04: this panel used to render in full, permanently, even once every check was already
  // verified — a new full-suite owner saw an unlaunched-looking wall of setup tools forever,
  // and Restaurant Admin placed it below the (empty, pre-launch) business dashboard while Kiosk
  // Admin placed it above. Both apps now show it above the dashboard (see App.tsx), and once
  // every check the branch actually has is done, it collapses to a one-line summary instead of
  // staying expanded — "review setup" re-opens it on request.
  const [expanded, setExpanded] = useState(false);
  const launched = !!data && data.checks.length > 0 && data.checks.every((c) => c.done);
  const load = () =>
    ops<LaunchState>(branchId, 'launch')
      .then((value) => {
        setData(value);
        setError('');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    let live = true;
    setData(undefined);
    ops<LaunchState>(branchId, 'launch')
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [branchId]);
  const go = (page: string, task?: string) => {
    if (task) {
      const url = new URL(window.location.href);
      url.searchParams.set('opsTask', task);
      window.history.replaceState({}, '', url);
    }
    onNavigate(page as PosAdminTab);
  };
  // Shared presentation only: one secondary style for navigation/disclosure actions, one brand-outlined style for the refresh action.
  const button = 'min-h-11 rounded-xl border border-jaman-border bg-white px-4 py-2 text-sm font-bold text-jaman-navy hover:bg-[#F5F3EE] hover:border-[#D8D1C3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:opacity-50';
  const checkBase = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-bold text-jaman-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2';
  const primaryButton = 'min-h-11 inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/[0.08] px-4 py-2 text-sm font-bold text-brand hover:bg-brand/[0.14] active:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:opacity-50';
  const disclosure = 'jv-disclosure rounded-xl border border-jaman-border bg-[#FBF9F5] [&>*:not(summary)]:mx-3 [&>*:last-child]:mb-3';
  if (launched && !expanded) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-wrap items-center justify-between gap-3" aria-label="Launch and handover">
        <p className="text-sm font-bold text-emerald-800">
          {data!.branch.name} is launched — every setup check is verified. Daily service tasks are below.
        </p>
        <button className={button} onClick={() => setExpanded(true)}>
          Review setup
        </button>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-jaman-border bg-white p-4 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(11,37,58,0.04)]" aria-label="Launch and handover">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-jaman-navy">Launch & handover</h2>
          <p className="jv-tabular mt-1 text-sm text-slate-600" title="Only relevant setup steps are shown. Tests record real service evidence.">{data?.branch.name || 'Selected branch'}{data && data.checks.length > 0 && <> · <span className="font-semibold text-jaman-navy">{data.checks.filter((c) => c.done).length} of {data.checks.length}</span> checks verified</>}</p>
        </div>
        <div className="flex gap-2">
          {launched && (
            <button className={button} onClick={() => setExpanded(false)}>
              Collapse
            </button>
          )}
          <button className={primaryButton} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            Refresh readiness
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Checks unavailable: {error}
        </p>
      )}
      {!data && !error && <p role="status" className="animate-pulse text-sm text-slate-600">Checking purchased products, branch setup and devices…</p>}
      {data && (
        <>
          {data.products.some((p) => p.appCode === 'KIOSK_ADMIN' && p.enabled) && (
            <nav aria-label="Kiosk launch steps" className="flex flex-wrap gap-2">
              {(
                [
                  ['Menu', 'MENU'],
                  ['Customer experience', 'KIOSK_EXPERIENCE'],
                  ['Payments', 'KIOSK_PAYMENTS'],
                  ['Connect kiosk', 'KIOSKS'],
                  ['Test a real order', 'OPERATIONS_HUB']
                ] as const
              ).map(([label, page], index) => (
                <button className={`${button} inline-flex items-center gap-2.5`} key={page} onClick={() => go(page, page === 'OPERATIONS_HUB' ? 'acceptance' : undefined)}>
                  <span aria-hidden="true" className="jv-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{index + 1}</span>
                  <span className="sr-only">{index + 1}. </span>
                  {label}
                </button>
              ))}
            </nav>
          )}
          <details className={disclosure}>
            <summary>How does this branch serve customers?</summary>
            <div className="flex flex-wrap gap-4 py-3">
              {(['tableService', 'printedReceipts'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm min-h-11">
                  <input
                    type="checkbox"
                    checked={data.preferences[key]}
                    disabled={busy}
                    onChange={async (e) => {
                      const previous = data;
                      const next = { ...data.preferences, [key]: e.target.checked };
                      setData({ ...data, preferences: next });
                      setBusy(true);
                      try {
                        await ops(branchId, 'launch/preferences', {
                          expectedVersion: data.preferences.version,
                          tableService: data.preferences.tableService,
                          printedReceipts: data.preferences.printedReceipts,
                          [key]: e.target.checked
                        });
                        await load();
                      } catch (e) {
                        setData(previous);
                        setError(e instanceof Error ? e.message : 'Could not save service choices');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  {key === 'tableService' ? 'Table service (turn off for takeaway only)' : 'Printed receipts (turn off for paperless service)'}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              These choices change setup guidance only. Existing orders, taxes and receipts stay under their own settings.
            </p>
          </details>
          <div className="grid gap-2 sm:grid-cols-2 jv-stagger">
            {data.checks.map((c) => (
              <button
                key={c.id}
                className={`${checkBase} flex items-center gap-3 text-left ${c.done ? 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50' : 'border-jaman-border bg-white hover:bg-[#F5F3EE] hover:border-[#D8D1C3]'}`}
                onClick={() => go(c.page, c.id.startsWith('test-') || c.id === 'printer' ? 'acceptance' : undefined)}
              >
                <span aria-label={c.done ? 'Verified' : 'Needs attention'} className="shrink-0">
                  {c.done
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                    : <Circle className="h-5 w-5 text-slate-400" aria-hidden="true" />}
                </span>
                <span className="min-w-0 break-words">{c.label}</span>
              </button>
            ))}
          </div>
          {!data.checks.length && <p>No active ordering channel. Review Products & plan before launch.</p>}
          <details className={disclosure}>
            <summary>Purchased → enabled for branch → configured → verified</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {['Product', 'Purchased', 'Branch enabled', 'Configured', 'Ready', 'Next step'].map((h) => (
                      <th className="p-2 text-xs font-semibold uppercase tracking-wide text-slate-500" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.products
                    .filter((p) => p.purchased || p.enabled)
                    .map((p) => (
                      <tr key={p.appCode} className="border-t">
                        <th className="p-2">{p.appCode.replaceAll('_', ' ')}</th>
                        {[p.purchased, p.enabled, p.configured, p.ready].map((v, i) => (
                          <td className="p-2" key={i}>
                            {v ? 'Yes' : i < 2 ? 'No' : 'Not yet'}
                          </td>
                        ))}
                        <td className="p-2">
                          <button className="underline min-h-11" onClick={() => go(p.nextAction, p.enabled ? 'acceptance' : undefined)}>
                            {p.reason.replaceAll('_', ' ').toLowerCase()}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600">
              Unavailable? Review the restaurant plan and branch allocation under Subscription, or ask your platform administrator. Configuration and recorded
              tests do not grant a license.
            </p>
            <p className="text-xs text-slate-600">{data.paymentNote}</p>
          </details>
          <details className={disclosure}>
            <summary>Published vs received by kiosks · menu v{data.publishedMenuVersion}</summary>
            {data.unpublishedChanges && <p className="text-amber-800">There are unpublished menu changes. Review and publish in Menu.</p>}
            {!data.delivery.length ? (
              <p>No kiosks connected to this branch yet.</p>
            ) : (
              data.delivery.map((d) => (
                <div key={d.id} className="border-t py-3 text-sm">
                  <strong>{d.name}</strong> · {d.online ? 'Online' : 'Offline'}
                  {d.isLocked ? ' · Locked' : ''}
                  <p>
                    Menu: {d.menuReceived ? 'Received current version' : `Waiting (device v${d.menuVersion ?? 'unknown'})`} · Design:{' '}
                    {d.configurationReceived ? 'Received current version' : d.configurationStatus.toLowerCase()}
                  </p>
                  {d.error && <p role="alert">{d.error}</p>}
                  <button className="underline min-h-11" onClick={() => go('KIOSKS')}>
                    Open kiosk and retry sync
                  </button>
                </div>
              ))
            )}
          </details>
          <div className="flex flex-wrap gap-3">
            <button className={button} onClick={()=>setMenuOpen(v=>!v)} aria-expanded={menuOpen}>{menuOpen?'Hide channel menu preview':'What customers can order'}</button>
            {data.products.some((p) => p.appCode === 'KIOSK_ADMIN' && p.enabled) && (
              <button className={button} onClick={() => go('KIOSK_EXPERIENCE')}>
                Customer experience & private preview
              </button>
            )}
            <button className={button} onClick={() => go('OPERATIONS_HUB', 'handover')}>
              Owner / manager handover
            </button>
          </div>
          {menuOpen&&<ChannelMenuPreview branchId={branchId} kiosks={[]} journey={false} initialChannel={data.channels.includes('KIOSK')?'KIOSK':data.channels.includes('POS')?'POS':'QR'}/>}
          <p className="text-xs text-slate-500">
            {data.handovers.length
              ? `${data.handovers.length} recent handover(s); ${data.handovers.filter((h) => h.acceptedAt).length} acknowledged by the receiving user.`
              : 'No branch handover recorded yet.'}
          </p>
        </>
      )}
    </section>
  );
}
