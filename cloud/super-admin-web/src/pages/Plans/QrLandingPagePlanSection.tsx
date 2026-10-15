import { Link } from 'react-router-dom';
import type { FeatureRecord } from '../../api/types';

export function QrLandingPagePlanSection({ feature, loading, error, included, onChange }: {
  feature?: FeatureRecord;
  loading: boolean;
  error: string;
  included: boolean;
  onChange: (included: boolean) => void;
}) {
  return <section aria-label="Restaurant landing page plan option" style={{ padding: 18, border: '1px solid var(--jv-border)', borderRadius: 14, background: 'var(--jv-bg-muted)' }}>
    <h3 style={{ margin: '0 0 8px' }}>Restaurant landing page</h3>
    <p className="form-note">Include a restaurant website with mobile designs, photos, contact details, WhatsApp, Instagram and a Google review link. Available with standalone QR, Restaurant or Kiosk plans.</p>
    <label className="entitlement-checkbox-label">
      <input type="checkbox" aria-label="Include restaurant landing page" checked={included} disabled={loading || !feature} onChange={e => onChange(e.target.checked)} />
      <span>Include restaurant landing page and page builder</span>
    </label>
    {loading ? <p role="status">Checking the feature catalog...</p> : error ? <p role="alert">{error} The landing-page option cannot be changed until the catalog loads.</p> : !feature ? <p role="alert">The restaurant-page feature is missing from this server's catalog. Apply the pending API migrations, then reopen this plan. Rebuilding only the frontend does not register the feature.</p> : !feature.isActive || feature.rolloutPercent < 100 ? <p role="status">Platform availability: {feature.isActive ? `${feature.rolloutPercent}% rollout` : 'inactive'}. Including it in a plan does not override platform availability.</p> : null}
    <p className="form-note">Enabling this also includes QR ordering, Menu Management and Table Management. It does not publish a page. After assigning the plan, the owner opens QR Ordering → Restaurant Page, previews their design and publishes it.</p>
    <Link to="/feature-catalog" target="_blank" rel="noopener noreferrer">Open feature catalog</Link>
  </section>;
}
