import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/ui';
type Bundle = { id: string; name: string; description: string; capabilities: Record<string, boolean> };
type Config = { revision: number; bundles: Bundle[] };
export function QrFeatureBundles({
  labels,
  value,
  disabled,
  branches = [],
  onChange
}: {
  labels: Record<string, string>;
  value: Record<string, boolean>;
  disabled: boolean;
  branches?:{id:string;name:string}[];
  onChange: (value: Record<string, boolean>) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null),
    [selected, setSelected] = useState(''),
    [name, setName] = useState(''),
    [replace, setReplace] = useState(false),
    [review, setReview] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const load = () => {
    setError('');
    api
      .get<Config>('/api/v1/qr-ordering/feature-bundles')
      .then(setConfig)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  const bundle = config?.bundles.find((b) => b.id === selected);
  const next = bundle
    ? {
        ...value,
        ...(replace ? Object.fromEntries(Object.keys(labels).map((k) => [k, false])) : {}),
        ...Object.fromEntries(Object.entries(bundle.capabilities).filter(([, enabled]) => replace || enabled))
      }
    : value;
  const changed = Object.keys(labels).filter((k) => !!value[k] !== !!next[k]);
  const save = async (remove = false) => {
    if (!config) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const id = 'custom-' + crypto.randomUUID();
      const bundles = remove
        ? config.bundles.filter((b) => b.id !== selected)
        : [
            ...config.bundles,
            {
              id,
              name: name.trim(),
              description: 'Saved from an optional capability selection.',
              capabilities: Object.fromEntries(Object.keys(labels).map((k) => [k, value[k] === true]))
            }
          ];
      const result = await api.patch<Config>('/api/v1/qr-ordering/feature-bundles', { revision: config.revision, bundles });
      setConfig(result);
      setSelected(remove ? '' : id);
      setName('');
      setReview(false);
      setMessage(remove ? 'Bundle removed. Restaurant access unchanged.' : 'Bundle saved. Restaurant access unchanged until reviewed and saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label="QR feature bundles" style={{ padding: 16, border: '1px solid var(--jv-border)', borderRadius: 12, display: 'grid', gap: 10 }}>
      <strong>Named QR feature bundles</strong>
      <p className="form-note">
        Choose a starting selection, review exactly what changes, then save the restaurant entitlement. Bundles change optional capabilities; ordering, payment
        switches and branch licenses remain separate.
      </p>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={load}>
            Reload bundles
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <label>
        Feature bundle
        <select
          aria-label="Feature bundle"
          value={selected}
          disabled={disabled || saving || !config}
          onChange={(e) => {
            setSelected(e.target.value);
            setReview(false);
            setMessage('');
          }}
          style={{ width: '100%', minHeight: 44 }}
        >
          <option value="">Select a bundle</option>
          {config?.bundles.map((b) => (
            <option value={b.id} key={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {bundle && (
        <>
          <p className="form-note">{bundle.description}</p>
          <label>
            <input
              type="checkbox"
              checked={replace}
              disabled={disabled || saving}
              onChange={(e) => {
                setReplace(e.target.checked);
                setReview(false);
              }}
            />{' '}
            Replace the current optional feature selection (may remove access)
          </label>
          <Button size="sm" disabled={disabled || saving} onClick={() => setReview(true)}>
            Review bundle changes
          </Button>
          {review && (
            <div style={{ padding: 12, background: 'var(--jv-bg-muted)', borderRadius: 10 }}>
              <strong>{changed.length} capability changes</strong>
              <ul>
                {changed.map((k) => (
                  <li key={k}>
                    {next[k] ? 'Include' : 'Remove'}: {labels[k]}
                  </li>
                ))}
              </ul>
              {!changed.length && <p>No change to this selection.</p>}
              <details><summary>Included optional features after applying</summary><ul>{Object.keys(labels).filter(k=>next[k]).map(k=><li key={k}>{labels[k]}</li>)}</ul></details>
              <p><strong>Affected restaurant branches</strong></p><ul>{branches.map(b=><li key={b.id}>{b.name}</li>)}</ul>
              {!branches.length&&<p className="form-note">Restaurant-wide QR grants. Check branch records before enabling service.</p>}
              <p className="form-note">
                Effective access still depends on the feature catalogue, rollout and branch licensing. This does not publish restaurant content.
              </p>
              <Button
                disabled={disabled || saving || !changed.length}
                onClick={() => {
                  onChange(next);
                  setReview(false);
                  setMessage('Bundle applied to the entitlement draft. Save entitlement changes to activate it.');
                }}
              >
                Apply reviewed bundle to draft
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" disabled={disabled || saving} onClick={() => void save(true)}>
            Remove saved bundle
          </Button>
        </>
      )}
      <details>
        <summary>Save this optional feature selection as a reusable bundle</summary>
        <label>
          New bundle name
          <input
            aria-label="New bundle name"
            value={name}
            maxLength={80}
            disabled={disabled || saving}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', minHeight: 44 }}
          />
        </label>
        <Button size="sm" disabled={disabled || saving || !name.trim() || !config || config.bundles.length >= 20} onClick={() => void save()}>
          Save reusable bundle
        </Button>
      </details>
    </section>
  );
}
