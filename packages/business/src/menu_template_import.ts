import type { Category, MenuItem, ModifierGroup } from '@jamanvaar/types';
import { db, PREBUILT_MENU_TEMPLATES, normalizeMenuText, menuItemBranchIntersection, menuTransaction, newAuthoringId, type MenuTemplateItem } from '@jamanvaar/database';
import type { TemplateImportOptions, ImportExecutionResult } from './menu_builder';
const hash = (text: string) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
import { KeyValueStore } from '@jamanvaar/database';
export const templateItemKey = (templateId: string, slug: string, sku: string) => `${templateId}::${slug}::${sku}`;
export function existingTemplateItem(key: string, item: MenuTemplateItem, category?: Category): MenuItem | undefined {
  return db.menuItems.find(i => i.templateItemKey === key || (!!item.sku && normalizeMenuText(i.sku) === normalizeMenuText(item.sku)) || (!i.archivedAt && !!category && i.categoryId === category.id && normalizeMenuText(i.name) === normalizeMenuText(item.name)));
}
export function exactCategory(name: string): Category | undefined { return db.categories.find(c => normalizeMenuText(c.name) === normalizeMenuText(name)); }
export function executeTemplateImport(templateIds: string[], selectedItemKeys: string[], mappings: Record<string, { action: 'USE_EXISTING' | 'CREATE_NEW'; existingCategoryId?: string }>, resolutions: Record<string, string>, options: Partial<TemplateImportOptions>): ImportExecutionResult {
  const templates = PREBUILT_MENU_TEMPLATES.filter(t => templateIds.includes(t.id));
  if (!templates.length) throw Error('Choose a valid restaurant template.');
  const tenant = KeyValueStore.get('jamanvaar_tenant_id') || 'local';
  const stable = (prefix: string, key: string) => `${prefix}-${hash(tenant)}-${hash(key)}`;
  const result = { importedCategoriesCount: 0, matchedCategoriesCount: 0, importedItemsCount: 0, updatedItemsCount: 0, skippedItemsCount: 0, importedCombosCount: 0, stationsAssignedCount: 0, importedVariantsCount: 0, importedAddonsCount: 0, summaryMessage: '' };
  const now = new Date().toISOString();
  const chosen = new Set(selectedItemKeys);
  return menuTransaction(() => {
    for (const template of templates) {
      const itemMap = new Map<string, MenuItem>();
      const allowedCategory = (slug: string) => !options.selectedCategoryKeys || options.selectedCategoryKeys.includes(`${template.id}::${slug}`);
      const categoryFor = (slug: string, name: string, description?: string, iconName?: string): Category => {
        const key = `${template.id}::${slug}`; const mapping = mappings[key];
        let cat = mapping?.action === 'USE_EXISTING' ? db.categories.find(c => c.id === mapping.existingCategoryId) : mapping?.action === 'CREATE_NEW' ? undefined : db.categories.find(c => c.templateCategoryKey === key) || exactCategory(name);
        if (mapping?.action === 'USE_EXISTING' && !cat) throw Error(`The selected existing category for ${name} no longer exists.`);
        if (cat) { result.matchedCategoriesCount++; return cat; }
        if (options.importCategories === false) throw Error(`Create or map category ${name} first.`);
        cat = { id: mapping?.action === 'CREATE_NEW' ? newAuthoringId('cat') : stable('tplcat', key), name, slug, description, iconName, isActive: true, sortOrder: Math.max(0, ...db.categories.map(c => c.sortOrder)) + 1, templateCategoryKey: key, updatedAt: now };
        db.categories.push(cat); result.importedCategoriesCount++; return cat;
      };
      for (const category of template.categories) {
        if (!allowedCategory(category.slug)) continue;
        const rows = category.items.filter(item => options.importItems !== false && (!options.selectedOnly && !chosen.size || chosen.has(templateItemKey(template.id, category.slug, item.sku))));
        if (!rows.length) continue;
        const target = categoryFor(category.slug, category.name, category.description, category.iconName);
        for (const item of rows) {
          const key = templateItemKey(template.id, category.slug, item.sku); const existing = existingTemplateItem(key, item, target);
          const action = resolutions[key] || options.duplicateStrategy || 'SKIP_DUPLICATE';
          if (existing && ['KEEP_EXISTING', 'SKIP_DUPLICATE'].includes(action)) { result.skippedItemsCount++; itemMap.set(item.sku, existing); continue; }
          const copy = !!existing && action === 'IMPORT_AS_NEW';
          const id = !copy && existing ? existing.id : copy ? newAuthoringId('item') : stable('tplitem', key);
          const groups: string[] = [];
          if (options.importModifiers !== false) {
            for (const [type, values] of [['variant', item.variants], ['addon', item.addons]] as const) {
              if (!values?.length) continue;
              const groupId = copy ? newAuthoringId('mod') : stable('tplmod', `${key}::${type}`);
              const variant = type === 'variant';
              const base = options.importSuggestedPrices === false ? existing?.price ?? 0 : item.suggestedPrice;
              const group: ModifierGroup & { updatedAt: string } = { id: groupId, name: `${item.name} — ${variant ? 'Size' : 'Add-ons'}`, minSelections: variant ? 1 : 0, maxSelections: variant ? 1 : values.length, isRequired: variant, sortOrder: db.modifierGroups.length + 1, updatedAt: now,
                options: values.map((v, i) => ({ id: `${groupId}-${i}`, groupId, name: v.name, priceDelta: variant ? Math.max(0, Math.round((v.price - item.suggestedPrice) * 100) / 100) : v.price, isDefault: variant && i === 0, isAvailable: true, sortOrder: i })) };
              if (!Number.isFinite(base) || group.options.some(o => !Number.isFinite(o.priceDelta) || o.priceDelta < 0)) throw Error(`Invalid prices for ${item.name}.`);
              const at = db.modifierGroups.findIndex(g => g.id === groupId); if (at >= 0) db.modifierGroups[at] = group; else db.modifierGroups.push(group);
              groups.push(groupId); if (variant) result.importedVariantsCount += values.length; else result.importedAddonsCount += values.length;
            }
            for (const sourceId of item.modifierGroupIds || []) {
              const source = template.modifierGroups?.find(g => g.id === sourceId); if (!source) continue;
              const groupId = stable('tplmod', `${template.id}::${sourceId}`);
              if (!db.modifierGroups.some(g => g.id === groupId)) db.modifierGroups.push({ ...structuredClone(source), id: groupId, options: source.options.map((o, i) => ({ ...o, id: `${groupId}-${i}`, groupId })) });
              groups.push(groupId);
            }
          }
          const record: MenuItem = { ...(existing && !copy ? existing : {}), id, categoryId: target.id,
            sku: copy ? `${item.sku.slice(0, 90)}-${newAuthoringId('copy')}` : item.sku, name: copy ? `${item.name} (New)` : item.name,
            description: item.description, price: options.importSuggestedPrices === false ? existing?.price ?? 0 : item.suggestedPrice,
            dietaryType: item.dietaryType, spiceLevel: item.spiceLevel, isAvailable: existing && !copy ? existing.isAvailable : true,
            isPopular: !!item.isPopular, isNew: true, isFeatured: false, prepTimeMinutes: item.prepTimeMinutes, allergens: existing?.allergens || [],
            modifierGroupIds: options.importModifiers === false ? existing?.modifierGroupIds || [] : groups,
            imageUrl: options.importImages === false ? existing?.imageUrl : item.imageUrl,
            tags: [...(item.tags || [])], subcategory: item.subcategory, kitchenStation: item.kitchenStation || 'Main Kitchen', sortOrder: existing?.sortOrder ?? db.menuItems.length + 1,
            taxGroupId: options.taxGroupId ?? existing?.taxGroupId ?? (db.taxGroups.filter(t => t.isActive).length === 1 ? db.taxGroups.find(t => t.isActive)?.id : undefined),
            templateItemKey: copy ? `${key}::${id}` : key, updatedAt: now };
          if (!Number.isFinite(record.price) || record.price < 0 || record.price > 1_000_000) throw Error(`Invalid price for ${item.name}.`);
          if (options.taxGroupId && !db.taxGroups.some(t => t.id === options.taxGroupId && t.isActive)) throw Error('The selected tax group is no longer active.');
          if (existing && !copy) { Object.assign(existing, record); result.updatedItemsCount++; } else { db.menuItems.push(record); result.importedItemsCount++; }
          result.stationsAssignedCount++; itemMap.set(item.sku, record);
        }
      }
      if (options.importCombos !== false && allowedCategory('combos')) for (const combo of template.combos || []) {
        const parts = (combo.itemSkus || []).map(sku => itemMap.get(sku));
        if (parts.length < 2 || parts.some(p => !p)) continue; // A selective import never pulls unselected hidden components.
        const id = stable('tpldeal', `${template.id}::${combo.id}`);
        const exists = db.combos.find(c => c.id === id); if (exists && options.duplicateStrategy !== 'REPLACE_DUPLICATE' && options.duplicateStrategy !== 'UPDATE_EXISTING') continue;
        const target = categoryFor('combos', 'Combos', 'Fixed portion meal deals', 'Package');
        const realParts = parts as MenuItem[]; const originalPrice = realParts.reduce((sum, p) => sum + p.price, 0);
        const branchIds = menuItemBranchIntersection(realParts);
        if (branchIds && !branchIds.length) throw Error(`The components of ${combo.name} are restricted to different branches. Import the dishes without this combo or review their branch restrictions.`);
        const record = { id, name: combo.name!, description: combo.description || '', basePrice: combo.basePrice!, originalPrice, savingsAmount: Math.max(0, originalPrice - combo.basePrice!), isAvailable: true, mainItemIds: realParts.map(p => p.id), sideItemIds: [], drinkItemIds: [], dessertItemIds: [], imageUrl: combo.imageUrl, updatedAt: now };
        if (exists) Object.assign(exists, record); else db.combos.push(record);
        const bundle: MenuItem = { ...realParts[0], id: `combo-${id}`, categoryId: target.id, name: record.name, sku: `DEAL-${id}`, description: record.description, price: record.basePrice, modifierGroupIds: [], branchIds, imageUrl: record.imageUrl, allergens: [...new Set(realParts.flatMap(p => p.allergens))], dietaryType: realParts.some(p => p.dietaryType === 'NON_VEG') ? 'NON_VEG' : realParts.some(p => p.dietaryType === 'EGG') ? 'EGG' : realParts.every(p => p.dietaryType === 'JAIN') ? 'JAIN' : realParts.every(p => p.dietaryType === 'VEGAN') ? 'VEGAN' : 'VEG', templateItemKey: `${template.id}::combo::${combo.id}`, updatedAt: now };
        const at = db.menuItems.findIndex(i => i.id === bundle.id); if (at >= 0) db.menuItems[at] = bundle; else { db.menuItems.push(bundle); result.importedItemsCount++; }
        result.importedCombosCount++;
      }
      db.menuImportHistory.unshift({ id: newAuthoringId('import'), templateId: template.id, templateName: template.name, importedAt: now, importedCategoriesCount: result.importedCategoriesCount, importedItemsCount: result.importedItemsCount, strategy: options.duplicateStrategy || 'SKIP_DUPLICATE', version: template.version || '2.0' });
    }
    result.summaryMessage = `${result.importedItemsCount} new items, ${result.updatedItemsCount} updated, ${result.skippedItemsCount} existing skipped, ${result.importedCategoriesCount} categories, ${result.importedVariantsCount} variants, ${result.importedAddonsCount} add-ons and ${result.importedCombosCount} combos saved.`;
    db.notify(); return result;
  });
}
