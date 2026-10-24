import React from 'react';
import { kdsDb } from '@jamanvaar/database';
import { JamanvaarAuthLayout, APP_HERO_IMAGES, JAMANVAARStartup, ActivationNoticeBanner, ActivationHelpNote } from '@jamanvaar/ui';
import { AlertCircle, ArrowRight } from 'lucide-react';

/**
 * Device activation gate -- this terminal has no cloud identity until an activation code is
 * redeemed. Runs before the PIN-login screen, mirroring POS's activation-before-staff-login
 * order. Extracted from App.tsx.
 */
export const KdsActivationScreen: React.FC<{
  activationCode: string;
  setActivationCode: (v: string) => void;
  activationError: string;
  isActivating: boolean;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ activationCode, setActivationCode, activationError, isActivating, onSubmit }) => (
  <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" subtitle="Kitchen Production & Expediter System">
    <JamanvaarAuthLayout
      appIdentity="KDS"
      appTitle="Kitchen Display System"
      appSubtitle="One-time setup — activate this display to start receiving tickets."
      isLocalCoreUnauthorized={kdsDb.isLocalCoreUnauthorized()}
      isLocalCoreConnected={kdsDb.isLocalCoreConnected()}
      healthCheckUrl={kdsDb.localCoreHealthUrl()}
      heroHeadline="Real-Time Kitchen Production Command"
      heroHighlightWord="Live KOTs"
      heroDescription="Instant station routing, live ticket timers, and cross-terminal food ready dispatch for kitchen staff."
      heroImages={APP_HERO_IMAGES.KDS}
    >
      <ActivationNoticeBanner />
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Activate This Terminal</h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
          Enter the activation key from your Super Admin Welcome Kit to connect this Kitchen Display to your restaurant.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="kds-activation-key" className="text-xs font-bold text-slate-500 block mb-1.5">Activation Key *</label>
          <input id="kds-activation-key"
            type="text"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="JMV-XXXX-XXXX-XXXX"
            required
            autoFocus
            className="w-full bg-white border border-jaman-border focus:border-jaman-saffron focus:ring-2 focus:ring-jaman-saffron/20 rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors uppercase placeholder:text-slate-500"
          />
        </div>
        {activationError && (
          <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{activationError}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={isActivating || !activationCode.trim()}
          className="w-full py-4 rounded-2xl bg-[#BF540F] hover:bg-[#A9480C] disabled:opacity-100 disabled:bg-[#5F6F80] disabled:shadow-none disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{isActivating ? 'Activating…' : 'Activate Terminal'}</span>
          {!isActivating && <ArrowRight className="w-4 h-4 text-white" />}
        </button>
      </form>
      <ActivationHelpNote deviceNoun="terminal" />
    </JamanvaarAuthLayout>
  </JAMANVAARStartup>
);
