// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Branch, RestaurantListItem } from '../../api/types';
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
  const [deviceType, setDeviceType] = useState<'ANY' | 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN'>('ANY');
  const [expiryDays, setExpiryDays] = useState('30');
  // BUG-048: the branch this terminal belongs to, and the name it will carry ("Counter 1").
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!fixedRestaurantId) {
      api.get<RestaurantListItem[]>('/api/v1/restaurants').then(setRestaurants).catch(() => setRestaurants([]));
    }
  }, [fixedRestaurantId]);

  useEffect(() => {
    setBranchId('');
    if (!restaurantId) {
      setBranches([]);
      return;
    }
    api.get<Branch[]>(`/api/v1/branches?restaurantId=${encodeURIComponent(restaurantId)}`).then(setBranches).catch(() => setBranches([]));
  }, [restaurantId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString();
      const key = await api.post<{ code: string }>('/api/v1/activation-keys', {
        restaurantId,
        allowedDeviceType: deviceType,
        expiresAt,
        branchId: branchId || undefined,
        label: label.trim() || undefined
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
                onClick={async () => {
                  if (!(await copyText(createdCode))) return;
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
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
                  <option value="ANY">Restaurant Admin Console (Any Terminal)</option>
                  <option value="POS_ADMIN">Restaurant Admin Console (POS_ADMIN)</option>
                  <option value="POS">Main Billing Counter POS</option>
                  <option value="CAPTAIN">Captain Waiter Tablet</option>
                  <option value="KDS">Kitchen Order Display (KDS)</option>
                  <option value="KIOSK">Self-Order Kiosk</option>
                  <option value="KIOSK_ADMIN">Kiosk Admin Console</option>
                </select>
              </div>
              <div className="field">
                <label>Expires in (days)</label>
                <input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} required />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="key-branch">Branch</label>
                <select id="key-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branches.length === 0}>
                  <option value="">No specific branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="key-label">Terminal name (optional)</label>
                <input id="key-label" type="text" maxLength={80} placeholder="e.g. Counter 1, Kitchen wall" value={label} onChange={(e) => setLabel(e.target.value)} />
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
