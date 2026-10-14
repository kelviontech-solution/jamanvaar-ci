import { useEffect, useRef, useState } from 'react';
import { Check, Eye, ImagePlus, Monitor, RotateCcw, Save, Smartphone, Trash2 } from 'lucide-react';
import { KioskWelcomeScreen, useConfirm, Modal } from '@jamanvaar/ui';
import { db, KeyValueStore, KioskConfigurationRepository, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { CUSTOM_WELCOME_MAX_COUNT, DEFAULT_WELCOME_PRESENTATION, isWelcomeImageUrl, optimizeWelcomeUpload, resolveMenuImage, welcomeBackgroundUrl, welcomePresentation } from '@jamanvaar/utils';
import type { WelcomeScreenPresentation, WelcomeScreenSettings } from '@jamanvaar/types';
import { getTranslation } from '@jamanvaar/i18n';
import { fetchCloudKiosks, fetchWelcomeDesignCatalog, sendKioskCommand, type CloudKiosk, type WelcomeDesignCatalog } from '../../cloud/cloudClient';

const input = 'mt-1 w-full rounded-xl border border-[#ddd4c7] bg-white px-3 py-2.5 text-sm text-[#0b2b40] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const sizes = [[768,1024],[800,1280],[820,1180],[1024,768],[1280,800],[1366,768],[1920,1080]];
export function KioskWelcomeScreenPanel({ kiosks, showToast }: { kiosks: CloudKiosk[]; showToast: (message: string) => void }) {
  const { confirm, confirmDialog } = useConfirm();
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
  const historyKey = `welcome-previous:${db.restaurant.id}:${branchId || 'branch'}:${scope}`;
  const previousPresentation = KeyValueStore.get(historyKey);
  const targetKiosk = branchKiosks.find(k => k.id === scope);
  const hasTerminalOverride = scope !== 'branch' && Boolean(settings.deviceOverrides?.[scope]);
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
  async function chooseScope(next: string) {
    if (dirty && !(await confirm({ title: 'Switch kiosk scope?', message: 'The preview changes you have not applied will be discarded.', confirmLabel: 'Discard & switch', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
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
      if (JSON.stringify(welcomePresentation(current, scope === 'branch' ? undefined : scope)) !== JSON.stringify(draft)) KeyValueStore.set(historyKey, JSON.stringify(welcomePresentation(current, scope === 'branch' ? undefined : scope)));
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
    {dirty && <div role="status" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><span>Preview changes have not been applied to your kiosks.</span><button type="button" disabled={busy} onClick={() => void apply()} className="min-h-11 rounded-xl bg-[#bf540f] px-4 font-bold text-white">{busy ? 'Applying…' : 'Apply changes'}</button></div>}
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Kiosk · Appearance</p><h1 className="mt-1 text-3xl font-extrabold text-[#0b2b40]">Welcome Screen</h1><p className="mt-2 text-sm text-slate-600">Customize the experience guests see before they start ordering.</p></div><div className="flex gap-2"><button type="button" className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold" onClick={() => setResetOpen(true)} disabled={busy}><RotateCcw size={16} />Reset to Default</button><button type="button" className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60" onClick={() => void apply()} disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Apply to Kiosk'}</button></div></header>
    {previousPresentation && <button type="button" disabled={busy} className="min-h-11 rounded-xl border bg-white px-4 py-2 font-bold text-sm" onClick={async () => {if (!await confirm({title:'Restore previous welcome design?',message:'Load the previous published presentation for this scope into the preview. Other kiosks stay unchanged. Review, then Apply to publish.',confirmLabel:'Restore preview'})) return;try {const previous=JSON.parse(previousPresentation) as WelcomeScreenPresentation;if(!isWelcomeImageUrl(previous.backgroundImageUrl || ''))throw Error('Previous design is invalid');setDraft(previous);setDirty(true);setMessage('Previous published design restored to the preview. Apply to publish.');}catch {setMessage('Previous design could not be loaded. Choose a design from the collection.');}}}>Restore previous published design</button>}
    <fieldset disabled={busy} className="min-w-0 space-y-6 border-0 p-0">
    {branchKiosks.length > 1 && <section aria-label="Compare kiosk welcome designs" className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-bold">Compare kiosks in this branch</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{branchKiosks.map(k=>{const presentation=welcomePresentation(settings,k.id);return <button type="button" key={k.id} className="rounded-xl border p-3 text-left space-y-2" onClick={()=>void chooseScope(k.id)}><img src={resolveMenuImage(welcomeBackgroundUrl(presentation,custom))} alt={`${k.name} saved background`} className="aspect-video w-full rounded-lg object-cover"/><strong className="block">{k.name}</strong><span className="block text-xs text-slate-500">{settings.deviceOverrides?.[k.id] ? 'Individual design' : 'Follows branch default'} ? {catalog.designs.find(d=>d.id===presentation.backgroundId)?.name || presentation.backgroundId || 'Uploaded background'}</span></button>;})}</div></section>}
    <section aria-label="Welcome configuration scope" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-2 text-sm text-[#0b253a]">
      <h2 className="font-bold">{scope === 'branch' ? `Branch default · ${db.outlet.name}` : `This kiosk only · ${targetKiosk?.name || scope}`}</h2>
      <p>{scope === 'branch' ? `Applies to ${branchKiosks.length} kiosk(s) in this branch. Kiosks with their own saved override keep their design.` : hasTerminalOverride ? 'This terminal has its own saved welcome screen. Applying here does not change other kiosks.' : 'This terminal currently follows the branch default. Applying creates an override for this terminal only.'}</p>
      <p className="font-semibold">{dirty ? 'Unsaved preview — Apply to publish these changes.' : 'Showing the saved configuration.'}</p>
    </section>
    <div className="rounded-2xl border border-[#e7ded1] bg-white p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-[#0b2b40]">Apply to<select aria-label="Welcome screen scope" className={input} value={scope} onChange={e => chooseScope(e.target.value)}><option value="branch">All kiosks in this branch</option>{branchKiosks.map(k => <option key={k.id} value={k.id}>{k.name} · {k.id.slice(0,8)}</option>)}</select></label><div className="text-sm text-slate-600"><p className="font-bold text-[#0b2b40]">{db.outlet.name}</p><p className="mt-1">Branch settings stay within this branch. Individual kiosks can use their own design. Switch branch before configuring another location.</p>{scope !== 'branch' && <button className="mt-2 font-bold text-orange-700" disabled={busy} onClick={() => void apply(true)}>Use branch default on this kiosk</button>}</div></div></div>
    {message && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-[#774a24]">{message}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5"><section className="space-y-4 rounded-2xl border border-[#e7ded1] bg-white p-5"><h2 className="text-lg font-bold text-[#0b2b40]">Hotel name & welcome message</h2><p className="text-xs text-slate-500">1. Enter the hotel or restaurant name. 2. Add a greeting and personal message. These appear immediately in the preview. Leave a field empty to use the restaurant or language default.</p><div className="grid gap-4 sm:grid-cols-2">{([
        ['restaurantName','Hotel / restaurant name',160,db.restaurant.name], ['headingText','Welcome greeting',200,'Welcome to'], ['subtitleText','Custom welcome message',300,'Authentic flavors. A little moment of happiness.'], ['startOrderButtonText','Start Order button',60,'Start Order'], ['supportingText','Touch instruction',180,'Touch the screen to begin your order'], ['logoUrl','Restaurant logo URL',2000,db.kioskDisplaySettings.logoUrl || '']
      ] as const).map(([key,label,max,placeholder]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input className={input} aria-label={`Welcome ${label}`} maxLength={max} placeholder={placeholder} value={draft[key] || ''} onChange={e => update({ [key]: e.target.value })} /></label>)}</div><p className="text-xs text-slate-500">Upload your restaurant logo in Appearance & Content. Names and messages are live UI, never printed into a background.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showHeritageArtwork} onChange={e => update({ showHeritageArtwork: e.target.checked })} />Show freshly prepared note</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showPromoBanner} onChange={e => update({ showPromoBanner: e.target.checked })} />Show promotion</label>{draft.showPromoBanner && <input aria-label="Welcome promotion message" className={input} maxLength={200} value={draft.promoBannerText || ''} onChange={e => update({ promoBannerText: e.target.value })} />}</section><section className="rounded-2xl border border-[#e7ded1] bg-white p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-lg text-[#0b2b40]">Background collection</h2><p className="text-xs text-slate-500">{catalog.designs.length} available platform designs ? Selection limit: {catalog.maxDesigns || 'loading'}. Live text always stays editable.</p></div><button type="button" disabled={busy} className="flex gap-2 rounded-xl border px-3 py-2 text-sm font-bold" onClick={() => { setReplaceId(null); uploadInput.current?.click(); }}><ImagePlus size={16} />Upload Custom Background</button></div><input ref={uploadInput} aria-label="Upload custom welcome background" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => void upload(e.target.files?.[0])} />
      <p className="mb-4 text-xs text-slate-500">Recommended: 1080 × 1920 portrait. PNG, JPG or WebP, up to 12 MB. Uploads are optimized before saving. Three custom designs per branch.</p>
      {catalogMessage && <p role="status" className="mb-3 text-sm text-amber-700">{catalogMessage}</p>}<button type="button" className="mb-3 text-sm font-bold text-orange-700" onClick={() => void fetchWelcomeDesignCatalog().then(v => { setCatalog(v); setCatalogMessage(''); }).catch(() => setCatalogMessage('Could not refresh design access. Try again when connected.'))}>Refresh available designs</button>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{library.map(b => <article key={b.id} data-testid={`welcome-card-${b.id}`} className={`overflow-hidden rounded-xl border-2 ${draft.backgroundId === b.id ? 'border-orange-500 ring-2 ring-orange-100' : 'border-[#ede7de]'}`}><button type="button" aria-label={`Preview ${b.name}`} onClick={() => update({ backgroundId: b.id, backgroundImageUrl: b.id.startsWith('platform-') ? b.imageUrl : undefined, backgroundLandscapeImageUrl: b.id.startsWith('platform-') ? b.landscapeImageUrl : undefined })} className="block w-full text-left"><div className="grid grid-cols-[1fr_2fr] gap-1 bg-[#f5eee3] p-2"><img loading="lazy" src={resolveMenuImage(b.imageUrl)} alt={`${b.name} portrait`} className="aspect-[9/16] w-full rounded object-cover" /><img loading="lazy" src={resolveMenuImage(b.thumbnailUrl)} alt={`${b.name} landscape`} className="aspect-video w-full self-center rounded object-cover" /></div><div className="p-3"><div className="flex flex-wrap gap-1 text-[10px] font-bold"><span className="rounded bg-[#f4eee5] px-2 py-1">{b.custom ? 'Custom' : 'Default'}</span>{active.backgroundId === b.id && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Active</span>}{draft.backgroundId === b.id && <span className="flex items-center gap-1 rounded bg-orange-50 px-2 py-1 text-orange-700"><Check size={11} />Selected</span>}</div><h3 className="mt-2 text-sm font-bold text-[#0b2b40]">{b.name}</h3><p className="mt-1 text-xs text-slate-500">{b.category}</p><span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-orange-700"><Eye size={12} />Preview</span></div></button>{b.custom && <div className="flex flex-wrap gap-2 border-t p-2 text-xs"><button type="button" disabled={busy} onClick={() => { setReplaceId(b.id); uploadInput.current?.click(); }} className="font-bold text-slate-600">Replace</button><button aria-label={`Delete ${b.name}`} type="button" disabled={busy} onClick={async () => {
        const used = active.backgroundId === b.id || draft.backgroundId === b.id || Object.values(settings.deviceOverrides || {}).some(w => w.backgroundId === b.id) || settings.backgroundId === b.id;
        if (used) { setMessage('Select and apply another background on every kiosk using this image before deleting it.'); return; }
        if (await confirm({ title: `Delete ${b.name}?`, message: 'Apply to Kiosk afterwards to publish this library change.', confirmLabel: 'Delete', tone: 'danger' })) { setCustom(current => current.filter(v => v.id !== b.id)); setDirty(true); }
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
    {confirmDialog}
    <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title="Reset welcome screen?" maxWidth="sm" footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" className="min-h-11 rounded-xl border px-4 py-2" onClick={() => setResetOpen(false)}>Cancel</button><button type="button" className="min-h-11 rounded-xl bg-[#bf540f] px-4 py-2 font-bold text-white" onClick={() => { setDraft({ ...DEFAULT_WELCOME_PRESENTATION, backgroundId: catalog.designs[0]?.id || DEFAULT_WELCOME_PRESENTATION.backgroundId, backgroundImageUrl: catalog.designs[0]?.id.startsWith('platform-') ? catalog.designs[0].imageUrl : undefined, backgroundLandscapeImageUrl: catalog.designs[0]?.id.startsWith('platform-') ? catalog.designs[0].landscapeImageUrl : undefined }); setDirty(true); setResetOpen(false); }}>Reset preview</button></div>}><p className="text-sm text-slate-600">Restore the default JAMANVAAR design for the selected scope. Custom images stay in your library. Review the preview, then Apply to Kiosk.</p></Modal>
  </div>;
}
