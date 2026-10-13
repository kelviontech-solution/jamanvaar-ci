import React, { useState } from 'react';
import { Button, SettingsSection } from '@jamanvaar/ui';
import { db, KioskDisplaySettingsRepository, OrderRepository, TokenSequenceRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import type { KioskDisplaySettings } from '@jamanvaar/types';

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
export const KioskDisplaySettingsPanel: React.FC<{ showToast: (msg: string) => void; kiosks?: Array<{id:string;name:string}> }> = ({ showToast, kiosks = [] }) => {
  const [confirmingTokenReset, setConfirmingTokenReset] = useState(false);
  const [orderingScope,setOrderingScope] = useState('branch');
  const [orderingBusy,setOrderingBusy] = useState(false);
  const shared = KioskDisplaySettingsRepository.getSettings();
  const settings = {...shared,...(orderingScope === 'branch' ? {} : shared.orderingOverrides?.[orderingScope])};
  const saveChoices = async (partial: Pick<KioskDisplaySettings,'allowedOrderTypes'|'defaultTableId'> | null) => {
    setOrderingBusy(true);
    try {
      if (orderingScope === 'branch') KioskDisplaySettingsRepository.updateSettings(partial ?? {});
      else {const overrides={...shared.orderingOverrides};if (partial) overrides[orderingScope]={...overrides[orderingScope],...partial};else delete overrides[orderingScope];KioskDisplaySettingsRepository.updateSettings({orderingOverrides:overrides});}
      await syncKioskConfiguration({push:true});showToast('Ordering choices published. Offline kiosks receive them after reconnecting.');
    } catch(error) {showToast((error as Error).message);} finally {setOrderingBusy(false);}
  };

  return (
    <>
      <SettingsSection title="Ordering choices" description="Guests skip screens with only one choice. A table binding is optional; leave it empty for a shared kiosk.">
        <p role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-jaman-navy">{orderingScope === 'branch' ? `Editing branch defaults for ${db.outlet.name}. Individual terminal overrides are retained.` : `Editing only ${kiosks.find(k => k.id === orderingScope)?.name || 'the selected terminal'}. Other kiosks keep their current ordering choices.`}</p>
        <label className="block text-sm font-semibold mb-3">Apply to<select aria-label="Ordering choices scope" disabled={orderingBusy} value={orderingScope} onChange={e => setOrderingScope(e.target.value)} className="block min-h-12 w-full rounded-xl border border-jaman-border bg-white px-3 mt-1"><option value="branch">Branch defaults · all kiosks</option>{kiosks.map(kiosk => <option key={kiosk.id} value={kiosk.id}>{kiosk.name}</option>)}</select></label>
        {orderingScope !== 'branch' && <div className="flex flex-wrap items-center gap-2 mb-3 text-sm"><span>{shared.orderingOverrides?.[orderingScope] ? 'Terminal override' : 'Following branch defaults'}</span><button type="button" disabled={orderingBusy || !shared.orderingOverrides?.[orderingScope]} onClick={() => void saveChoices(null)} className="min-h-11 px-3 rounded-xl border">Use branch defaults</button></div>}
        <div className="flex flex-wrap gap-3">
          {(['DINE_IN','TAKEAWAY'] as const).map(mode => <label key={mode} className="min-h-12 flex items-center gap-2 rounded-xl border border-jaman-border p-3 text-sm font-semibold"><input type="checkbox" disabled={orderingBusy} checked={(settings.allowedOrderTypes ?? ['DINE_IN','TAKEAWAY']).includes(mode)} onChange={e => {const current = settings.allowedOrderTypes ?? ['DINE_IN','TAKEAWAY'];void saveChoices({allowedOrderTypes:e.target.checked ? [...current,mode] : current.filter(t => t !== mode)});}}/>{mode === 'DINE_IN' ? 'Dine in' : 'Takeaway'}</label>)}
        </div>
        <label className="block text-sm font-semibold mt-3">Default table<select disabled={orderingBusy} value={settings.defaultTableId ?? ''} onChange={e => void saveChoices({defaultTableId:e.target.value})} className="block w-full mt-1 min-h-12 rounded-xl border border-jaman-border px-3 bg-white"><option value="">Let guests choose</option>{db.tables.filter(t => t.isActive !== false && t.status !== 'BLOCKED').map(t => <option key={t.id} value={t.id}>Table {t.tableNumber}</option>)}</select></label>
      </SettingsSection>
      <SettingsSection
        title="Customer kiosk language & idle timeout"
        description="Which languages the self-order kiosk offers, and how long it waits before resetting an idle session."
      >

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
      </SettingsSection>

      <SettingsSection
        title="Kiosk order token counter"
        description="The kiosk hands out sequential tokens (K-101, K-102...) that reset automatically each new business day. Use this only to force an early restart mid-day."
      >

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
      </SettingsSection>
    </>
  );
};
