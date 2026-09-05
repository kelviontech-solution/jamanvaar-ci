import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS, type Entitlements, type Plan } from '../../api/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';

interface FormState {
  tier: 'CORE' | 'PRO' | 'ENTERPRISE';
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  maxBranches: string;
  maxDevices: string;
  maxUsers: string;
  entitlements: Entitlements;
}

const EMPTY_ENTITLEMENTS = Object.fromEntries(ENTITLEMENT_KEYS.map((k) => [k, false])) as Entitlements;

function toFormState(plan?: Plan): FormState {
  if (!plan) {
    return {
      tier: 'CORE',
      name: '',
      description: '',
      priceMonthly: '',
      priceYearly: '',
      maxBranches: '1',
      maxDevices: '5',
      maxUsers: '10',
      entitlements: { ...EMPTY_ENTITLEMENTS }
    };
  }
  return {
    tier: plan.tier,
    name: plan.name,
    description: plan.description ?? '',
    priceMonthly: String(plan.priceMonthly / 100),
    priceYearly: plan.priceYearly ? String(plan.priceYearly / 100) : '',
    maxBranches: String(plan.maxBranches),
    maxDevices: String(plan.maxDevices),
    maxUsers: String(plan.maxUsers),
    entitlements: { ...EMPTY_ENTITLEMENTS, ...plan.entitlements }
  };
}

export function PlanFormModal({
  plan,
  onClose,
  onSaved
}: {
  plan?: Plan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(plan));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleEntitlement(key: keyof Entitlements) {
    setForm((f) => ({ ...f, entitlements: { ...f.entitlements, [key]: !f.entitlements[key] } }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        tier: form.tier,
        name: form.name,
        description: form.description || undefined,
        priceMonthly: Math.round(Number(form.priceMonthly) * 100),
        priceYearly: form.priceYearly ? Math.round(Number(form.priceYearly) * 100) : undefined,
        maxBranches: Number(form.maxBranches),
        maxDevices: Number(form.maxDevices),
        maxUsers: Number(form.maxUsers),
        entitlements: form.entitlements
      };
      if (plan) {
        await api.patch(`/api/v1/plans/${plan.id}`, payload);
      } else {
        await api.post('/api/v1/plans', payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{plan ? `Edit ${plan.name}` : 'Create plan'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-section-label">Details</div>
          <div className="form-grid">
            <div className="field">
              <label>Tier</label>
              <select value={form.tier} onChange={(e) => update('tier', e.target.value as FormState['tier'])}>
                <option value="CORE">CORE</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>
            <div className="field">
              <label>Plan name</label>
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>

          <div className="form-section-label">Pricing (₹)</div>
          <div className="form-grid">
            <div className="field">
              <label>Monthly price</label>
              <input
                type="number"
                min={0}
                value={form.priceMonthly}
                onChange={(e) => update('priceMonthly', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Yearly price (optional)</label>
              <input type="number" min={0} value={form.priceYearly} onChange={(e) => update('priceYearly', e.target.value)} />
            </div>
          </div>

          <div className="form-section-label">Limits</div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="field">
              <label>Max branches</label>
              <input type="number" min={1} value={form.maxBranches} onChange={(e) => update('maxBranches', e.target.value)} required />
            </div>
            <div className="field">
              <label>Max devices</label>
              <input type="number" min={1} value={form.maxDevices} onChange={(e) => update('maxDevices', e.target.value)} required />
            </div>
            <div className="field">
              <label>Max users</label>
              <input type="number" min={1} value={form.maxUsers} onChange={(e) => update('maxUsers', e.target.value)} required />
            </div>
          </div>

          <div className="form-section-label">Feature entitlements</div>
          <div className="checkbox-grid">
            {ENTITLEMENT_KEYS.map((key) => (
              <label className="checkbox-row" key={key}>
                <input type="checkbox" checked={form.entitlements[key]} onChange={() => toggleEntitlement(key)} />
                {ENTITLEMENT_LABELS[key]}
              </label>
            ))}
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
