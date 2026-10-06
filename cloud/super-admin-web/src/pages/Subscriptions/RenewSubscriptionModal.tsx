import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { SubscriptionListItem } from '../../api/types';
import { Button, Modal } from '../../components/ui';
import { Calendar, Clock, RefreshCw } from 'lucide-react';
import '../../components/shared.css';

export function RenewSubscriptionModal({
  subscription,
  onClose,
  onSaved
}: {
  subscription: SubscriptionListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [extendDays, setExtendDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentExpiry = new Date(subscription.expiresAt);
  // Calculate base date: if already expired, extend from now; else extend from currentExpiry
  const baseTimestamp = Math.max(Date.now(), currentExpiry.getTime());
  const newExpiryDate = new Date(baseTimestamp + extendDays * 24 * 60 * 60 * 1000);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/api/v1/subscriptions/${subscription.id}/renew`, {
        expiresAt: newExpiryDate.toISOString()
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to renew subscription');
    } finally {
      setSubmitting(false);
    }
  }

  const presets = [
    { label: '+30 Days (1 Month)', days: 30 },
    { label: '+90 Days (Quarterly)', days: 90 },
    { label: '+180 Days (Half-Yearly)', days: 180 },
    { label: '+365 Days (1 Year)', days: 365 }
  ];

  return (
    <Modal
      title={`Renew Subscription — ${subscription.restaurant.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Renewing…' : `Confirm Renewal (+${extendDays} Days)`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="page-error">{error}</div>}

        <div style={{ background: 'var(--jv-surface-subtle)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--jv-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Restaurant Tenant</span>
            <strong style={{ fontSize: 13, color: 'var(--jv-text)' }}>{subscription.restaurant.name}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Current SaaS Plan</span>
            <strong style={{ fontSize: 13, color: 'var(--jv-accent-text)' }}>{subscription.plan.name} ({subscription.plan.tier})</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>Current Expiration Date</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{currentExpiry.toLocaleDateString('en-IN')}</span>
          </div>
        </div>

        <div className="field">
          <label>Select Extension Period Preset</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            {presets.map((p) => (
              <button
                key={p.days}
                type="button"
                className={`btn btn-sm ${extendDays === p.days ? 'btn-accent' : 'btn-ghost'}`}
                onClick={() => setExtendDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Or Enter Custom Days</label>
          <input
            type="number"
            min={1}
            value={extendDays}
            onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value)))}
            required
          />
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
            New Expiry Date After Extension
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d', marginTop: 2 }}>
            {newExpiryDate.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
