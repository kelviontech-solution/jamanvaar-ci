import React, { useState } from 'react';
import { Button } from '@jamanvaar/ui';
import { KioskDisplaySettingsRepository, OrderRepository, TokenSequenceRepository } from '@jamanvaar/database';

/** Mirrors kiosk-admin's KIOSK_LANGUAGE_LABELS (apps/kiosk-system/kiosk-admin/src/App.tsx:234-242). */
const KIOSK_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  gu: 'ગુજરાતી (Gujarati)',
  mr: 'मराठी (Marathi)',
  ta: 'தமிழ் (Tamil)',
  te: 'తెలుగు (Telugu)',
  kn: 'ಕನ್ನಡ (Kannada)'
};

/**
 * Relocated from kiosk-admin's Settings tab — these two settings are genuinely kiosk-specific
 * (the customer kiosk's own language/idle behavior and its own K-prefixed token sequence), unlike
 * the Receipt & E-Bill and Payment Gateway sections of that same tab, which are general restaurant
 * settings and don't belong behind a kiosk-only gate.
 */
export const KioskDisplaySettingsPanel: React.FC<{ showToast: (msg: string) => void }> = ({ showToast }) => {
  const [confirmingTokenReset, setConfirmingTokenReset] = useState(false);
  const settings = KioskDisplaySettingsRepository.getSettings();

  return (
    <>
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
        <div>
          <h4 className="font-bold text-jaman-navy">Customer Kiosk Language & Idle Timeout</h4>
          <p className="text-xs text-[#4A5568]">Which languages the self-order kiosk offers, and how long it waits before resetting an idle session.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-jaman-ivory rounded-xl border border-jaman-border">
          {(Object.keys(KIOSK_LANGUAGE_LABELS) as Array<keyof typeof KIOSK_LANGUAGE_LABELS>).map((code) => {
            const label = KIOSK_LANGUAGE_LABELS[code];
            const isEnabled = settings.enabledLanguages.includes(code as never);
            return (
              <label key={code} className="flex items-center gap-2 text-xs font-bold text-jaman-navy">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => {
                    const current = KioskDisplaySettingsRepository.getSettings();
                    const nextEnabled = isEnabled
                      ? current.enabledLanguages.filter((l) => l !== code)
                      : [...current.enabledLanguages, code as never];
                    try {
                      KioskDisplaySettingsRepository.updateSettings({ enabledLanguages: nextEnabled });
                      showToast(`${label} ${isEnabled ? 'disabled' : 'enabled'} on the customer kiosk.`);
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Could not update kiosk languages');
                    }
                  }}
                />
                {label}
              </label>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Default Language</label>
            <select
              value={settings.defaultLanguage}
              onChange={(e) => {
                try {
                  KioskDisplaySettingsRepository.updateSettings({ defaultLanguage: e.target.value as never });
                  showToast(`Default kiosk language set to ${e.target.value}`);
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Could not update default language');
                }
              }}
              className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
            >
              {settings.enabledLanguages.map((l) => (
                <option key={l} value={l}>{KIOSK_LANGUAGE_LABELS[l] ?? l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-jaman-navy mb-1">Idle Warning After (seconds)</label>
            <input
              type="number"
              min={5}
              value={settings.idleWarningAfterSeconds}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!Number.isFinite(val) || val < 5) return;
                KioskDisplaySettingsRepository.updateSettings({ idleWarningAfterSeconds: val });
              }}
              className="w-full bg-white border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
        <div>
          <h4 className="font-bold text-jaman-navy">Kiosk Order Token Counter</h4>
          <p className="text-xs text-[#4A5568]">
            The kiosk hands out sequential tokens (K-101, K-102...) that reset automatically each new business day. Use this only to force an early restart mid-day.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 bg-jaman-ivory rounded-xl p-4 border border-jaman-border">
          <div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Next Kiosk Token</p>
            <p className="text-2xl font-bold text-jaman-navy">{OrderRepository.nextTokenNumber('K')}</p>
            {TokenSequenceRepository.getLastReset('K') && (
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Last reset {new Date(TokenSequenceRepository.getLastReset('K')!).toLocaleString()}
              </p>
            )}
          </div>

          {confirmingTokenReset ? (
            <div className="text-right space-y-2">
              <p className="text-[11px] font-bold text-rose-600 max-w-[220px]">
                If orders were already placed today, new tokens may repeat one already used today. Continue?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmingTokenReset(false)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    TokenSequenceRepository.reset('K');
                    setConfirmingTokenReset(false);
                    showToast('Token counter reset — next order starts at K-101.');
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                >
                  Yes, Reset
                </button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirmingTokenReset(true)}>
              Reset to 101
            </Button>
          )}
        </div>
      </div>
    </>
  );
};
