import React, { useState } from 'react';
import { captainDb } from '@jamanvaar/database';
import { JamanvaarAuthLayout, APP_HERO_IMAGES, JAMANVAARStartup } from '@jamanvaar/ui';
import { AlertCircle, ArrowRight } from 'lucide-react';

/**
 * The PIN keypad sign-in screen. Extracted from App.tsx. Owns its own PIN-entry state (pinInput,
 * pinError) since nothing outside this screen needs them -- the parent only needs to know the
 * result of a login attempt via `login`.
 */
export const CaptainSignInScreen: React.FC<{
  login: (pin: string) => Promise<boolean>;
  loginError: string | null;
}> = ({ login, loginError }) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // One path for typed and keypad entry, so a wrong PIN always shows the error and clears the
  // entry (BUG-105: the keypad path used to ignore the result and jam at four digits).
  const attemptLogin = async (candidate: string) => {
    const ok = await login(candidate);
    setPinError(!ok);
    setPinInput('');
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;
    attemptLogin(pinInput);
  };

  return (
    <JAMANVAARStartup appName="CAPTAIN APP" appType="CAPTAIN" minDurationMs={1500}>
      <JamanvaarAuthLayout
        appIdentity="CAPTAIN"
        appTitle="Floor Captain & Service"
        appSubtitle="High-Speed Table Orders & Service"
        restaurantName={captainDb.restaurant?.name}
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
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-jaman-navy tracking-tight">
              Floor Captain Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              Enter your authorized 4-digit staff PIN to unlock this tablet
            </p>
          </div>

          {/* Authorized Staff Help Notice */}
          <div className="p-3.5 rounded-2xl bg-[#FDFBF7] border border-jaman-border flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-jaman-navy block">🔒 Registered Staff Access</span>
              <span className="text-[11px] text-slate-600 font-medium">Ask your manager for your 4-digit staff PIN</span>
            </div>
          </div>

          {/* PIN Input & Keypad */}
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label htmlFor="captain-pin" className="block text-xs font-bold text-jaman-navy uppercase tracking-wider mb-2">
                Staff 4-Digit PIN
              </label>
              <div className="relative">
                <input
                  id="captain-pin"
                  type="password"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    setPinError(false);
                    setPinInput(e.target.value);
                  }}
                  placeholder="• • • •"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3.5 px-4 rounded-2xl bg-white border border-jaman-border focus:border-jaman-saffron focus:ring-2 focus:ring-jaman-saffron/20 outline-none text-jaman-navy"
                />
              </div>
              {pinError && (
                <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {loginError ?? 'Invalid staff PIN code. Please enter your authorized 4-digit PIN.'}
                </p>
              )}
            </div>

            {/* Touch Numpad */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 4) {
                      setPinError(false);
                      const next = pinInput + num;
                      setPinInput(next);
                      if (next.length === 4) {
                        setTimeout(() => attemptLogin(next), 50);
                      }
                    }
                  }}
                  className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-bold font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPinInput('');
                  setPinError(false);
                }}
                className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < 4) {
                    setPinError(false);
                    const next = pinInput + '0';
                    setPinInput(next);
                    if (next.length === 4) {
                      setTimeout(() => attemptLogin(next), 50);
                    }
                  }
                }}
                className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-bold font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={pinInput.length === 0}
              className="w-full py-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] disabled:opacity-100 disabled:bg-[#5F6F80] disabled:shadow-none disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Unlock Captain Terminal</span>
              <ArrowRight className="w-4 h-4 text-jaman-saffronText" />
            </button>
          </form>
        </div>
      </JamanvaarAuthLayout>
    </JAMANVAARStartup>
  );
};
