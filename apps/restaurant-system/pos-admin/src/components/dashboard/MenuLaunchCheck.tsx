import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchMenuDraftStatus, fetchDeviceFleet, type FleetDevice, type MenuDraftStatus } from '../../cloud/cloudClient';
import { QrAdminApi, type QrTableRow } from '../../cloud/qrAdminClient';
import { QrSetupHealth } from '../qrconsole/QrOperations';

export function MenuLaunchCheck({qrEnabled, onNavigate, branchId}: {qrEnabled: boolean; onNavigate: (tab: string) => void; branchId?: string}) {
  const [status, setStatus] = useState<MenuDraftStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fleet, setFleet] = useState<FleetDevice[] | null>(null);
  const [tables, setTables] = useState<QrTableRow[]>([]);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const version = ++revision.current;setBusy(true);setError('');
    const results = await Promise.allSettled([fetchMenuDraftStatus(),fetchDeviceFleet(),qrEnabled ? QrAdminApi.tables() : Promise.resolve([] as QrTableRow[])] as const);
    if (version !== revision.current) return;
    const [menu, devices, codes] = results;
    setStatus(menu.status === 'fulfilled' ? menu.value : null);
    setFleet(devices.status === 'fulfilled' ? devices.value : null);
    setTables(codes.status === 'fulfilled' ? codes.value.filter(row => !branchId || row.branchId === branchId) : []);
    setError(results.filter(result => result.status === 'rejected').map(result => result.reason instanceof Error ? result.reason.message : 'A setup check could not be verified.').join(' '));setBusy(false);
  },[branchId,qrEnabled]);
  useEffect(() => {void load();return () => {revision.current++;};}, [load]);
  const published = !!status && status.publishedVersion > 0 && !status.hasUnpublishedChanges && status.errors.length === 0;
  return <div className="space-y-4 mb-4">
    <section className="rounded-2xl border border-jaman-border bg-white p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-jaman-navy">Guest menu readiness</h2><button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-xl border border-jaman-border px-3 font-bold text-sm disabled:opacity-50">{busy ? 'Checking…' : 'Check again'}</button></div>
      <p role="status" className={published ? 'text-emerald-800' : 'text-amber-900'}>{published ? `Menu version ${status.publishedVersion} is published.` : status ? status.hasUnpublishedChanges ? 'Your latest edits still need publishing.' : 'Publish a menu before inviting guests to order.' : 'Publication has not been verified.'}</p>
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      {status?.errors.map(message => <p key={message} className="text-rose-700 text-sm">{message}</p>)}
      {status && <p className="text-sm text-slate-600">Draft: {status.counts.items} dishes in {status.counts.categories} categories. {status.warnings.join(' ')}</p>}
      <ol className="space-y-3 text-sm"><li><strong>1. Publish your menu.</strong> Resolve the errors above, then publish the latest draft.</li><li><strong>2. Confirm terminal delivery.</strong> {fleet === null ? 'Device acknowledgement has not been verified.' : `${fleet.filter(device => device.menuStatus === 'current').length} of ${fleet.length} devices report the current menu.`} <button type="button" onClick={() => onNavigate('SYNC')} className="min-h-11 underline font-bold">Check device acknowledgements</button></li><li><strong>3. Open a guest menu.</strong> {tables.filter(row => row.isActive && row.qr?.status === 'ACTIVE' && row.qr.url).slice(0,3).map(row => {const raw=row.qr!.url!;let href:string|null=null;try{const url=new URL(raw,location.origin);if(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))href=url.href;}catch{}return href?<a key={row.tableId} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border px-3 ml-2 font-bold">Live menu · Table {row.displayNumber}</a>:null;})} {qrEnabled && !tables.some(row => row.qr?.status === 'ACTIVE' && row.qr.url) && <button type="button" onClick={() => onNavigate('QR_ORDERING')} className="min-h-11 underline font-bold">Set up a table QR</button>}</li><li><strong>4. Verify staff receive an order.</strong> Use a supervised test in your configured test environment. Confirm the correct counter and kitchen receive it. This checklist does not place or pay for an order.</li></ol>
      <button type="button" onClick={() => onNavigate('MENU')} className="min-h-11 px-4 rounded-xl bg-jaman-navy text-white font-bold text-sm">Open menu & publish</button>
      <p className="text-sm text-slate-600">Publication confirms the server menu. Check a guest QR page or kiosk and place a test order to verify delivery to staff.</p>
    </section>
    {qrEnabled && <div className="rounded-2xl border border-jaman-border bg-white p-5"><QrSetupHealth navigate={() => onNavigate('QR_ORDERING')}/></div>}
  </div>;
}
