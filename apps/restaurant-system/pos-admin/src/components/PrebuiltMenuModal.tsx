import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@jamanvaar/ui';
import { PREBUILT_MENU_TEMPLATES, db, AuditRepository, KeyValueStore } from '@jamanvaar/database';
import { MenuBuilderService, templateItemKey, existingTemplateItem, exactCategory } from '@jamanvaar/business';
import { publishCatalogNow } from '@jamanvaar/sync';
interface Props { isOpen: boolean; onClose: () => void; onImported: (count: number) => void }
// Keep old miniature presets compatible with saved IDs, but offer complete restaurant catalogs for onboarding.
const onboardingTemplates = PREBUILT_MENU_TEMPLATES.filter(template => template.approxItemCount >= 25);
export const PrebuiltMenuModal: React.FC<Props> = ({ isOpen, onClose, onImported }) => {
  const [templateId, setTemplateId] = useState('tpl-pizza'); const [selected, setSelected] = useState<string[]>([]); const [categories, setCategories] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<'SKIP_DUPLICATE' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW'>('SKIP_DUPLICATE');
  const [taxId, setTaxId] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [tenant, setTenant] = useState<string | null>(null);
  const template = PREBUILT_MENU_TEMPLATES.find(t => t.id === templateId)!;
  const entries = template.categories.flatMap(c => c.items.map(item => ({ item, cat: c, key: templateItemKey(template.id, c.slug, item.sku) })));
  useEffect(() => { if (isOpen) { setSelected([]); setCategories([]); setMessage(''); setTenant(KeyValueStore.get('jamanvaar_tenant_id')); } }, [isOpen, templateId]);
  const chooseAll = () => { setSelected(entries.map(e => e.key)); setCategories(template.categories.map(c => `${template.id}::${c.slug}`)); };
  const selectedEntries = entries.filter(e => selected.includes(e.key));
  const duplicateCount = selectedEntries.filter(e => existingTemplateItem(e.key, e.item, exactCategory(e.cat.name))).length;
  const toggleCategory = (slug: string, checked: boolean) => {
    const key = `${template.id}::${slug}`;
    const dependencies = slug === 'combos' && checked ? new Set(template.combos?.flatMap(c => c.itemSkus || [])) : null;
    const matching = entries.filter(e => dependencies ? dependencies.has(e.item.sku) : e.cat.slug === slug);
    const itemKeys = matching.map(e => e.key);
    setCategories(current => checked ? [...new Set([...current, key, ...matching.map(e => `${template.id}::${e.cat.slug}`)])] : current.filter(k => k !== key));
    setSelected(current => checked ? [...new Set([...current, ...itemKeys])] : current.filter(k => !itemKeys.includes(k)));
  };
  return <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Load Restaurant Menu Template" maxWidth="3xl">
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Choose a niche, review the complete starter menu, then load all or individual categories and items. Your current menu is retained.</p>
      <label className="block font-semibold">Restaurant type / template<select aria-label="Restaurant menu template" className="block w-full rounded-xl border p-3 mt-1" value={templateId} disabled={busy} onChange={e => setTemplateId(e.target.value)}>{onboardingTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <p>{template.description}</p>
      <div data-testid="template-counts" className="rounded-xl bg-orange-50 p-3 text-sm">{template.categories.length} categories · {entries.length} items · {entries.reduce((n, e) => n + (e.item.variants?.length || 0), 0)} variants · {entries.reduce((n, e) => n + (e.item.addons?.length || 0), 0)} add-ons · {template.combos?.length || 0} combos</div>
      <div className="flex gap-3"><Button variant="outline" onClick={chooseAll} disabled={busy}>Select Complete Template</Button><Button variant="outline" onClick={() => { setSelected([]); setCategories([]); }} disabled={busy}>Clear Selection</Button></div>
      <div className="max-h-[420px] overflow-auto space-y-3">{template.categories.map(cat => <fieldset key={cat.slug} className="rounded-xl border p-3">
        <legend className="font-bold px-2"><label><input type="checkbox" aria-label={`Select category ${cat.name}`} disabled={busy} checked={categories.includes(`${template.id}::${cat.slug}`)} onChange={e => toggleCategory(cat.slug, e.target.checked)} /> {cat.name} ({cat.items.length || (cat.slug === 'combos' ? template.combos?.length : 0)})</label></legend>
        {cat.slug === 'combos' && <p className="text-xs text-slate-600">Selecting Combos also selects their component dishes for review. They use fixed portions and an authoritative bundle price.</p>}
        {cat.items.map(item => { const key = templateItemKey(template.id, cat.slug, item.sku); const existing = existingTemplateItem(key, item, exactCategory(cat.name)); return <label key={key} className="flex gap-3 items-start py-2 border-b last:border-0">
          <input aria-label={`Select item ${item.name}`} type="checkbox" disabled={busy} checked={selected.includes(key)} onChange={e => { setSelected(current => e.target.checked ? [...new Set([...current, key])] : current.filter(k => k !== key)); if (e.target.checked) setCategories(current => [...new Set([...current, `${template.id}::${cat.slug}`])]); }} />
          <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/assets/menu/common/menu-placeholder-v2.svg'; }} />
          <span className="flex-1 text-sm"><strong>{item.name}</strong> · ₹{item.suggestedPrice} · {item.dietaryType}{item.subcategory && ` · ${item.subcategory}`}<span className="block text-xs text-slate-600">{item.description}</span><span className="block text-xs">{item.variants?.map(v => `${v.name} ₹${v.price}`).join(' / ')}{item.addons?.length ? ` · ${item.addons.length} add-ons` : ''}{item.imageUrl?.includes('placeholder') ? ' · Photo needed' : ''}{existing ? ' · Already exists' : ''}</span></span>
        </label>; })}
      </fieldset>)}</div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Existing items<select aria-label="Template duplicate strategy" className="block w-full border rounded-xl p-2" disabled={busy} value={strategy} onChange={e => setStrategy(e.target.value as typeof strategy)}><option value="SKIP_DUPLICATE">Skip Existing (recommended)</option><option value="UPDATE_EXISTING">Update Existing</option><option value="IMPORT_AS_NEW">Create New Copy</option></select></label>
      <label className="text-sm">Restaurant tax group<select aria-label="Template tax group" className="block w-full border rounded-xl p-2" disabled={busy} value={taxId} onChange={e => setTaxId(e.target.value)}><option value="">Keep existing / use sole active group</option>{db.taxGroups.filter(t => t.isActive).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
      <p className="text-sm">Selected: {selected.length} items. Potential duplicates: {duplicateCount}. Suggested prices and tax assignment should be reviewed before trading.</p>
      {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm">{message}</p>}
      <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button><Button disabled={busy || !selected.length} onClick={async () => {
        setBusy(true); setMessage('');
        try {
          if (tenant !== KeyValueStore.get('jamanvaar_tenant_id')) throw Error('Restaurant changed. Close and preview again.');
          const result = MenuBuilderService.executeSelectiveImport([template.id], selected, {}, {}, { selectedOnly: true, selectedCategoryKeys: categories, duplicateStrategy: strategy, ...(taxId ? { taxGroupId: taxId } : {}) });
          AuditRepository.log({ action: 'MENU_TEMPLATE_IMPORTED', category: 'MENU', details: `${template.name}: ${result.summaryMessage}`, username: 'Manager' });
          onImported(result.importedItemsCount + result.updatedItemsCount);
          try { const sync = await publishCatalogNow(); setMessage(result.summaryMessage + (sync.delivered ? ' Published to connected terminals.' : ` ${sync.pending} changes await synchronization.`)); }
          catch (error) { setMessage(`${result.summaryMessage} Saved locally; publication pending: ${(error as Error).message}`); }
        } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Loading…' : `Load ${selected.length} Selected Items`}</Button></div>
    </div>
  </Modal>;
};
