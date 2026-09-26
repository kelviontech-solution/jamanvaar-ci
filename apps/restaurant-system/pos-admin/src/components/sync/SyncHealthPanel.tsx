import { useCallback, useEffect, useState } from 'react';
import { fetchSyncIssues, fetchDeviceFleet, fetchMenuVersion, publishMenu } from '../../cloud/cloudClient';
import type { SyncIssue, FleetDevice } from '../../cloud/cloudClient';
import { ConnectionPanel } from '@jamanvaar/ui';

const SEVERITY_STYLE: Record<SyncIssue['severity'], string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200'
};

const HEALTH_STYLE: Record<string, string> = {
  online: 'text-emerald-700',
  degraded: 'text-amber-700',
  offline: 'text-rose-700',
  never_seen: 'text-slate-500',
  pending: 'text-slate-500'
};

/**
 * One place for the restaurant owner to see whether every device is in step: the devices and their sync
 * backlog, the menu version each one has applied, and anything the server's reconciliation flagged for review.
 * Reconciliation only reports; nothing here changes money or stock.
 */
export function SyncHealthPanel({ showToast }: { showToast: (msg: string) => void }) {
  const [devices, setDevices] = useState<FleetDevice[]>([]);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [menuVersion, setMenuVersion] = useState<number>(0);
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fleet, found, menu] = await Promise.all([fetchDeviceFleet(), fetchSyncIssues(), fetchMenuVersion()]);
      setDevices(fleet);
      setIssues(found);
      setMenuVersion(menu.version);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load sync status');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const behind = devices.filter((d) => d.menuStatus === 'behind').length;

  async function publish() {
    setPublishing(true);
    try {
      const res = await publishMenu(note.trim() || undefined);
      setNote('');
      showToast(`Menu version ${res.version} published. Devices update within moments.`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not publish the menu');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Sync &amp; Devices</h1>
        <p className="text-sm text-[#4A5568] mt-1">Whether every terminal is in step with the cloud, and what needs your review.</p>
      </div>

      <div className="bg-white border border-jaman-border rounded-3xl p-5">
        <h2 className="text-base font-extrabold text-jaman-navy mb-3">This device: connection &amp; diagnostics</h2>
        <ConnectionPanel appVersion={typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'} showToast={showToast} />
      </div>

      {loadError && <div role="alert" className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{loadError}</div>}

      <section className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-jaman-navy">Menu publishing</h2>
            <p className="text-xs text-[#4A5568]">
              Current version: <span className="font-mono font-bold">{menuVersion || 'none yet'}</span>
              {behind > 0 && <span className="ml-2 text-amber-700 font-semibold">{behind} device{behind === 1 ? '' : 's'} not on the latest menu</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Note (optional)"
              className="border border-jaman-border rounded-lg px-3 py-2 text-sm"
              aria-label="Publish note"
            />
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publish()}
              className="bg-jaman-saffron text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {publishing ? 'Publishing…' : 'Publish menu'}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <h2 className="text-lg font-bold text-jaman-navy mb-3">Devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-[#4A5568]">No devices have connected yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#8C9BAE]">
                  <th className="py-2 pr-4">Device</th><th className="pr-4">Status</th><th className="pr-4">Pending</th><th className="pr-4">Menu</th><th className="pr-4">Version</th><th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-t border-jaman-border">
                    <td className="py-2 pr-4 font-semibold text-jaman-navy">{d.name ?? d.type}<span className="ml-2 text-xs text-[#8C9BAE]">{d.type}</span></td>
                    <td className={`pr-4 font-semibold ${HEALTH_STYLE[d.health] ?? ''}`}>{d.health.replace('_', ' ')}</td>
                    <td className="pr-4 font-mono">{d.pendingSyncCount ?? 0}</td>
                    <td className="pr-4">{d.menuStatus === 'behind' ? <span className="text-amber-700 font-semibold">behind (v{d.menuVersion ?? 0})</span> : d.menuStatus === 'current' ? 'up to date' : '—'}</td>
                    <td className="pr-4 font-mono">{d.appVersion ?? '—'}</td>
                    <td className="text-rose-700 text-xs">{d.syncError ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-jaman-navy">Needs review ({issues.length})</h2>
          <button type="button" onClick={() => void load()} className="text-xs font-semibold text-jaman-saffron">Refresh</button>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-emerald-700 font-semibold">Nothing to review. All synced data is consistent.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((i, idx) => (
              <li key={`${i.code}-${i.entityId ?? idx}`} className={`text-sm border rounded-xl p-3 ${SEVERITY_STYLE[i.severity]}`}>
                <div className="font-bold">{i.code.replace(/_/g, ' ').toLowerCase()}</div>
                <div>{i.message}{i.detail ? ` (${i.detail})` : ''}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[#8C9BAE] mt-3">These are reported, never repaired automatically: payments and stock are reviewed by a person.</p>
      </section>
    </div>
  );
}
