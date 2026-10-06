import React, { useState } from 'react';
import { db, KioskDisplaySettingsRepository, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { getTranslation, KIOSK_CONTENT_CATALOG, type SupportedLanguage } from '@jamanvaar/i18n';

export function KioskContentPanel({ showToast }: { showToast: (message: string) => void }) {
  const [display, setDisplay] = useState(() => structuredClone(db.kioskDisplaySettings));
  const [welcome, setWelcome] = useState(() => structuredClone(db.welcomeScreenSettings));
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const catalog: Record<string, string> = { ...Object.fromEntries(Object.entries(getTranslation(language)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), ...KIOSK_CONTENT_CATALOG };
  const inputClass = 'w-full rounded-xl border border-slate-300 p-2 text-sm';
  const welcomeFields = [ ['headingText', 'Welcome heading'], ['subtitleText', 'Welcome subtitle'], ['startOrderButtonText', 'Start order button'], ['supportingText', 'Supporting text'], ['promoBannerText', 'Promotion banner text'], ['backgroundImageUrl', 'Welcome background image URL'] ] as const;
  return <div className="space-y-5" data-testid="kiosk-content-panel">
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <h2 className="text-xl font-bold">Kiosk Appearance & Content</h2>
      <p className="text-sm text-slate-600">Customize this branch's customer kiosk. Menu images, prices, availability and modifiers are managed in Menu & Categories and Customisations & Tax. Receipt content and layout are managed in Receipt & E-Bill.</p>
      <label className="block text-sm font-semibold">Restaurant logo URL<input aria-label="Kiosk logo URL" className={inputClass} value={display.logoUrl || ''} onChange={e => setDisplay({ ...display, logoUrl: e.target.value })} placeholder="https://… or /assets/…" /></label>
      <label className="block text-sm font-semibold">Upload kiosk logo (PNG, JPEG or WebP, under 2MB)<input aria-label="Upload kiosk logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setMessage('Choose a PNG, JPEG or WebP image under 2MB.'); return; }
        const reader = new FileReader(); reader.onload = () => setDisplay(current => ({ ...current, logoUrl: String(reader.result) })); reader.readAsDataURL(file);
      }} /></label>
      <label className="block text-sm font-semibold">Kiosk accent color<input aria-label="Kiosk accent color" type="color" value={display.accentColor || '#EF6A0B'} onChange={e => setDisplay({ ...display, accentColor: e.target.value })} /></label>
      {display.logoUrl && <img src={display.logoUrl} alt="Kiosk logo preview" className="h-20 max-w-full object-contain" />}
      <div className="grid gap-4 sm:grid-cols-2">{welcomeFields.map(([key, label]) => <label key={key} className="text-sm font-semibold">{label}<input aria-label={label} className={inputClass} maxLength={key === 'backgroundImageUrl' ? 4000000 : 2000} value={welcome[key] || ''} onChange={e => setWelcome({ ...welcome, [key]: e.target.value })} /></label>)}</div>
      {(['showHeritageArtwork', 'showPromoBanner'] as const).map(key => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={welcome[key]} onChange={e => setWelcome({ ...welcome, [key]: e.target.checked })} />{key === 'showHeritageArtwork' ? 'Show welcome artwork' : 'Show promotion banner'}</label>)}
      <label className="block text-sm font-semibold">Idle warning after (seconds)<input aria-label="Kiosk idle warning" type="number" min={5} max={3600} className={inputClass} value={display.idleWarningAfterSeconds} onChange={e => setDisplay({ ...display, idleWarningAfterSeconds: Number(e.target.value) })} /></label>
      <label className="block text-sm font-semibold">Idle reset countdown (seconds)<input aria-label="Kiosk idle countdown" type="number" min={3} max={120} className={inputClass} value={display.idleResetCountdownSeconds} onChange={e => setDisplay({ ...display, idleResetCountdownSeconds: Number(e.target.value) })} /></label>
    </div>
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <h3 className="font-bold">Customer screen wording by language</h3>
      <p className="text-sm text-slate-600">Edit welcome, menu, cart, checkout, payment, confirmation and help labels. Empty values use the default wording. Values containing placeholders should retain those placeholders.</p>
      <div className="flex gap-3"><select aria-label="Kiosk content language" value={language} onChange={e => setLanguage(e.target.value as SupportedLanguage)} className={inputClass}>{['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select><input aria-label="Search kiosk wording" placeholder="Search text or screen label" value={query} onChange={e => setQuery(e.target.value)} className={inputClass} /></div>
      <div className="max-h-[480px] overflow-auto space-y-3">{Object.entries(catalog).filter(([key, value]) => typeof value === 'string' && `${key} ${value}`.toLowerCase().includes(query.toLowerCase())).map(([key, value]) => <label className="block text-xs text-slate-600" key={key}>{key}<input aria-label={`Kiosk wording ${key}`} maxLength={2000} className={inputClass} placeholder={value} value={display.texts?.[language]?.[key] || ''} onChange={e => setDisplay({ ...display, texts: { ...display.texts, [language]: { ...display.texts?.[language], [key]: e.target.value } } })} /></label>)}</div>
    </div>
    <button disabled={busy} className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50" onClick={async () => {
      setBusy(true); setMessage('');
      try {
        if (!Number.isInteger(display.idleWarningAfterSeconds) || display.idleWarningAfterSeconds < 5 || display.idleWarningAfterSeconds > 3600 || !Number.isInteger(display.idleResetCountdownSeconds) || display.idleResetCountdownSeconds < 3 || display.idleResetCountdownSeconds > 120) throw new Error('Use an idle warning of 5–3600 seconds and countdown of 3–120 seconds.');
        KioskDisplaySettingsRepository.updateSettings(display); WelcomeScreenSettingsRepository.updateSettings(welcome);
        await syncKioskConfiguration({ push: true }); setMessage('Kiosk settings published. Connected kiosks receive them automatically.'); showToast('Kiosk settings published.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not publish kiosk settings.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Publishing…' : 'Save & Publish Kiosk Settings'}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
