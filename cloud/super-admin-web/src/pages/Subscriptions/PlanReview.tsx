import type { AppCode, Plan } from '../../api/types';
import { Link } from 'react-router-dom';
import { planFeatureSummary, productNames } from '../../lib/planAccess';
import './plan-review.css';
export function PlanReview({
  plan,
  expiresAt,
  applications,
  compact = false
}: {
  plan: Plan;
  expiresAt?: string;
  applications?: AppCode[];
  compact?: boolean;
}) {
  const apps = applications ?? plan.defaultApps ?? [],
    summary = planFeatureSummary(plan, apps);
  return (
    <section className={`plan-access-review ${compact ? 'is-compact' : ''}`} aria-label="Selected plan review">
      <header>
        <div>
          <span className="plan-access-eyebrow">{compact ? 'Selected product features' : 'Review products & access'}</span>
          <h3>{plan.name}</h3>
        </div>
        <span className="plan-access-product-count">
          {apps.length} {apps.length === 1 ? 'product' : 'products'}
        </span>
      </header>
      {!compact && (
        <dl className="plan-access-limits">
          <div>
            <dt>Branches</dt>
            <dd>{plan.maxBranches}</dd>
          </div>
          <div>
            <dt>Devices</dt>
            <dd>{plan.maxDevices}</dd>
          </div>
          <div>
            <dt>Staff accounts</dt>
            <dd>{plan.maxUsers}</dd>
          </div>
        </dl>
      )}
      <h4>Selected products</h4>
      <ul className="plan-access-products">
        {productNames(apps).map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      {!apps.length && <p>No products selected. Choose products before provisioning.</p>}
      <h4>Included for these products</h4>
      <ul className="plan-access-features">
        {summary.included.map((feature) => (
          <li key={feature.key}>
            <span aria-hidden="true">✓</span>
            {feature.label}
          </li>
        ))}
      </ul>
      {!summary.included.length && <p>No enabled feature flags for these products.</p>}
      {summary.outsideSelection.length > 0 && (
        <details className="plan-access-warning">
          <summary>{summary.outsideSelection.length} configured features are outside the selected products</summary>
          <p>
            These flags are stored on this plan, but are not shown as included for this onboarding selection. They do not activate an unselected product. Review
            the plan configuration before assigning it to other restaurants.
          </p>
          <ul>
            {summary.outsideSelection.map((feature) => (
              <li key={feature.key}>{feature.label}</li>
            ))}
          </ul>
          <Link to={`/plans/${encodeURIComponent(plan.id)}`}>Review plan settings</Link>
        </details>
      )}
      {expiresAt && <p>Access expires: {new Date(expiresAt).toLocaleString('en-IN')}</p>}
      {!compact && (
        <p className="plan-access-note">Branch restrictions and restaurant overrides can further limit access. Confirm effective access after saving.</p>
      )}
    </section>
  );
}
