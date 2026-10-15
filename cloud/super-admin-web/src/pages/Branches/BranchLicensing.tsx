import { useEffect, useState } from 'react';
import { api } from '../../api/client';

type Allocation = {
  id: string;
  appCode: string;
  revision: number;
  enabled: boolean;
  deviceQuota: number | null;
  effectiveAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
};
type View = {
  apps: { appCode: string; enabled: boolean; reason: string; revision: number }[];
  features: { name: string; appCode: string; legacyEntitlementKey: string }[];
  history: Allocation[];
};
type Input = {
  appCode: string;
  enabled: boolean;
  deviceQuota: number | null;
  disabledFeatures: string[];
  effectiveAt: string;
  expiresAt: string | null;
  expectedRevision: number;
};
type Preview = {
  previewHash: string;
  impact: { activeDevices: number; pendingOrders: number; quotaWarning: string | null; affectedDevices: { id: string; name: string | null; type: string }[] };
};
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function BranchLicensing({ branchId }: { branchId: string }) {
  const [data, setData] = useState<View>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [app, setApp] = useState('POS'),
    [preview, setPreview] = useState<Preview>(),
    [input, setInput] = useState<Input>(),
    [ack, setAck] = useState(false);
  const load = () =>
    api
      .get<View>(`/api/v1/branches/${branchId}/licenses`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [branchId]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save allocation');
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Loading branch products…'}</p>;
  return (
    <section className="detail-card" style={{ padding: 24 }}>
      <h2>Branch products & device limits</h2>
      <p>
        Branch allocations restrict the restaurant’s purchased products. They cannot add an unpurchased product or feature. Without an allocation, a branch
        inherits its restaurant’s license.
      </p>
      <div className="card-grid">
        {data.apps.map((a) => (
          <article key={a.appCode} className="detail-card" style={{ padding: 12 }}>
            <strong>{a.appCode}</strong>
            <p>
              {a.enabled ? 'Active' : a.reason.replaceAll('_', ' ').toLowerCase()} · Revision {a.revision}
            </p>
          </article>
        ))}
      </div>
      <form
        onChange={() => {
          setPreview(undefined);
          setAck(false);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const proposed: Input = {
            appCode: app,
            enabled: f.get('enabled') === 'on',
            deviceQuota: String(f.get('quota')).trim() === '' ? null : Number(f.get('quota')),
            disabledFeatures: f.getAll('feature').map(String),
            effectiveAt: new Date(String(f.get('effective'))).toISOString(),
            expiresAt: f.get('expires') ? new Date(String(f.get('expires'))).toISOString() : null,
            expectedRevision: data.apps.find((a) => a.appCode === app)?.revision ?? 0
          };
          setInput(proposed);
          void run(async () => {
            setPreview(await api.post<Preview>(`/api/v1/branches/${branchId}/licenses/preview`, proposed));
          });
        }}
      >
        <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 16, marginTop: 20 }}>
          <label>
            Product{' '}
            <select aria-label="Product" value={app} onChange={(e) => setApp(e.target.value)}>
              {data.apps.map((a) => (
                <option key={a.appCode}>{a.appCode}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" name="enabled" defaultChecked /> Enable product in this branch
          </label>
          <label>
            Device limit (blank inherits restaurant limit) <input name="quota" type="number" min="0" max="10000" />
          </label>
          <label>
            Effective time <input name="effective" type="datetime-local" required defaultValue={localNow()} />
          </label>
          <label>
            Optional expiry <input name="expires" type="datetime-local" />
          </label>
          <details>
            <summary>Disable optional features in this branch</summary>
            {data.features
              .filter((f) => f.appCode === app)
              .map((f) => (
                <label key={f.legacyEntitlementKey} style={{ display: 'block', padding: 6 }}>
                  <input type="checkbox" name="feature" value={f.legacyEntitlementKey} /> {f.name}
                </label>
              ))}
          </details>
          <button type="submit" className="btn btn-primary">
            Review allocation
          </button>
        </fieldset>
      </form>
      {preview && input && (
        <section style={{ padding: 20, marginTop: 20, border: '1px solid var(--jv-border)', borderRadius: 12 }}>
          <h3>Review before applying</h3>
          <p>
            {preview.impact.activeDevices} active devices · {preview.impact.pendingOrders} open orders
          </p>
          <p>{preview.impact.quotaWarning}</p>
          {preview.impact.affectedDevices.map((d) => (
            <p key={d.id}>
              {d.name || d.type} · {d.type}
            </p>
          ))}
          <p>Disabling a product stops its online requests at the effective time. Complete service and synchronize devices before a downgrade.</p>
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed the affected devices and pending work.
          </label>
          <p>
            <button
              disabled={!ack || busy}
              className="btn btn-primary"
              onClick={() =>
                void run(async () => {
                  await api.post(`/api/v1/branches/${branchId}/licenses`, { ...input, acknowledgeImpact: true, previewHash: preview.previewHash });
                  setPreview(undefined);
                  setMessage('Branch allocation saved.');
                  await load();
                })
              }
            >
              Apply reviewed allocation
            </button>
          </p>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h3>Allocation history</h3>
      {data.history.length === 0 ? (
        <p>No branch overrides. Restaurant rights are inherited.</p>
      ) : (
        data.history.map((row) => (
          <article key={row.id} style={{ padding: 12, borderBottom: '1px solid var(--jv-border)' }}>
            <strong>
              {row.appCode} · Revision {row.revision}
            </strong>
            <p>
              {row.enabled ? 'Enabled' : 'Disabled'} · {new Date(row.effectiveAt).toLocaleString()} · Device limit: {row.deviceQuota ?? 'Inherited'}
              {row.expiresAt ? ` · Expires ${new Date(row.expiresAt).toLocaleString()}` : ''}
            </p>
            {row.cancelledAt ? (
              <span>Cancelled</span>
            ) : (
              new Date(row.effectiveAt) > new Date() && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.post(`/api/v1/branches/${branchId}/licenses/${row.id}/cancel`, {});
                      await load();
                    })
                  }
                >
                  Cancel scheduled allocation
                </button>
              )
            )}
          </article>
        ))
      )}
    </section>
  );
}
