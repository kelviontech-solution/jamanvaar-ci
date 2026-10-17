import type { Plan } from '../../api/types';
import { APP_CODE_LABELS, ENTITLEMENT_LABELS } from '../../api/types';

export function PlanReview({ plan, expiresAt }: { plan: Plan; expiresAt?: string }) {
  const included = Object.entries(plan.entitlements || {}).filter(([, value]) => value === true);
  return <section aria-label="Selected plan review" style={{ border:'1px solid var(--jv-border)', borderRadius:12, padding:16 }}>
    <h3>{plan.name}: review access</h3>
    <p>{plan.maxBranches} branches · {plan.maxDevices} devices · {plan.maxUsers} staff accounts</p>
    <p>Default products: {plan.defaultApps?.length ? plan.defaultApps.map(code=>APP_CODE_LABELS[code]).join(', ') : 'No default product list returned; review Products & access before issuing codes.'}</p>
    <p>Included features: {included.length ? included.map(([key]) => ENTITLEMENT_LABELS[key as keyof typeof ENTITLEMENT_LABELS] || key).join(', ') : 'None listed'}</p>
    {expiresAt && <p>Access expires: {new Date(expiresAt).toLocaleString('en-IN')}</p>}
    <p>Branch restrictions and existing overrides can further limit access. Confirm effective access and connected devices after saving.</p>
  </section>;
}
