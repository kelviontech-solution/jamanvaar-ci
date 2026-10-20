import { useEffect, useState } from 'react';
import { qrApi } from '../../cloud/cloudClient';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import './qr-receipts.css';

export interface ReceiptDesign {
  heading: string;
  thankYou: string;
  footer: string;
  contact: string;
  accent: string;
  showTaxBreakup: boolean;
  showCustomer: boolean;
  showNotes: boolean;
}
interface ReceiptSettings {
  design: ReceiptDesign;
  version: number;
  scope: string;
}
const endpoint = '/api/v1/restaurant/qr/receipts';
export function QrReceiptSettings() {
  const [saved, setSaved] = useState<ReceiptSettings | null>(null),
    [draft, setDraft] = useState<ReceiptDesign | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const dirty = !!saved && JSON.stringify(saved.design) !== JSON.stringify(draft);
  useQrUnsavedChanges(dirty);
  function accept(result: ReceiptSettings) {
    setSaved(result);
    setDraft(result.design);
  }
  useEffect(() => {
    let active = true;
    qrApi<ReceiptSettings>(endpoint)
      .then((data) => {
        if (active) accept(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    if (!draft || !saved) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      accept(await qrApi<ReceiptSettings>(endpoint, { method: 'PUT', body: JSON.stringify({ design: draft, version: saved.version }) }));
      setMessage('Receipt design saved. New downloads use this design; order amounts stay unchanged.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the design.');
    } finally {
      setBusy(false);
    }
  }
  function field<K extends keyof ReceiptDesign>(key: K, value: ReceiptDesign[K]) {
    setDraft((old) => (old ? { ...old, [key]: value } : old));
    setMessage('');
  }
  if (!draft) return <div>{error ? <p role="alert">{error}</p> : <p>Loading receipt settings…</p>}</div>;
  return (
    <div className="qr-bill-editor">
      <section>
        <h2 className="sr-only">Bills & receipts</h2>
        <p>
          {saved?.scope === 'restaurant' ? 'Applies to branches using restaurant defaults.' : 'Applies to the selected branch.'} Guests can download their own
          bill; your team can download it from QR Orders → Details.
        </p>
        <label>
          Bill heading
          <input maxLength={60} value={draft.heading} onChange={(event) => field('heading', event.target.value)} />
        </label>
        <label>
          Contact details
          <input maxLength={120} placeholder="Phone or support email" value={draft.contact} onChange={(event) => field('contact', event.target.value)} />
        </label>
        <label>
          Thank-you message
          <input maxLength={200} value={draft.thankYou} onChange={(event) => field('thankYou', event.target.value)} />
        </label>
        <label>
          Footer message
          <textarea maxLength={300} rows={3} value={draft.footer} onChange={(event) => field('footer', event.target.value)} />
        </label>
        <label>
          Accent colour
          <input type="color" value={draft.accent} onChange={(event) => field('accent', event.target.value)} />
        </label>
        {(
          [
            ['showTaxBreakup', 'Show CGST and SGST separately'],
            ['showCustomer', 'Include details shared by the guest'],
            ['showNotes', 'Include kitchen and item notes']
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={draft[key]} onChange={(event) => field(key, event.target.checked)} />
            {label}
          </label>
        ))}
        <div className="qr-receipt-actions">
          <button className="primary" disabled={busy || !dirty || !draft.heading.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save receipt design'}
          </button>
          <button
            disabled={busy || !dirty}
            onClick={() => {
              if (saved) setDraft(saved.design);
              setError('');
            }}
          >
            Discard changes
          </button>
        </div>
        {error && (
          <p role="alert">{error} Your edits are kept. Reopen this page after saving a copy of your text if another administrator changed the design.</p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <aside className="qr-bill-preview" aria-label="Live receipt preview" style={{ borderTopColor: draft.accent }}>
        <span data-sample>Sample preview · not a real bill</span>
        <h2>Your restaurant</h2>
        <p>Selected branch · address from your business profile</p>
        {draft.contact && <p>{draft.contact}</p>}
        <h3>{draft.heading}</h3>
        <small>Order QR-24 · Table 1</small>
        {draft.showCustomer && <p>Guest name · Mobile number</p>}
        <dl>
          <div>
            <dt>2 × Signature dish</dt>
            <dd>₹400.00</dd>
          </div>
          {draft.showNotes && (
            <div>
              <dt>Guest note</dt>
              <dd>Less spicy</dd>
            </div>
          )}
          <div>
            <dt>Subtotal</dt>
            <dd>₹400.00</dd>
          </div>
          {draft.showTaxBreakup ? (
            <>
              <div>
                <dt>CGST</dt>
                <dd>₹10.00</dd>
              </div>
              <div>
                <dt>SGST</dt>
                <dd>₹10.00</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Tax</dt>
              <dd>₹20.00</dd>
            </div>
          )}
          <div>
            <dt>
              <strong>Total</strong>
            </dt>
            <dd>
              <strong>₹420.00</strong>
            </dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>₹420.00</dd>
          </div>
          <div>
            <dt>Balance due</dt>
            <dd>₹0.00</dd>
          </div>
        </dl>
        <p>{draft.thankYou}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{draft.footer}</p>
        <small>Actual bills use saved order items, taxes and confirmed payments.</small>
      </aside>
    </div>
  );
}
