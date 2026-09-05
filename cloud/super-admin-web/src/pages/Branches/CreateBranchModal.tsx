import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';

export function CreateBranchModal({
  restaurantId: fixedRestaurantId,
  onClose,
  onSaved
}: {
  restaurantId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [restaurantId, setRestaurantId] = useState(fixedRestaurantId ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!fixedRestaurantId) {
      api.get<RestaurantListItem[]>('/api/v1/restaurants').then(setRestaurants).catch(() => setRestaurants([]));
    }
  }, [fixedRestaurantId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/v1/branches', { restaurantId, name, code, address: address || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create branch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add branch</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {!fixedRestaurantId && (
            <div className="field">
              <label>Restaurant</label>
              <select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} required>
                <option value="" disabled>
                  Select a restaurant…
                </option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label>Branch name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Branch code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. NORTH" required />
            </div>
          </div>
          <div className="field">
            <label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !restaurantId}>
              {submitting ? 'Creating…' : 'Add branch'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
