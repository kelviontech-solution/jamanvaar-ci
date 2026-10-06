import React, { useState } from 'react';
import { db, ComboRepository, MenuRepository, KioskComboAuthoring, type KioskComboDraft } from '@jamanvaar/database';
import { syncMenuCatalog, syncPromotions } from '@jamanvaar/sync';
const empty = (): KioskComboDraft => ({ name: '', description: '', basePrice: 0, mainItemIds: [], sideItemIds: [], drinkItemIds: [], dessertItemIds: [], isAvailable: true, featured: false });
export function KioskComboPanel({ showToast }: { showToast: (message: string) => void }) {
  const [draft, setDraft] = useState<KioskComboDraft>(empty); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [language, setLanguage] = useState('en');
  const input = 'w-full rounded-xl border border-slate-300 p-2 text-sm';
  const items = MenuRepository.getAllMenuItems().filter(item => !item.id.startsWith('combo-'));
  return <div className="space-y-5" data-testid="kiosk-combo-panel">
    <h2 className="text-xl font-bold">Kiosk Combos & Deals</h2>
    <p className="text-sm text-slate-600">Build bundles from your own menu. Their price and tax are published as menu items so checkout uses the same amount. Make a combo unavailable to stop new orders and remove its promotion.</p>
    <div className="flex flex-wrap gap-2"><button className="rounded-xl border p-2" onClick={() => setDraft(empty())}>New Combo</button>{ComboRepository.getAllCombos().map(combo => <button key={combo.id} className="rounded-xl border p-2" onClick={() => setDraft({ ...structuredClone(combo), taxGroupId: MenuRepository.getMenuItemById(`combo-${combo.id}`)?.taxGroupId })}>{combo.name}{combo.isAvailable ? '' : ' (unavailable)'}</button>)}</div>
    <form className="rounded-2xl border bg-white p-6 space-y-4" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try {
        const saved = KioskComboAuthoring.save(draft); setDraft({ ...saved, taxGroupId: MenuRepository.getMenuItemById(`combo-${saved.id}`)?.taxGroupId });
        await syncMenuCatalog({ push: true }); await syncPromotions({ pushCombos: true, pushCoupons: true });
        setMessage('Combo saved. Publication is tracked in Sync & Devices.'); showToast('Combo saved.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the combo.'); } finally { setBusy(false); }
    }}>
      <label className="block">Combo name<input required maxLength={200} className={input} aria-label="Combo name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="block">Description<textarea maxLength={2000} className={input} aria-label="Combo description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label className="block">Bundle price (₹)<input required type="number" step="0.01" min="0" max="1000000" className={input} aria-label="Combo price" value={draft.basePrice} onChange={e => setDraft({ ...draft, basePrice: Number(e.target.value) })} /></label>
      <label className="block">Image URL<input className={input} aria-label="Combo image URL" value={draft.imageUrl || ''} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} /></label>
      <label className="block">Tax group<select className={input} aria-label="Combo tax group" value={draft.taxGroupId || ''} onChange={e => setDraft({ ...draft, taxGroupId: e.target.value || undefined })}><option value="">Use menu default</option>{db.taxGroups.filter(t => t.isActive).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2">{(['mainItemIds', 'sideItemIds', 'drinkItemIds', 'dessertItemIds'] as const).map(group => <fieldset key={group} className="rounded-xl border p-3 max-h-52 overflow-auto"><legend>{({ mainItemIds: 'Main items', sideItemIds: 'Sides', drinkItemIds: 'Drinks', dessertItemIds: 'Desserts' })[group]}</legend>{items.map(item => <label key={item.id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={draft[group].includes(item.id)} onChange={e => setDraft({ ...draft, [group]: e.target.checked ? [...draft[group], item.id] : draft[group].filter(id => id !== item.id) })} />{item.name} — ₹{item.price}</label>)}</fieldset>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={draft.isAvailable} onChange={e => setDraft({ ...draft, isAvailable: e.target.checked })} />Available on kiosk</label>
      <label className="flex gap-2"><input type="checkbox" checked={!!draft.featured} onChange={e => setDraft({ ...draft, featured: e.target.checked })} />Featured promotion</label>
      <label className="block">Translation language<select className={input} value={language} onChange={e => setLanguage(e.target.value)}>{['en', 'hi', 'gu', 'mr', 'ta', 'te', 'kn'].map(lang => <option key={lang}>{lang}</option>)}</select></label>
      <input aria-label="Translated combo name" className={input} placeholder="Translated name (optional)" value={draft.translations?.[language]?.name || ''} onChange={e => setDraft({ ...draft, translations: { ...draft.translations, [language]: { ...draft.translations?.[language], name: e.target.value } } })} />
      <textarea aria-label="Translated combo description" className={input} placeholder="Translated description (optional)" value={draft.translations?.[language]?.description || ''} onChange={e => setDraft({ ...draft, translations: { ...draft.translations, [language]: { name: draft.translations?.[language]?.name || '', description: e.target.value } } })} />
      <button className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Combo'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </div>;
}
