import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { RestaurantListItem } from '../../api/types';
import { Button } from '../../components/ui';
import '../../components/shared.css';

export function GenerateActivationKeyModal({
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
  const [deviceType, setDeviceType] = useState<'ANY' | 'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK'>('ANY');
  const [expiryDays, setExpiryDays] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      const expiresAt = new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString();
      const key = await api.post<{ code: string }>('/api/v1/activation-keys', {
        restaurantId,
        allowedDeviceType: deviceType,
        expiresAt
      });
      setCreatedCode(key.code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate activation key');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generate activation key</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {createdCode ? (
          <div className="modal-form">
            <p className="muted">
              Relay this code to the restaurant owner — it can only be redeemed once, and isn't shown again.
            </p>
            <div className="activation-code-display">{createdCode}</div>
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(createdCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? 'Copied ✓' : 'Copy Code'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onSaved();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
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
                <label>Allowed device type</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value as typeof deviceType)}>
                  <option value="ANY">Restaurant Admin Console (POS_ADMIN / Any Terminal)</option>
                  <option value="POS">Main Billing Counter POS</option>
                  <option value="CAPTAIN">Captain Waiter Tablet</option>
                  <option value="KDS">Kitchen Order Display (KDS)</option>
                  <option value="KIOSK">Self-Order Kiosk</option>
                </select>
              </div>
              <div className="field">
                <label>Expires in (days)</label>
                <input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} required />
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || !restaurantId}>
                {submitting ? 'Generating…' : 'Generate key'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
