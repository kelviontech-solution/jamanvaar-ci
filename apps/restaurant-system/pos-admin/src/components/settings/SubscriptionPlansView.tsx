import React, { useEffect, useState } from 'react';
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
  CloudApiError,
  type CloudEntitlementsResponse
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
  type LucideIcon
} from 'lucide-react';

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
  const [dealerKeyInput, setDealerKeyInput] = useState('');
  const [licenseFeedback, setLicenseFeedback] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [expandedCoreCategory, setExpandedCoreCategory] = useState<string | null>('pos_billing');
  const [expandedProCategory, setExpandedProCategory] = useState<string | null>('captain');
  const [showAllCoreFeatures, setShowAllCoreFeatures] = useState(false);
  const [showAllProFeatures, setShowAllProFeatures] = useState(false);

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

  async function refreshCloudEntitlements() {
    const result = await fetchEntitlements();
    setCloudData(result.data);
    setCloudSyncedAt(result.syncedAt);
    setCloudStale(result.stale);

    // Synchronize cloud subscription entitlements directly into authoritative local runtime
    if (result.data?.planTier && result.data?.entitlements) {
      const isPro = result.data.planTier === 'PRO';
      const isEligible = result.data.subscriptionStatus === 'ACTIVE' || result.data.subscriptionStatus === 'TRIAL';
      LicenseRepository.updateLicense({
        tier: isPro ? 'PRO' : 'CORE',
        planName: result.data.planName || (isPro ? 'JAMANVAAR PRO' : 'JAMANVAAR CORE'),
        price: isPro ? 7000 : 5000,
        status: isEligible ? 'ACTIVE' : 'SUSPENDED',
        entitlements: {
          ...result.data.entitlements,
          qrTableOrdering: isPro && result.data.entitlements.qrTableOrdering !== false
        }
      });
      if (onUpdated) onUpdated();
    }
  }

  useEffect(() => {
    if (cloudConnected && cloudLoggedIn) {
      refreshCloudEntitlements();
    }
  }, [cloudConnected, cloudLoggedIn]);

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

    const result = await applyLicenseCertificate(cert);
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
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-black flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{licenseFeedback}</span>
          </div>
          <button
            onClick={() => setLicenseFeedback('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {licenseError && (
        <div className="p-3.5 bg-red-50 border border-red-300 text-red-800 rounded-2xl text-xs font-black flex items-center justify-between animate-fadeIn shadow-xs">
          <span>⚠️ {licenseError}</span>
          <button
            onClick={() => setLicenseError('')}
            className="text-red-700 hover:text-red-900 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Plan Comparison Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">
            JAMANVAAR Software Plans
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Commercial restaurant POS & connected restaurant ecosystem licensing by KELVIONTECH.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black text-[#E66817] bg-[#FFF4ED] border border-[#FDBA74] px-3.5 py-1 rounded-xl w-fit shadow-2xs">
            Active Plan: {currentLicense.planName || 'JAMANVAAR CORE'} ({currentTier})
          </span>
          <span className="text-[11px] font-bold text-slate-500 bg-[#FAF7F2] border border-[#EBE6DD] px-3 py-1 rounded-xl w-fit">
            Lifetime License • No Monthly Commissions • 100% Offline-First
          </span>
        </div>
      </div>

      {/* CLOUD SUBSCRIPTION STATUS — additive, optional; everything below keeps working offline regardless */}
      <div className="bg-white rounded-3xl p-5 border border-[#EBE6DD] shadow-2xs space-y-3">
        {!cloudConnected ? (
          <form onSubmit={handleConnectSubmit} className="space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#E66817]" />
              <h3 className="text-sm font-bold text-[#0B253A]">Connect to JAMANVAAR Cloud</h3>
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
                className="w-full sm:flex-1 bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
              />
              <button
                type="submit"
                disabled={cloudBusy || !activationCodeInput.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#0B253A] hover:bg-[#1E3A4C] disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
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
                <KeyRound className="w-4 h-4 text-[#E66817]" />
                <h3 className="text-sm font-bold text-[#0B253A]">
                  {cloudMode === 'set-password' ? 'Set your owner password' : 'Log in to JAMANVAAR Cloud'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCloudMode(cloudMode === 'login' ? 'set-password' : 'login')}
                className="text-[10px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer"
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
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#0B253A] hover:bg-[#1E3A4C] disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
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
                <span className="text-sm font-black text-[#0B253A]">
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
              className="text-[11px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer shrink-0"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* DEVICE & STAFF LOGINS — self-service credentials for Captain and other apps/terminals */}
      <CloudDeviceLoginsPanel />

      {/* TWO CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CARD 1: JAMANVAAR CORE (₹5,000) - 5 Cols */}
        <div
          className={`lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border flex flex-col justify-between transition-all select-none ${
            currentTier === 'CORE'
              ? 'border-[#0B253A] shadow-md ring-2 ring-[#0B253A]/10'
              : 'border-[#EBE6DD] shadow-2xs hover:border-slate-300'
          }`}
        >
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 block">
                  FOUNDATION EDITION
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-[#0B253A]">JAMANVAAR CORE</h2>
                <span className="text-xs text-slate-600 font-bold block mt-0.5">
                  POS + Complete Restaurant Management
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-[#0B253A] font-mono">₹5,000</span>
                <span className="text-[10px] text-slate-400 block">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-600 leading-relaxed bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
              Complete offline-first restaurant POS for billing, payments, tables, kitchen operations, inventory and daily restaurant management.
            </p>

            {/* CORE Feature Modules Accordion */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  INCLUDED MODULES & CAPABILITIES ({CORE_FEATURE_COUNT} FEATURES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllCoreFeatures(!showAllCoreFeatures)}
                  className="text-[10px] font-bold text-slate-500 hover:text-[#0B253A] underline cursor-pointer"
                >
                  {showAllCoreFeatures ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {CORE_PLAN_FEATURE_GROUPS.map((group) => {
                const isExpanded = expandedCoreCategory === group.id || showAllCoreFeatures;

                return (
                  <div key={group.id} className="border border-[#EBE6DD] rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setExpandedCoreCategory(expandedCoreCategory === group.id ? null : group.id)}
                      className="w-full px-3.5 py-2.5 bg-[#FAF7F2] hover:bg-slate-100 flex items-center justify-between font-bold text-xs text-[#0B253A] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                        <span>{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-3 text-[11px] text-slate-700 bg-white border-t border-[#EBE6DD]">
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
            <div className="text-[10px] font-black tracking-wider uppercase text-emerald-700 text-center flex items-center justify-center gap-1">
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
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-colors cursor-pointer"
              >
                Switch to JAMANVAAR CORE (₹5,000)
              </button>
            )}
          </div>
        </div>

        {/* CARD 2: JAMANVAAR PRO (₹7,000) - 7 Cols - FLAGSHIP CONNECTED ECOSYSTEM */}
        <div
          className={`lg:col-span-7 bg-gradient-to-b from-[#FFFDFB] via-white to-[#FFFDFB] rounded-3xl p-5 sm:p-7 border-2 flex flex-col justify-between transition-all select-none relative shadow-xl ${
            currentTier === 'PRO'
              ? 'border-[#E66817] ring-4 ring-[#E66817]/20 shadow-2xl'
              : 'border-[#FDBA74] hover:border-[#E66817]'
          }`}
        >
          {/* Recommended Flagship Ribbon */}
          <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-[#E66817] to-[#EA580C] text-white text-[11px] font-black px-4 py-1 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>RECOMMENDED • BEST VALUE</span>
          </div>

          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-amber-200/60 pb-4">
              <div>
                <span className="text-[10px] font-black tracking-widest uppercase text-[#E66817] block">
                  FLAGSHIP CONNECTED RESTAURANT ECOSYSTEM
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-[#0B253A] flex items-center gap-2">
                  <span>JAMANVAAR PRO</span>
                </h2>
                <span className="text-xs text-slate-700 font-bold block mt-0.5">
                  POS + Restaurant Management + Connected Restaurant Ecosystem
                </span>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <div className="flex items-baseline gap-1 sm:justify-end">
                  <span className="text-3xl sm:text-4xl font-black text-[#0B253A] font-mono">₹7,000</span>
                </div>
                <span className="text-[10px] text-slate-400 block font-sans">per license</span>
              </div>
            </div>

            {/* Positioning Tagline */}
            <p className="text-xs text-slate-700 leading-relaxed font-medium bg-amber-50/40 p-3 rounded-2xl border border-amber-200/70">
              Everything in JAMANVAAR CORE plus wireless Captain ordering, QR table ordering, Kiosk integration, advanced multi-station KDS, real-time multi-device synchronization, advanced analytics, customer intelligence and JAMAN AI Assistant.
            </p>

            {/* Top Prominent Value Badges */}
            <div className="space-y-2">
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-black text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>✓ EVERYTHING IN CORE IS INCLUDED ({CORE_FEATURE_COUNT} Base Features)</span>
              </div>

              <div className="p-2.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 rounded-xl border border-amber-300 text-xs text-[#0B253A] flex items-center justify-between gap-2 font-black">
                <div className="flex items-center gap-1.5 text-[#E66817]">
                  <Sparkles className="w-4 h-4 text-[#E66817] shrink-0" />
                  <span>⭐ ONLY ₹2,000 MORE THAN CORE</span>
                </div>
                <span className="text-[11px] font-bold text-[#E66817] bg-white px-2.5 py-0.5 rounded-full shadow-2xs border border-amber-200">
                  ⭐ RECOMMENDED • BEST VALUE
                </span>
              </div>
            </div>

            {/* PRO Feature Modules Accordion */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[#E66817] tracking-wider block">
                  ⭐ PRO CONNECTED MODULES ({PRO_FEATURE_COUNT} EXCLUSIVE CAPABILITIES):
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllProFeatures(!showAllProFeatures)}
                  className="text-[10px] font-bold text-[#E66817] hover:text-[#EA580C] underline cursor-pointer"
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
                        ? 'border-2 border-[#E66817]/60 ring-2 ring-[#E66817]/10'
                        : 'border border-amber-200/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedProCategory(expandedProCategory === group.id ? null : group.id)}
                      className={`w-full px-3.5 py-3 flex items-center justify-between font-black text-xs cursor-pointer transition-colors ${
                        group.isFlagship
                          ? 'bg-gradient-to-r from-[#FFF7F0] to-[#FFFDF9] hover:bg-amber-50 text-[#0B253A]'
                          : 'bg-[#FFFDFB] hover:bg-amber-50/50 text-[#0B253A]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#E66817] flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="tracking-tight">{group.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-[#E66817] bg-[#FFF4EB] border border-[#FED7AA] px-2 py-0.5 rounded-full">
                          {group.features.length} features
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#E66817]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#E66817]" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 text-[11px] text-slate-800 bg-white border-t border-amber-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                          {group.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-[#E66817] shrink-0 mt-0.5 stroke-[2.5]" />
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
            <div className="p-4 bg-gradient-to-br from-[#0B253A] to-[#1E3A4C] text-white rounded-2xl shadow-md space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <strong className="text-xs font-black tracking-wide text-amber-200">
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
            <div className="text-[10px] font-black tracking-wider uppercase text-[#E66817] text-center flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#E66817]" />
              <span>RUN + CONNECT + GROW YOUR RESTAURANT</span>
            </div>

            {currentTier === 'PRO' ? (
              <div className="w-full py-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-xs text-center flex items-center justify-center gap-2 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm">Active License: JAMANVAAR PRO Edition</span>
              </div>
            ) : (
              <div className="space-y-1 text-center">
                <button
                  onClick={() => handleActivatePlan('PRO')}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#E66817] via-[#EA580C] to-[#E66817] hover:from-[#EA580C] hover:to-[#C2410C] text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-[#E66817]/30 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
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
      <div className="bg-white rounded-3xl p-6 border border-[#EBE6DD] shadow-2xs space-y-4">
        <div>
          <span className="text-[10px] font-black uppercase text-[#E66817] tracking-widest block">
            COMMERCIAL ADVANTAGE
          </span>
          <h3 className="text-base font-black text-[#0B253A]">Why Restaurants Upgrade to JAMANVAAR PRO</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#E66817] flex items-center justify-center font-black text-xs">
              01
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📱 SERVE FROM THE TABLE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Wireless Captain App for waiters. Take orders table-side and fire KOT tickets directly to the kitchen.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs">
              02
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📲 LET CUSTOMERS ORDER
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              QR Table Ordering and Self-Service Kiosks. Increase average ticket size without hiring extra staff.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-xs">
              03
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              ⚡ CONNECT FLOOR & KITCHEN
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              POS ↔ Captain ↔ KDS real-time mesh sync. Zero miscommunication between waiters, kitchen, and billing.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#EBE6DD] space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-xs">
              04
            </div>
            <strong className="text-xs font-black text-[#0B253A] block">
              📊 RUN WITH INTELLIGENCE
            </strong>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Advanced analytics, staff tracking, and JAMAN AI Assistant to answer sales and operational questions in seconds.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: CORE vs PRO SIDE-BY-SIDE MATRIX */}
      <div className="bg-white rounded-3xl p-6 border border-[#EBE6DD] shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-[#0B253A]">CORE vs PRO — Feature Comparison Matrix</h3>
            <span className="text-[11px] text-slate-500">Every feature is backed by production-grade offline-first code.</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">OFFICIAL FEATURE MATRIX</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EBE6DD] text-slate-400 font-bold text-[10px] uppercase">
                <th className="py-2.5 px-3">Software Capability</th>
                <th className="py-2.5 px-3 text-center w-36">CORE (₹5,000)</th>
                <th className="py-2.5 px-3 text-center w-48 bg-amber-50/60 text-[#E66817]">PRO (₹7,000)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { cap: 'Counter POS & Fast Billing', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Payments, Multi-Tender & Split Bill', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Interactive Table Management & Floor Plan', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Kitchen KOT & Basic KDS Spooling', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Kitchen Inventory & Stock Alerts', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Daily Sales & Operational Reports', core: '✓ Included', pro: '✓ Included' },
                { cap: '100% Offline SQLite Local Engine', core: '✓ Included', pro: '✓ Included' },
                { cap: 'Wireless Captain App for Waiters', core: '—', pro: '✓ Full Captain Suite' },
                { cap: 'Table-Side QR Code Ordering', core: '—', pro: '✓ Included' },
                { cap: 'Self-Service Customer Touch Kiosk', core: '—', pro: '✓ Included' },
                { cap: 'Real-Time POS ↔ Captain ↔ KDS Mesh Sync', core: '—', pro: '✓ Instant Mesh Sync' },
                { cap: 'Advanced Multi-Station KDS', core: '—', pro: '✓ Station Routing' },
                { cap: 'Advanced Restaurant Analytics & Heatmaps', core: 'Basic', pro: '✓ Advanced Enterprise' },
                { cap: 'JAMAN AI Restaurant Assistant', core: 'Basic', pro: '✓ Full Conversational AI' },
                { cap: 'Customer CRM & Lifetime Value (LTV)', core: 'Basic', pro: '✓ Advanced Intelligence' },
                { cap: 'Smart Automation & Exception Alerts', core: 'Basic', pro: '✓ Real-Time Notifications' },
                { cap: 'Connected Multi-Device Health Monitoring', core: 'Basic', pro: '✓ Live 6-Node Mesh' }
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-[#0B253A]">{row.cap}</td>
                  <td className="py-2.5 px-3 text-center text-slate-700 font-mono text-[11px]">{row.core}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-[#E66817] bg-amber-50/30 font-mono text-[11px]">
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: OFFLINE LICENSE CERTIFICATE ACTIVATION */}
      <div className="bg-white border border-[#EBE6DD] rounded-3xl p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="w-5 h-5 text-[#E66817]" />
          <div>
            <h3 className="text-sm font-bold text-[#0B253A]">Offline License Certificate</h3>
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
            className="w-full sm:flex-1 bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl px-4 py-2.5 text-xs font-mono font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
          />

          <button
            onClick={handleApplyCertificate}
            disabled={!dealerKeyInput.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#0B253A] hover:bg-[#1E3A4C] disabled:opacity-40 text-white font-bold text-xs rounded-2xl transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            Verify & Apply Certificate
          </button>
        </div>
      </div>
    </div>
  );
};
