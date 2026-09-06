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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Plan[]>('/api/v1/plans')
      .then((all) => setPlans(all.filter((p) => p.status === 'ACTIVE')))
      .catch(() => setPlans([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedPlanId === subscription.plan.id) {
      onClose();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/api/v1/subscriptions/${subscription.id}/change-plan`, {
        planId: selectedPlanId
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
          <Button variant="accent" onClick={handleSubmit} disabled={submitting || selectedPlanId === currentPlan.id}>
            {submitting ? 'Applying Plan…' : `Update to ${chosenPlan?.name || 'Selected Plan'}`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="modal-form">
        {error && <div className="page-error">{error}</div>}

        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--jv-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Current Allotted Tier</span>
            <strong style={{ fontSize: 13, color: '#0B253A' }}>
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
            onChange={(e) => setSelectedPlanId(e.target.value)}
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
          <div style={{ background: '#fffaf5', border: '1px solid #fed7aa', padding: '12px 16px', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>
              Plan Transition Summary
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#7c2d12' }}>
              Moving from <strong>{currentPlan.name}</strong> to <strong>{chosenPlan.name}</strong>.
              {chosenPlan.tier === 'PRO' || chosenPlan.tier === 'ENTERPRISE'
                ? ' Captain app, QR table ordering, KDS, and multi-device sync will be immediately unlocked for this restaurant.'
                : ' Advanced PRO features will be locked according to the CORE plan specification.'}
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
