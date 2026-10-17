// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { APP_CODE_LABELS, type AppCode, type Branch, type RestaurantListItem } from '../../api/types';
import { Link } from 'react-router-dom';
import { RESTAURANT_ADMIN_URL } from '../../lib/appUrls';
import { Button, ModalShell } from '../../components/ui';
import '../../components/shared.css';

export function GenerateActivationKeyModal({
  restaurantId: fixedRestaurantId,
  initialBranchId,
  onClose,
  onSaved
}: {
  restaurantId?: string;
  initialBranchId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [restaurantId, setRestaurantId] = useState(fixedRestaurantId ?? '');
  // 'QR_ORDERING' is a frontend-only sentinel: the Device model has no QR-specific type (a QR
  // console is a POS_ADMIN-typed device, per the deployment doc), but picking it here still needs
  // to (a) show up as its own clearly-labeled choice instead of being invisible inside "POS_ADMIN",
  // and (b) preview quota against the restaurant's actual QR_ORDERING entitlement, not POS_ADMIN's
  // (a solo-QR restaurant has no POS_ADMIN entitlement row at all). Translated to 'POS_ADMIN' only
  // at the moment of submission, below.
  const [deviceType, setDeviceType] = useState<'ANY' | 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN' | 'QR_ORDERING'>('POS_ADMIN');
  const [expiryDays, setExpiryDays] = useState('30');
  // BUG-048: the branch this terminal belongs to, and the name it will carry ("Counter 1").
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [quotaPreview, setQuotaPreview] = useState<{ current: number; quota: number | null; branchCurrent:number; branchQuota:number|null; available:boolean; enabled:boolean; reason:string } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  // Reported live: a key generated for an app this restaurant's plan never had enabled was
  // handed to the owner, who redeemed it and hit a dead end at login ("No admin application is
  // enabled") with no way to connect that back to anything fixable -- the one person who could
  // fix it (the Super Admin) had already moved on believing the key worked. null = not checked
  // yet / not applicable (e.g. deviceType 'ANY' has no single app to check).
  const [appEnabled, setAppEnabled] = useState<boolean | null>(null);

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
    let active=true;
    api.get<Branch[]>(`/api/v1/branches?restaurantId=${encodeURIComponent(restaurantId)}`).then(rows=>{if(active){const available=rows.filter(b=>b.status==='ACTIVE');setBranches(available);if(available.some(b=>b.id===initialBranchId))setBranchId(initialBranchId!);else if(available.length===1)setBranchId(available[0].id);}}).catch(() => {if(active)setBranches([]);});
    return()=>{active=false;};
  }, [restaurantId,initialBranchId]);

  useEffect(() => {
    setQuotaPreview(null);
    setAppEnabled(null);
    // 'ANY' isn't a single AppCode — no per-app quota or entitlement check applies to it.
    if (!restaurantId || deviceType === 'ANY') return;
    setQuotaLoading(true);
    let active = true;
    const query = new URLSearchParams({restaurantId, appCode:deviceType, ...(branchId ? {branchId} : {})});
    api.get<NonNullable<typeof quotaPreview>>('/api/v1/activation-keys/quota-preview?'+query)
      .then(value=>{if(active){setQuotaPreview(value);setAppEnabled(value.enabled);setError(null);}})
      .catch(e=>{if(active){setQuotaPreview(null);setAppEnabled(null);setError(e.message || 'Cannot verify capacity. Retry before issuing a key.');}})
      .finally(()=>{if(active)setQuotaLoading(false);});
    return ()=>{active=false;};
  }, [restaurantId, deviceType, branchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString();
      const key = await api.post<{ code: string }>('/api/v1/activation-keys', {
        restaurantId,
        allowedDeviceType: deviceType === 'QR_ORDERING' ? 'POS_ADMIN' : deviceType,
        expiresAt,
        branchId: branchId || undefined,
        // Without this, a QR console key is submitted as a plain POS_ADMIN key with no label and
        // renders in the activation keys list as "RESTAURANT ADMIN CONSOLE" -- identical to, and
        // so indistinguishable from, a real Restaurant Admin key. It isn't missing, just unlabeled.
        label: label.trim() || (deviceType === 'QR_ORDERING' ? 'QR Ordering Console' : undefined)
      });
      setCreatedCode(key.code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate activation key');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} label="Connect a device">
        <div className="modal-header">
          <h2>Connect a device</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {createdCode ? (
          <div className="modal-form">
            <p className="muted">
              Enter this pairing code on the selected device — it can only be redeemed once, and isn't shown again.
            </p>
            <div className="activation-code-display">{createdCode}</div>
            <h3>Next: connect and verify</h3><p>Restaurant: {restaurants.find(r=>r.id===restaurantId)?.name || 'Selected restaurant'} | Branch: {branches.find(b=>b.id===branchId)?.name || 'Unassigned'} | Product: {deviceType==='ANY'?'Any licensed terminal':APP_CODE_LABELS[deviceType as AppCode]}</p>
            <ol><li>Open the product on the device being connected.</li><li>Enter the restaurant ID and this pairing code on its activation screen.</li><li>Return to branch devices and refresh. A code being created is not proof that the device is connected.</li></ol>
            {['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'].includes(deviceType)&&<a className="btn btn-ghost" href={RESTAURANT_ADMIN_URL} target="_blank" rel="noopener noreferrer">Open admin sign-in</a>}
            <Link className="btn btn-ghost" to={`/restaurants/${restaurantId}?tab=devices${branchId?'&branchId='+encodeURIComponent(branchId):''}`} onClick={onClose}>Check branch connection status</Link>
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
                      {/* B2-049/B2-050: two restaurants can share a name (there's no uniqueness
                          check, and franchise locations legitimately do) — the owner's email and
                          a short id fragment let an operator tell them apart instead of guessing. */}
                      {r.name}
                      {r.city ? ` — ${r.city}` : ''} ({r.users?.[0]?.email ?? `id: ${r.id.slice(0, 8)}`})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-grid">
              <div className="field">
                <label>Which product are you connecting?</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value as typeof deviceType)}>
                  <option value="ANY">Advanced: any licensed terminal type</option>
                  <option value="POS_ADMIN">Restaurant Admin console</option>
                  <option value="POS">Main Billing Counter POS</option>
                  <option value="CAPTAIN">Captain Waiter Tablet</option>
                  <option value="KDS">Kitchen Order Display (KDS)</option>
                  <option value="KIOSK">Self-Order Kiosk</option>
                  <option value="KIOSK_ADMIN">Kiosk Admin Console</option>
                  <option value="QR_ORDERING">QR Ordering Console (solo — no POS/Kiosk needed)</option>
                </select>
              </div>
              <div className="field">
                <label>Expires in (days)</label>
                <input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} required />
              </div>
            </div>
            {deviceType !== 'ANY' && restaurantId && (
              <div style={{ fontSize: 12, color: 'var(--jv-text-muted)', margin: '-4px 0 4px' }}>
                {quotaLoading ? (
                  'Checking device quota…'
                ) : quotaPreview ? (
                  <span style={{ color: !quotaPreview.available ? '#b91c1c' : 'var(--jv-text-muted)' }}>
                    Restaurant: {quotaPreview.current} / {quotaPreview.quota ?? 'No device cap'} devices.
                    {branchId && <> Branch: {quotaPreview.branchCurrent} / {quotaPreview.branchQuota ?? 'Inherits restaurant cap'}.</>}
                    {!quotaPreview.enabled ? ' Product unavailable: '+quotaPreview.reason.replaceAll('_',' ').toLowerCase() : !quotaPreview.available ? ' No capacity. Revoke an unused device or review Products & plan.' : ' Capacity available. Capacity is checked again at activation.'}
                  </span>
                ) : null}
              </div>
            )}
            {deviceType !== 'ANY' && restaurantId && !quotaLoading && appEnabled === false && (
              <div
                role="alert"
                style={{ fontSize: 13, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', margin: '-4px 0 8px' }}
              >
                <strong>{APP_CODE_LABELS[deviceType as AppCode]}</strong>{' '}
                is unavailable for the selected restaurant or branch. Review Products & access, then return here. No pairing code will be issued while access is unavailable.
              </div>
            )}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="key-branch">Branch</label>
                <select id="key-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branches.length === 0}>
                  <option value="" disabled>Choose the device?s branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="key-label">Terminal name (optional)</label>
                <input
                  id="key-label"
                  type="text"
                  maxLength={80}
                  placeholder={deviceType === 'QR_ORDERING' ? 'Defaults to "QR Ordering Console"' : 'e.g. Counter 1, Kitchen wall'}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                {deviceType === 'QR_ORDERING' && !label.trim() && (
                  <p style={{ fontSize: 12, color: 'var(--jv-text-muted)', margin: '4px 0 0' }}>
                    Left blank, this key is labeled "QR Ordering Console" in the activation keys list — otherwise it would
                    look identical to a regular Restaurant Admin key and be easy to mistake for missing.
                  </p>
                )}
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || !restaurantId || !branchId || appEnabled === false || (deviceType !== 'ANY' && (quotaLoading || !quotaPreview?.available))}>
                {submitting ? 'Generating…' : 'Create pairing code'}
              </Button>
            </div>
          </form>
        )}
    </ModalShell>
  );
}
