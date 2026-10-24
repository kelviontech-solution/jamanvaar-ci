import { useEffect, useState } from 'react';
import { db, ComboRepository, MenuRepository, KioskComboAuthoring, type KioskComboDraft } from '@jamanvaar/database';
import { syncMenuCatalog, syncPromotions } from '@jamanvaar/sync';
import { useConfirm } from '@jamanvaar/ui';
import { useQrUnsavedChanges } from '../qrconsole/useQrUnsavedChanges';
const empty = (): KioskComboDraft => ({ name: '', description: '', basePrice: 0, mainItemIds: [], sideItemIds: [], drinkItemIds: [], dessertItemIds: [], isAvailable: true, featured: false });
export function KioskComboPanel({ showToast }: { showToast: (message: string) => void }) {
  const [draft, setDraft] = useState<KioskComboDraft>(empty); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [comboQuery, setComboQuery] = useState('');
  const [language, setLanguage] = useState('en');
  // K01: picking "New Combo" or another existing combo from the list used to swap `draft` out
  // from under whatever was being edited, with no warning — same for navigating away from this
  // page entirely. `dirty` tracks both; switching drafts and leaving the page both route through
  // the same confirm-or-discard check below.
  const [dirty, setDirty] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  useQrUnsavedChanges(dirty);
  useEffect(() => {
    const onRequestLeave = (event: Event) => {
      const resolve = (event as CustomEvent<{ resolve: (ok: boolean) => void }>).detail.resolve;
      if (!dirty) { resolve(true); return; }
      void confirm({
        title: 'Discard unsaved combo changes?',
        message: 'This combo has unsaved edits. Leaving now discards them.',
        confirmLabel: 'Leave without saving',
        tone: 'danger'
      }).then(resolve);
    };
    window.addEventListener('jamanvaar-qr-request-leave', onRequestLeave);
    return () => window.removeEventListener('jamanvaar-qr-request-leave', onRequestLeave);
  }, [dirty, confirm]);
  const switchDraft = async (next: KioskComboDraft) => {
    if (dirty && !(await confirm({
      title: 'Discard unsaved combo changes?',
      message: 'Switching combos now discards your unsaved edits to this one.',
      confirmLabel: 'Discard & switch',
      tone: 'danger'
    }))) return;
    setDraft(next);
    setDirty(false);
  };
  const input = 'mt-1.5 w-full min-h-11 rounded-xl border border-jaman-border bg-white px-3 py-2 text-sm font-normal text-jaman-navy hover:border-[#d8d1c3] focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';
  const items = MenuRepository.getAllMenuItems().filter(item => !item.id.startsWith('combo-'));
  return <>
  <div className="space-y-5" data-testid="kiosk-combo-panel">
    <h1 className="text-2xl font-bold text-jaman-navy">Kiosk Combos & Deals</h1>
    <p className="text-sm text-slate-600 -mt-3">Build bundles from your own menu. Their price and tax are published as menu items so checkout uses the same amount. Make a combo unavailable to stop new orders and remove its promotion.</p>
    <input aria-label="Search combos" className={input} placeholder="Search existing combos" value={comboQuery} onChange={e=>setComboQuery(e.target.value)} />
    <div className="flex flex-wrap gap-2"><button className="min-h-10 rounded-xl border border-jaman-border bg-white px-3.5 text-xs font-bold text-jaman-navy hover:bg-[#F8F6F0] cursor-pointer" onClick={() => void switchDraft(empty())}>New Combo</button>{ComboRepository.getAllCombos().filter(combo=>combo.name.toLowerCase().includes(comboQuery.toLowerCase())).map(combo => <button key={combo.id} className="rounded-xl border p-2" onClick={() => void switchDraft({ ...structuredClone(combo), taxGroupId: MenuRepository.getMenuItemById(`combo-${combo.id}`)?.taxGroupId })}>{combo.name}{combo.isAvailable ? '' : ' (unavailable)'}</button>)}</div>
    <form className="rounded-2xl border border-jaman-border bg-white p-5 sm:p-6 space-y-4" onChange={() => setDirty(true)} onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try {
        const saved = KioskComboAuthoring.save(draft); setDraft({ ...saved, taxGroupId: MenuRepository.getMenuItemById(`combo-${saved.id}`)?.taxGroupId }); setDirty(false);
        await syncMenuCatalog({ push: true }); await syncPromotions({ pushCombos: true, pushCoupons: true });
        setMessage('Combo saved. Publication is tracked in Sync & Devices.'); showToast('Combo saved.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the combo.'); } finally { setBusy(false); }
    }}>
      <label className="block text-xs font-bold text-jaman-navy">Combo name<input required maxLength={200} className={input} aria-label="Combo name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="block text-xs font-bold text-jaman-navy">Description<textarea maxLength={2000} className={input} aria-label="Combo description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label className="block text-xs font-bold text-jaman-navy">Bundle price (₹)<input required type="number" step="0.01" min="0" max="1000000" className={input} aria-label="Combo price" value={draft.basePrice} onChange={e => setDraft({ ...draft, basePrice: Number(e.target.value) })} /></label>
      <label className="block text-xs font-bold text-jaman-navy">Image URL<input className={input} aria-label="Combo image URL" value={draft.imageUrl || ''} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} /></label>
      <label className="block text-xs font-bold text-jaman-navy">Tax group<select className={input} aria-label="Combo tax group" value={draft.taxGroupId || ''} onChange={e => setDraft({ ...draft, taxGroupId: e.target.value || undefined })}><option value="">Use menu default</option>{db.taxGroups.filter(t => t.isActive).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="block text-xs font-bold text-jaman-navy">Find dishes for this bundle<input aria-label="Search combo dishes" className={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or SKU" /></label>
      <div className="grid gap-3 sm:grid-cols-2">{(['mainItemIds', 'sideItemIds', 'drinkItemIds', 'dessertItemIds'] as const).map(group => <fieldset key={group} className="rounded-xl border p-3 max-h-52 overflow-auto"><legend>{({ mainItemIds: 'Main items', sideItemIds: 'Sides', drinkItemIds: 'Drinks', dessertItemIds: 'Desserts' })[group]}</legend>{items.filter(item=>draft[group].includes(item.id) || `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase())).map(item => <label key={item.id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={draft[group].includes(item.id)} onChange={e => setDraft({ ...draft, [group]: e.target.checked ? [...draft[group], item.id] : draft[group].filter(id => id !== item.id) })} />{item.name} — ₹{item.price}</label>)}</fieldset>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={draft.isAvailable} onChange={e => setDraft({ ...draft, isAvailable: e.target.checked })} />Available on kiosk</label>
      <label className="flex gap-2"><input type="checkbox" checked={!!draft.featured} onChange={e => setDraft({ ...draft, featured: e.target.checked })} />Featured promotion</label>
      <label className="block text-xs font-bold text-jaman-navy">Translation language<select className={input} value={language} onChange={e => setLanguage(e.target.value)}>{['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn'].map(lang => <option key={lang}>{lang}</option>)}</select></label>
      <input aria-label="Translated combo name" className={input} placeholder="Translated name (optional)" value={draft.translations?.[language]?.name || ''} onChange={e => setDraft({ ...draft, translations: { ...draft.translations, [language]: { ...draft.translations?.[language], name: e.target.value } } })} />
      <textarea aria-label="Translated combo description" className={input} placeholder="Translated description (optional)" value={draft.translations?.[language]?.description || ''} onChange={e => setDraft({ ...draft, translations: { ...draft.translations, [language]: { name: draft.translations?.[language]?.name || '', description: e.target.value } } })} />
      <button className="min-h-11 rounded-xl bg-brand hover:bg-brand-hover px-5 text-sm font-bold text-white disabled:opacity-50 cursor-pointer" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Combo'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </div>
  {confirmDialog}
  </>;
}
