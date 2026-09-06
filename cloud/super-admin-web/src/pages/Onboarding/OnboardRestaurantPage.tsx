import React, { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Plan, EntitlementKey } from '../../api/types';
import { ENTITLEMENT_LABELS } from '../../api/types';
import { Button, Card, Badge } from '../../components/ui';
// See ProtectedLayout.tsx for why this bypasses the '@jamanvaar/ui' barrel.
import { JAMANVAAR_LOGOS } from '../../../../../packages/ui/src/assets';
// Deep relative import, not the '@jamanvaar/utils' barrel: that barrel's
// sound.ts re-exports the ENTIRE '@jamanvaar/ui' package, which in turn pulls
// in @jamanvaar/database (a local-first engine that immediately opens a LAN
// connection to a nonexistent local device bridge on module load) plus
// @jamanvaar/business, @jamanvaar/sync, and @jamanvaar/api's hardware modules
// — none of which a pure cloud web console has any business loading just to
// generate a QR code SVG. Confirmed via a real browser session's network
// trace (repeated connection-refused noise to localhost:5178 on every page).
import { generateQrSvg } from '../../../../../packages/utils/src/qrcode';
import {
  Check,
  CheckCircle2,
  Sparkles,
  Copy,
  Printer,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  Store,
  Laptop2,
  Building2,
  Users,
  QrCode,
  ChefHat,
  Smartphone,
  Info,
  RefreshCw
} from 'lucide-react';
import '../../components/shared.css';
import './onboarding.css';

type Step = 'details' | 'owner' | 'plan' | 'modules' | 'activation' | 'review' | 'done';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'details', label: '1. Restaurant Details' },
  { key: 'owner', label: '2. Owner Credentials' },
  { key: 'plan', label: '3. Plan & Commercials' },
  { key: 'modules', label: '4. Branches & Limits' },
  { key: 'activation', label: '5. Device Provisioning' },
  { key: 'review', label: '6. Review & Launch' },
  { key: 'done', label: '7. Welcome Kit' }
];

interface DetailsForm {
  name: string;
  legalName: string;
  gstin: string;
  fssaiNumber: string;
  address: string;
  city: string;
  state: string;
  country: string;
  restaurantType: string;
}

interface OwnerForm {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  passwordMode: 'set_now' | 'invite';
  initialPassword: string;
}

interface PlanForm {
  planId: string;
  status: 'ACTIVE' | 'TRIAL';
  billingCycle: 'monthly' | 'yearly';
  durationDays: string;
}

interface ModulesForm {
  branchName: string;
  branchCode: string;
  maxBranches: number;
  maxDevices: number;
}

interface ActivationForm {
  deviceTypes: Array<'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK'>;
  expiryDays: string;
}

interface ProvisionedKey {
  id: string;
  code: string;
  deviceType: string;
  qrSvg: string;
}

const EMPTY_DETAILS: DetailsForm = {
  name: '',
  legalName: '',
  gstin: '',
  fssaiNumber: '',
  address: '',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  restaurantType: 'Casual Dine-in'
};

const EMPTY_OWNER: OwnerForm = {
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  passwordMode: 'set_now',
  initialPassword: 'Jaman@' + Math.floor(1000 + Math.random() * 9000)
};

const EMPTY_PLAN: PlanForm = {
  planId: '',
  status: 'ACTIVE',
  billingCycle: 'monthly',
  durationDays: '30'
};

const EMPTY_MODULES: ModulesForm = {
  branchName: 'Main Dining & Kitchen',
  branchCode: 'MAIN',
  maxBranches: 1,
  maxDevices: 5
};

const EMPTY_ACTIVATION: ActivationForm = {
  deviceTypes: ['POS', 'CAPTAIN', 'KDS'],
  expiryDays: '30'
};

export function OnboardRestaurantPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('details');
  const [details, setDetails] = useState<DetailsForm>(EMPTY_DETAILS);
  const [owner, setOwner] = useState<OwnerForm>(EMPTY_OWNER);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN);
  const [modulesForm, setModulesForm] = useState<ModulesForm>(EMPTY_MODULES);
  const [activationForm, setActivationForm] = useState<ActivationForm>(EMPTY_ACTIVATION);
  const [plans, setPlans] = useState<Plan[]>([]);

  // Execution state & outputs
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  // Real credential, not "check your email" — no email-sending system exists
  // anywhere in cloud/api, so that claim was never true. This is the only way
  // the owner can actually self-activate via pos-admin's invitation-token flow.
  const [ownerActivationToken, setOwnerActivationToken] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [provisionedKeys, setProvisionedKeys] = useState<ProvisionedKey[]>([]);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each optional provisioning sub-step (password set, invoice, activation
  // keys) used to fail silently (console.warn only) while the wizard still
  // advanced to "done" and showed an unconditional success badge — an admin
  // could be handed a QR code or password that was never actually created
  // server-side. Now surfaced and shown on the done screen.
  const [provisioningWarnings, setProvisioningWarnings] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<Plan[]>('/api/v1/plans')
      .then((all) => {
        const active = all.filter((p) => p.status === 'ACTIVE');
        setPlans(active);
        // Default to PRO plan if available, else first plan
        const proPlan = active.find((p) => p.tier === 'PRO') || active[0];
        if (proPlan) {
          setPlanForm((prev) => ({ ...prev, planId: proPlan.id }));
          setModulesForm((prev) => ({
            ...prev,
            maxBranches: proPlan.maxBranches,
            maxDevices: proPlan.maxDevices
          }));
        }
      })
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = plans.find((p) => p.id === planForm.planId);

  function handleSelectPlan(plan: Plan) {
    setPlanForm((f) => ({ ...f, planId: plan.id }));
    setModulesForm((m) => ({
      ...m,
      maxBranches: plan.maxBranches,
      maxDevices: plan.maxDevices
    }));
  }

  function handleDeviceTypeToggle(type: 'POS' | 'CAPTAIN' | 'KDS' | 'KIOSK') {
    setActivationForm((prev) => {
      const exists = prev.deviceTypes.includes(type);
      return {
        ...prev,
        deviceTypes: exists ? prev.deviceTypes.filter((t) => t !== type) : [...prev.deviceTypes, type]
      };
    });
  }

  function handleRegeneratePassword() {
    setOwner((prev) => ({
      ...prev,
      initialPassword: 'Jaman@' + Math.floor(1000 + Math.random() * 9000)
    }));
  }

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopyToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopyToast(null), 3000);
  }

  function handlePrint() {
    window.print();
  }

  /**
   * Final atomic orchestration:
   * 1. Create Restaurant + Branch + Owner
   * 2. If password provided, activate owner account immediately via set-initial-password
   * 3. Assign Subscription
   * 4. Provision Activation Keys for all selected device types
   */
  async function runOnboarding() {
    setError(null);
    setProcessing(true);
    try {
      let rId = restaurantId;
      if (!rId) {
        const res = await api.post<{
          restaurant: { id: string };
          owner: { id: string; email: string };
          activationToken: string;
        }>(
          '/api/v1/restaurants',
          {
            name: details.name,
            legalName: details.legalName || undefined,
            gstin: details.gstin || undefined,
            fssaiNumber: details.fssaiNumber || undefined,
            address: details.address || undefined,
            city: details.city || undefined,
            state: details.state || undefined,
            country: details.country,
            ownerName: owner.ownerName,
            ownerEmail: owner.ownerEmail,
            ownerPhone: owner.ownerPhone || undefined
          }
        );
        rId = res.restaurant.id;
        setRestaurantId(rId);
        setOwnerActivationToken(res.activationToken);

        // If Super Admin provided an initial password, set it now to activate the owner account!
        if (owner.passwordMode === 'set_now' && owner.initialPassword.trim()) {
          try {
            await api.post('/api/v1/tenant-auth/set-initial-password', {
              restaurantId: rId,
              email: owner.ownerEmail,
              activationToken: res.activationToken,
              newPassword: owner.initialPassword.trim()
            });
          } catch (passErr) {
            console.warn('Initial password set error:', passErr);
            setProvisioningWarnings((w) => [
              ...w,
              'Owner password was NOT set — the owner cannot log in yet. Use "Reset Password" from the restaurant detail page to retry.'
            ]);
          }
        }
      }

      let sId = subscriptionId;
      if (!sId && selectedPlan) {
        const days = Number(planForm.durationDays) || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const sub = await api.post<{ id: string }>('/api/v1/subscriptions', {
          restaurantId: rId,
          planId: selectedPlan.id,
          status: planForm.status,
          expiresAt
        });
        sId = sub.id;
        setSubscriptionId(sId);

        // Automatically issue the initial tax invoice for this subscription
        try {
          const baseAmt = selectedPlan.priceMonthly;
          const taxAmt = Math.round(baseAmt * 0.18);
          await api.post('/api/v1/invoices', {
            restaurantId: rId,
            subscriptionId: sId,
            planId: selectedPlan.id,
            amount: baseAmt,
            taxAmount: taxAmt,
            dueDate: expiresAt,
            billingPeriodStart: new Date().toISOString(),
            billingPeriodEnd: expiresAt,
            notes: `Initial subscription invoice for ${selectedPlan.name}`
          });
        } catch (invErr) {
          console.warn('Initial invoice generation skipped:', invErr);
          setProvisioningWarnings((w) => [
            ...w,
            'Initial invoice was NOT created — create it manually from the Billing tab.'
          ]);
        }
      }

      // Provision device activation keys
      if (provisionedKeys.length === 0) {
        const keyDays = Number(activationForm.expiryDays) || 30;
        const keyExpiresAt = new Date(Date.now() + keyDays * 24 * 60 * 60 * 1000).toISOString();
        const results: ProvisionedKey[] = [];

        for (const type of activationForm.deviceTypes) {
          try {
            const keyRes = await api.post<{ id: string; code: string; allowedDeviceType: string }>(
              '/api/v1/activation-keys',
              {
                restaurantId: rId,
                subscriptionId: sId,
                allowedDeviceType: type,
                expiresAt: keyExpiresAt
              }
            );
            const qrSvg = generateQrSvg(keyRes.code, { size: 100, margin: 1 });
            results.push({
              id: keyRes.id,
              code: keyRes.code,
              deviceType: keyRes.allowedDeviceType,
              qrSvg
            });
          } catch (keyErr) {
            console.warn('Key generation skipped for type:', type, keyErr);
            setProvisioningWarnings((w) => [
              ...w,
              `Activation key for ${type} was NOT generated — create it manually from the Activation Keys tab.`
            ]);
          }
        }
        setProvisionedKeys(results);
      }

      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboarding failed — please review error and retry.');
    } finally {
      setProcessing(false);
    }
  }

  function getHandoverWhatsAppText(): string {
    const lines = [
      `*WELCOME TO JAMANVAAR RESTAURANT PLATFORM*`,
      `Namaste ${owner.ownerName},`,
      `Your restaurant *${details.name}* is officially onboarded and activated on JAMANVAAR SaaS.`,
      ``,
      `*YOUR RESTAURANT ADMIN CREDENTIALS:*`,
      `• Portal: http://localhost:5176`,
      `• Restaurant ID: ${restaurantId || '—'}`,
      `• Login Email: ${owner.ownerEmail}`,
      owner.passwordMode === 'set_now'
        ? `• Password: ${owner.initialPassword}`
        : `• Invitation Token (open the Admin Portal → "First time? Set your password"): ${ownerActivationToken ?? 'unavailable — see warning in console'}`,
      `• Plan: ${selectedPlan?.name || 'JAMANVAAR PRO'} (Status: ${planForm.status})`,
      ``,
      `*HARDWARE ACTIVATION KEYS:*`
    ];

    if (provisionedKeys.length > 0) {
      provisionedKeys.forEach((k) => {
        lines.push(`• ${k.deviceType} Terminal: *${k.code}*`);
      });
    } else {
      lines.push(`• Key: (Generated in console)`);
    }

    lines.push(
      ``,
      `*FIRST TIME SETUP INSTRUCTIONS:*`,
      `1. Open Restaurant Admin on your manager PC (http://localhost:5176).`,
      `2. Go to Subscription / Activation and enter your activation key.`,
      `3. Enter your login credentials to verify your live menu and POS terminals.`,
      `4. For assistance, contact KELVIONTECH Platform Support.`
    );

    return lines.join('\n');
  }

  return (
    <div className="onboard-wizard">
      {/* ── HEADER ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Onboard New Restaurant</h1>
          <p className="page-subtitle">
            Commercial SaaS onboarding workflow: register organization, allocate plan, generate owner credentials, and issue device activation keys.
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/restaurants')}>
          ← Back to Restaurants
        </Button>
      </div>

      {/* ── PROGRESS STEPPER ── */}
      <div className="onboard-steps">
        {STEPS.map((s, idx) => {
          const currentIdx = STEPS.findIndex((item) => item.key === step);
          const isComplete = currentIdx > idx;
          const isActive = step === s.key;
          return (
            <div
              key={s.key}
              className={`onboard-step-pill ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
            >
              {isComplete && <Check className="w-3 h-3" />}
              {s.label}
            </div>
          );
        })}
      </div>

      {copyToast && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: '#0f172a',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* ── CARD CONTENT ── */}
      <Card className="onboard-card">
        {/* STEP 1: RESTAURANT DETAILS */}
        {step === 'details' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep('owner');
            }}
            className="modal-form"
          >
            <div className="form-section-title">
              <Store className="w-4 h-4 text-[#e66817]" />
              <span>Restaurant & Legal Business Identity</span>
            </div>
            <p className="form-subtext">
              Enter official restaurant establishment details for GST billing, taxation receipts, and SaaS licensing.
            </p>

            <div className="form-grid">
              <div className="field">
                <label>Restaurant Trade Name *</label>
                <input
                  value={details.name}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. The Royal Haveli"
                  required
                />
              </div>
              <div className="field">
                <label>Legal Entity / Registered Business Name</label>
                <input
                  value={details.legalName}
                  onChange={(e) => setDetails((d) => ({ ...d, legalName: e.target.value }))}
                  placeholder="e.g. Haveli Hospitality Pvt. Ltd."
                />
              </div>
              <div className="field">
                <label>Restaurant Business Type</label>
                <select
                  value={details.restaurantType}
                  onChange={(e) => setDetails((d) => ({ ...d, restaurantType: e.target.value }))}
                >
                  <option value="Fine Dining">Fine Dining</option>
                  <option value="Casual Dine-in">Casual Dine-in</option>
                  <option value="QSR / Fast Food">QSR / Quick Service</option>
                  <option value="Cafe & Bakery">Cafe & Bakery</option>
                  <option value="Cloud Kitchen">Cloud Kitchen / Delivery Only</option>
                </select>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>GSTIN (Tax Number)</label>
                <input
                  value={details.gstin}
                  onChange={(e) => setDetails((d) => ({ ...d, gstin: e.target.value.toUpperCase() }))}
                  placeholder="24AAAAA0000A1Z5"
                />
              </div>
              <div className="field">
                <label>FSSAI License Number</label>
                <input
                  value={details.fssaiNumber}
                  onChange={(e) => setDetails((d) => ({ ...d, fssaiNumber: e.target.value }))}
                  placeholder="14-digit FSSAI number"
                />
              </div>
              <div className="field">
                <label>City *</label>
                <input
                  value={details.city}
                  onChange={(e) => setDetails((d) => ({ ...d, city: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>State *</label>
                <input
                  value={details.state}
                  onChange={(e) => setDetails((d) => ({ ...d, state: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>Street Address</label>
                <input
                  value={details.address}
                  onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))}
                  placeholder="Street, Landmark, Area"
                />
              </div>
              <div className="field">
                <label>Country</label>
                <input
                  value={details.country}
                  onChange={(e) => setDetails((d) => ({ ...d, country: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => navigate('/restaurants')}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Next: Owner Credentials →
              </Button>
            </div>
          </form>
        )}

        {/* STEP 2: OWNER ACCOUNT */}
        {step === 'owner' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep('plan');
            }}
            className="modal-form"
          >
            <div className="form-section-title">
              <Users className="w-4 h-4 text-[#e66817]" />
              <span>Restaurant Owner & Master Administrator Credentials</span>
            </div>
            <p className="form-subtext">
              The owner will hold the primary administrative login for Restaurant Admin and management reports.
            </p>

            <div className="form-grid">
              <div className="field">
                <label>Owner Full Name *</label>
                <input
                  value={owner.ownerName}
                  onChange={(e) => setOwner((o) => ({ ...o, ownerName: e.target.value }))}
                  placeholder="e.g. Rajesh Patel"
                  required
                />
              </div>
              <div className="field">
                <label>Owner Email Address (Login Username) *</label>
                <input
                  type="email"
                  value={owner.ownerEmail}
                  onChange={(e) => setOwner((o) => ({ ...o, ownerEmail: e.target.value }))}
                  placeholder="owner@royalhaveli.com"
                  required
                />
              </div>
              <div className="field">
                <label>Contact Mobile Number</label>
                <input
                  value={owner.ownerPhone}
                  onChange={(e) => setOwner((o) => ({ ...o, ownerPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                padding: '16px 20px',
                borderRadius: 12,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Initial Account Access Setup
              </div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={owner.passwordMode === 'set_now'}
                    onChange={() => setOwner((o) => ({ ...o, passwordMode: 'set_now' }))}
                  />
                  <span>
                    <strong>Set Temporary Password Now</strong> (Recommended for quick onboarding)
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={owner.passwordMode === 'invite'}
                    onChange={() => setOwner((o) => ({ ...o, passwordMode: 'invite' }))}
                  />
                  <span>Send Email Invitation Link</span>
                </label>
              </div>

              {owner.passwordMode === 'set_now' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 440 }}>
                  <input
                    type="text"
                    value={owner.initialPassword}
                    onChange={(e) => setOwner((o) => ({ ...o, initialPassword: e.target.value }))}
                    placeholder="Enter temporary password"
                    required
                    style={{ fontFamily: 'monospace', fontWeight: 700 }}
                  />
                  <Button type="button" variant="ghost" onClick={handleRegeneratePassword} title="Generate random password">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Regenerate
                  </Button>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => setStep('details')}>
                ← Back
              </Button>
              <Button type="submit" variant="primary">
                Next: Subscription Plan →
              </Button>
            </div>
          </form>
        )}

        {/* STEP 3: PLAN SELECTION */}
        {step === 'plan' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep('modules');
            }}
            className="modal-form"
          >
            <div className="form-section-title">
              <Sparkles className="w-4 h-4 text-[#e66817]" />
              <span>Select Subscription Plan Tier & Commercial Terms</span>
            </div>
            <p className="form-subtext">
              The assigned plan dictates which applications and entitlements the restaurant can execute.
            </p>

            {/* Plan Cards Grid */}
            <div className="plan-cards-grid">
              {plans.map((p) => {
                const isSelected = planForm.planId === p.id;
                const isPro = p.tier === 'PRO';
                const monthlyPrice = p.priceMonthly / 100;
                return (
                  <div
                    key={p.id}
                    className={`plan-select-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPlan(p)}
                  >
                    {isPro && <div className="plan-card-popular-badge">MOST POPULAR • ALL FEATURES</div>}
                    <div className="plan-card-title">{p.name}</div>
                    <div className="plan-card-price">
                      ₹{monthlyPrice.toLocaleString('en-IN')}
                      <span>/ month</span>
                    </div>
                    <div className="plan-card-desc">
                      {p.description ||
                        (isPro
                          ? 'Full restaurant operating system with Captain ordering, QR dining, KDS, and multi-terminal management.'
                          : 'Essential billing and local counter management for single-branch restaurants.')}
                    </div>

                    <ul className="plan-features-list">
                      <li className="plan-feature-item">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Up to {p.maxBranches} Physical Branch</span>
                      </li>
                      <li className="plan-feature-item">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Up to {p.maxDevices} Registered Devices</span>
                      </li>
                      <li className="plan-feature-item">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Offline Local POS Billing Engine</span>
                      </li>
                      <li className="plan-feature-item">
                        {isPro ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-bold">✕</span>
                        )}
                        <span className={isPro ? 'font-bold text-[#0b253a]' : 'text-slate-400 line-through'}>
                          Captain Wireless Waiter App
                        </span>
                      </li>
                      <li className="plan-feature-item">
                        {isPro ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-bold">✕</span>
                        )}
                        <span className={isPro ? 'font-bold text-[#0b253a]' : 'text-slate-400 line-through'}>
                          QR Table Ordering & Standees
                        </span>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Commercial terms */}
            <div className="form-grid" style={{ marginTop: 16 }}>
              <div className="field">
                <label>Subscription Status</label>
                <select
                  value={planForm.status}
                  onChange={(e) => setPlanForm((f) => ({ ...f, status: e.target.value as 'TRIAL' | 'ACTIVE' }))}
                >
                  <option value="ACTIVE">ACTIVE (Paid Commercial License)</option>
                  <option value="TRIAL">TRIAL (Evaluation Period)</option>
                </select>
              </div>

              <div className="field">
                <label>Initial License Validity (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={planForm.durationDays}
                  onChange={(e) => setPlanForm((f) => ({ ...f, durationDays: e.target.value }))}
                  required
                />
              </div>

              <div className="field">
                <label>Billing Cycle</label>
                <select
                  value={planForm.billingCycle}
                  onChange={(e) => setPlanForm((f) => ({ ...f, billingCycle: e.target.value as 'monthly' | 'yearly' }))}
                >
                  <option value="monthly">Monthly Recurring</option>
                  <option value="yearly">Annual Prepayment (10% Discount)</option>
                </select>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => setStep('owner')}>
                ← Back
              </Button>
              <Button type="submit" variant="primary" disabled={!planForm.planId}>
                Next: Branches & Limits →
              </Button>
            </div>
          </form>
        )}

        {/* STEP 4: MODULES & HARDWARE LIMITS */}
        {step === 'modules' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep('activation');
            }}
            className="modal-form"
          >
            <div className="form-section-title">
              <Building2 className="w-4 h-4 text-[#e66817]" />
              <span>Initial Branch & Hardware Quotas</span>
            </div>
            <p className="form-subtext">
              Configure initial branch deployment settings and maximum device thresholds permitted by the plan.
            </p>

            <div className="form-grid">
              <div className="field">
                <label>Primary Branch Name *</label>
                <input
                  value={modulesForm.branchName}
                  onChange={(e) => setModulesForm((m) => ({ ...m, branchName: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>Branch Identifier Code *</label>
                <input
                  value={modulesForm.branchCode}
                  onChange={(e) => setModulesForm((m) => ({ ...m, branchCode: e.target.value.toUpperCase() }))}
                  required
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
              <div className="field">
                <label>Branch Limit (Plan Maximum: {selectedPlan?.maxBranches || 1})</label>
                <input
                  type="number"
                  min={1}
                  max={selectedPlan?.maxBranches || 1}
                  value={modulesForm.maxBranches}
                  onChange={(e) => setModulesForm((m) => ({ ...m, maxBranches: Number(e.target.value) }))}
                  required
                />
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Max Registered Devices (Plan Maximum: {selectedPlan?.maxDevices || 5})</label>
                <input
                  type="number"
                  min={1}
                  max={selectedPlan?.maxDevices || 20}
                  value={modulesForm.maxDevices}
                  onChange={(e) => setModulesForm((m) => ({ ...m, maxDevices: Number(e.target.value) }))}
                  required
                />
              </div>
            </div>

            {/* Plan Entitlement Summary Tags */}
            <div
              style={{
                marginTop: 20,
                padding: '16px',
                borderRadius: 12,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>
                Included Application Entitlements ({selectedPlan?.name || 'Selected Plan'}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedPlan &&
                  Object.entries(selectedPlan.entitlements)
                    .filter(([_, enabled]) => enabled)
                    .map(([key]) => (
                      <span
                        key={key}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Check className="w-3 h-3 text-emerald-600" />
                        {ENTITLEMENT_LABELS[key as EntitlementKey] || key}
                      </span>
                    ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => setStep('plan')}>
                ← Back
              </Button>
              <Button type="submit" variant="primary">
                Next: Device Provisioning →
              </Button>
            </div>
          </form>
        )}

        {/* STEP 5: DEVICE PROVISIONING */}
        {step === 'activation' && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep('review');
            }}
            className="modal-form"
          >
            <div className="form-section-title">
              <Laptop2 className="w-4 h-4 text-[#e66817]" />
              <span>Pre-Generate Hardware Activation Keys</span>
            </div>
            <p className="form-subtext">
              Select which hardware station keys to automatically generate now for the customer's Welcome Kit.
            </p>

            <div className="device-key-picker">
              <label className="device-key-option">
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('POS')}
                  onChange={() => handleDeviceTypeToggle('POS')}
                />
                <div>
                  <div className="device-key-option-label">Main Billing POS</div>
                  <div className="device-key-option-desc">Windows / Desktop Counter Terminal</div>
                </div>
              </label>

              <label className="device-key-option">
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('CAPTAIN')}
                  onChange={() => handleDeviceTypeToggle('CAPTAIN')}
                />
                <div>
                  <div className="device-key-option-label">Captain Tablet</div>
                  <div className="device-key-option-desc">Wireless Table-Side Waiter Order Pad</div>
                </div>
              </label>

              <label className="device-key-option">
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('KDS')}
                  onChange={() => handleDeviceTypeToggle('KDS')}
                />
                <div>
                  <div className="device-key-option-label">Kitchen Display (KDS)</div>
                  <div className="device-key-option-desc">Chef Screen / Kitchen Order Screen</div>
                </div>
              </label>

              <label className="device-key-option">
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('KIOSK')}
                  onChange={() => handleDeviceTypeToggle('KIOSK')}
                />
                <div>
                  <div className="device-key-option-label">Self-Order Kiosk</div>
                  <div className="device-key-option-desc">Customer Touchscreen Kiosk</div>
                </div>
              </label>
            </div>

            <div className="form-grid" style={{ marginTop: 20 }}>
              <div className="field">
                <label>Key Redemption Validity Window (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={activationForm.expiryDays}
                  onChange={(e) => setActivationForm((f) => ({ ...f, expiryDays: e.target.value }))}
                  required
                />
                <span className="text-xs text-slate-500 mt-1">
                  Keys will expire if not redeemed on hardware within this timeframe.
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => setStep('modules')}>
                ← Back
              </Button>
              <Button type="submit" variant="primary" disabled={activationForm.deviceTypes.length === 0}>
                Next: Review & Launch →
              </Button>
            </div>
          </form>
        )}

        {/* STEP 6: REVIEW & FINAL LAUNCH */}
        {step === 'review' && (
          <div className="modal-form">
            <div className="form-section-title">
              <ShieldCheck className="w-4 h-4 text-[#e66817]" />
              <span>Review Commercial Contract & Onboarding Details</span>
            </div>
            <p className="form-subtext">
              Confirm restaurant details before provisioning the cloud database and generating the customer Welcome Kit.
            </p>

            <div className="credentials-box">
              <div className="credentials-grid">
                <div className="credential-item">
                  <span className="credential-label">Restaurant Trade Name</span>
                  <span className="credential-value">{details.name}</span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">City, State</span>
                  <span className="credential-value">
                    {[details.city, details.state].filter(Boolean).join(', ')} ({details.country})
                  </span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">GSTIN / FSSAI</span>
                  <span className="credential-value">{details.gstin || details.fssaiNumber || 'Standard Unregistered'}</span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Primary Owner</span>
                  <span className="credential-value">{owner.ownerName}</span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Owner Login Email</span>
                  <span className="credential-value">{owner.ownerEmail}</span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Temporary Password</span>
                  <span className="credential-value" style={{ color: '#e66817' }}>
                    {owner.passwordMode === 'set_now' ? owner.initialPassword : 'Invitation token (generated on submit)'}
                  </span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Assigned Plan Tier</span>
                  <span className="credential-value" style={{ color: '#059669' }}>
                    {selectedPlan?.name} (₹{((selectedPlan?.priceMonthly || 0) / 100).toLocaleString('en-IN')}/mo)
                  </span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Subscription Term</span>
                  <span className="credential-value">
                    {planForm.status} • {planForm.durationDays} Days ({planForm.billingCycle})
                  </span>
                </div>
                <div className="credential-item">
                  <span className="credential-label">Hardware Keys to Issue</span>
                  <span className="credential-value">{activationForm.deviceTypes.join(', ')}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="login-error" style={{ marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button type="button" variant="ghost" onClick={() => setStep('activation')} disabled={processing}>
                ← Back
              </Button>
              <Button type="button" variant="primary" onClick={runOnboarding} disabled={processing}>
                {processing ? '⚡ Provisioning Restaurant & Issuing Keys…' : '⚡ Activate Restaurant & Issue Welcome Kit'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 7 / DONE: OFFICIAL WELCOME KIT & HANDOVER PACKAGE */}
        {step === 'done' && (
          <div className="welcome-kit-container">
            {/* Stationery Header */}
            <div className="welcome-kit-banner">
              <img
                src={JAMANVAAR_LOGOS.horizontal}
                alt="JAMANVAAR by KELVIONTECH"
                style={{ height: 44, width: 'auto', margin: '0 auto', display: 'block' }}
              />
              <div className="welcome-kit-title">{details.name}</div>
              <div className="welcome-kit-subtitle">
                Official SaaS Welcome Kit &amp; Hardware Activation Package
              </div>
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 9999,
                    backgroundColor: provisioningWarnings.length === 0 ? '#ecfdf5' : '#fef2f2',
                    color: provisioningWarnings.length === 0 ? '#047857' : '#991b1b',
                    border: `1px solid ${provisioningWarnings.length === 0 ? '#a7f3d0' : '#fecaca'}`
                  }}
                >
                  {provisioningWarnings.length === 0
                    ? '✓ VERIFIED & ACTIVE ON JAMANVAAR CLOUD'
                    : `⚠ ACTIVE WITH ${provisioningWarnings.length} STEP${provisioningWarnings.length > 1 ? 'S' : ''} NEEDING ATTENTION`}
                </span>
              </div>
            </div>

            {provisioningWarnings.length > 0 && (
              <div
                style={{
                  margin: '16px 0',
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>
                  The restaurant was created, but these steps did not complete:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                  {provisioningWarnings.map((w, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Owner Credentials Card */}
            <div className="credentials-box">
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0b253a', marginBottom: 12 }}>
                1. Restaurant Admin Console Credentials
              </div>
              <div className="credentials-grid">
                <div className="credential-item">
                  <span className="credential-label">Restaurant ID</span>
                  <div className="credential-value">
                    <span>{restaurantId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(restaurantId || '', 'Restaurant ID')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <span className="credential-label">Admin Portal URL</span>
                  <div className="credential-value">
                    <span>http://localhost:5176</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('http://localhost:5176', 'Portal URL')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <span className="credential-label">Owner Login Email</span>
                  <div className="credential-value">
                    <span>{owner.ownerEmail}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(owner.ownerEmail, 'Login Email')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <span className="credential-label">Initial Password</span>
                  <div className="credential-value" style={{ color: '#e66817' }}>
                    <span>{owner.passwordMode === 'set_now' ? owner.initialPassword : 'Set by owner (see invitation token below)'}</span>
                    {owner.passwordMode === 'set_now' && (
                      <button
                        type="button"
                        onClick={() => handleCopy(owner.initialPassword, 'Password')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {owner.passwordMode === 'invite' && (
                  <div className="credential-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="credential-label">
                      Invitation Token — send this to the owner yourself; there is no automatic email
                    </span>
                    <div className="credential-value" style={{ color: '#e66817', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                      <span>{ownerActivationToken ?? 'Unavailable — password activation step failed, see warning above'}</span>
                      {ownerActivationToken && (
                        <button
                          type="button"
                          onClick={() => handleCopy(ownerActivationToken, 'Invitation token')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                          title="Copy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hardware Activation Codes & QR Stamps */}
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0b253a', marginBottom: 12 }}>
              2. Pre-Generated Device Activation Keys
            </div>
            <div className="device-keys-grid">
              {provisionedKeys.map((k) => (
                <div key={k.id} className="device-key-card">
                  <div className="device-key-type-tag">{k.deviceType} TERMINAL</div>
                  <div
                    className="device-qr-wrapper"
                    dangerouslySetInnerHTML={{ __html: k.qrSvg }}
                    title={`Scan QR to activate ${k.deviceType}`}
                  />
                  <div className="device-code-pill">{k.code}</div>
                  <Button
                    variant="ghost"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => handleCopy(k.code, `${k.deviceType} Key`)}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Code
                  </Button>
                </div>
              ))}
            </div>

            {/* Handover Toolbar */}
            <div className="welcome-actions-bar">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-1.5" />
                  Print Official Welcome Kit
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleCopy(getHandoverWhatsAppText(), 'WhatsApp Handover Message')}
                >
                  <Copy className="w-4 h-4 mr-1.5" />
                  Copy WhatsApp / Email Greeting
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="accent" onClick={() => navigate(`/restaurants/${restaurantId}`)}>
                  Manage Restaurant Detail →
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
