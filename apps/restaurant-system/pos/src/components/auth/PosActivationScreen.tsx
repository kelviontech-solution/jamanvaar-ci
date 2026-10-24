import React from 'react';
import { db } from '@jamanvaar/database';
import { JAMANVAARStartup, JamanvaarAuthLayout, APP_HERO_IMAGES, ActivationNoticeBanner, ActivationHelpNote } from '@jamanvaar/ui';
import { AlertCircle, ArrowRight } from 'lucide-react';

/**
 * Device activation gate -- this terminal has no cloud identity until an activation code is
 * redeemed. Extracted from App.tsx, which otherwise mixed this one-time setup screen in with
 * the main app's sync wiring and render shell.
 */
export const PosActivationScreen: React.FC<{
  activationCode: string;
  setActivationCode: (v: string) => void;
  activationError: string;
  isActivating: boolean;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ activationCode, setActivationCode, activationError, isActivating, onSubmit }) => (
  <JAMANVAARStartup appName="POS Terminal" appType="POS" subtitle="Restaurant Operations Platform">
    <JamanvaarAuthLayout
      appIdentity="POS"
      appTitle="POS Counter"
      appSubtitle="One-time setup — activate this terminal to start billing."
      isLocalCoreUnauthorized={db.isLocalCoreUnauthorized()}
      isLocalCoreConnected={db.isLocalCoreConnected()}
      healthCheckUrl={db.localCoreHealthUrl()}
      heroHeadline="Smart Billing."
      heroHighlightWord="Better Dining."
      heroDescription="Fast, reliable and easy-to-use restaurant POS software built for modern Indian restaurants."
      capabilities={[
        { label: 'Fast Billing', icon: 'zap' },
        { label: 'Instant KOT', icon: 'printer' },
        { label: 'Table Management', icon: 'table' },
        { label: 'Offline First', icon: 'cloud' }
      ]}
      heroImages={APP_HERO_IMAGES.POS}
      footerNote="Role-Based Security • Instant Offline Boot • Role-based access"
    >
      <ActivationNoticeBanner />
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Activate This Terminal</h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
          Enter the activation key from your Super Admin Welcome Kit to connect this terminal to your restaurant.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="pos-activation-key" className="text-xs font-bold text-slate-700 block mb-1.5">Activation Key *</label>
          <input id="pos-activation-key"
            type="text"
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value)}
            placeholder="JMV-XXXX-XXXX-XXXX"
            required
            autoFocus
            className="w-full bg-jaman-cream border border-jaman-border focus:border-jaman-saffron focus:bg-white rounded-2xl px-4 py-3 text-sm font-mono text-jaman-navy font-semibold focus:outline-hidden transition-colors uppercase"
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
          className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-100 disabled:bg-[#5F6F80] disabled:shadow-none disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{isActivating ? 'Activating…' : 'Activate Terminal'}</span>
          {!isActivating && <ArrowRight className="w-4 h-4 text-jaman-saffronText" />}
        </button>
      </form>
      <ActivationHelpNote deviceNoun="terminal" />
    </JamanvaarAuthLayout>
  </JAMANVAARStartup>
);
