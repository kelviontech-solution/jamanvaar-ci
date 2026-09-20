import { useEffect, useState, type FormEvent } from 'react';
import { Receipt, Save } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Button, Card, Input } from '../../components/ui';
import '../../components/shared.css';

const FIELDS = [
  { key: 'tradeName', label: 'Trade name', hint: 'Shown as the seller on invoices' },
  { key: 'legalName', label: 'Legal name' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State', hint: 'Decides CGST + SGST (same state as the restaurant) or IGST' },
  { key: 'pincode', label: 'PIN code' },
  { key: 'gstin', label: 'GSTIN', hint: 'Its first two digits must match the state' },
  { key: 'sacCode', label: 'SAC code' },
  { key: 'bankName', label: 'Bank' },
  { key: 'bankAccountName', label: 'Account name' },
  { key: 'bankAccountNumber', label: 'Account number' },
  { key: 'bankIfsc', label: 'IFSC' },
  { key: 'upiId', label: 'UPI ID' },
  { key: 'billingEmail', label: 'Billing email', hint: 'Leave empty to use the support email above' }
] as const;

type Values = Record<(typeof FIELDS)[number]['key'], string>;

/** The company that issues invoices and receipts. Everything here is printed on them, and the state drives the GST split. */
export function InvoiceSellerCard({ value, onSaved }: { value: Record<string, string> | null; onSaved: (message: string) => void }) {
  const [form, setForm] = useState<Values | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!value) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, value[f.key] ?? ''])) as Values);
  }, [value]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaving(true);
    try {
      await api.patch('/api/v1/platform/settings/platform.billing', { value: form });
      onSaved('Invoice seller details updated. New invoices and receipts use them now.');
    } catch (err) {
      setError(err instanceof ApiError ? err.issues?.map((i) => i.message).join(' ') || err.message : 'Failed to save the seller details');
    } finally {
      setSaving(false);
    }
  }

  if (!form) return null;

  return (
    <Card className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-icon">
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <h3 className="settings-card-title">Invoice seller details</h3>
          <p className="settings-card-desc">Printed on every invoice and receipt. Check these are your real company and bank details before invoicing.</p>
        </div>
      </div>
      <form onSubmit={save} className="settings-form">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {FIELDS.map((f) => (
            <div className="form-field" key={f.key}>
              <label htmlFor={`seller-${f.key}`}>{f.label}</label>
              <Input id={`seller-${f.key}`} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              {'hint' in f && <div className="muted" style={{ fontSize: 11 }}>{f.hint}</div>}
            </div>
          ))}
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div style={{ marginTop: '0.5rem' }}>
          <Button type="submit" variant="accent" disabled={saving}>
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving…' : 'Save seller details'}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
