import React, { useState } from 'react';
import { verifyPinWithSync, getAssignedStation } from '@jamanvaar/sync';
import { db, kdsDb, StaffRepository, getTerminalId } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { JamanvaarAuthLayout, APP_HERO_IMAGES, JAMANVAARStartup } from '@jamanvaar/ui';
import { Delete, AlertTriangle } from 'lucide-react';

/**
 * The PIN keypad + kitchen-station sign-in screen. Extracted from App.tsx. Owns its own PIN-entry
 * and verification state; the parent only learns the result via `onLoggedIn`, which also finishes
 * the session persistence (same as before the split, just called from here).
 */
export const KdsSignInScreen: React.FC<{
  kitchenStations: string[];
  stationChoices: Array<{ id: string; label: string }>;
  kdsStationSelection: string;
  setKdsStationSelection: (v: string) => void;
  onLoggedIn: (stationName: string) => void;
}> = ({ kitchenStations, stationChoices, kdsStationSelection, setKdsStationSelection, onLoggedIn }) => {
  const assignedStation = getAssignedStation();
  const [kdsPin, setKdsPin] = useState('');
  const [kdsPinBusy, setKdsPinBusy] = useState(false);
  const [kdsPinError, setKdsPinError] = useState(false);
  // Set when the PIN is right but the person's role cannot use the kitchen screen (BUG-147).
  const [kdsPinDenied, setKdsPinDenied] = useState<string | null>(null);

  // Same fix as Captain's SEC-006: authenticate against real db.users
  // records instead of accepting any 4-digit sequence. Previously this
  // logged any staff member in the moment they'd typed 4 digits, checking
  // nothing — not even a hardcoded PIN, unlike Captain/POS Admin's
  // (already-fixed or already-removed) demo bypasses.
  const handleKdsPinPress = async (digit: string) => {
    if (kdsPinBusy) return;
    if (kdsPin.length < 4) {
      const next = kdsPin + digit;
      setKdsPin(next);
      if (next.length === 4) {
        setKdsPinBusy(true);
        try {
          const candidate = (await verifyPinWithSync(next))?.user;
          // A PIN for a role that does not work the kitchen screen is refused (BUG-118).
          const matchedUser = candidate && StaffRepository.canUseTerminal(candidate.roleId, 'KDS') ? candidate : undefined;

          setKdsPinDenied(candidate && !matchedUser ? StaffRepository.terminalDeniedMessage(candidate.roleId, 'KDS') : null);

          if (matchedUser) {
            setKdsPinError(false);
            SessionPersistence.save('kds', {
              userId: matchedUser.id,
              fullName: matchedUser.fullName,
              roleId: matchedUser.roleId || 'KDS_STATION',
              restaurantId: matchedUser.restaurantId || db.restaurant.id,
              stationId: kdsStationSelection.toLowerCase().replace(/\s+/g, '-'),
              stationName: kdsStationSelection,
              terminalId: getTerminalId('KDS')
            });
            onLoggedIn(kdsStationSelection);
          } else {
            setKdsPinError(true);
          }
        } catch (error) {
          setKdsPinDenied(error instanceof Error ? error.message : 'Could not verify your PIN. Please try again.');
          setKdsPinError(true);
        } finally {
          setKdsPin('');
          setKdsPinBusy(false);
        }
      }
    }
  };

  return (
    <JAMANVAARStartup appName="Kitchen Display (KDS)" appType="KDS" minDurationMs={1200}>
      <JamanvaarAuthLayout
        appIdentity="KDS"
        appTitle="Kitchen Display System"
        appSubtitle="Kitchen Stations & Line Cook Display"
        restaurantName={kdsDb.restaurant?.name}
        isLocalCoreUnauthorized={kdsDb.isLocalCoreUnauthorized()}
        isLocalCoreConnected={kdsDb.isLocalCoreConnected()}
        localCoreUrl={kdsDb.getSyncServerUrl()}
        onPairLocalCore={(pin, url) => kdsDb.pairLocalCore(pin, url)}
        healthCheckUrl={kdsDb.localCoreHealthUrl()}
        heroHeadline="Real-Time Kitchen Production Command"
        heroHighlightWord="Live KOTs"
        heroDescription="Instant station routing, live ticket timers, and cross-terminal food ready dispatch for kitchen staff."
        heroImages={APP_HERO_IMAGES.KDS}
      >
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-jaman-navy tracking-tight">Kitchen Staff Sign In</h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Choose your station, then enter your 4-digit staff PIN</p>
          </div>

          {/* Station: the ones on this restaurant's menu. A station assigned to this screen in Restaurant Admin is fixed. */}
          <div className="space-y-2" role="group" aria-labelledby="kds-station-label">
            <p id="kds-station-label" className="block text-xs font-bold text-jaman-navy uppercase tracking-wider">Kitchen Station</p>
            {assignedStation ? (
              <div className="p-3.5 rounded-2xl bg-[#FDFBF7] border border-jaman-border text-xs font-bold text-jaman-navy">
                This screen is assigned to <span className="text-jaman-saffron">{assignedStation}</span> by your restaurant admin.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stationChoices.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setKdsStationSelection(st.id)}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                      kdsStationSelection === st.id
                        ? 'bg-jaman-navy text-white border-jaman-navy shadow-xs'
                        : 'bg-jaman-cream border-jaman-border text-jaman-navy hover:bg-[#FFF4ED] hover:border-jaman-saffron'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
            {kitchenStations.length === 0 && (
              <p className="text-[11px] text-slate-500 font-medium">No kitchen stations are set on the menu yet, so this screen shows every ticket.</p>
            )}
          </div>

          {/* PIN Input & Numpad */}
          <div className="space-y-3">
            <label htmlFor="kds-pin" className="block text-xs font-bold text-jaman-navy uppercase tracking-wider">Staff 4-Digit PIN</label>
            <input
              id="kds-pin"
              type="password"
              maxLength={4}
              value={kdsPin}
              readOnly
              placeholder="• • • •"
              className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3.5 px-4 rounded-2xl bg-white border border-jaman-border focus:border-jaman-saffron outline-none text-jaman-navy"
            />
            {kdsPinBusy && <p role="status" className="text-xs font-bold text-slate-600 text-center">Verifying staff PIN…</p>}
            {kdsPinError && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5" role="alert">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{kdsPinDenied ?? 'Incorrect PIN. Please try again.'}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') { setKdsPin(''); setKdsPinError(false); }
                    else if (k === '⌫') setKdsPin((prev) => prev.slice(0, -1));
                    else handleKdsPinPress(k);
                  }}
                  className="h-14 rounded-2xl bg-jaman-cream hover:bg-[#FFF4ED] hover:border-jaman-saffron border border-jaman-border text-lg font-black font-mono text-jaman-navy active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-2xs"
                >
                  {k === '⌫' ? <Delete className="w-4 h-4 text-slate-500" /> : k === 'C' ? <span className="text-xs font-black uppercase tracking-wider text-slate-500">Clear</span> : k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </JamanvaarAuthLayout>
    </JAMANVAARStartup>
  );
};
