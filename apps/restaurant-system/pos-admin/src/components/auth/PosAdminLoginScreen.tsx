import React from 'react';
import { db } from '@jamanvaar/database';
import {
  JAMANVAARStartup,
  JamanvaarAuthLayout,
  APP_HERO_IMAGES,
  ActivationNoticeBanner
} from '@jamanvaar/ui';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { ForgotPasswordPanel } from './ForgotPasswordPanel';
import { ActivateOwnerPanel } from './ActivateOwnerPanel';

/**
 * The owner sign-in screen (LOGIN / FORGOT / ACTIVATE / ACTIVATION_REQUIRED sub-states).
 * Extracted from App.tsx. Owns no state of its own -- all of it is still in App.tsx, since
 * completeLogin/handleAdminLogin/handleActivateSubmit/handleAdminLogout stay there too (they feed
 * the post-login app shell as well, not just this screen).
 */
export const PosAdminLoginScreen: React.FC<{
  isOnline: boolean;
  onToggleNetwork: () => void;
  authScreenState: 'LOGIN' | 'ACTIVATION_REQUIRED' | 'FORGOT' | 'ACTIVATE';
  setAuthScreenState: (state: 'LOGIN' | 'ACTIVATION_REQUIRED' | 'FORGOT' | 'ACTIVATE') => void;
  activatePrefill: { code: string; email: string; token: string } | null;
  setActivatePrefill: (v: { code: string; email: string; token: string } | null) => void;
  authRestaurantCode: string;
  setAuthRestaurantCode: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  authError: string;
  setAuthError: (v: string) => void;
  passwordResetNotice: boolean;
  setPasswordResetNotice: (v: boolean) => void;
  activationKeyInput: string;
  setActivationKeyInput: (v: string) => void;
  loginBusy: boolean;
  handleAdminLogin: (e?: React.FormEvent) => void;
  pendingTenant: { restaurantId: string; restaurantName: string; ownerEmail: string; ownerName: string } | null;
  activationError: string;
  setActivationError: (v: string) => void;
  activationBusy: boolean;
  handleActivateSubmit: (e: React.FormEvent) => void;
}> = ({
  isOnline,
  onToggleNetwork,
  authScreenState,
  setAuthScreenState,
  activatePrefill,
  setActivatePrefill,
  authRestaurantCode,
  setAuthRestaurantCode,
  authPassword,
  setAuthPassword,
  showPassword,
  setShowPassword,
  authError,
  setAuthError,
  passwordResetNotice,
  setPasswordResetNotice,
  activationKeyInput,
  setActivationKeyInput,
  loginBusy,
  handleAdminLogin,
  pendingTenant,
  activationError,
  setActivationError,
  activationBusy,
  handleActivateSubmit
}) => {
  return (
    <JAMANVAARStartup appName="Owner Sign-in" appType="OWNER" subtitle="Your restaurant account">
      <JamanvaarAuthLayout
        appIdentity="ADMIN"
        applicationLabel="Owner Sign-in"
        appTitle="JAMANVAAR"
        appSubtitle="One account for your restaurant and kiosk apps"
        isOnline={isOnline}
        onToggleNetwork={onToggleNetwork}
        isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
        isLocalCoreConnected={db.isLocalCoreConnected()}
        localCoreUrl={db.getSyncServerUrl()}
        onPairLocalCore={(pin, url) => db.pairLocalCore(pin, url)}
        healthCheckUrl={db.localCoreHealthUrl()}
        heroHeadline="Restaurant Control."
        heroHighlightWord="Live Intelligence."
        heroDescription="Sign in once. Open the apps included in your plan, with a separate workspace for each."
        heroImages={APP_HERO_IMAGES.ADMIN}
        capabilities={[
          { label: 'Restaurant Management', icon: 'dashboard' },
          { label: 'Reports & Analytics', icon: 'chart' },
          { label: 'Menu Management', icon: 'table' },
          { label: 'Inventory & Staff', icon: 'package' }
        ]}
        footerNote="Plan-Based Access • Instant Offline Boot • Role-based access"
      >
        <ActivationNoticeBanner />
        {authScreenState === 'ACTIVATE' ? (
          <ActivateOwnerPanel
            defaultRestaurantCode={activatePrefill?.code ?? authRestaurantCode}
            defaultEmail={activatePrefill?.email ?? ''}
            defaultToken={activatePrefill?.token ?? ''}
            onBack={() => setAuthScreenState('LOGIN')}
            onDone={(code) => {
              setAuthRestaurantCode(code);
              setAuthPassword('');
              setActivatePrefill(null);
              setAuthError('');
              setPasswordResetNotice(true);
              setAuthScreenState('LOGIN');
            }}
          />
        ) : authScreenState === 'FORGOT' ? (
          <ForgotPasswordPanel
            defaultRestaurantCode={authRestaurantCode}
            onBack={() => setAuthScreenState('LOGIN')}
            onActivate={() => {
              setAuthError('');
              setAuthScreenState('ACTIVATE');
            }}
            onDone={() => {
              setAuthPassword('');
              setAuthScreenState('LOGIN');
              setAuthError('');
              setPasswordResetNotice(true);
            }}
          />
        ) : authScreenState === 'LOGIN' ? (
          <>
            <form onSubmit={handleAdminLogin} className="space-y-3.5 pt-2">
              <div>
                <label htmlFor="admin-restaurant-id" className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                  Restaurant ID *
                </label>
                <input
                  id="admin-restaurant-id"
                  type="text"
                  autoComplete="off"
                  value={authRestaurantCode}
                  onChange={(e) => {
                    setAuthRestaurantCode(e.target.value);
                    setAuthError('');
                  }}
                  placeholder="e.g. JM9876543210"
                  className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Find your Restaurant ID in your Welcome Kit or activation email. If you cannot find it, ask your JAMANVAAR setup contact. Never share your password or activation key.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="admin-password" className="text-xs font-bold text-slate-700">Owner Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-controls="admin-password"
                    className="text-xs text-[#B8500C] hover:underline font-semibold inline-flex items-center min-h-11 -my-3.5 px-2 -mx-2"
                  >
                    {showPassword ? 'Hide Password' : 'Show Password'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={authPassword}
                    onChange={(e) => {
                      setAuthPassword(e.target.value);
                      setAuthError('');
                    }}
                    placeholder="Enter owner password"
                    className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm text-jaman-navy font-semibold focus:outline-hidden transition-colors"
                  />
                </div>
              </div>

              {passwordResetNotice && !authError && (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-center" role="status">
                  Your password was changed. Sign in with the new one.
                </div>
              )}

              {authError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                <span>Your owner account</span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    setPasswordResetNotice(false);
                    setAuthScreenState('FORGOT');
                  }}
                  className="font-semibold text-[#B8500C] hover:underline cursor-pointer inline-flex items-center min-h-11 -my-3.5 px-2 -mx-2"
                >
                  Forgot password?
                </button>
              </div>

              <details className="text-sm text-slate-600"><summary className="cursor-pointer">Connecting a new device? Add your admin key</summary><label className="block mt-3">Admin activation key (first connection only)<input aria-label="Admin activation key (optional)" type="text" value={activationKeyInput} onChange={e => setActivationKeyInput(e.target.value.toUpperCase())} placeholder="JMV-XXXX-XXXX-XXXX" className="block w-full mt-1 rounded-xl border border-jaman-border p-3 font-mono" /></label><p className="text-xs mt-2">Use your Restaurant Admin or Kiosk Admin key. Customer kiosks still use their own kiosk activation screen.</p></details>

              <button
                type="submit"
                disabled={loginBusy}
                className="w-full h-12 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-sm active:scale-[0.99] cursor-pointer mt-2"
              >
                {loginBusy ? 'Signing In…' : 'Sign In'}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    setPasswordResetNotice(false);
                    setActivatePrefill(null);
                    setAuthScreenState('ACTIVATE');
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-jaman-navy underline cursor-pointer inline-flex items-center min-h-11 -my-3.5 px-2"
                >
                  Set your password from the welcome email
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>FIRST-TIME DEVICE ACTIVATION</span>
              </div>
              <h3 className="text-base font-bold text-jaman-navy pt-1">
                Connect this admin device
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Enter your admin activation key once on this device. Your plan determines which apps open after sign-in.
              </p>
            </div>

            {pendingTenant && (
              <div className="p-3.5 bg-jaman-cream border border-jaman-border rounded-2xl space-y-1 text-left text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Restaurant:</span>
                  <span className="font-bold text-jaman-navy">{pendingTenant.restaurantName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Owner Account:</span>
                  <span className="font-mono text-jaman-navy text-[11px]">{pendingTenant.ownerEmail}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Apps:</span>
                  <span className="font-bold text-brand">Restaurant Admin / Kiosk Admin</span>
                </div>
              </div>
            )}

            <form onSubmit={handleActivateSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
                  Admin Activation Key *
                </label>
                <input
                  type="text"
                  value={activationKeyInput}
                  onChange={(e) => {
                    setActivationKeyInput(e.target.value.toUpperCase());
                    setActivationError('');
                  }}
                  placeholder="JMV-XXXX-XXXX-XXXX"
                  autoFocus
                  required
                  className="w-full bg-jaman-cream border border-jaman-border focus:border-brand focus:bg-white rounded-2xl px-4 py-3 text-sm text-center font-mono font-bold tracking-wider text-jaman-navy focus:outline-hidden transition-colors"
                />
              </div>

              {activationError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{activationError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={activationBusy || !activationKeyInput.trim()}
                className="w-full h-12 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-press disabled:opacity-40 text-white font-semibold text-sm transition-colors shadow-sm active:scale-[0.99] cursor-pointer mt-2"
              >
                {activationBusy ? 'Activating Terminal…' : 'Connect & Continue'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthScreenState('LOGIN');
                  setActivationError('');
                }}
                className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-jaman-navy transition-colors cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </form>
          </div>
        )}
      </JamanvaarAuthLayout>
    </JAMANVAARStartup>
  );
};
