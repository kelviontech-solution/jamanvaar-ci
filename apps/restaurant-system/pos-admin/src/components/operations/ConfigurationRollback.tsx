import { useEffect, useState } from 'react';
import { ops } from './operationsClient';
type Input = { kind: 'MENU' | 'APPEARANCE'; version: string; fields: string[] };
type Versions = {
  menus: { version: number; createdAt: string }[];
  appearances: { id: string; target: string; branchId: string; at: string; presentation: unknown }[];
};
type Preview = {
  previewHash: string;
  scope: string;
  branches: { id: string; name: string }[];
  changes: { id: string; name: string; fields: { field: string; from: unknown; to: unknown }[] }[];
};
export function ConfigurationRollback({ branch }: { branch: string }) {
  const [versions, setVersions] = useState<Versions>(),
    [kind, setKind] = useState<Input['kind']>('MENU'),
    [preview, setPreview] = useState<Preview>(),
    [input, setInput] = useState<Input>(),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const load = () =>
    ops<Versions>(branch, 'rollback/versions')
      .then(setVersions)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, [branch]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not restore configuration');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>Review & restore configuration</h3>
      <p>Restore selected prices, availability, photos or appearance fields from a saved version. Past orders and payments keep their original records.</p>
      {message && <p role="status">{message}</p>}
      {versions && (
        <form
          key={kind}
          onChange={() => {
            setPreview(undefined);
            setAck(false);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              value: Input = { kind, version: String(f.get('version')), fields: f.getAll('field').map(String) };
            setInput(value);
            void run(async () => setPreview(await ops<Preview>(branch, 'rollback/preview', value)));
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Configuration
              <select aria-label="Configuration" value={kind} onChange={(e) => setKind(e.target.value as Input['kind'])}>
                <option value="MENU">Published menu</option>
                <option value="APPEARANCE">Saved appearance</option>
              </select>
            </label>
            <label>
              Previous version
              <select aria-label="Previous version" name="version" required>
                <option value="">Choose version</option>
                {kind === 'MENU'
                  ? versions.menus.map((v) => (
                      <option key={v.version} value={v.version}>
                        Version {v.version} · {new Date(v.createdAt).toLocaleString()}
                      </option>
                    ))
                  : versions.appearances.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.target} · {v.branchId === 'restaurant' ? 'Whole restaurant' : 'Branch'} · {new Date(v.at).toLocaleString()}
                      </option>
                    ))}
              </select>
            </label>
            <p>Fields to restore</p>
            {(kind === 'MENU'
              ? [
                  ['price', 'Prices'],
                  ['isAvailable', 'Availability'],
                  ['imageUrl', 'Dish photos']
                ]
              : [
                  ['text', 'Welcome text'],
                  ['background', 'Background, layout & logo']
                ]
            ).map(([value, label]) => (
              <label key={value}>
                <input name="field" value={value} type="checkbox" defaultChecked />
                {label}
              </label>
            ))}
            {kind === 'APPEARANCE' && !versions.appearances.length && (
              <p>Appearance history starts with the next saved change. Earlier versions cannot be reconstructed.</p>
            )}
            <button type="submit">Preview selected restoration</button>
          </fieldset>
        </form>
      )}
      {preview && input && (
        <article className="ops-card">
          <h4>{preview.scope}</h4>
          <p>Affected branches: {preview.branches.map((b) => b.name).join(', ')}</p>
          {preview.changes.length === 0 ? (
            <p>No differences for the selected fields.</p>
          ) : (
            preview.changes.map((c) => (
              <details key={c.id}>
                <summary>
                  {c.name} · {c.fields.length} changed fields
                </summary>
                {c.fields.map((f) => (
                  <div key={f.field}>
                    <strong>{f.field}</strong>
                    <div className="ops-grid">
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 250, overflow: 'auto' }}>
                        {JSON.stringify(f.from, null, 2)}
                      </pre>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 250, overflow: 'auto' }}>{JSON.stringify(f.to, null, 2)}</pre>
                    </div>
                  </div>
                ))}
              </details>
            ))
          )}
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed these changes and affected branches.
          </label>
          <button
            disabled={!ack || busy || !preview.changes.length}
            onClick={() =>
              void run(async () => {
                await ops(branch, 'rollback/apply', { ...input, previewHash: preview.previewHash, acknowledge: true });
                setPreview(undefined);
                setMessage('Reviewed configuration restored.');
                await load();
              })
            }
          >
            Restore reviewed settings
          </button>
        </article>
      )}
    </section>
  );
}
