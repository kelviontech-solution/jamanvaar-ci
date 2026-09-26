import { RESTAURANT_ADMIN_URL, KIOSK_ADMIN_URL } from '../../lib/appUrls';
// Deep import, not the '@jamanvaar/ui' barrel (see layout/ProtectedLayout.tsx).
import { printElement } from '../../../../../packages/ui/src/printElement';
import { useCopied } from '../../components/CopyButton';
import React, { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Plan, EntitlementKey, AppCode } from '../../api/types';
import { ENTITLEMENT_LABELS, APP_CODES, APP_CODE_LABELS } from '../../api/types';
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
  RefreshCw,
  Plus
} from 'lucide-react';
import '../../components/shared.css';
import './onboarding.css';

/**
 * Replaces the old 'Jaman@' + 4-digit-random pattern (36 characters of real
 * entropy shared by every restaurant, distinguished only by a guessable
 * 4-digit suffix) with a genuinely random password drawn from the Web Crypto
 * API — still readable/typeable for an operator relaying it by phone.
 */
function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O — avoid confusion with 1/0
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // no l
  const digits = '23456789'; // no 0/1
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;

  const randomFrom = (charset: string) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return charset[bytes[0] % charset.length];
  };

  // Guarantee at least one of each class, then fill the rest randomly.
  const required = [randomFrom(upper), randomFrom(lower), randomFrom(digits), randomFrom(symbols)];
  const rest = Array.from({ length: 8 }, () => randomFrom(all));
  const chars = [...required, ...rest];

  // Fisher-Yates shuffle so the required chars aren't always in the same 4 positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)) * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

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
  /** The restaurant's registered 10-digit mobile; the customer-facing Restaurant ID (JM + mobile) is made from it. */
  mobile: string;
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
  // Which applications this restaurant actually gets provisioned with —
  // previously this step only ever displayed the plan's entitlements as
  // read-only pills; this is now a real selection sent to POST
  // /subscriptions as `applications`, which creates the ApplicationEntitlement
  // rows every app is gated against (see application-entitlements.service.ts).
  applications: AppCode[];
  // JAMAN AI for this restaurant (BUG-057): follow the plan, or ON / LOCKED (teaser) / OFF (hidden).
  aiState?: 'PLAN' | 'ON' | 'LOCKED' | 'OFF';
}

interface ActivationForm {
  deviceTypes: Array<'ANY' | 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN'>;
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
  mobile: '',
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
  initialPassword: generateSecurePassword()
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
  maxDevices: 5,
  applications: [],
  aiState: 'PLAN'
};

// Left empty rather than a fixed guess — the modules step (which knows the
// actual entitled apps for this plan/tier) fills this in when the operator
// advances past it, so a Kiosk-entitled restaurant gets KIOSK_ADMIN
// pre-checked instead of relying on the operator to notice and check it
// themselves (see BUG-001: KIOSK_ADMIN key silently never got generated).
const EMPTY_ACTIVATION: ActivationForm = {
  deviceTypes: [],
  expiryDays: '30'
};

// A half-filled onboarding form used to simply vanish on any navigation
// away (back button, accidental refresh, closing the tab) — everything
// lived in plain useState with nothing backing it. This is the shape of
// what gets saved as a resumable draft in localStorage. Provisioned keys
// and other one-time-shown secrets are deliberately excluded: re-deriving
// or re-issuing those isn't safe/idempotent, so a resumed draft re-enters
// at whichever step the admin was on and re-runs that step's own action.
const ONBOARDING_DRAFT_KEY = 'jamanvaar_onboarding_draft_v1';

interface OnboardingDraft {
  step: Step;
  details: DetailsForm;
  owner: OwnerForm;
  planForm: PlanForm;
  modulesForm: ModulesForm;
  activationForm: ActivationForm;
  restaurantId: string | null;
  ownerActivationToken: string | null;
  inviteEmailSent: boolean;
  subscriptionId: string | null;
  savedAt: string;
}

export function OnboardRestaurantPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('details');
  const [details, setDetails] = useState<DetailsForm>(EMPTY_DETAILS);
  const [owner, setOwner] = useState<OwnerForm>(EMPTY_OWNER);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN);
  // Platform Settings -> "Default Trial Duration". Not every role can read settings; then 14 days is used.
  const [trialDefaultDays, setTrialDefaultDays] = useState(14);
  useEffect(() => {
    api
      .get<Array<{ key: string; value: { trialDurationDays?: number } }>>('/api/v1/platform/settings')
      .then((rows) => {
        const days = rows.find((r) => r.key === 'platform.defaults')?.value?.trialDurationDays;
        if (typeof days === 'number' && days > 0) setTrialDefaultDays(days);
      })
      .catch(() => {});
  }, []);
  const [modulesForm, setModulesForm] = useState<ModulesForm>(EMPTY_MODULES);
  const [activationForm, setActivationForm] = useState<ActivationForm>(EMPTY_ACTIVATION);
  const [plans, setPlans] = useState<Plan[]>([]);

  // Execution state & outputs
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantCode, setRestaurantCode] = useState<string | null>(null);
  // Shown to the operator regardless of email outcome — this is the only way
  // the owner can self-activate via pos-admin's invitation-token flow, and
  // when passwordMode is 'invite' it's also what gets emailed to them
  // (inviteEmailSent says whether that actually went out).
  const [ownerActivationToken, setOwnerActivationToken] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  // Draft resume: a previous incomplete session's saved state, offered to
  // the admin on mount rather than silently auto-applied — so navigating
  // back in here deliberately to start a *different* restaurant doesn't
  // get unexpectedly hijacked by an old draft.
  const [pendingDraft, setPendingDraft] = useState<OnboardingDraft | null>(null);
  const [draftResolved, setDraftResolved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OnboardingDraft;
        if (parsed && parsed.step && parsed.step !== 'done') {
          setPendingDraft(parsed);
          return;
        }
      }
    } catch {
      // Corrupt/unreadable draft — treat as no draft rather than crash the page.
    }
    setDraftResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resumeDraft() {
    if (!pendingDraft) return;
    setStep(pendingDraft.step);
    setDetails(pendingDraft.details);
    setOwner(pendingDraft.owner);
    setPlanForm(pendingDraft.planForm);
    setModulesForm(pendingDraft.modulesForm);
    setActivationForm(pendingDraft.activationForm);
    setRestaurantId(pendingDraft.restaurantId);
    setOwnerActivationToken(pendingDraft.ownerActivationToken);
    setInviteEmailSent(pendingDraft.inviteEmailSent);
    setSubscriptionId(pendingDraft.subscriptionId);
    setPendingDraft(null);
    setDraftResolved(true);
  }

  function discardDraft() {
    try {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // ignore
    }
    setPendingDraft(null);
    setDraftResolved(true);
  }

  // Autosave — runs after the draft prompt (if any) has been resolved one
  // way or the other, so it never overwrites a not-yet-reviewed draft with
  // the fresh blank form the page mounted with.
  useEffect(() => {
    if (!draftResolved) return;
    if (step === 'done') {
      try {
        localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      } catch {
        // ignore
      }
      return;
    }
    const draft: OnboardingDraft = {
      step,
      details,
      owner,
      planForm,
      modulesForm,
      activationForm,
      restaurantId,
      ownerActivationToken,
      inviteEmailSent,
      subscriptionId,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full/unavailable — draft-saving is a convenience, not a
      // requirement, so fail silently rather than block the wizard.
    }
  }, [draftResolved, step, details, owner, planForm, modulesForm, activationForm, restaurantId, ownerActivationToken, inviteEmailSent, subscriptionId]);
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
      .get<Plan[]>('/api/v1/plans?excludeTestFixtures=true')
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
    // Applications pre-selected for a previously chosen plan must not carry over to this one.
    setModulesForm((m) => ({ ...m, applications: [] }));
    setModulesForm((m) => ({
      ...m,
      maxBranches: plan.maxBranches,
      maxDevices: plan.maxDevices
    }));
  }

  function handleDeviceTypeToggle(type: 'ANY' | 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN') {
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
      initialPassword: generateSecurePassword()
    }));
  }

  // A real tick on the button that was clicked (only when the copy worked), plus a toast
  // that stays on screen wherever the page is scrolled to.
  const { copy: copyWithTick, isCopied } = useCopied();
  async function handleCopy(text: string, label: string) {
    const ok = await copyWithTick(text, label);
    setCopyToast(ok ? `Copied ${label} to clipboard!` : `Could not copy ${label} automatically. Select it and press Ctrl+C.`);
    setTimeout(() => setCopyToast(null), 3000);
  }

  function handlePrint() {
    printElement('.welcome-kit-container', { title: 'Welcome kit', pageSize: 'A4 portrait' });
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
          restaurant: { id: string; restaurantCode?: string | null };
          owner: { id: string; email: string };
          activationToken: string;
          emailSent: boolean;
        }>(
          '/api/v1/restaurants',
          {
            name: details.name,
            mobile: details.mobile.trim(),
            legalName: details.legalName || undefined,
            gstin: details.gstin || undefined,
            fssaiNumber: details.fssaiNumber || undefined,
            address: details.address || undefined,
            city: details.city || undefined,
            state: details.state || undefined,
            country: details.country,
            ownerName: owner.ownerName,
            ownerEmail: owner.ownerEmail,
            ownerPhone: owner.ownerPhone || undefined,
            // "Set now": the password goes in with the creation, so the owner starts ACTIVE and the server emails
            // them the Restaurant ID, login and this first password. Otherwise the server emails an invitation token.
            ...(owner.passwordMode === 'set_now' && owner.initialPassword.trim() ? { ownerPassword: owner.initialPassword.trim() } : {})
          }
        );
        rId = res.restaurant.id;
        setRestaurantId(rId);
        setRestaurantCode(res.restaurant.restaurantCode ?? null);
        setOwnerActivationToken(res.activationToken);
        setInviteEmailSent(res.emailSent);

      }

      let sId = subscriptionId;
      if (!sId && selectedPlan) {
        const days = Number(planForm.durationDays) || 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const sub = await api.post<{ id: string }>('/api/v1/subscriptions', {
          restaurantId: rId,
          planId: selectedPlan.id,
          status: planForm.status,
          expiresAt,
          applications: modulesForm.applications
        });
        sId = sub.id;
        setSubscriptionId(sId);

        // JAMAN AI is decided per restaurant. 'Follow the plan' needs no call.
        if (modulesForm.aiState && modulesForm.aiState !== 'PLAN') {
          try {
            await api.patch(`/api/v1/ai-assistant/restaurants/${rId}/access`, { state: modulesForm.aiState });
          } catch {
            // The restaurant exists either way; it can be changed later on the JAMAN AI page.
          }
        }

        // The server issues the one initial invoice when the subscription is assigned.
        // (The wizard used to post a second, identical invoice here - BUG-050.)
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
      // BUG-054: prefer the specific field error (e.g. an invalid GSTIN) over the generic message.
      setError(err instanceof ApiError ? err.issues?.[0]?.message || err.message : 'Onboarding failed — please review error and retry.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleGenerateKeysOnDone() {
    if (!restaurantId) return;
    setProcessing(true);
    try {
      const results: ProvisionedKey[] = [];
      const types = activationForm.deviceTypes.length > 0 ? activationForm.deviceTypes : (['POS', 'CAPTAIN', 'KDS'] as Array<'POS' | 'CAPTAIN' | 'KDS'>);
      const keyExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      for (const type of types) {
        const keyRes = await api.post<{ id: string; code: string; allowedDeviceType: string }>(
          '/api/v1/activation-keys',
          {
            restaurantId,
            subscriptionId,
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
      }
      setProvisionedKeys(results);
      setCopyToast('Generated activation keys successfully!');
    } catch (err) {
      console.error('Failed to generate keys on done:', err);
    } finally {
      setProcessing(false);
    }
  }

  function getHandoverWhatsAppText(): string {
    const hasKioskAdmin = provisionedKeys.some((k) => k.deviceType === 'KIOSK_ADMIN');
    const lines = [
      `*WELCOME TO JAMANVAAR RESTAURANT PLATFORM*`,
      `Namaste ${owner.ownerName},`,
      `Your restaurant *${details.name}* is officially onboarded and activated on JAMANVAAR SaaS.`,
      ``,
      `*YOUR RESTAURANT ADMIN CREDENTIALS:*`,
      `• Restaurant Admin Portal (POS/Captain/KDS): ${RESTAURANT_ADMIN_URL}`,
      ...(hasKioskAdmin ? [`• Kiosk Admin Portal: ${KIOSK_ADMIN_URL}`] : []),
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
      `1. Open Restaurant Admin on your manager PC (${RESTAURANT_ADMIN_URL}).`,
      `2. Go to Subscription / Activation and enter your activation key.`,
      `3. Enter your login credentials to verify your live menu and POS terminals.`,
      ...(hasKioskAdmin
        ? [
            `4. To manage your self-order kiosks, open the Kiosk Admin console (${KIOSK_ADMIN_URL}) and enter your KIOSK_ADMIN key.`,
            `5. For assistance, contact KELVIONTECH Platform Support.`
          ]
        : [`4. For assistance, contact KELVIONTECH Platform Support.`])
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

      {/* ── RESUME DRAFT PROMPT ── a half-filled form used to just vanish
          on any navigation away; this offers the saved draft back rather
          than silently applying or silently discarding it. */}
      {pendingDraft && (
        <div className="onboard-draft-banner">
          <div>
            <strong>Unfinished onboarding draft found</strong>
            <span>
              {' '}
              — "{pendingDraft.details.name || 'Untitled restaurant'}", last edited{' '}
              {new Date(pendingDraft.savedAt).toLocaleString('en-IN')} (step: {STEPS.find((s) => s.key === pendingDraft.step)?.label}).
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={resumeDraft}>
              Resume Draft
            </Button>
            <Button variant="ghost" onClick={discardDraft}>
              Discard & Start Fresh
            </Button>
          </div>
        </div>
      )}

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
          role="status"
          className="no-print"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
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
                <label>Restaurant Mobile Number * (makes the Restaurant ID)</label>
                <input
                  value={details.mobile ?? ''}
                  onChange={(e) => setDetails((d) => ({ ...d, mobile: e.target.value.replace(/[^0-9+ ]/g, '') }))}
                  placeholder="10-digit mobile, e.g. 9876543210"
                  inputMode="tel"
                  required
                  pattern="(\+?91)?[ ]?[6-9][0-9]{9}"
                  title="A valid 10-digit Indian mobile number"
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
              setModulesForm((m) => ({
                ...m,
                applications: m.applications.length > 0 ? m.applications : (selectedPlan?.defaultApps ?? [])
              }));
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
                      {/* Self-Order Kiosk + its admin console are a real,
                          distinct AppCode pair (KIOSK / KIOSK_ADMIN) gated
                          the same way Captain/QR are — PRO-tier only per
                          the plan's computed defaultApps — but this card never listed them at
                          all, so an onboarding admin had no way to see
                          whether a plan included Kiosk. */}
                      <li className="plan-feature-item">
                        {isPro ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-bold">✕</span>
                        )}
                        <span className={isPro ? 'font-bold text-[#0b253a]' : 'text-slate-400 line-through'}>
                          Self-Order Kiosk App
                        </span>
                      </li>
                      <li className="plan-feature-item">
                        {isPro ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-bold">✕</span>
                        )}
                        <span className={isPro ? 'font-bold text-[#0b253a]' : 'text-slate-400 line-through'}>
                          Kiosk Admin Dashboard
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
                  onChange={(e) => {
                    const status = e.target.value as 'TRIAL' | 'ACTIVE';
                    // Picking TRIAL applies the platform's default trial length; going back to ACTIVE undoes only that.
                    setPlanForm((f) => ({
                      ...f,
                      status,
                      durationDays:
                        status === 'TRIAL'
                          ? String(trialDefaultDays)
                          : f.durationDays === String(trialDefaultDays)
                            ? EMPTY_PLAN.durationDays
                            : f.durationDays
                    }));
                  }}
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
              // Pre-check the hardware-key checklist to match whatever apps
              // were just entitled above — only on the first arrival (i.e.
              // deviceTypes is still empty) so a deliberate manual edit made
              // after going back and forth isn't silently clobbered.
              setActivationForm((f) => ({
                ...f,
                deviceTypes: f.deviceTypes.length > 0 ? f.deviceTypes : (modulesForm.applications as ActivationForm['deviceTypes'])
              }));
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

            {/* Application selection — this used to be a read-only display
                of whatever the plan's entitlements JSON happened to
                contain (which never included Kiosk/Kiosk Admin at all).
                It's now a real checklist: whatever is checked here is sent
                as `applications` on the subscription-assign call and
                becomes the restaurant's actual ApplicationEntitlement rows
                — the same rows activation-key generation/redemption are
                gated against. */}
            <div
              style={{
                marginTop: 20,
                padding: '16px',
                borderRadius: 12,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase' }}>
                Applications to Provision
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 0, marginBottom: 10 }}>
                Pre-selected from {selectedPlan?.name || 'the selected plan'}'s tier — uncheck anything this
                restaurant shouldn't have, or enable one the plan doesn't normally include.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {APP_CODES.map((code) => {
                  const checked = modulesForm.applications.includes(code);
                  return (
                    <label
                      key={code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: checked ? '1.5px solid #ea580c' : '1px solid #e2e8f0',
                        backgroundColor: checked ? '#fffaf5' : '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        color: checked ? '#0B253A' : '#475569'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setModulesForm((m) => ({
                            ...m,
                            applications: checked ? m.applications.filter((a) => a !== code) : [...m.applications, code]
                          }))
                        }
                      />
                      {APP_CODE_LABELS[code]}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="form-field" style={{ marginTop: 12, maxWidth: 460 }}>
              <label htmlFor="onboard-ai">JAMAN AI assistant</label>
              <select
                id="onboard-ai"
                value={modulesForm.aiState ?? 'PLAN'}
                onChange={(e) => setModulesForm((m) => ({ ...m, aiState: e.target.value as ModulesForm['aiState'] }))}
              >
                <option value="PLAN">Follow the plan (PRO: on, CORE: locked teaser)</option>
                <option value="ON">On: works</option>
                <option value="LOCKED">Locked: visible with a lock, answers nothing</option>
                <option value="OFF">Off: hidden</option>
              </select>
              <span className="muted" style={{ fontSize: 12 }}>Can be changed later, per restaurant, on the JAMAN AI page.</span>
            </div>

            {/* Plan Feature Entitlement Summary Tags (informational — the
                separate Feature Entitlements matrix still governs these) */}
            <div
              style={{
                marginTop: 12,
                padding: '16px',
                borderRadius: 12,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>
                Plan Feature Entitlements ({selectedPlan?.name || 'Selected Plan'}):
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
              {/* Was secretly submitting allowedDeviceType: 'ANY' regardless
                  of this checkbox's POS_ADMIN label — ActivationKeyDeviceType
                  now has a real POS_ADMIN value, so this issues a key
                  actually scoped to POS_ADMIN instead of one valid for any
                  device type. */}
              <label className="device-key-option" style={{ border: activationForm.deviceTypes.includes('POS_ADMIN') ? '1.5px solid #ea580c' : undefined, background: activationForm.deviceTypes.includes('POS_ADMIN') ? '#fffaf5' : undefined }}>
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('POS_ADMIN')}
                  onChange={() => handleDeviceTypeToggle('POS_ADMIN')}
                />
                <div>
                  <div className="device-key-option-label" style={{ fontWeight: 800, color: '#0b253a' }}>
                    Restaurant Admin Console (POS_ADMIN) ★
                  </div>
                  <div className="device-key-option-desc">Manager PC / Browser Management Suite ({RESTAURANT_ADMIN_URL})</div>
                </div>
              </label>

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

              {/* Kiosk Admin previously had no checkbox anywhere in this
                  wizard — there was no ActivationKeyDeviceType/DeviceType
                  value for it to redeem as, so it could never be issued a
                  key at all regardless of UI. */}
              <label className="device-key-option">
                <input
                  type="checkbox"
                  checked={activationForm.deviceTypes.includes('KIOSK_ADMIN')}
                  onChange={() => handleDeviceTypeToggle('KIOSK_ADMIN')}
                />
                <div>
                  <div className="device-key-option-label">Kiosk Admin Terminal</div>
                  <div className="device-key-option-desc">Kiosk Fleet & Self-Ordering Configuration ({KIOSK_ADMIN_URL})</div>
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
                    <span>{restaurantCode ?? restaurantId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(restaurantCode ?? restaurantId ?? '', 'Restaurant ID')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      title="Copy"
                    >
                      {isCopied('Restaurant ID') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <span className="credential-label">Restaurant Admin Portal URL (POS / Captain / KDS)</span>
                  <div className="credential-value">
                    <span>{RESTAURANT_ADMIN_URL}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(RESTAURANT_ADMIN_URL, 'Restaurant Admin Portal URL')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      title="Copy"
                    >
                      {isCopied('Restaurant Admin Portal URL') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Kiosk Admin (:5173) is a separate console from Restaurant
                    Admin (:5176) — a Kiosk-entitled restaurant was only ever
                    handed the 5176 URL, leaving the owner with no way to find
                    where to redeem their KIOSK_ADMIN key (BUG-002). */}
                {provisionedKeys.some((k) => k.deviceType === 'KIOSK_ADMIN') && (
                  <div className="credential-item">
                    <span className="credential-label">Kiosk Admin Portal URL</span>
                    <div className="credential-value">
                      <span>{KIOSK_ADMIN_URL}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(KIOSK_ADMIN_URL, 'Kiosk Admin Portal URL')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                        title="Copy"
                      >
                        {isCopied('Kiosk Admin Portal URL') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

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
                      {isCopied('Login Email') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
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
                        {isCopied('Password') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {owner.passwordMode === 'invite' && (
                  <div className="credential-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="credential-label">
                      Invitation Token —{' '}
                      {inviteEmailSent
                        ? `emailed to ${owner.ownerEmail} — also shown here as a backup`
                        : 'could not be emailed (SMTP not configured or delivery failed) — relay it to the owner yourself'}
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
                          {isCopied('Invitation token') ? <Check className="w-3.5 h-3.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hardware Activation Codes & QR Stamps */}
            <div style={{ marginTop: 24, padding: '18px 20px', borderRadius: 14, border: '1.5px solid #fed7aa', background: 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KeyRound className="w-5 h-5 text-orange-600" />
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#0b253a' }}>
                      2. Pre-Generated Device Activation Keys ({provisionedKeys.length})
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#64748b' }}>
                    Provide these keys to the restaurant owner. On first login, entering the matching key registers and
                    binds the device — <strong>POS_ADMIN / POS / CAPTAIN / KDS</strong> keys at{' '}
                    <strong>{RESTAURANT_ADMIN_URL}</strong>
                    {provisionedKeys.some((k) => k.deviceType === 'KIOSK_ADMIN') && (
                      <>
                        , and the <strong>KIOSK_ADMIN</strong> key at <strong>{KIOSK_ADMIN_URL}</strong>
                      </>
                    )}
                    .
                  </p>
                </div>

                {provisionedKeys.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const allText = provisionedKeys.map((k) => `${k.deviceType}: ${k.code}`).join(' | ');
                      handleCopy(allText, 'All Activation Keys');
                    }}
                    style={{ fontWeight: 700, color: '#ea580c' }}
                  >
                    {isCopied('All Activation Keys') ? <Check className="w-3.5 h-3.5 mr-1.5" style={{ color: '#047857' }} /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                    {isCopied('All Activation Keys') ? 'Copied' : 'Copy All Keys'}
                  </Button>
                )}
              </div>

              <div style={{ padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0', color: '#065f46', fontSize: 12.5, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>These keys are permanently saved and accessible anytime in <strong>Restaurant Details → Overview</strong> and <strong>Devices &amp; Keys</strong> tab.</span>
              </div>

              {provisionedKeys.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#fff', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
                  <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#64748b' }}>
                    No keys were provisioned yet for this restaurant.
                  </p>
                  <Button variant="accent" onClick={handleGenerateKeysOnDone} disabled={processing}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    {processing ? 'Generating Keys…' : '⚡ Generate Activation Keys Now'}
                  </Button>
                </div>
              ) : (
                <div className="device-keys-grid">
                  {provisionedKeys.map((k) => (
                    <div key={k.id} className="device-key-card" style={{ border: '1.5px solid #fed7aa', boxShadow: '0 2px 8px rgba(234, 88, 12, 0.08)' }}>
                      <div className="device-key-type-tag" style={{ background: '#ea580c', color: '#fff', fontWeight: 800 }}>
                        {k.deviceType === 'ANY' || k.deviceType === 'POS_ADMIN'
                          ? 'RESTAURANT ADMIN CONSOLE'
                          : k.deviceType === 'KIOSK_ADMIN'
                            ? 'KIOSK ADMIN CONSOLE'
                            : `${k.deviceType} TERMINAL`}
                      </div>
                      <div
                        className="device-qr-wrapper"
                        dangerouslySetInnerHTML={{ __html: k.qrSvg }}
                        title={`Scan QR to activate ${k.deviceType}`}
                      />
                      <div className="device-code-pill" style={{ fontWeight: 900, color: '#0b253a', fontSize: 14 }}>
                        {k.code}
                      </div>
                      <Button
                        variant="ghost"
                        style={{ fontSize: 11, padding: '4px 10px', color: '#ea580c', fontWeight: 700 }}
                        onClick={() => handleCopy(k.code, `${k.deviceType} Key`)}
                      >
                        {isCopied(`${k.deviceType} Key`) ? <Check className="w-3 h-3 mr-1" style={{ color: '#047857' }} /> : <Copy className="w-3 h-3 mr-1" />}
                        {isCopied(`${k.deviceType} Key`) ? 'Copied' : 'Copy Code'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                  {isCopied('WhatsApp Handover Message') ? <Check className="w-4 h-4 mr-1.5" style={{ color: '#047857' }} /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {isCopied('WhatsApp Handover Message') ? 'Copied' : 'Copy WhatsApp / Email Greeting'}
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="accent" onClick={() => navigate(`/restaurants/${restaurantId}`)}>
                  Open Restaurant Details &amp; Keys →
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
