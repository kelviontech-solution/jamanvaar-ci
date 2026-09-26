import React, { useEffect, useState } from 'react';
import { collectDiagnostics, connectionStatus, saveCoreUrl, syncNow, EndpointResolver, type StatusTone } from '@jamanvaar/sync';
import { db } from '@jamanvaar/database';

const TONE: Record<StatusTone, string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  local: 'bg-amber-50 text-amber-900 border-amber-200',
  busy: 'bg-sky-50 text-sky-800 border-sky-200',
  error: 'bg-rose-50 text-rose-800 border-rose-200'
};

/** Re-renders whenever connectivity or local data changes, and every few seconds as a safety net. */
function useLive<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    const offResolver = EndpointResolver.subscribe(update);
    const offDb = db.subscribe(update);
    const t = setInterval(update, 5000);
    return () => { offResolver(); offDb(); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** Small status pill with a "Sync now" button, for headers. */
export const ConnectionBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const status = useLive(connectionStatus);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span title={status.detail} className={`px-3 py-1 rounded-full border text-xs font-bold ${TONE[status.tone]}`}>{status.label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); await syncNow(); setBusy(false); }}
        className="px-3 py-1 rounded-full border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
  );
};

/** Full connectivity and diagnostics screen: status, Branch Core address, sync backlog, storage health, versions. */
export const ConnectionPanel: React.FC<{ appVersion: string; showToast?: (msg: string) => void }> = ({ appVersion, showToast }) => {
  const d = useLive(() => collectDiagnostics(appVersion));
  const [address, setAddress] = useState(d.coreUrl ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (m: string) => { setMessage(m); showToast?.(m); };

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 text-right">{v}</span></div>
  );

  return (
    <div className="space-y-5" data-testid="connection-panel">
      <div className={`rounded-2xl border p-4 ${TONE[d.status.tone]}`}>
        <div className="text-lg font-extrabold">{d.status.label}</div>
        <div className="text-sm mt-1">{d.status.detail}</div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); say((await syncNow()).message); setBusy(false); }}
          className="mt-3 px-4 py-2 rounded-xl bg-white/80 border border-current text-sm font-bold disabled:opacity-50"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="font-bold text-slate-800">Branch Core (restaurant server)</div>
        <p className="text-xs text-slate-500 mt-1">The always-on machine that lets every device work together without internet. Enter its address, e.g. 192.168.1.10. Leave empty to use the cloud only.</p>
        <div className="flex gap-2 mt-3">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.10:5178" className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); say((await saveCoreUrl(address)).message); setBusy(false); }}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50"
          >
            Connect
          </button>
        </div>
        {message && <div className="text-xs mt-2 text-slate-600">{message}</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <Row k="Connection" v={d.mode === 'ONLINE' ? 'Cloud' : d.mode === 'LOCAL' ? 'Branch Core (no internet)' : 'None (working on this device)'} />
        <Row k="Internet verified" v={d.internetVerified ? 'Yes' : 'No: UPI is unavailable'} />
        <Row k="Waiting to send" v={d.pending} />
        <Row k="Could not send" v={d.failed + d.deadLetter} />
        <Row k="Orders on this device" v={d.orders} />
        <Row k="Local storage" v={d.storage.ok ? 'Healthy' : `Problem: ${d.storage.error}`} />
        <Row k="App version" v={d.appVersion} />
      </div>
    </div>
  );
};
