import { PlanReview } from './PlanReview';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Plan, SubscriptionListItem } from '../../api/types';
import { Badge, Button, Modal } from '../../components/ui';
import '../../components/shared.css';

export function ChangePlanModal({
  subscription,
  onClose,
  onSaved
}: {
  subscription: SubscriptionListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(subscription.plan.id);
  const [submitting, setSubmitting] = useState(false);
  const [reviewed,setReviewed]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<{ losingApps: string[]; deviceImpact: Array<{ appCode: string; activeDevices: number }> } | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    api
      .get<Plan[]>('/api/v1/plans')
      .then((all) => setPlans(all.filter((p) => p.status === 'ACTIVE' && p.productFamily === subscription.plan.productFamily)))
      .catch(() => setPlans([]));
    // Changing plan only moves within the subscription's current product family — the server
    // rejects a cross-family change-plan (see SubscriptionsService.changePlan), so listing other
    // families' plans here would only let an operator pick one and then hit that error.
  }, [subscription.plan.productFamily]);

  // A real server-computed preview of what this change disables — not just a generic "downgrades
  // may affect devices" warning. Re-fetched whenever the target plan changes.
  useEffect(() => {
    if (selectedPlanId === subscription.plan.id) {
      setImpact(null);
      return;
    }
    let active = true;
    setImpactLoading(true);
    api
      .get<{ losingApps: string[]; deviceImpact: Array<{ appCode: string; activeDevices: number }> }>(
        `/api/v1/subscriptions/${subscription.id}/change-plan-preview?planId=${encodeURIComponent(selectedPlanId)}`
      )
      .then((res) => { if (active) setImpact(res); })
      .catch(() => { if (active) setImpact(null); })
      .finally(() => { if (active) setImpactLoading(false); });
    return () => { active = false; };
  }, [selectedPlanId, subscription.id, subscription.plan.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedPlanId === subscription.plan.id) {
      onClose();
      return;
    }
    if(!reviewed)return;
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/api/v1/subscriptions/${subscription.id}/change-plan`, {
        planId: selectedPlanId,
        acknowledgeImpact: true
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change plan');
    } finally {
      setSubmitting(false);
    }
  }

  const currentPlan = subscription.plan;
  const chosenPlan = plans.find((p) => p.id === selectedPlanId) || currentPlan;

  return (
    <Modal
      title={`Change SaaS Plan Tier — ${subscription.restaurant.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleSubmit} disabled={submitting || selectedPlanId === currentPlan.id || !reviewed}>
            {submitting ? 'Applying Plan…' : `Update to ${chosenPlan?.name || 'Selected Plan'}`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="page-error">{error}</div>}

        <div style={{ background: 'var(--jv-surface-subtle)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--jv-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Current Allotted Tier</span>
            <strong style={{ fontSize: 13, color: 'var(--jv-text)' }}>
              {currentPlan.name} ({currentPlan.tier})
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>Current Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
              ₹{(currentPlan.priceMonthly / 100).toLocaleString('en-IN')}/mo
            </span>
          </div>
        </div>

        <div className="field">
          <label>Select Target Plan Tier *</label>
          <select
            value={selectedPlanId}
            onChange={(e) => {setSelectedPlanId(e.target.value);setReviewed(false);}}
            style={{ height: 42 }}
            required
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.tier}) — ₹{(p.priceMonthly / 100).toLocaleString('en-IN')}/mo [Max {p.maxBranches} Br, {p.maxDevices} Dev]
              </option>
            ))}
          </select>
        </div>

        {chosenPlan && chosenPlan.id !== currentPlan.id && (
          <div style={{ background: 'var(--jv-accent-soft)', border: '1px solid var(--jv-accent-line)', padding: '12px 16px', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--jv-accent-text)', textTransform: 'uppercase' }}>
              Plan Transition Summary
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#7c2d12' }}>
              Moving from <strong>{currentPlan.name}</strong> to <strong>{chosenPlan.name}</strong>.
              {' Existing branch restrictions remain. Review the actual product and limit changes below.'}
            </p>
          </div>
        )}
        {chosenPlan && chosenPlan.id !== currentPlan.id && (
          impactLoading ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Checking what this change would affect…</p>
          ) : impact && impact.deviceImpact.length > 0 ? (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 8 }}>
              <strong style={{ color: '#991b1b', fontSize: 13 }}>This will disable, right now, for connected devices:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: '#7f1d1d' }}>
                {impact.deviceImpact.map((d) => (
                  <li key={d.appCode}>{d.activeDevices} active {d.appCode} device{d.activeDevices === 1 ? '' : 's'}</li>
                ))}
              </ul>
            </div>
          ) : impact && impact.losingApps.length > 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--jv-text-muted)' }}>
              This also turns off: {impact.losingApps.join(', ')} (no active devices currently use {impact.losingApps.length === 1 ? 'it' : 'them'}).
            </p>
          ) : null
        )}
        {chosenPlan&&chosenPlan.id!==currentPlan.id&&<><PlanReview plan={chosenPlan}/><label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the new products and limits{impact && impact.deviceImpact.length > 0 ? ' and the device impact above' : ''}.</label></>}
      </form>
    </Modal>
  );
}
