import type { FeatureRecord } from '../../api/types';

export function qrPackageFlags(flags: Record<string, boolean>, features: FeatureRecord[], complete: boolean) {
  return {
    ...flags,
    ...Object.fromEntries(features.filter((feature) => !!feature.legacyEntitlementKey).map((feature) => [feature.legacyEntitlementKey!, complete])),
    qrTableOrdering: true,
    menuManagement: true,
    tableManagement: true,
    foodCustomization: true
  };
}

export function QrPlanCapabilities({
  features,
  flags,
  loading,
  error,
  onChange
}: {
  features: FeatureRecord[];
  flags: Record<string, boolean>;
  loading: boolean;
  error: string;
  onChange: (flags: Record<string, boolean>) => void;
}) {
  const included = features.filter((feature) => flags[feature.legacyEntitlementKey!] === true).length;
  return (
    <section className="qr-package-editor" aria-label="QR package features">
      <div className="qr-package-heading">
        <div>
          <h3>Choose the QR package</h3>
          <p>A plan name or higher price does not include add-ons automatically. Select what this plan actually provides.</p>
        </div>
        <strong>
          {included}/{features.length} QR capabilities included
        </strong>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="qr-package-options">
        <button type="button" disabled={loading || !!error || !features.length} onClick={() => onChange(qrPackageFlags(flags, features, false))}>
          <b>QR Essential</b>
          <span>Menu and table ordering. Optional capabilities remain separate.</span>
        </button>
        <button type="button" disabled={loading || !!error || !features.length} onClick={() => onChange(qrPackageFlags(flags, features, true))}>
          <b>QR Complete · include all QR capabilities</b>
          <span>Includes Menu Performance, loyalty, restaurant page and every QR capability listed below.</span>
        </button>
      </div>
      <p className="form-note">
        Save this plan and assign it to the restaurant. Existing feature restrictions for an individual restaurant or branch still apply. Platform-inactive or
        limited-rollout features remain subject to their release controls.
      </p>
      <details>
        <summary>Review individual QR capabilities</summary>
        <div className="module-entitlement-grid">
          {features.map((feature) => (
            <label key={feature.id} className="entitlement-checkbox-label">
              <input
                type="checkbox"
                disabled={loading || !!error}
                checked={flags[feature.legacyEntitlementKey!] === true}
                onChange={(event) =>
                  onChange({
                    ...flags,
                    [feature.legacyEntitlementKey!]: event.target.checked,
                    ...(event.target.checked ? { qrTableOrdering: true, menuManagement: true, tableManagement: true, foodCustomization: true } : {})
                  })
                }
              />
              <span>
                {feature.name}
                {!feature.isActive ? ' · platform inactive' : feature.rolloutPercent < 100 ? ` · ${feature.rolloutPercent}% rollout` : ''}
              </span>
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
