import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { CreateRestaurantInput, RestaurantDetail } from '../../api/types';
import { Button } from '../../components/ui';
import './restaurants.css';

const EMPTY: CreateRestaurantInput = {
  name: '',
  city: '',
  state: '',
  ownerName: '',
  ownerEmail: '',
  ownerPhone: ''
};

export function CreateRestaurantModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateRestaurantInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof CreateRestaurantInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await api.post<{ restaurant: RestaurantDetail }>('/api/v1/restaurants', form);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.issues) {
        setFieldErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      } else {
        setSubmitError(err instanceof ApiError ? err.message : 'Failed to create restaurant');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create restaurant</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-section-label">Restaurant</div>
          <div className="form-grid">
            <div className="field">
              <label>Restaurant name</label>
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
              {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
            </div>
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="field">
              <label>State</label>
              <input value={form.state} onChange={(e) => update('state', e.target.value)} />
            </div>
          </div>

          <div className="form-section-label">Owner</div>
          <div className="form-grid">
            <div className="field">
              <label>Owner name</label>
              <input value={form.ownerName} onChange={(e) => update('ownerName', e.target.value)} required />
              {fieldErrors.ownerName && <div className="error">{fieldErrors.ownerName}</div>}
            </div>
            <div className="field">
              <label>Owner email</label>
              <input
                type="email"
                value={form.ownerEmail}
                onChange={(e) => update('ownerEmail', e.target.value)}
                required
              />
              {fieldErrors.ownerEmail && <div className="error">{fieldErrors.ownerEmail}</div>}
            </div>
            <div className="field">
              <label>Owner phone</label>
              <input value={form.ownerPhone} onChange={(e) => update('ownerPhone', e.target.value)} />
            </div>
          </div>

          <p className="form-note">
            A pending owner account is created for this email. Invitation delivery (email/link) isn't wired up
            yet — for now, relay the account manually.
          </p>

          {submitError && <div className="form-error">{submitError}</div>}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create restaurant'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
