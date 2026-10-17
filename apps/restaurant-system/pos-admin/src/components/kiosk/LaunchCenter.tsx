import { useEffect, useState } from 'react';
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
  const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50';
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
    <section className="rounded-2xl border border-jaman-border bg-white p-4 sm:p-6 space-y-4" aria-label="Launch and handover">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Launch & handover</h2>
          <p className="text-sm text-slate-600">{data?.branch.name || 'Selected branch'} · Only relevant setup steps. Tests record real service evidence.</p>
        </div>
        <div className="flex gap-2">
          {launched && (
            <button className={button} onClick={() => setExpanded(false)}>
              Collapse
            </button>
          )}
          <button className={button} onClick={() => void load()}>
            Refresh readiness
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3">
          Checks unavailable: {error}
        </p>
      )}
      {!data && !error && <p role="status">Checking purchased products, branch setup and devices…</p>}
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
                <button className={button} key={page} onClick={() => go(page, page === 'OPERATIONS_HUB' ? 'acceptance' : undefined)}>
                  {index + 1}. {label}
                </button>
              ))}
            </nav>
          )}
          <details>
            <summary className="cursor-pointer font-bold py-3">How does this branch serve customers?</summary>
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
          <div className="grid gap-2 sm:grid-cols-2">
            {data.checks.map((c) => (
              <button
                key={c.id}
                className={`${button} flex items-center gap-3 text-left`}
                onClick={() => go(c.page, c.id.startsWith('test-') || c.id === 'printer' ? 'acceptance' : undefined)}
              >
                <span aria-label={c.done ? 'Verified' : 'Needs attention'}>{c.done ? '✓' : '○'}</span>
                {c.label}
              </button>
            ))}
          </div>
          {!data.checks.length && <p>No active ordering channel. Review Products & plan before launch.</p>}
          <details>
            <summary className="cursor-pointer py-3 font-bold">Purchased → enabled for branch → configured → verified</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {['Product', 'Purchased', 'Branch enabled', 'Configured', 'Ready', 'Next step'].map((h) => (
                      <th className="p-2" key={h}>
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
          </details>
          <details>
            <summary className="cursor-pointer py-3 font-bold">Published vs received by kiosks · menu v{data.publishedMenuVersion}</summary>
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
          <p className="text-xs text-slate-600">{data.paymentNote}</p>
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
