import { RESTAURANT_ADMIN_URL } from '../../lib/appUrls';
// Deep import on purpose: the '@jamanvaar/utils' barrel drags in the local device database (see tests/super_admin_css_classes.test.ts).
import { copyText } from '../../../../../packages/utils/src/clipboard';
import { generateSecurePassword } from '../../../../../packages/utils/src/uuid';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { CreateRestaurantInput, RestaurantDetail, ActivationKey, Plan } from '../../api/types';
import { Button } from '../../components/ui';
import { Copy, Check, Eye, EyeOff, RefreshCw, KeyRound } from 'lucide-react';
import './restaurants.css';

// B2-003: was built from Math.random() for every character, including the final shuffle
// (`.sort(() => Math.random() - 0.5)`, itself a known-biased shuffle even set aside the RNG
// choice) — for a password that becomes a real owner's platform login. Now cryptographically
// random throughout, via the same shared helper every other generated-password/PIN/code in
// the product should use.
function generateRandomPassword(): string {
  return generateSecurePassword(12);
}

export function CreateRestaurantModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateRestaurantInput>({
    name: '',
    mobile: '',
    city: 'Ahmedabad',
    state: 'Gujarat',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: generateRandomPassword()
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<{
    restaurant: RestaurantDetail;
    ownerEmail: string;
    ownerPassword?: string;
    activationKey?: string;
  } | null>(null);

  function update<K extends keyof CreateRestaurantInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCopy(text: string, id: string) {
    if (!(await copyText(text))) return;
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await api.post<{ restaurant: RestaurantDetail }>(
        '/api/v1/restaurants',
        form
      );

      // Restaurant creation alone leaves the tenant with no subscription and
      // therefore no enabled applications — every device activation attempt
      // would fail with "<app> is not enabled on this restaurant's current
      // subscription" no matter what activation key is handed out below.
      // A 30-day TRIAL keeps this a low-commitment convenience action (it
      // deliberately does not generate an invoice the way an ACTIVE
      // subscription would); PRO is picked so every app — not just POS —
      // is ready to activate immediately, matching what this modal already
      // promises on the confirmation screen.
      try {
        const plans = await api.get<Plan[]>('/api/v1/plans?excludeTestFixtures=true');
        const activePlans = plans.filter((p) => p.status === 'ACTIVE');
        const defaultPlan = activePlans.find((p) => p.tier === 'PRO') || activePlans[0];
        if (defaultPlan) {
          await api.post('/api/v1/subscriptions', {
            restaurantId: res.restaurant.id,
            planId: defaultPlan.id,
            status: 'TRIAL',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          });
        } else {
          console.warn('Auto subscription assignment skipped: no active plan found.');
        }
      } catch (subErr) {
        console.warn('Auto subscription assignment error:', subErr);
      }

      // Also generate an initial terminal activation key for this restaurant
      let keyResult: string | undefined;
      try {
        const keyRes = await api.post<ActivationKey>('/api/v1/activation-keys', {
          restaurantId: res.restaurant.id,
          allowedDeviceType: 'ANY',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        keyResult = keyRes.code ?? undefined;
      } catch (keyErr) {
        console.warn('Auto key generation error:', keyErr);
      }

      setCreatedResult({
        restaurant: res.restaurant,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
        activationKey: keyResult
      });
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
      <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Quick Create Restaurant</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {createdResult ? (
          <div className="modal-form">
            <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, color: '#166534', fontSize: 14, fontWeight: 600 }}>
              ✓ Restaurant & Owner Account Successfully Created!
            </div>

            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              The owner account is activated and ready to log into Restaurant Admin immediately. Relay these credentials to the restaurant manager:
            </p>

            <div style={{ background: '#FFFDF9', border: '1px solid var(--jv-border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--jv-text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Restaurant</span>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{createdResult.restaurant.name}</div>
                </div>
                <span className="badge badge-accent">ACTIVE TENANT</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--jv-border)', paddingTop: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--jv-text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Login Email</span>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{createdResult.ownerEmail}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleCopy(createdResult.ownerEmail, 'email')}>
                  {copiedKey === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'email' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>

              {createdResult.ownerPassword && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--jv-border)', paddingTop: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--jv-text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Password</span>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--jv-navy, #0B253A)' }}>
                      {createdResult.ownerPassword}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(createdResult.ownerPassword!, 'pass')}>
                    {copiedKey === 'pass' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'pass' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              )}

              {createdResult.activationKey && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--jv-border)', paddingTop: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span style={{ fontSize: 11, color: '#E66817', fontWeight: 800, textTransform: 'uppercase' }}>
                        Restaurant Admin Activation Key
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#E66817', letterSpacing: '0.05em', marginTop: 2 }}>
                      {createdResult.activationKey}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(createdResult.activationKey!, 'key')}>
                    {copiedKey === 'key' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'key' ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--jv-text-secondary)', background: 'var(--jv-bg-muted)', padding: '8px 12px', borderRadius: 6, marginTop: 4 }}>
              💡 <strong>First Login Note:</strong> On the first login at <code>{RESTAURANT_ADMIN_URL}</code>, the owner will enter their email & password, then enter the Activation Key. Subsequent logins will authenticate directly without prompting for the key.
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={onCreated}>
                View Restaurant Workspace
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-section-label">Restaurant Profile</div>
            <div className="form-grid">
              <div className="field">
                <label>Restaurant Name *</label>
                <input
                  placeholder="e.g. Havmor Restaurant"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                />
                {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
              </div>
              <div className="field">
                <label>Restaurant Mobile * (makes the Restaurant ID)</label>
                <input
                  placeholder="10-digit mobile, e.g. 9876543210"
                  value={form.mobile || ''}
                  onChange={(e) => update('mobile', e.target.value.replace(/[^0-9+ ]/g, ''))}
                  inputMode="tel"
                  required
                />
                {fieldErrors.mobile && <div className="error">{fieldErrors.mobile}</div>}
              </div>
              <div className="field">
                <label>City</label>
                <input placeholder="e.g. Ahmedabad" value={form.city || ''} onChange={(e) => update('city', e.target.value)} />
              </div>
              <div className="field">
                <label>State</label>
                <input placeholder="e.g. Gujarat" value={form.state || ''} onChange={(e) => update('state', e.target.value)} />
              </div>
            </div>

            <div className="form-section-label" style={{ marginTop: 14 }}>Owner Credentials</div>
            <div className="form-grid">
              <div className="field">
                <label>Owner Full Name *</label>
                <input
                  placeholder="e.g. Ramesh Patel"
                  value={form.ownerName}
                  onChange={(e) => update('ownerName', e.target.value)}
                  required
                />
                {fieldErrors.ownerName && <div className="error">{fieldErrors.ownerName}</div>}
              </div>
              <div className="field">
                <label>Owner Email *</label>
                <input
                  type="email"
                  placeholder="owner@restaurant.com"
                  value={form.ownerEmail}
                  onChange={(e) => update('ownerEmail', e.target.value)}
                  required
                />
                {fieldErrors.ownerEmail && <div className="error">{fieldErrors.ownerEmail}</div>}
              </div>
              <div className="field">
                <label>Owner Phone</label>
                <input placeholder="+91 9876543210" value={form.ownerPhone || ''} onChange={(e) => update('ownerPhone', e.target.value)} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Initial Password *</label>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--jv-accent)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => update('ownerPassword', generateRandomPassword())}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generate New</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="mono"
                  value={form.ownerPassword || ''}
                  onChange={(e) => update('ownerPassword', e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="form-note" style={{ marginTop: 8 }}>
              Account will be created immediately ACTIVE with these credentials. A POS Admin hardware activation key will also be provisioned automatically.
            </p>

            {submitError && <div className="form-error">{submitError}</div>}

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Creating Restaurant…' : 'Create & Activate Restaurant'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
