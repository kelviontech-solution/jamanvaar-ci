import { useConfirm } from '@jamanvaar/ui';
import { useKioskDraft } from '../kiosk/useKioskDraft';
import { requestConfigurationReceipts } from '../kiosk/configurationDelivery';
import { useState } from 'react';
import { db, KioskDisplaySettingsRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { getTranslation, KIOSK_CONTENT_CATALOG, type SupportedLanguage } from '@jamanvaar/i18n';
import { ImageIcon, Clock, Languages, Info, Save, Search as SearchIcon, Pencil } from 'lucide-react';

const LANGUAGE_LABEL: Record<string, string> = {
  en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada'
};

/** A bounded-integer text field that lets the box go empty while typing instead of collapsing to 0.
 * BUG: binding a number input's value straight to a number state (value={n}, onChange={Number(e.target.value)})
 * means Number('') === 0, so clearing the box to retype wrote 0 into the real setting immediately,
 * and the field then looked permanently stuck at "0" no matter what was typed next. This keeps its
 * own string buffer while focused and only commits (or reverts) a real number on blur. */
function BoundedNumberField({
  label, hint, value, min, max, onCommit
}: { label: string; hint: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  return (
    <div>
      <label className="block text-xs font-bold text-jaman-navy mb-1">{label}</label>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.trunc(Number(draft));
          if (draft !== null && draft.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
          setDraft(null);
        }}
      />
      <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

export function KioskContentPanel({ showToast }: { showToast: (message: string) => void }) {
  const {confirm, confirmDialog} = useConfirm();
  const [baseline,setBaseline] = useState(() => JSON.stringify(db.kioskDisplaySettings));
  const [display, setDisplay] = useState(() => structuredClone(db.kioskDisplaySettings));
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState('Menu');
  const [advanced, setAdvanced] = useState(false);
  const screenFor = (key: string) => /receipt|invoice|bill|email|whatsapp/i.test(key) ? 'Receipt' : /pay|upi|cash|card|transaction/i.test(key) ? 'Payment' : /cart|checkout|quantity|total|discount/i.test(key) ? 'Cart & checkout' : /welcome|start_order|language|restaurant/i.test(key) ? 'Welcome & language' : /help|staff|chat|assistant/i.test(key) ? 'Help & assistance' : /confirm|success|token|thank|order_status/i.test(key) ? 'Confirmation' : 'Menu';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const catalog: Record<string, string> = {
    ...Object.fromEntries(Object.entries(getTranslation(language)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    ...KIOSK_CONTENT_CATALOG
  };
  const entries = Object.entries(catalog).filter(([key]) => screen === 'All screens' || screenFor(key) === screen).filter(([key, value]) => `${key} ${value}`.toLowerCase().includes(query.toLowerCase()));
  const overriddenCount = Object.keys(display.texts?.[language] ?? {}).filter((k) => (display.texts?.[language]?.[k] ?? '').trim() !== '').length;

  const draftGuard=useKioskDraft({scope:'appearance',value:display,dirty:JSON.stringify(display)!==baseline,restore:setDisplay,discard:()=>setDisplay(JSON.parse(baseline))});
  const save = async () => {
    if (!await confirm({title: 'Publish customer kiosk settings?', message: `Apply appearance, timing and wording to the kiosks in ${db.outlet.name || 'this branch'}? Per-device welcome overrides remain available in Welcome Screen. Review the previews before publishing.`, confirmLabel: 'Publish to this branch'})) return;
    setBusy(true); setMessage('');
    try {
      // Defensive, not redundant: BoundedNumberField only ever commits a validated value for an
      // edit made *this session* -- a value already sitting in storage from before this fix existed
      // (e.g. a prior save that landed on 0) would otherwise publish unchanged.
      if (
        !Number.isInteger(display.idleWarningAfterSeconds) || display.idleWarningAfterSeconds < 5 || display.idleWarningAfterSeconds > 3600 ||
        !Number.isInteger(display.idleResetCountdownSeconds) || display.idleResetCountdownSeconds < 3 || display.idleResetCountdownSeconds > 120
      ) {
        throw new Error('Use an idle warning of 5–3600 seconds and countdown of 3–120 seconds.');
      }
      KioskDisplaySettingsRepository.updateSettings(display);
      await syncKioskConfiguration({ push: true });
      setBaseline(JSON.stringify(display)); draftGuard.clear();
      setMessage(await requestConfigurationReceipts());
      showToast('Kiosk settings published.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish kiosk settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {confirmDialog}{draftGuard.ui}
    <div className="space-y-6" data-testid="kiosk-content-panel">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">Kiosk Appearance & Content</h1>
        <p className="text-sm text-[#4A5568] mt-1">
          Customize this branch's customer kiosk. Menu images, prices, availability and modifiers are managed in
          Menu & Categories and Customisations & Tax. Receipt content and layout are managed in Receipt & E-Bill.
        </p>
      </div>

      {/* 1. Branding */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-jaman-border shadow-2xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-jaman-navy flex items-center justify-center shrink-0">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-jaman-navy">Branding</h3>
            <p className="text-xs text-slate-500 mt-0.5">The logo and accent color shown on this kiosk's screens.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Restaurant logo URL</label>
              <input
                aria-label="Kiosk logo URL"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                value={display.logoUrl || ''}
                onChange={(e) => setDisplay({ ...display, logoUrl: e.target.value })}
                placeholder="https://… or /assets/…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">Upload kiosk logo</label>
                <input
                  aria-label="Upload kiosk logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:bg-jaman-navy file:text-white file:text-xs file:font-bold file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
                      setMessage('Choose a PNG, JPEG or WebP image under 2MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setDisplay((current) => ({ ...current, logoUrl: String(reader.result) }));
                    reader.readAsDataURL(file);
                  }}
                />
                <p className="text-[11px] text-slate-500 mt-1">PNG, JPEG or WebP, under 2MB.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-jaman-navy mb-1">Accent color</label>
                <input
                  aria-label="Kiosk accent color"
                  type="color"
                  className="w-full h-10 rounded-xl border border-jaman-border cursor-pointer"
                  value={display.accentColor || '#EF6A0B'}
                  onChange={(e) => setDisplay({ ...display, accentColor: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="w-full lg:w-40 shrink-0">
            <span className="block text-xs font-bold text-jaman-navy mb-1">Preview</span>
            <div className="h-28 w-full lg:w-40 rounded-xl border border-jaman-border bg-jaman-ivory flex items-center justify-center overflow-hidden">
              {display.logoUrl ? (
                <img src={display.logoUrl} alt="Kiosk logo preview" className="h-20 max-w-full object-contain" />
              ) : (
                <span className="text-[11px] text-slate-400 text-center px-2">No logo set</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Idle & Session Timing */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-jaman-border shadow-2xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-jaman-navy flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-jaman-navy">Idle & Session Timing</h3>
            <p className="text-xs text-slate-500 mt-0.5">When an untouched kiosk warns the guest, and how long before it resets to the welcome screen.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BoundedNumberField
            label="Idle warning after (seconds)"
            hint="5–3600 seconds of no touch before the warning appears."
            value={display.idleWarningAfterSeconds}
            min={5}
            max={3600}
            onCommit={(n) => setDisplay((d) => ({ ...d, idleWarningAfterSeconds: n }))}
          />
          <BoundedNumberField
            label="Idle reset countdown (seconds)"
            hint="3–120 seconds the warning counts down before the session resets."
            value={display.idleResetCountdownSeconds}
            min={3}
            max={120}
            onCommit={(n) => setDisplay((d) => ({ ...d, idleResetCountdownSeconds: n }))}
          />
        </div>
      </div>

      {/* 3. Welcome Screen cross-link */}
      <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          Choose backgrounds, preview the welcome screen and edit its message in{' '}
          <a href="/kiosk-admin/welcome-screen" className="font-bold underline">Kiosk Welcome Screen</a>.
        </p>
      </div>

      {/* 4. Customer screen wording by language */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-jaman-border shadow-2xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-jaman-navy flex items-center justify-center shrink-0">
            <Languages className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-jaman-navy">Customer Screen Wording by Language</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Edit welcome, menu, cart, checkout, payment, confirmation and help labels. Empty values use the default
              wording. Values containing placeholders should retain those placeholders.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center"><label className="text-sm font-bold">Customer screen <select aria-label="Customer screen" className="rounded-xl border p-3 ml-2" value={screen} onChange={e => setScreen(e.target.value)}>{['Welcome & language', 'Menu', 'Cart & checkout', 'Payment', 'Confirmation', 'Receipt', 'Help & assistance', 'All screens'].map(name => <option key={name}>{name}</option>)}</select></label><label className="text-xs"><input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} /> Show technical keys</label></div>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            aria-label="Kiosk content language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="sm:w-48 bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
          >
            {['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn'].map((l) => (
              <option key={l} value={l}>{LANGUAGE_LABEL[l] ?? l.toUpperCase()}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              aria-label="Search kiosk wording"
              placeholder="Search text or screen label"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-jaman-ivory border border-jaman-border rounded-xl pl-9 pr-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Showing {entries.length} of {Object.keys(catalog).length} labels</span>
          <span>{overriddenCount} customized in {LANGUAGE_LABEL[language] ?? language}</span>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-xl border border-jaman-border divide-y divide-jaman-border">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No wording matches "{query}".</div>
          ) : (
            entries.map(([key, defaultValue]) => {
              const overrideValue = display.texts?.[language]?.[key] || '';
              const isOverridden = overrideValue.trim() !== '';
              return (
                <div key={key} className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 hover:bg-jaman-cream/60">
                  <div className="sm:w-[42%] min-w-0">
                    <div className="text-sm text-jaman-navy font-semibold leading-snug">{defaultValue}</div>
                    {advanced && <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={key}>{key}</div>}
                    {isOverridden && <p className="text-xs mt-1 text-brand">Preview: {overrideValue}</p>}
                  </div>
                  <div className="flex-1 relative">
                    {isOverridden && (
                      <Pencil className="w-3 h-3 text-jaman-saffron absolute left-2.5 top-1/2 -translate-y-1/2" />
                    )}
                    <input
                      aria-label={`Kiosk wording: ${defaultValue}`}
                      maxLength={2000}
                      className={`w-full bg-white border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy ${isOverridden ? 'border-jaman-saffron/60 pl-7' : 'border-jaman-border'}`}
                      placeholder={defaultValue}
                      value={overrideValue}
                      onChange={(e) =>
                        setDisplay({ ...display, texts: { ...display.texts, [language]: { ...display.texts?.[language], [key]: e.target.value } } })
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          className="px-5 py-2.5 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 shadow-2xs transition-colors"
          onClick={() => void save()}
        >
          <Save className="w-4 h-4" />
          <span>{busy ? 'Publishing…' : 'Save & Publish Kiosk Settings'}</span>
        </button>
        {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
      </div>
    </div>
    </>
  );
}
