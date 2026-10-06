import { ChangeOwnerPasswordForm } from './ChangeOwnerPasswordForm';
import React, { useEffect, useState } from 'react';
import { printElement } from '@jamanvaar/ui';
import { LicenseRepository } from '@jamanvaar/database';
import { applyLicenseCertificate } from '@jamanvaar/business';
import { PlanTier, CORE_PLAN_FEATURE_GROUPS, PRO_PLAN_FEATURE_GROUPS, countFeatures } from '@jamanvaar/types';
import {
  isCloudConnected,
  isCloudLoggedIn,
  redeemActivationCode,
  cloudLogin,
  cloudSetInitialPassword,
  fetchEntitlements,
  applyEntitlementsToLicense,
  CloudApiError,
  type CloudEntitlementsResponse,
  fetchTenantBillingSummary,
  fetchTenantInvoices,
  fetchTenantInvoiceDetail,
  fetchTenantReceipt,
  payTenantInvoice,
  type TenantBillingSummary,
  type TenantInvoice,
  type TenantReceipt
} from '../../cloud/cloudClient';
import { CloudDeviceLoginsPanel } from './CloudDeviceLoginsPanel';
import {
  Check,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  KeyRound,
  UtensilsCrossed,
  Banknote,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  HardDrive,
  Printer,
  Users,
  Settings,
  Smartphone,
  QrCode,
  Network,
  Bot,
  FileText,
  Receipt,
  CreditCard,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  type LucideIcon, X } from 'lucide-react';

// Feature groups themselves live in @jamanvaar/types/planFeatureCatalog (shared with cloud/api's
// entitlement schema) — this package has no UI dependency, so icons are resolved locally by name.
const FEATURE_GROUP_ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Banknote,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  HardDrive,
  Printer,
  Users,
  Settings,
  Smartphone,
  QrCode,
  Network,
  Bot
};

const CORE_FEATURE_COUNT = countFeatures(CORE_PLAN_FEATURE_GROUPS);
const PRO_FEATURE_COUNT = countFeatures(PRO_PLAN_FEATURE_GROUPS);

interface SubscriptionPlansViewProps {
  showToast: (msg: string) => void;
  onUpdated?: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  showToast,
  onUpdated
}) => {
  // The plan screen used to be one long scroll: cloud status, device logins,
  // two full plan cards, an upgrade-pillars section, a comparison matrix, and
  // offline certificate activation all stacked on a single page. Split into
  // tabs so each visit lands on the thing the user actually came for.
  const [activeSubTab, setActiveSubTab] = useState<'MY_PLAN' | 'BILLING_INVOICES' | 'COMPARE' | 'ACTIVATE_OFFLINE'>('MY_PLAN');
  const [dealerKeyInput, setDealerKeyInput] = useState('');
  const [licenseFeedback, setLicenseFeedback] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [expandedCoreCategory, setExpandedCoreCategory] = useState<string | null>('pos_billing');
  const [expandedProCategory, setExpandedProCategory] = useState<string | null>('captain');
  const [showAllCoreFeatures, setShowAllCoreFeatures] = useState(false);
  const [showAllProFeatures, setShowAllProFeatures] = useState(false);

  // Billing & Invoices Tab State
  const [billingSummary, setBillingSummary] = useState<TenantBillingSummary | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<TenantInvoice[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [tenantViewInvoice, setTenantViewInvoice] = useState<TenantInvoice | null>(null);
  const [tenantReceiptData, setTenantReceiptData] = useState<TenantReceipt | null>(null);
  const [payModalInvoice, setPayModalInvoice] = useState<TenantInvoice | null>(null);
  const [payMethod, setPayMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'CARD'>('UPI');
  const [payReference, setPayReference] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Cloud connection (see @jamanvaar's cloud/cloudClient.ts) — purely additive to
  // everything below; a restaurant that has never entered an activation code never
  // triggers any of this, and the existing CORE/PRO cards + dealer-key activation
  // keep working exactly as before as the offline path.
  const [cloudConnected, setCloudConnected] = useState(isCloudConnected());
  const [cloudLoggedIn, setCloudLoggedIn] = useState(isCloudLoggedIn());
  const [cloudData, setCloudData] = useState<CloudEntitlementsResponse | null>(null);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const [cloudStale, setCloudStale] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudMode, setCloudMode] = useState<'connect' | 'login' | 'set-password'>(
    isCloudConnected() ? 'login' : 'connect'
  );
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudNewPassword, setCloudNewPassword] = useState('');
  const [cloudActivationToken, setCloudActivationToken] = useState('');

  async function loadTenantBilling() {
    if (!cloudLoggedIn) return;
    setLoadingBilling(true);
    try {
      const [sum, invs] = await Promise.all([
        fetchTenantBillingSummary(),
        fetchTenantInvoices()
      ]);
      setBillingSummary(sum);
      setBillingInvoices(invs);
    } catch (err) {
      console.error('Failed to load tenant billing records', err);
    } finally {
      setLoadingBilling(false);
    }
  }

  async function refreshCloudEntitlements() {
    const result = await fetchEntitlements();
    setCloudData(result.data);
    setCloudSyncedAt(result.syncedAt);
    setCloudStale(result.stale);

    // B2-055: this "apply to LicenseRepository" step is shared with the app-level periodic sync
    // tick (App.tsx) — this screen's own useEffect only ran on mount/tab-change, so an owner not
    // currently on this exact screen kept seeing a stale plan tier (PRO-only sidebar badges, JAMAN
    // AI button) after a Super Admin downgrade. The tick now applies the same refresh regardless
    // of which screen is open; this call stays too, so this screen's own state updates immediately.
    if (result.data) {
      applyEntitlementsToLicense(result.data);
    }
    if (result.data?.planTier && result.data?.entitlements) {
      if (onUpdated) onUpdated();
    }
  }

  useEffect(() => {
    if (cloudConnected && cloudLoggedIn) {
      refreshCloudEntitlements();
      if (activeSubTab === 'BILLING_INVOICES') {
        loadTenantBilling();
      }
    }
  }, [cloudConnected, cloudLoggedIn, activeSubTab]);

  async function handlePayInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!payModalInvoice) return;
    setProcessingPayment(true);
    try {
      const res = await payTenantInvoice(payModalInvoice.id, {
        amount: payModalInvoice.totalAmount,
        method: payMethod,
        referenceNumber: payReference.trim() || undefined
      });
      showToast('Payment successful! Subscription active and tax receipt issued.');
      setPayModalInvoice(null);
      await loadTenantBilling();
      await refreshCloudEntitlements();
      if (res?.payment?.receiptNumber) {
        try {
          const rcp = await fetchTenantReceipt(payModalInvoice.id);
          setTenantReceiptData(rcp);
        } catch {}
      }
    } catch (err: any) {
      showToast(err?.message || 'Payment processing failed. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  }

  async function handleConnectSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCloudError(null);
    setCloudBusy(true);
    try {
      await redeemActivationCode(activationCodeInput.trim());
      setCloudConnected(true);
      setCloudMode('login');
      setActivationCodeInput('');
    } catch (err) {
      setCloudError(err instanceof CloudApiError ? err.message : 'Could not connect — check the code and try again.');
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCloudError(null);
    setCloudBusy(true);
    try {
      await cloudLogin(cloudEmail, cloudPassword);
      setCloudLoggedIn(true);
      setCloudPassword('');
    } catch (err) {
      setCloudError(err instanceof CloudApiError ? err.message : 'Login failed — check your email and password.');
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleSetInitialPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCloudError(null);
    setCloudBusy(true);
    try {
      await cloudSetInitialPassword(cloudEmail, cloudActivationToken.trim(), cloudNewPassword);
      await cloudLogin(cloudEmail, cloudNewPassword);
      setCloudLoggedIn(true);
      setCloudNewPassword('');
      setCloudActivationToken('');
      setCloudMode('login');
    } catch (err) {
      setCloudError(err instanceof CloudApiError ? err.message : 'Could not set password — it may already be set.');
    } finally {
      setCloudBusy(false);
    }
  }

  const currentLicense = LicenseRepository.getLicense();
  const currentTier: PlanTier = currentLicense.tier || 'CORE';

  // ENT-001 / SEC-002 fix: neither button below can activate a plan by itself any
  // more. A restaurant either (a) connects to JAMANVAAR Cloud above and gets its
  // entitlements from the real, subscription-backed endpoint, or (b) pastes a
  // signed license certificate issued by Super Admin (see handleApplyCertificate).
  // There is no third path — clicking a plan card only explains how to activate it.
  const handleActivatePlan = (tier: PlanTier) => {
    setLicenseError('');
    if (isCloudConnected()) {
      setLicenseError('This restaurant is enrolled in JAMANVAAR Cloud Control Plane. Subscription plans and feature entitlements are authoritative and must be assigned by Super Admin.');
      return;
    }
    setLicenseError(
      `To activate ${tier === 'PRO' ? 'JAMANVAAR PRO' : 'JAMANVAAR CORE'}, connect to JAMANVAAR Cloud above, or paste a signed License Certificate from Super Admin below.`
    );
  };

  const handleApplyCertificate = async () => {
    setLicenseError('');
    const cert = dealerKeyInput.trim();
    if (!cert) {
      setLicenseError('Please paste a License Certificate issued by Super Admin');
      return;
    }
    if (isCloudConnected()) {
      setLicenseError('This restaurant is enrolled in JAMANVAAR Cloud Control Plane. Use official Cloud Activation Keys from Super Admin.');
      return;
    }

    // A certificate is bound to one restaurant: a terminal that knows which restaurant it belongs to refuses any other's.
    let ownRestaurantId: string | undefined;
    try { ownRestaurantId = localStorage.getItem('jamanvaar_cloud_restaurant_id') || undefined; } catch { /* storage unavailable: no local binding to enforce */ }
    const result = await applyLicenseCertificate(cert, ownRestaurantId);
    if (!result.ok) {
      const reasons: Record<typeof result.reason, string> = {
        malformed: 'That does not look like a License Certificate — paste it exactly as Super Admin provided it.',
        'invalid-signature-or-expired': 'This License Certificate is invalid or has expired. Request a new one from Super Admin.',
        'restaurant-mismatch': 'This License Certificate was issued for a different restaurant.'
      };
      setLicenseError(reasons[result.reason]);
      return;
    }

    const msg = `License Certificate applied: activated ${result.license.planName} (verified, signed by Super Admin).`;
    setLicenseFeedback(msg);
    showToast(msg);
    setDealerKeyInput('');
    if (onUpdated) onUpdated();
    setTimeout(() => setLicenseFeedback(''), 4000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none">
      {/* Toast / Feedback Banner */}
      {licenseFeedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{licenseFeedback}</span>
          </div>
          <button
            onClick={() => setLicenseFeedback('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {licenseError && (
        <div className="p-3.5 bg-red-50 border border-red-300 text-red-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn shadow-xs">
          <span>{licenseError}</span>
          <button
            onClick={() => setLicenseError('')}
            className="text-red-700 hover:text-red-900 font-bold text-xs cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Plan Comparison Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy tracking-tight">
            JAMANVAAR Software Plans
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Commercial restaurant POS & connected restaurant ecosystem licensing by KELVIONTECH.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-brand bg-brand/[0.07] border border-brand/30 px-3.5 py-1 rounded-xl w-fit shadow-2xs">
            Active Plan: {currentLicense.planName || 'JAMANVAAR CORE'} ({currentTier})
          </span>
          <span className="text-[11px] font-bold text-slate-500 bg-jaman-cream border border-jaman-border px-3 py-1 rounded-xl w-fit">
            Monthly subscription • No commissions on your sales • Works offline
          </span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 -mt-2">
        {([
          { id: 'MY_PLAN', label: 'My Plan' },
          { id: 'BILLING_INVOICES', label: 'Billing & Invoices' },
          { id: 'COMPARE', label: 'Compare Plans' },
          { id: 'ACTIVATE_OFFLINE', label: 'Activate Offline' }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-bold tracking-tight rounded-t-xl transition-colors cursor-pointer border-b-2 -mb-px ${
              activeSubTab === tab.id
                ? 'text-brand border-brand'
                : 'text-slate-500 border-transparent hover:text-jaman-navy hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'MY_PLAN' && (
      <>
      {cloudConnected && cloudLoggedIn && <ChangeOwnerPasswordForm />}
      {/* CLOUD SUBSCRIPTION STATUS — additive, optional; everything below keeps working offline regardless */}
      <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs space-y-3">
        {!cloudConnected ? (
          <form onSubmit={handleConnectSubmit} className="space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-jaman-navy">Connect to JAMANVAAR Cloud</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter the activation code from Super Admin to see this restaurant's real, live subscription plan here.
              Optional — everything below already works without it.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={activationCodeInput}
                onChange={(e) => setActivationCodeInput(e.target.value)}
                placeholder="JMV-XXXX-XXXX-XXXX"
                className="w-full sm:flex-1 bg-jaman-cream border border-jaman-border rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-jaman-navy placeholder:text-slate-500 focus:outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={cloudBusy || !activationCodeInput.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
              >
                {cloudBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {cloudError && <div className="form-error">{cloudError}</div>}
          </form>
        ) : !cloudLoggedIn ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-bold text-jaman-navy">
                  {cloudMode === 'set-password' ? 'Set your owner password' : 'Log in to JAMANVAAR Cloud'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCloudMode(cloudMode === 'login' ? 'set-password' : 'login')}
                className="text-[11px] font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer"
              >
                {cloudMode === 'set-password' ? 'Already have a password? Log in' : 'First time? Set your password'}
              </button>
            </div>
            <form
              onSubmit={cloudMode === 'set-password' ? handleSetInitialPasswordSubmit : handleCloudLoginSubmit}
              className="form-grid"
            >
              <div className="field">
                <label>Owner email</label>
                <input type="email" value={cloudEmail} onChange={(e) => setCloudEmail(e.target.value)} required />
              </div>
              {cloudMode === 'set-password' ? (
                <>
                  <div className="field">
                    <label>Invitation token</label>
                    <input
                      type="text"
                      value={cloudActivationToken}
                      onChange={(e) => setCloudActivationToken(e.target.value)}
                      placeholder="From Super Admin — sent when this restaurant was created"
                      required
                    />
                  </div>
                  <div className="field">
                    <label>New password</label>
                    <input
                      type="password"
                      value={cloudNewPassword}
                      onChange={(e) => setCloudNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
                <button
                  type="submit"
                  disabled={cloudBusy}
                  className="w-full sm:w-auto px-6 py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  {cloudBusy ? 'Please wait…' : cloudMode === 'set-password' ? 'Set password & log in' : 'Log in'}
                </button>
              </div>
            </form>
            {cloudError && <div className="form-error">{cloudError}</div>}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-jaman-navy">
                  Cloud-Synced Plan: {cloudData?.planName ?? '—'} {cloudData?.planTier ? `(${cloudData.planTier})` : ''}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {cloudData?.subscriptionStatus
                  ? `Subscription ${cloudData.subscriptionStatus}`
                  : 'No active subscription on this restaurant yet'}
                {cloudSyncedAt &&
                  ` • ${cloudStale ? 'offline — last synced' : 'synced'} ${new Date(cloudSyncedAt).toLocaleString()}`}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshCloudEntitlements}
              className="text-[11px] font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer shrink-0"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* DEVICE & STAFF LOGINS — self-service credentials for Captain and other apps/terminals */}
      <CloudDeviceLoginsPanel />
      </>
      )}

      {activeSubTab === 'COMPARE' && (
      <>
      {/* TWO CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CARD 1: JAMANVAAR CORE (₹5,000) - 5 Cols */}
        <div
          className={`lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border flex flex-col justify-between transition-all select-none ${
            currentTier === 'CORE'
              ? 'border-jaman-navy shadow-md ring-2 ring-jaman-navy/10'
              : 'border-jaman-border shadow-2xs hover:border-slate-300'
          }`}
        >
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 block">
                  FOUNDATION EDITION
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-jaman-navy">JAMANVAAR CORE</h2>
                <span className="text-xs text-slate-600 font-bold block mt-0.5">
                  POS + Complete Restaurant Management
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl sm:text-3xl font-bold text-jaman-navy tabular-nums">₹5,000</span>
                <span className="text-[11px] text-slate-500 block">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-600 leading-relaxed bg-jaman-cream p-3 rounded-2xl border border-jaman-border">
              Complete offline-first restaurant POS for billing, payments, tables, kitchen operations, inventory and daily restaurant management.
            </p>

            {/* CORE Feature Modules Accordion */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider block">
                  INCLUDED MODULES & CAPABILITIES ({CORE_FEATURE_COUNT} FEATURES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllCoreFeatures(!showAllCoreFeatures)}
                  className="text-[11px] font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer"
                >
                  {showAllCoreFeatures ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {CORE_PLAN_FEATURE_GROUPS.map((group) => {
                const isExpanded = expandedCoreCategory === group.id || showAllCoreFeatures;

                return (
                  <div key={group.id} className="border border-jaman-border rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setExpandedCoreCategory(expandedCoreCategory === group.id ? null : group.id)}
                      className="w-full px-3.5 py-2.5 bg-jaman-cream hover:bg-slate-100 flex items-center justify-between font-bold text-xs text-jaman-navy cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                        <span>{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="text-[11px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-3 text-[11px] text-slate-700 bg-white border-t border-jaman-border">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5">
                          {group.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card Bottom / CTA */}
          <div className="pt-6 border-t border-slate-100 mt-4 space-y-2">
            <div className="text-[11px] font-bold tracking-wider uppercase text-emerald-700 text-center flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>COMPLETE RESTAURANT MANAGEMENT</span>
            </div>

            {currentTier === 'CORE' ? (
              <div className="w-full py-3 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Current Active Edition</span>
              </div>
            ) : (
              <button
                onClick={() => handleActivatePlan('CORE')}
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Switch to JAMANVAAR CORE (₹5,000)
              </button>
            )}
          </div>
        </div>

        {/* CARD 2: JAMANVAAR PRO (₹7,000) - 7 Cols - FLAGSHIP CONNECTED ECOSYSTEM */}
        <div
          className={`lg:col-span-7 bg-white rounded-2xl p-5 sm:p-7 border-2 flex flex-col justify-between transition-all select-none relative shadow-xl ${
            currentTier === 'PRO'
              ? 'border-brand ring-4 ring-brand/20 shadow-2xl'
              : 'border-brand/30 hover:border-brand'
          }`}
        >
          {/* Recommended Flagship Ribbon */}
          <div className="absolute -top-3.5 right-6 bg-brand text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>RECOMMENDED • BEST VALUE</span>
          </div>

          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-amber-200/60 pb-4">
              <div>
                <span className="text-[11px] font-bold tracking-widest uppercase text-brand block">
                  FLAGSHIP CONNECTED RESTAURANT ECOSYSTEM
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-jaman-navy flex items-center gap-2">
                  <span>JAMANVAAR PRO</span>
                </h2>
                <span className="text-xs text-slate-700 font-bold block mt-0.5">
                  POS + Restaurant Management + Connected Restaurant Ecosystem
                </span>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="flex items-baseline gap-1 sm:justify-end">
                  <span className="text-3xl sm:text-4xl font-bold text-jaman-navy tabular-nums">₹7,000</span>
                </div>
                <span className="text-[11px] text-slate-500 block font-sans">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-700 leading-relaxed font-medium bg-amber-50/40 p-3 rounded-2xl border border-amber-200/70">
              Everything in JAMANVAAR CORE plus wireless Captain ordering, QR table ordering, Kiosk integration, advanced multi-station KDS, real-time multi-device synchronization, advanced analytics, customer intelligence and JAMAN AI Assistant.
            </p>

            {/* Top Prominent Value Badges */}
            <div className="space-y-2">
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>EVERYTHING IN CORE IS INCLUDED ({CORE_FEATURE_COUNT} Base Features)</span>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-300 text-xs text-jaman-navy flex items-center justify-between gap-2 font-bold">
                <div className="flex items-center gap-1.5 text-brand">
                  <Sparkles className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>ONLY ₹2,000 MORE THAN CORE</span>
                </div>
                <span className="text-[11px] font-bold text-brand bg-white px-2.5 py-0.5 rounded-full shadow-2xs border border-amber-200">
                  RECOMMENDED • BEST VALUE
                </span>
              </div>
            </div>

            {/* PRO Feature Modules Accordion */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-brand tracking-wider block">
                  PRO CONNECTED MODULES ({PRO_FEATURE_COUNT} EXCLUSIVE CAPABILITIES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllProFeatures(!showAllProFeatures)}
                  className="text-[11px] font-bold text-brand hover:text-[#EA580C] underline cursor-pointer"
                >
                  {showAllProFeatures ? 'Collapse All PRO' : 'Expand All PRO'}
                </button>
              </div>

              {PRO_PLAN_FEATURE_GROUPS.map((group) => {
                const Icon = FEATURE_GROUP_ICONS[group.iconName];
                const isExpanded = expandedProCategory === group.id || showAllProFeatures;

                return (
                  <div
                    key={group.id}
                    className={`rounded-2xl overflow-hidden bg-white shadow-2xs transition-all ${
                      group.isFlagship
                        ? 'border-2 border-brand/60 ring-2 ring-brand/10'
                        : 'border border-amber-200/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedProCategory(expandedProCategory === group.id ? null : group.id)}
                      className={`w-full px-3.5 py-3 flex items-center justify-between font-bold text-xs cursor-pointer transition-colors ${
                        group.isFlagship
                          ? 'bg-[#FFF7F0] hover:bg-amber-50 text-jaman-navy'
                          : 'bg-[#FFFDFB] hover:bg-amber-50/50 text-jaman-navy'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-6 h-6 rounded-lg bg-orange-100 text-brand flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="tracking-tight">{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                        <span className="text-[11px] font-mono font-bold text-brand bg-[#FFF4EB] border border-[#FED7AA] px-2 py-0.5 rounded-full">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 text-[11px] text-slate-800 bg-white border-t border-amber-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                          {group.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5 stroke-[2.5]" />
                              <span className="font-medium text-slate-700">{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* PRO VALUE SUMMARY BANNER */}
            <div className="p-4 bg-jaman-navy text-white rounded-2xl shadow-md space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <strong className="text-xs font-bold tracking-wide text-amber-200">
                  "Everything you need to run a connected modern restaurant."
                </strong>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-semibold text-slate-200">
                {[
                  'Complete POS',
                  'Captain / Waiter App',
                  'QR Table Ordering',
                  'Kiosk',
                  'Advanced KDS',
                  'Real-Time Device Sync',
                  'Advanced Analytics',
                  'Customer Intelligence',
                  'JAMANA AI',
                  'Live Restaurant Monitoring'
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 stroke-[2.5]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card Bottom / Primary CTA */}
          <div className="pt-5 border-t border-amber-200/80 mt-4 space-y-2">
            <div className="text-[11px] font-bold tracking-wider uppercase text-brand text-center flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-slate-500" />
              <span>RUN + CONNECT + GROW YOUR RESTAURANT</span>
            </div>

            {currentTier === 'PRO' ? (
              <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs text-center flex items-center justify-center gap-2 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm">Active License: JAMANVAAR PRO Edition</span>
              </div>
            ) : (
              <div className="space-y-1 text-center">
                <button
                  onClick={() => handleActivatePlan('PRO')}
                  className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-hover active:bg-brand-press text-white font-bold text-sm uppercase tracking-wider shadow-xl shadow-brand/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>CHOOSE JAMANVAAR PRO — ₹7,000 →</span>
                </button>
                <span className="text-[11px] text-slate-500 font-bold block pt-0.5">
                  "Only ₹2,000 more than Core."
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: WHY RESTAURANTS UPGRADE TO PRO (4 Pillars) */}
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-2xs space-y-4">
        <div>
          <span className="text-[11px] font-bold uppercase text-brand tracking-widest block">
            COMMERCIAL ADVANTAGE
          </span>
          <h3 className="text-base font-bold text-jaman-navy">Why Restaurants Upgrade to JAMANVAAR PRO</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-brand flex items-center justify-center font-bold text-xs">
              01
            </div>
            <strong className="text-xs font-bold text-jaman-navy block">
              SERVE FROM THE TABLE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Wireless Captain App for waiters. Take orders table-side and fire KOT tickets directly to the kitchen.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              02
            </div>
            <strong className="text-xs font-bold text-jaman-navy block">
              LET CUSTOMERS ORDER
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              QR Table Ordering and Self-Service Kiosks. Increase average ticket size without hiring extra staff.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
              03
            </div>
            <strong className="text-xs font-bold text-jaman-navy block">
              CONNECT FLOOR & KITCHEN
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              POS ↔ Captain ↔ KDS real-time mesh sync. Zero miscommunication between waiters, kitchen, and billing.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-jaman-cream border border-jaman-border space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
              04
            </div>
            <strong className="text-xs font-bold text-jaman-navy block">
              RUN WITH INTELLIGENCE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Advanced analytics, staff tracking, and JAMAN AI Assistant to answer sales and operational questions in seconds.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: CORE vs PRO SIDE-BY-SIDE MATRIX */}
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-jaman-navy">CORE vs PRO — Feature Comparison Matrix</h3>
            <span className="text-[11px] text-slate-500">Every feature is backed by production-grade offline-first code.</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">OFFICIAL FEATURE MATRIX</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-jaman-border text-slate-500 font-bold text-[11px] uppercase">
                <th className="py-2.5 px-3">Software Capability</th>
                <th className="py-2.5 px-3 text-center w-36">CORE (₹5,000)</th>
                <th className="py-2.5 px-3 text-center w-48 bg-amber-50/60 text-brand">PRO (₹7,000)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { cap: 'Counter POS & Fast Billing', core: 'Included', pro: 'Included' },
                { cap: 'Payments, Multi-Tender & Split Bill', core: 'Included', pro: 'Included' },
                { cap: 'Interactive Table Management & Floor Plan', core: 'Included', pro: 'Included' },
                { cap: 'Kitchen KOT & Basic KDS Spooling', core: 'Included', pro: 'Included' },
                { cap: 'Kitchen Inventory & Stock Alerts', core: 'Included', pro: 'Included' },
                { cap: 'Daily Sales & Operational Reports', core: 'Included', pro: 'Included' },
                { cap: '100% Offline Local Engine', core: 'Included', pro: 'Included' },
                { cap: 'Wireless Captain App for Waiters', core: '—', pro: 'Full Captain Suite' },
                { cap: 'Table-Side QR Code Ordering', core: '—', pro: 'Included' },
                { cap: 'Self-Service Customer Touch Kiosk', core: '—', pro: 'Included' },
                { cap: 'Real-Time POS ↔ Captain ↔ KDS Mesh Sync', core: '—', pro: 'Instant Mesh Sync' },
                { cap: 'Advanced Multi-Station KDS', core: '—', pro: 'Station Routing' },
                { cap: 'Advanced Restaurant Analytics & Heatmaps', core: 'Basic', pro: 'Advanced Enterprise' },
                { cap: 'JAMAN AI Restaurant Assistant', core: 'Basic', pro: 'Full Conversational AI' },
                { cap: 'Customer CRM & Lifetime Value (LTV)', core: 'Basic', pro: 'Advanced Intelligence' },
                { cap: 'Smart Automation & Exception Alerts', core: 'Basic', pro: 'Real-Time Notifications' },
                { cap: 'Connected Multi-Device Health Monitoring', core: 'Basic', pro: 'Live 6-Node Mesh' }
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-jaman-navy">{row.cap}</td>
                  <td className="py-2.5 px-3 text-center text-slate-700 font-mono text-[11px]">{row.core}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-brand bg-amber-50/30 font-mono text-[11px]">
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeSubTab === 'BILLING_INVOICES' && (
        <div className="space-y-4">
          {!cloudLoggedIn ? (
            <div className="bg-white rounded-2xl p-8 border border-jaman-border shadow-2xs text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-brand flex items-center justify-center mx-auto">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-jaman-navy">Cloud Subscription Login Required</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                To view statutory GST 18% invoices, download official payment receipts, and make subscription renewal payments, please sign in to your restaurant cloud account.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('MY_PLAN')}
                className="px-5 py-2 bg-brand hover:bg-[#d45b10] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Go to Cloud Account Login
              </button>
            </div>
          ) : loadingBilling ? (
            <div className="bg-white rounded-2xl p-12 border border-jaman-border shadow-2xs text-center text-xs text-slate-500 font-bold">
              Loading subscription billing history and invoices…
            </div>
          ) : (
            <>
              {/* Top Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Current Subscription</span>
                    <Building2 className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold text-jaman-navy">
                      {billingSummary?.subscription?.planName || 'JAMANVAAR SaaS'}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        billingSummary?.subscription?.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : billingSummary?.subscription?.status === 'PAST_DUE'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {billingSummary?.subscription?.status || 'ACTIVE'}
                      </span>
                      <span className="text-xs text-slate-500 font-mono font-bold">
                        ₹{(billingSummary?.subscription?.priceMonthly || 7000).toLocaleString('en-IN')}/mo + GST
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Renewal Countdown</span>
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold text-jaman-navy">
                      {billingSummary?.subscription?.daysRemaining !== undefined
                        ? `Renews in ${billingSummary.subscription.daysRemaining} days`
                        : 'Active Lifetime'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Next billing date:{' '}
                      <strong>
                        {billingSummary?.subscription?.expiresAt
                          ? new Date(billingSummary.subscription.expiresAt).toLocaleDateString('en-IN')
                          : 'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-jaman-border shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Account Balance</span>
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold" style={{ color: (billingSummary?.totalDue || 0) > 0 ? '#dc2626' : '#059669' }}>
                      {(billingSummary?.totalDue || 0) > 0 ? `₹${billingSummary?.totalDue.toLocaleString('en-IN')} Due` : 'All Settled (₹0.00)'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Total settled: <strong>₹{(billingSummary?.totalPaid || 0).toLocaleString('en-IN')}</strong> • {billingSummary?.unpaidInvoicesCount || 0} invoice(s) pending
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoices List Table */}
              <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-jaman-navy">Statutory Tax Invoices & Receipts</h3>
                    <span className="text-[11px] text-slate-500">
                      GST-compliant commercial tax invoices issued by KELVIONTECH PRIVATE LIMITED.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={loadTenantBilling}
                    className="text-xs font-bold text-brand hover:underline cursor-pointer"
                  >
                    Refresh Records
                  </button>
                </div>

                {billingInvoices.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs">
                    No commercial invoices issued yet. When a new subscription cycle initiates, invoices will appear here automatically.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-jaman-border text-slate-500 font-bold text-[11px] uppercase">
                          <th className="py-2.5 px-3">Invoice #</th>
                          <th className="py-2.5 px-3">Plan / Description</th>
                          <th className="py-2.5 px-3">Billing Period</th>
                          <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                          <th className="py-2.5 px-3">Due Date</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billingInvoices.map((inv) => {
                          const isPaid = inv.status === 'PAID';
                          const hasPayments = inv.payments && inv.payments.length > 0;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-3 font-mono font-bold text-jaman-navy">
                                {inv.invoiceNumber}
                              </td>
                              <td className="py-3 px-3 font-medium text-jaman-navy">
                                {inv.plan?.name || 'JAMANVAAR License'}
                              </td>
                              <td className="py-3 px-3 text-slate-500 text-[11px]">
                                {new Date(inv.billingPeriodStart).toLocaleDateString('en-IN')} – {new Date(inv.billingPeriodEnd).toLocaleDateString('en-IN')}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-jaman-navy">
                                ₹{(inv.totalAmount / 100).toFixed(2)}
                                <div className="text-[11px] text-slate-500 font-normal">
                                  ₹{(inv.amount / 100).toFixed(2)} + GST
                                </div>
                              </td>
                              <td className="py-3 px-3 text-slate-600 font-medium">
                                {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  isPaid
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : inv.status === 'PAST_DUE'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {inv.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {!isPaid && inv.status !== 'VOID' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayModalInvoice(inv);
                                        setPayReference('');
                                      }}
                                      className="px-3 py-1 bg-brand hover:bg-[#d45b10] text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
                                    >
                                      Pay Now
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setTenantViewInvoice(inv)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                                  >
                                    Invoice
                                  </button>
                                  {(isPaid || hasPayments) && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const rcp = await fetchTenantReceipt(inv.id);
                                          setTenantReceiptData(rcp);
                                        } catch (err: any) {
                                          showToast(err?.message || 'Receipt not available yet');
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Receipt
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TENANT MODAL 1: PAY NOW (UPI / BANK TRANSFER SIMULATION)
          ───────────────────────────────────────────────────────────── */}
      {payModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-jaman-navy">Pay Invoice</h3>
                <span className="text-xs text-slate-500 font-mono">{payModalInvoice.invoiceNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setPayModalInvoice(null)}
                className="text-slate-500 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500">Total Payable Amount</div>
                <div className="text-2xl font-bold text-jaman-navy font-mono mt-0.5">
                  ₹{(payModalInvoice.totalAmount / 100).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">Includes 18% statutory GST</div>
              </div>
              <span className="text-[11px] font-bold bg-amber-100 text-brand px-2.5 py-1 rounded-full">
                {payModalInvoice.plan?.name || 'SaaS Renewal'}
              </span>
            </div>

            <form onSubmit={handlePayInvoice} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['UPI', 'BANK_TRANSFER', 'CARD'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className={`py-2 px-2 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        payMethod === m
                          ? 'border-brand bg-amber-50/60 text-brand'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {m === 'UPI' ? 'UPI / QR' : m === 'BANK_TRANSFER' ? 'Net Banking' : 'Card'}
                    </button>
                  ))}
                </div>
              </div>

              {payMethod === 'UPI' && (
                <div className="bg-slate-50 rounded-2xl p-3 text-xs text-slate-600 space-y-1.5 border border-slate-200">
                  <div className="font-bold text-jaman-navy">Pay using UPI:</div>
                  <div className="font-mono text-[11px] text-brand bg-white p-2 rounded-lg border border-slate-200 font-bold text-center">
                    kelviontech@hdfcbank
                  </div>
                  <div className="text-[11px] text-slate-500 text-center">
                    Scan via Google Pay, PhonePe, Paytm, or BHIM
                  </div>
                </div>
              )}

              {payMethod === 'BANK_TRANSFER' && (
                <div className="bg-slate-50 rounded-2xl p-3 text-[11px] text-slate-600 space-y-1 border border-slate-200 font-mono">
                  <div><strong>Beneficiary:</strong> KELVIONTECH PRIVATE LIMITED</div>
                  <div><strong>Bank:</strong> HDFC Bank Ltd, Science City Branch</div>
                  <div><strong>Account:</strong> 50200084920194</div>
                  <div><strong>IFSC:</strong> HDFC0001248</div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Transaction / UTR Reference Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UPI-928472938472 or NEFT-HDFC2349"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full bg-jaman-cream border border-jaman-border rounded-xl px-3.5 py-2 text-xs font-mono text-jaman-navy placeholder:text-slate-500 focus:outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalInvoice(null)}
                  disabled={processingPayment}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingPayment}
                  className="px-5 py-2 bg-brand hover:bg-[#d45b10] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  {processingPayment ? 'Processing Payment…' : 'Confirm & Renew Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TENANT MODAL 2: VIEW TAX INVOICE
          ───────────────────────────────────────────────────────────── */}
      {tenantViewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-jaman-navy">Statutory Tax Invoice</h3>
                <span className="text-xs text-slate-500 font-mono">{tenantViewInvoice.invoiceNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printElement('[data-print-doc="tenant-invoice"]', { title: 'Invoice', pageSize: 'A4 portrait' })}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTenantViewInvoice(null)}
                  className="text-slate-500 hover:text-slate-600 font-bold text-base cursor-pointer px-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Invoice Print Surface */}
            <div data-print-doc="tenant-invoice" className="p-4 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-4">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <div className="text-lg font-bold text-jaman-navy">JAMANVAAR</div>
                  <div className="text-[11px] font-bold text-slate-500">KELVIONTECH PRIVATE LIMITED</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Plot 42, Science City Road, Ahmedabad, Gujarat 380060<br />
                    GSTIN: 24AAACK7890F1ZT | SAC: 997331
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-brand uppercase">TAX INVOICE</div>
                  <div className="font-mono font-bold text-sm text-jaman-navy mt-1">{tenantViewInvoice.invoiceNumber}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Date: {new Date(tenantViewInvoice.dueDate).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">BILLED TO:</div>
                  <div className="font-bold text-jaman-navy text-xs mt-0.5">{tenantViewInvoice.restaurant?.name}</div>
                  <div className="text-[11px] text-slate-500">{tenantViewInvoice.restaurant?.city || 'India'}</div>
                  {tenantViewInvoice.restaurant?.gstin && (
                    <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                      GSTIN: {tenantViewInvoice.restaurant.gstin}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">BILLING PERIOD:</div>
                  <div className="font-medium text-jaman-navy text-xs mt-0.5">
                    {new Date(tenantViewInvoice.billingPeriodStart).toLocaleDateString('en-IN')} – {new Date(tenantViewInvoice.billingPeriodEnd).toLocaleDateString('en-IN')}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Plan: {tenantViewInvoice.plan?.name || 'JAMANVAAR SaaS'}
                  </div>
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase">
                    <th className="py-2">Description</th>
                    <th className="py-2">SAC</th>
                    <th className="py-2 text-right">Taxable (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 font-medium">{tenantViewInvoice.plan?.name || 'JAMANVAAR Subscription License'}</td>
                    <td className="py-2 font-mono">997331</td>
                    <td className="py-2 text-right font-mono font-bold">₹{(tenantViewInvoice.amount / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="border-t border-slate-200 pt-3 space-y-1 text-right font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Taxable Value:</span>
                  <span>₹{(tenantViewInvoice.amount / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Goods and Services Tax (GST 18%):</span>
                  <span>₹{(tenantViewInvoice.taxAmount / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-jaman-navy font-bold text-sm border-t border-slate-200 pt-1.5 mt-1">
                  <span>Total Payable:</span>
                  <span>₹{(tenantViewInvoice.totalAmount / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TENANT MODAL 3: VIEW OFFICIAL PAYMENT RECEIPT
          ───────────────────────────────────────────────────────────── */}
      {tenantReceiptData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-jaman-navy">Official Payment Receipt</h3>
                <span className="text-xs text-emerald-600 font-mono font-bold">{tenantReceiptData.receiptNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printElement('[data-print-doc="tenant-receipt"]', { title: 'Payment receipt', pageSize: 'A5 portrait' })}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTenantReceiptData(null)}
                  className="text-slate-500 hover:text-slate-600 font-bold text-base cursor-pointer px-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div data-print-doc="tenant-receipt" className="p-4 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-4">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <div className="text-lg font-bold text-jaman-navy">JAMANVAAR</div>
                  <div className="text-[11px] font-bold text-slate-500">KELVIONTECH PRIVATE LIMITED</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    GSTIN: 24AAACK7890F1ZT | SAC: 997331
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-emerald-600 uppercase">PAYMENT SETTLED</div>
                  <div className="font-mono font-bold text-sm text-jaman-navy mt-1">{tenantReceiptData.receiptNumber}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Date: {new Date(tenantReceiptData.paymentDate).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">RECEIVED FROM:</div>
                  <div className="font-bold text-jaman-navy text-xs mt-0.5">{tenantReceiptData.receivedFrom.restaurantName}</div>
                  <div className="text-[11px] text-slate-500">{tenantReceiptData.receivedFrom.city || 'India'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase">RECONCILIATION DETAILS:</div>
                  <div className="font-medium text-jaman-navy text-xs mt-0.5">
                    Against Invoice: <span className="font-mono font-bold">{tenantReceiptData.invoiceNumber}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Method: {tenantReceiptData.paymentMethod} • Ref: {tenantReceiptData.transactionId}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1 text-right font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Amount Settled:</span>
                  <span className="text-emerald-700 font-bold text-sm">₹{tenantReceiptData.amountPaidRupees}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Balance Outstanding:</span>
                  <span>₹0.00 (Fully Settled)</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-500 text-center">
                This official receipt confirms statutory settlement of SaaS license charges. Generated electronically by KELVIONTECH.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'ACTIVATE_OFFLINE' && (
      <>
      {/* SECTION 4: OFFLINE LICENSE CERTIFICATE ACTIVATION */}
      <div className="bg-white border border-jaman-border rounded-2xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="text-sm font-bold text-jaman-navy">Offline License Certificate</h3>
            <p className="text-[11px] text-slate-500">
              For restaurants without a live cloud connection: ask Super Admin to generate a signed License
              Certificate for this restaurant and paste it here. It is cryptographically verified — a
              plan cannot be changed without one.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={dealerKeyInput}
            onChange={(e) => setDealerKeyInput(e.target.value)}
            placeholder="Paste the License Certificate from Super Admin..."
            className="w-full sm:flex-1 bg-jaman-cream border border-jaman-border rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-jaman-navy placeholder:text-slate-500 focus:outline-none focus:border-brand"
          />

          <button
            onClick={handleApplyCertificate}
            disabled={!dealerKeyInput.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            Verify & Apply Certificate
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
