import React from 'react';
import { captainDb } from '@jamanvaar/database';
import { JamanvaarAuthLayout, APP_HERO_IMAGES, JAMANVAARStartup, ActivationNoticeBanner, ActivationHelpNote } from '@jamanvaar/ui';
import { AlertCircle, ArrowRight } from 'lucide-react';

/** One-time device connection to JAMANVAAR Cloud. Extracted from App.tsx. */
export const CaptainActivationScreen: React.FC<{
  activationKeyInput: string;
  setActivationKeyInput: (v: string) => void;
  activationError: string;
  activationBusy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ activationKeyInput, setActivationKeyInput, activationError, activationBusy, onSubmit }) => (
  <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={1500}>
    <JamanvaarAuthLayout
      appIdentity="CAPTAIN"
      appTitle="Floor Captain & Service"
      appSubtitle="High-Speed Table Orders & Service"
      isLocalCoreUnauthorized={captainDb.isLocalCoreUnauthorized()}
      isLocalCoreConnected={captainDb.isLocalCoreConnected()}
      localCoreUrl={captainDb.getSyncServerUrl()}
      onPairLocalCore={(pin, url) => captainDb.pairLocalCore(pin, url)}
      healthCheckUrl={captainDb.localCoreHealthUrl()}
      heroHeadline="Touch-First Restaurant Floor Command"
      heroHighlightWord="Instant KOT"
      heroDescription="Real-time table ordering, live KDS food ready alerts, and fast billing requests with zero cloud latency."
      heroImages={APP_HERO_IMAGES.CAPTAIN}
    >
      <div className="space-y-5">
        <ActivationNoticeBanner />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-jaman-navy tracking-tight">Activate this Tablet</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            One-time setup — enter the activation key from your Super Admin Welcome Kit. Nothing else is needed.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="captain-activation-key" className="text-xs font-bold text-slate-700 block mb-1.5">Activation Key *</label>
            <input id="captain-activation-key"
              type="text"
              value={activationKeyInput}
              onChange={(e) => setActivationKeyInput(e.target.value)}
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
            disabled={activationBusy || !activationKeyInput.trim()}
            className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-100 disabled:bg-[#5F6F80] disabled:shadow-none disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{activationBusy ? 'Activating…' : 'Activate Tablet'}</span>
            {!activationBusy && <ArrowRight className="w-4 h-4 text-jaman-saffron" />}
          </button>
        </form>
        <ActivationHelpNote deviceNoun="tablet" />
      </div>
    </JamanvaarAuthLayout>
  </JAMANVAARStartup>
);
