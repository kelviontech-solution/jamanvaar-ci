import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMenuDraftStatus, fetchLaunchAcceptance, type LaunchAcceptance, type AppCode } from '../../cloud/cloudClient';
import { QrAdminApi } from '../../cloud/qrAdminClient';
import { OnboardingChecklistCard, type OnboardingChecklistItem } from './OnboardingChecklistCard';

export function onboardingStepIds(apps: readonly string[]) {
  return [
    'menu',
    'publish',
    ...(apps.includes('POS_ADMIN') ? ['tables', 'staff', 'printer'] : []),
    ...(apps.includes('KIOSK_ADMIN') ? ['kiosk'] : []),
    ...(apps.includes('QR_ORDERING') ? ['qr'] : []),
    'test'
  ];
}

export function PlanOnboarding({
  apps,
  branchId,
  counts,
  onNavigate
}: {
  apps: AppCode[];
  branchId: string;
  counts: { menu: number; tables: number; staff: number; printers: number; kiosks: number };
  onNavigate: (page: string) => void;
}) {
  const [published, setPublished] = useState(false),
    [qrReady, setQrReady] = useState(false),
    [launch, setLaunch] = useState<LaunchAcceptance | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState(''),
    [checks, setChecks] = useState([false, false, false]);
  const generation = useRef(0);
  const qrIncluded = apps.includes('QR_ORDERING');
  const load = useCallback(async () => {
    const version = ++generation.current;
    const results = await Promise.allSettled([
      fetchMenuDraftStatus(),
      fetchLaunchAcceptance(branchId),
      qrIncluded ? QrAdminApi.overview() : Promise.resolve(null)
    ]);
    if (version !== generation.current) return;
    const [menu, test, qr] = results;
    setPublished(menu.status === 'fulfilled' && menu.value.publishedVersion > 0 && !menu.value.hasUnpublishedChanges && !menu.value.errors.length);
    setLaunch(test.status === 'fulfilled' ? test.value : null);
    setQrReady(qr.status === 'fulfilled' && !!qr.value?.activeCodes);
    setError(
      results
        .filter((r) => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : 'Setup could not be verified'))
        .join(' ')
    );
  }, [branchId, qrIncluded]);
  useEffect(() => {
    const refresh = () => void load();
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      generation.current++;
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  const available: Record<string, OnboardingChecklistItem> = {
    menu: {
      id: 'menu',
      label: 'Add your dishes',
      hint: 'Use a template or upload your menu; review prices, photos and tax before publishing.',
      done: counts.menu > 0,
      onGo: () => onNavigate('MENU')
    },
    publish: {
      id: 'publish',
      label: 'Publish the guest menu',
      hint: 'Publishing makes the reviewed menu available to licensed ordering apps.',
      done: published,
      onGo: () => onNavigate('MENU')
    },
    tables: { id: 'tables', label: 'Set up tables', done: counts.tables > 0, onGo: () => onNavigate('TABLES') },
    staff: { id: 'staff', label: 'Add your team', done: counts.staff > 0, onGo: () => onNavigate('STAFF') },
    printer: { id: 'printer', label: 'Connect printers', done: counts.printers > 0, onGo: () => onNavigate('HARDWARE') },
    kiosk: { id: 'kiosk', label: 'Connect this branch’s kiosks', done: counts.kiosks > 0, onGo: () => onNavigate('KIOSKS') },
    qr: { id: 'qr', label: 'Generate and check a table QR', done: qrReady, onGo: () => onNavigate('QR_ORDERING') },
    test: {
      id: 'test',
      label: 'Verify a paid test order',
      hint: 'Complete a small order in a licensed app, confirm staff receive it, then record the result here.',
      done: launch?.verified === true,
      onGo: () => setOpen(true)
    }
  };
  return (
    <section className="space-y-3 mt-5" aria-label="Plan onboarding">
      {apps.includes('KIOSK_ADMIN') && (
        <button className="min-h-11 rounded-xl border bg-white px-4 font-bold text-sm" onClick={() => onNavigate('KIOSK_WELCOME')}>
          Preview kiosk welcome screens
        </button>
      )}
      <OnboardingChecklistCard progressKey={apps.slice().sort().join('-')} items={onboardingStepIds(apps).map((id) => available[id])} />
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {error}{' '}
          <button className="underline min-h-11 font-bold" onClick={() => void load()}>
            Retry setup checks
          </button>
        </p>
      )}
      <button type="button" className="min-h-11 rounded-xl border bg-white px-4 text-sm font-bold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide' : 'Open'} final test-order check
      </button>
      {open && (
        <form
          className="rounded-2xl border bg-white p-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              setLaunch(await fetchLaunchAcceptance(branchId, { orderId, counterReceived: checks[0], kitchenReceived: checks[1], receiptVerified: checks[2] }));
              setOrderId('');
              setChecks([false, false, false]);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Verification could not be saved');
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="font-bold text-lg">Finish with a test order</h2>
          <p className="text-sm text-slate-600">
            Place and settle a small order in your configured POS, Captain, Kiosk or table QR. Mark it served, then select it below. This check records
            evidence; it does not place orders or collect money. Repeat after a menu publication.
          </p>
          {launch?.verified && (
            <p role="status" className="text-emerald-800">
              Verified order {launch.record?.orderId} · {launch.record?.verifiedAt && new Date(launch.record.verifiedAt).toLocaleString()}
            </p>
          )}
          <label className="block text-sm font-bold">
            Paid and completed order
          <select aria-label="Paid and completed order" required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="mt-1 block w-full rounded-xl border p-3">
              <option value="">Choose an order</option>
              {launch?.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {o.source} · ₹{o.total}
                </option>
              ))}
            </select>
          </label>
          {!launch?.orders.length && <p className="text-sm text-amber-900">No paid, served or completed order has synced for this branch yet.</p>}
          {['I saw this order at the counter', 'I confirmed the kitchen received the same order', 'I verified the receipt and payment amount'].map(
            (label, i) => (
              <label key={label} className="flex gap-3 items-center min-h-11 text-sm">
                <input type="checkbox" required checked={checks[i]} onChange={(e) => setChecks((old) => old.map((v, n) => (n === i ? e.target.checked : v)))} />
                {label}
              </label>
            )
          )}
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy || !orderId || checks.some((v) => !v)}
              className="min-h-11 rounded-xl bg-jaman-navy text-white px-4 font-bold disabled:opacity-50"
            >
              {busy ? 'Recording…' : 'Record successful test'}
            </button>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border px-4 font-bold">
              Refresh completed orders
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
