import React, { useEffect, useRef, useState } from 'react';
import { Check, Eye, ImagePlus, Monitor, RotateCcw, Save, Smartphone, Trash2 } from 'lucide-react';
import { KioskWelcomeScreen } from '@jamanvaar/ui';
import { db, KeyValueStore, KioskConfigurationRepository, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { CUSTOM_WELCOME_MAX_COUNT, DEFAULT_WELCOME_PRESENTATION, isWelcomeImageUrl, optimizeWelcomeUpload, resolveMenuImage, welcomeBackgroundUrl, welcomePresentation } from '@jamanvaar/utils';
import type { WelcomeScreenPresentation, WelcomeScreenSettings } from '@jamanvaar/types';
import { getTranslation } from '@jamanvaar/i18n';
import { fetchCloudKiosks, fetchWelcomeDesignCatalog, sendKioskCommand, type CloudKiosk, type WelcomeDesignCatalog } from '../../cloud/cloudClient';

const input = 'mt-1 w-full rounded-xl border border-[#ddd4c7] bg-white px-3 py-2.5 text-sm text-[#0b2b40] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const sizes = [[768,1024],[800,1280],[820,1180],[1024,768],[1280,800],[1366,768],[1920,1080]];
export function KioskWelcomeScreenPanel({ kiosks, showToast }: { kiosks: CloudKiosk[]; showToast: (message: string) => void }) {
  const [scope, setScope] = useState('branch');
  const [catalog, setCatalog] = useState<WelcomeDesignCatalog>({ designs: [], maxDesigns: 0 });
  const [catalogMessage, setCatalogMessage] = useState('Loading your available designs…');
  useEffect(() => {
    let active = true;
    const refresh = () => void fetchWelcomeDesignCatalog().then(value => {
      if (active) { setCatalog(value); setCatalogMessage(''); }
    }).catch(() => { if (active) setCatalogMessage('Cannot load available designs. Your current welcome screen is preserved. Reconnect and refresh the collection before choosing another design.'); });
    refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  const [draft, setDraft] = useState<WelcomeScreenPresentation>(() => welcomePresentation(WelcomeScreenSettingsRepository.getSettings()));
  const [custom, setCustom] = useState(() => structuredClone(WelcomeScreenSettingsRepository.getSettings().customBackgrounds || []));
  const [screenSize, setScreenSize] = useState([800,1280]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const loadedVersion = useRef(KioskConfigurationRepository.snapshot().updatedAt);
  const uploadInput = useRef<HTMLInputElement>(null);
  const branchId = KeyValueStore.get('jamanvaar_bound_branch_id') || undefined;
  const branchKiosks = kiosks.filter(k => k.branchId === branchId);
  const settings = WelcomeScreenSettingsRepository.getSettings();
  const active = welcomePresentation(settings, scope === 'branch' ? undefined : scope);
  const selectedUrl = welcomeBackgroundUrl(draft, custom);
  const configurationVersion = KioskConfigurationRepository.snapshot().updatedAt;
  useEffect(() => {
    if (!dirty && !busy && loadedVersion.current !== configurationVersion) {
      loadedVersion.current = configurationVersion;
      setDraft(welcomePresentation(WelcomeScreenSettingsRepository.getSettings(), scope === 'branch' ? undefined : scope));
      setCustom(structuredClone(WelcomeScreenSettingsRepository.getSettings().customBackgrounds || []));
    }
  }, [configurationVersion, scope, dirty, busy]);
  const library = [...catalog.designs.map(b => ({ ...b, custom: false })), ...custom.map(b => ({ ...b, landscapeImageUrl: undefined, category: 'Your restaurant', thumbnailUrl: b.imageUrl, custom: true }))];
  const update = (partial: Partial<WelcomeScreenPresentation>) => { setDraft(current => ({ ...current, ...partial })); setDirty(true); setMessage(''); };
  function chooseScope(next: string) {
    if (dirty && !window.confirm('Discard the preview changes and switch kiosk scope?')) return;
    setScope(next); setDraft(welcomePresentation(settings, next === 'branch' ? undefined : next));
    setCustom(structuredClone(settings.customBackgrounds || [])); setDirty(false); setMessage(''); loadedVersion.current = KioskConfigurationRepository.snapshot().updatedAt;
  }
  async function apply(inherit = false) {
    setBusy(true); setMessage('');
    try {
      const latest = await fetchWelcomeDesignCatalog(); setCatalog(latest);
      const unchanged = draft.backgroundId === active.backgroundId && draft.backgroundImageUrl === active.backgroundImageUrl && draft.backgroundLandscapeImageUrl === active.backgroundLandscapeImageUrl;
      if (!inherit && draft.backgroundId && !unchanged && !custom.some(b => b.id === draft.backgroundId) && !latest.designs.some(b => b.id === draft.backgroundId)) throw Error('Super Admin changed design access. Select an available background from the refreshed collection.');
      if (!isWelcomeImageUrl(draft.logoUrl || '') || !isWelcomeImageUrl(draft.backgroundImageUrl || '')) throw Error('Use a local asset, HTTPS image or uploaded photo.');
      if (loadedVersion.current !== KioskConfigurationRepository.snapshot().updatedAt) throw Error('Kiosk settings changed elsewhere. Reload this page to review the latest settings before applying.');
      const current = structuredClone(WelcomeScreenSettingsRepository.getSettings());
      let next: WelcomeScreenSettings;
      if (scope === 'branch') next = {
        headingText: undefined, subtitleText: undefined, startOrderButtonText: undefined, supportingText: undefined,
        promoBannerText: undefined, backgroundImageUrl: undefined, backgroundLandscapeImageUrl: undefined, restaurantName: undefined, logoUrl: undefined,
        ...draft, customBackgrounds: custom, deviceOverrides: current.deviceOverrides
      };
      else {
        const overrides = { ...current.deviceOverrides };
        if (inherit) delete overrides[scope]; else overrides[scope] = draft;
        next = { ...current, deviceOverrides: overrides, customBackgrounds: custom };
      }
      WelcomeScreenSettingsRepository.updateSettings(next);
      const version = KioskConfigurationRepository.snapshot().updatedAt; loadedVersion.current = version;
      await syncKioskConfiguration({ push: true });
      // Existing device commands provide a real acknowledgement of this version, including offline delivery.
      // The sidebar fleet may still be loading or have missed a newly activated kiosk. Resolve targets at Apply.
      let currentFleet: CloudKiosk[];
      try { currentFleet = await fetchCloudKiosks(); }
      catch {
        setDirty(false); setMessage('Published to the server. Could not refresh the kiosk fleet to request acknowledgements. Connected kiosks still receive configuration through normal sync; retry Apply to confirm delivery.'); return;
      }
      const eligible = currentFleet.filter(k => k.branchId === branchId);
      const targets = scope === 'branch' ? eligible : eligible.filter(k => k.id === scope);
      const queue = await Promise.allSettled(targets.map(k => sendKioskCommand(k.id, 'REQUEST_SYNC', { scope: 'WELCOME', configVersion: version })));
      const failures = queue.filter(r => r.status === 'rejected').length;
      setDirty(false); setDraft(welcomePresentation(WelcomeScreenSettingsRepository.getSettings(), scope === 'branch' ? undefined : scope));
      setMessage(failures ? 'Published to the server. Some kiosk sync requests could not be queued; connected kiosks still receive configuration through normal sync.' : 'Welcome screen published. Waiting for kiosk acknowledgements; offline kiosks receive it when they reconnect.');
      showToast('Welcome screen updated');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not publish the welcome screen. Your changes remain available to retry.'); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      if (!replaceId && custom.length >= CUSTOM_WELCOME_MAX_COUNT) throw Error('Keep up to three custom backgrounds per branch. Replace or delete one before uploading another.');
      const optimized = await optimizeWelcomeUpload(file);
      const id = replaceId || `custom-${crypto.randomUUID()}`;
      const background = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0,80) || 'Custom background', imageUrl: optimized.imageUrl, width: optimized.width, height: optimized.height };
      setCustom(current => replaceId ? current.map(b => b.id === replaceId ? background : b) : [...current, background]);
      update({ backgroundId: id, backgroundImageUrl: undefined, backgroundLandscapeImageUrl: undefined }); setMessage(optimized.warning || 'Custom background optimized. Preview it, then apply to save and publish.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not upload this image.'); }
    finally { setBusy(false); setReplaceId(null); if (uploadInput.current) uploadInput.current.value = ''; }
  }
  return <div className="space-y-6" data-testid="kiosk-welcome-manager" aria-busy={busy}>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Kiosk · Appearance</p><h1 className="mt-1 text-3xl font-extrabold text-[#0b2b40]">Welcome Screen</h1><p className="mt-2 text-sm text-slate-600">Customize the experience guests see before they start ordering.</p></div><div className="flex gap-2"><button type="button" className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold" onClick={() => setResetOpen(true)} disabled={busy}><RotateCcw size={16} />Reset to Default</button><button type="button" className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60" onClick={() => void apply()} disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Apply to Kiosk'}</button></div></header>
    <fieldset disabled={busy} className="min-w-0 space-y-6 border-0 p-0">
    <div className="rounded-2xl border border-[#e7ded1] bg-white p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-[#0b2b40]">Apply to<select aria-label="Welcome screen scope" className={input} value={scope} onChange={e => chooseScope(e.target.value)}><option value="branch">All kiosks in this branch</option>{branchKiosks.map(k => <option key={k.id} value={k.id}>{k.name} · {k.id.slice(0,8)}</option>)}</select></label><div className="text-sm text-slate-600"><p className="font-bold text-[#0b2b40]">{db.outlet.name}</p><p className="mt-1">Branch settings stay within this branch. Individual kiosks can use their own design. Switch branch before configuring another location.</p>{scope !== 'branch' && <button className="mt-2 font-bold text-orange-700" disabled={busy} onClick={() => void apply(true)}>Use branch default on this kiosk</button>}</div></div></div>
    {message && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-[#774a24]">{message}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5"><section className="space-y-4 rounded-2xl border border-[#e7ded1] bg-white p-5"><h2 className="text-lg font-bold text-[#0b2b40]">Hotel name & welcome message</h2><p className="text-xs text-slate-500">1. Enter the hotel or restaurant name. 2. Add a greeting and personal message. These appear immediately in the preview. Leave a field empty to use the restaurant or language default.</p><div className="grid gap-4 sm:grid-cols-2">{([
        ['restaurantName','Hotel / restaurant name',160,db.restaurant.name], ['headingText','Welcome greeting',200,'Welcome to'], ['subtitleText','Custom welcome message',300,'Authentic flavors. A little moment of happiness.'], ['startOrderButtonText','Start Order button',60,'Start Order'], ['supportingText','Touch instruction',180,'Touch the screen to begin your order'], ['logoUrl','Restaurant logo URL',2000,db.kioskDisplaySettings.logoUrl || '']
      ] as const).map(([key,label,max,placeholder]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input className={input} aria-label={`Welcome ${label}`} maxLength={max} placeholder={placeholder} value={draft[key] || ''} onChange={e => update({ [key]: e.target.value })} /></label>)}</div><p className="text-xs text-slate-500">Upload your restaurant logo in Appearance & Content. Names and messages are live UI, never printed into a background.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showHeritageArtwork} onChange={e => update({ showHeritageArtwork: e.target.checked })} />Show freshly prepared note</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showPromoBanner} onChange={e => update({ showPromoBanner: e.target.checked })} />Show promotion</label>{draft.showPromoBanner && <input aria-label="Welcome promotion message" className={input} maxLength={200} value={draft.promoBannerText || ''} onChange={e => update({ promoBannerText: e.target.value })} />}</section><section className="rounded-2xl border border-[#e7ded1] bg-white p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-lg text-[#0b2b40]">Background collection</h2><p className="text-xs text-slate-500">{catalog.designs.length} available platform designs ? Selection limit: {catalog.maxDesigns || 'loading'}. Live text always stays editable.</p></div><button type="button" disabled={busy} className="flex gap-2 rounded-xl border px-3 py-2 text-sm font-bold" onClick={() => { setReplaceId(null); uploadInput.current?.click(); }}><ImagePlus size={16} />Upload Custom Background</button></div><input ref={uploadInput} aria-label="Upload custom welcome background" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => void upload(e.target.files?.[0])} />
      <p className="mb-4 text-xs text-slate-500">Recommended: 1080 × 1920 portrait. PNG, JPG or WebP, up to 12 MB. Uploads are optimized before saving. Three custom designs per branch.</p>
      {catalogMessage && <p role="status" className="mb-3 text-sm text-amber-700">{catalogMessage}</p>}<button type="button" className="mb-3 text-sm font-bold text-orange-700" onClick={() => void fetchWelcomeDesignCatalog().then(v => { setCatalog(v); setCatalogMessage(''); }).catch(() => setCatalogMessage('Could not refresh design access. Try again when connected.'))}>Refresh available designs</button>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{library.map(b => <article key={b.id} data-testid={`welcome-card-${b.id}`} className={`overflow-hidden rounded-xl border-2 ${draft.backgroundId === b.id ? 'border-orange-500 ring-2 ring-orange-100' : 'border-[#ede7de]'}`}><button type="button" aria-label={`Preview ${b.name}`} onClick={() => update({ backgroundId: b.id, backgroundImageUrl: b.id.startsWith('platform-') ? b.imageUrl : undefined, backgroundLandscapeImageUrl: b.id.startsWith('platform-') ? b.landscapeImageUrl : undefined })} className="block w-full text-left"><img loading="lazy" src={resolveMenuImage(b.thumbnailUrl)} alt={b.name} className="aspect-video w-full bg-[#f5eee3] object-cover" /><div className="p-3"><div className="flex flex-wrap gap-1 text-[10px] font-bold"><span className="rounded bg-[#f4eee5] px-2 py-1">{b.custom ? 'Custom' : 'Default'}</span>{active.backgroundId === b.id && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Active</span>}{draft.backgroundId === b.id && <span className="flex items-center gap-1 rounded bg-orange-50 px-2 py-1 text-orange-700"><Check size={11} />Selected</span>}</div><h3 className="mt-2 text-sm font-bold text-[#0b2b40]">{b.name}</h3><p className="mt-1 text-xs text-slate-500">{b.category}</p><span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-orange-700"><Eye size={12} />Preview</span></div></button>{b.custom && <div className="flex flex-wrap gap-2 border-t p-2 text-xs"><button type="button" disabled={busy} onClick={() => { setReplaceId(b.id); uploadInput.current?.click(); }} className="font-bold text-slate-600">Replace</button><button aria-label={`Delete ${b.name}`} type="button" disabled={busy} onClick={() => {
        const used = active.backgroundId === b.id || draft.backgroundId === b.id || Object.values(settings.deviceOverrides || {}).some(w => w.backgroundId === b.id) || settings.backgroundId === b.id;
        if (used) { setMessage('Select and apply another background on every kiosk using this image before deleting it.'); return; }
        if (window.confirm(`Delete ${b.name}? Apply to Kiosk to publish this library change.`)) { setCustom(current => current.filter(v => v.id !== b.id)); setDirty(true); }
      }} className="flex gap-1 font-bold text-rose-700"><Trash2 size={12} />Delete</button></div>}</article>)}</div></section>
</div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4"><section className="rounded-2xl border border-[#e7ded1] bg-white p-5"><div className="flex justify-between gap-2"><h2 className="text-lg font-bold text-[#0b2b40]">Kiosk Preview</h2><span className="text-xs text-orange-700">{dirty ? 'Preview · Not applied' : 'Saved configuration'}</span></div><div className="my-4 flex gap-2"><button type="button" className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => setScreenSize([800,1280])}><Smartphone size={14} />Portrait</button><button type="button" className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => setScreenSize([1366,768])}><Monitor size={14} />Landscape</button><select aria-label="Kiosk preview resolution" className="min-w-0 rounded-lg border text-xs" value={screenSize.join('x')} onChange={e => setScreenSize(e.target.value.split('x').map(Number))}>{sizes.map(size => <option key={size.join('x')} value={size.join('x')}>{size.join(' × ')}</option>)}</select></div><div className="mx-auto overflow-hidden rounded-[24px] border-[8px] border-[#102b3e] bg-[#102b3e] shadow-xl" style={{ width: '100%', maxWidth: screenSize[0] < screenSize[1] ? 340 : undefined, aspectRatio: `${screenSize[0]}/${screenSize[1]}` }}>
      <KioskWelcomeScreen preview settings={draft} backgroundUrl={selectedUrl} restaurantName={db.restaurant.name} logoUrl={db.kioskDisplaySettings.logoUrl} accentColor={db.kioskDisplaySettings.accentColor}
        heading={draft.headingText || (db.kioskDisplaySettings.texts?.en?.welcomeLine1 || getTranslation('en').welcomeLine1).replace('{{name}}', '')}
        subtitle={draft.subtitleText || db.kioskDisplaySettings.texts?.en?.tagline || getTranslation('en').tagline}
        buttonText={draft.startOrderButtonText || db.kioskDisplaySettings.texts?.en?.startOrder || getTranslation('en').startOrder}
        instruction={draft.supportingText || db.kioskDisplaySettings.texts?.en?.touchToBegin || getTranslation('en').touchToBegin}
      /></div><p className="mt-3 text-center text-xs text-slate-500">Same renderer as the customer kiosk · English preview · {screenSize.join(' × ')}</p></section>
      <section className="space-y-3 rounded-2xl border border-[#e7ded1] bg-white p-5"><h2 className="font-bold text-[#0b2b40]">Image fit & position</h2><label className="block text-xs font-bold text-slate-600">Fit<select aria-label="Welcome background fit" className={input} value={draft.backgroundFit || 'cover'} onChange={e => update({ backgroundFit: e.target.value as 'cover' | 'contain' })}><option value="cover">Fill screen · Cover</option><option value="contain">Show full photo · Soft backdrop</option></select></label>{([
        ['backgroundPositionX','Horizontal position',0,100,1,50], ['backgroundPositionY','Vertical position',0,100,1,50], ['backgroundZoom','Zoom',1,1.8,0.05,1], ['overlayOpacity','Readability overlay',0,0.85,0.05,0.2]
      ] as const).map(([key,label,min,max,step,defaultValue]) => <label className="block text-xs font-bold text-slate-600" key={key}>{label} · {draft[key] ?? defaultValue}<input aria-label={`Welcome ${label}`} className="mt-2 w-full accent-orange-600" type="range" min={min} max={max} step={step} value={draft[key] ?? defaultValue} onChange={e => update({ [key]: Number(e.target.value) })} /></label>)}</section>
      <section className="rounded-2xl border border-[#e7ded1] bg-white p-5 text-xs"><h2 className="font-bold text-[#0b2b40]">Configuration delivery</h2><p className="mt-2 break-all text-slate-500">Version: {KioskConfigurationRepository.snapshot().updatedAt}</p><p className="mt-2 font-bold">{KioskConfigurationRepository.pending() ? 'Pending publication · Retry Apply when connected' : KioskConfigurationRepository.snapshot().updatedAt === '1970-01-01T00:00:00.000Z' ? 'Bundled default - no custom configuration published' : 'Published configuration'}</p>{branchKiosks.map(k => { const command=k.lastCommand; const version=KioskConfigurationRepository.snapshot().updatedAt; const synced=command?.commandType === 'REQUEST_SYNC' && command.status === 'SUCCEEDED' && (command.result?.configVersion === version); return <p key={k.id} className="mt-3 text-slate-600">{k.name}: <strong className={synced ? 'text-emerald-700' : 'text-amber-700'}>{synced ? 'Synced' : command?.status === 'FAILED' && command.payload?.scope === 'WELCOME' ? 'Sync failed · retry Apply' : 'Pending sync / not yet acknowledged'}</strong></p>; })}<p className="mt-3 text-slate-500">Online kiosks receive configuration events. Offline kiosks keep their last saved design and catch up after reconnecting.</p></section></aside>
    </div>
    </fieldset>
    {resetOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Reset welcome screen"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Reset welcome screen?</h2><p className="mt-3 text-sm text-slate-600">Restore the default JAMANVAAR design for the selected scope. Custom images stay in your library. Review the preview, then Apply to Kiosk.</p><div className="mt-5 flex justify-end gap-3"><button className="rounded-xl border px-4 py-2" onClick={() => setResetOpen(false)}>Cancel</button><button className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white" onClick={() => { setDraft({ ...DEFAULT_WELCOME_PRESENTATION, backgroundId: catalog.designs[0]?.id || DEFAULT_WELCOME_PRESENTATION.backgroundId, backgroundImageUrl: catalog.designs[0]?.id.startsWith('platform-') ? catalog.designs[0].imageUrl : undefined, backgroundLandscapeImageUrl: catalog.designs[0]?.id.startsWith('platform-') ? catalog.designs[0].landscapeImageUrl : undefined }); setDirty(true); setResetOpen(false); }}>Reset</button></div></div></div>}
  </div>;
}
