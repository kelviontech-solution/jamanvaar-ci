import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantDetail } from '../../api/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';

export function EditRestaurantModal({
  restaurant,
  onClose,
  onSaved
}: {
  restaurant: RestaurantDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: restaurant.name,
    legalName: restaurant.legalName ?? '',
    gstin: restaurant.gstin ?? '',
    address: restaurant.address ?? '',
    city: restaurant.city ?? '',
    state: restaurant.state ?? ''
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/api/v1/restaurants/${restaurant.id}`, form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save restaurant');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit restaurant</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="field">
            <label>Restaurant name</label>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Legal name</label>
              <input value={form.legalName} onChange={(e) => update('legalName', e.target.value)} />
            </div>
            <div className="field">
              <label>GSTIN</label>
              <input value={form.gstin} onChange={(e) => update('gstin', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Address</label>
            <input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="field">
              <label>State</label>
              <input value={form.state} onChange={(e) => update('state', e.target.value)} />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
