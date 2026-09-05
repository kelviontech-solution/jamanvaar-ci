import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Plan, RestaurantListItem } from '../../api/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';

export function AssignSubscriptionModal({
  restaurantId: fixedRestaurantId,
  onClose,
  onSaved
}: {
  restaurantId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [restaurantId, setRestaurantId] = useState(fixedRestaurantId ?? '');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<'TRIAL' | 'ACTIVE'>('ACTIVE');
  const [durationDays, setDurationDays] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!fixedRestaurantId) {
      api.get<RestaurantListItem[]>('/api/v1/restaurants').then(setRestaurants).catch(() => setRestaurants([]));
    }
    api
      .get<Plan[]>('/api/v1/plans')
      .then((all) => setPlans(all.filter((p) => p.status === 'ACTIVE')))
      .catch(() => setPlans([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000).toISOString();
      await api.post('/api/v1/subscriptions', { restaurantId, planId, status, expiresAt });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign subscription');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign subscription</h2>
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
                {restaurants
                  .filter((r) => r.subscriptions.length === 0)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} required>
              <option value="" disabled>
                Select a plan…
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{(p.priceMonthly / 100).toLocaleString('en-IN')}/mo
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Initial status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'TRIAL' | 'ACTIVE')}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIAL">TRIAL</option>
              </select>
            </div>
            <div className="field">
              <label>Duration (days)</label>
              <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} required />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !restaurantId || !planId}>
              {submitting ? 'Assigning…' : 'Assign subscription'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
