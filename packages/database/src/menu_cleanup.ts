import type { MenuItem } from '@jamanvaar/types';
import { db } from './db';
import { KeyValueStore } from './key_value_store';
import { normalizeMenuText } from './menu_identity';
import { menuTransaction } from './menu_transaction';
import { stableCollectionSignature } from './collection_sync';
export interface DuplicateGroup { id: string; canonicalId: string; itemIds: string[]; confirmed: boolean; reasons: string[] }
export interface MenuCleanupReport { tenantId: string | null; groups: DuplicateGroup[]; totalItems: number; missingCategories: string[]; missingImages: string[]; invalidPrices: string[]; invalidFoodTypes: string[]; sharedImageGroups: string[][]; fingerprint: string; relationshipsFingerprint: string }
const fingerprint = () => stableCollectionSignature([...db.menuItems].sort((a, b) => a.id.localeCompare(b.id)).map(i => { const { updatedAt, ...record } = i; return record; }));
const relationshipsFingerprint = () => stableCollectionSignature([[...db.combos].sort((a, b) => a.id.localeCompare(b.id)).map(c => { const { updatedAt, ...record } = c; return record; }), [...db.recipes].sort((a, b) => a.id.localeCompare(b.id))]);
export function captureMenuCleanupBackup() { return structuredClone({ tenantId: KeyValueStore.get('jamanvaar_tenant_id'), menuItems: db.menuItems, combos: db.combos, recipes: db.recipes }); }
export const menuCleanupReportIsCurrent = (report: MenuCleanupReport) => report.tenantId === KeyValueStore.get('jamanvaar_tenant_id') && report.fingerprint === fingerprint();
export function restoreMenuCleanupBackup(backup: ReturnType<typeof captureMenuCleanupBackup>, after: MenuCleanupReport): void {
  if (backup.tenantId !== KeyValueStore.get('jamanvaar_tenant_id') || after.fingerprint !== fingerprint() || after.relationshipsFingerprint !== relationshipsFingerprint()) throw Error('Restaurant, menu or relationships changed. Automatic undo is no longer safe; retain the downloaded backup for reviewed recovery.');
  menuTransaction(() => {
    const now = new Date().toISOString();
    db.menuItems = backup.menuItems.map(i => ({ ...i, updatedAt: now })); db.combos = backup.combos.map(c => ({ ...c, updatedAt: now })); db.recipes = backup.recipes;
    db.notify();
  });
}
export function scanMenuDuplicates(): MenuCleanupReport {
  const live = db.menuItems.filter(i => !i.archivedAt); const buckets = new Map<string, MenuItem[]>();
  for (const item of live) {
    const key = `${item.outletId || ''}:${item.categoryId}:${normalizeMenuText(item.name)}`;
    const list = buckets.get(key) || []; list.push(item); buckets.set(key, list);
  }
  const namesOnly = [...buckets.values()];
  for (const field of ['sku', 'templateItemKey'] as const) {
    const identifiers = new Map<string, MenuItem[]>();
    for (const item of live) { const value = item[field]; if (!value) continue; const key = `${field}:${item.outletId || ''}:${item.categoryId}:${normalizeMenuText(value)}`; identifiers.set(key, [...(identifiers.get(key) || []), item]); }
    for (const [key, items] of identifiers) if (items.length > 1 && !namesOnly.some(group => items.every(item => group.includes(item)))) buckets.set(key, items);
  }
  const historicalCount = (id: string) => db.orders.reduce((n, order) => n + order.items.filter(i => i.menuItemId === id).length, 0);
  const groups: DuplicateGroup[] = [];
  for (const [key, items] of buckets) {
    if (items.length < 2) continue;
    const ranked = [...items].sort((a, b) => historicalCount(b.id) - historicalCount(a.id) || Number(!!b.imageUrl && !b.imageUrl.includes('placeholder')) - Number(!!a.imageUrl && !a.imageUrl.includes('placeholder')) || a.sortOrder - b.sortOrder);
    const canonical = ranked[0]; const reasons: string[] = ['Same restaurant and category; matching name, SKU or template identifier'];
    const confirmed = ranked.slice(1).every(other => {
      const sameConfiguration = canonical.price === other.price && canonical.dietaryType === other.dietaryType && JSON.stringify(canonical.modifierGroupIds) === JSON.stringify(other.modifierGroupIds) && canonical.taxGroupId === other.taxGroupId && JSON.stringify(canonical.branchIds) === JSON.stringify(other.branchIds) && JSON.stringify(canonical.salesChannels) === JSON.stringify(other.salesChannels) && canonical.subcategory === other.subcategory;
      const sameSku = !!canonical.sku && normalizeMenuText(canonical.sku) === normalizeMenuText(other.sku);
      const sameTemplate = !!canonical.templateItemKey && canonical.templateItemKey === other.templateItemKey;
      const sameContent = !!canonical.description?.trim() && normalizeMenuText(canonical.description) === normalizeMenuText(other.description) && canonical.imageUrl === other.imageUrl;
      if (sameSku) reasons.push('Same SKU'); if (sameTemplate) reasons.push('Same template provenance'); if (sameContent) reasons.push('Same description and image');
      return normalizeMenuText(canonical.name) === normalizeMenuText(other.name) && sameConfiguration && (sameSku || sameTemplate || sameContent);
    });
    groups.push({ id: key, canonicalId: canonical.id, itemIds: ranked.map(i => i.id), confirmed, reasons: [...new Set(reasons)] });
  }
  const imageMap = new Map<string, string[]>();
  for (const item of live) if (item.imageUrl && !/placeholder|fallback/.test(item.imageUrl)) imageMap.set(item.imageUrl, [...(imageMap.get(item.imageUrl) || []), item.id]);
  return { tenantId: KeyValueStore.get('jamanvaar_tenant_id'), groups, totalItems: live.length, missingCategories: live.filter(i => !db.categories.some(c => c.id === i.categoryId)).map(i => i.id), missingImages: live.filter(i => !i.imageUrl || /placeholder|fallback/.test(i.imageUrl)).map(i => i.id), invalidPrices: live.filter(i => !Number.isFinite(i.price) || i.price < 0).map(i => i.id), invalidFoodTypes: live.filter(i => !['VEG', 'NON_VEG', 'EGG', 'JAIN', 'VEGAN'].includes(i.dietaryType)).map(i => i.id), sharedImageGroups: [...imageMap.values()].filter(ids => ids.length > 1), fingerprint: fingerprint(), relationshipsFingerprint: relationshipsFingerprint() };
}
/** Explicit confirmation only. Historical orders, KOTs, invoice lines and menu IDs are retained. */
export function archiveConfirmedDuplicates(report: MenuCleanupReport, selectedGroupIds: string[], canonicalChoices: Record<string, string> = {}): { archived: number; remapped: number } {
  if (report.tenantId !== KeyValueStore.get('jamanvaar_tenant_id') || report.fingerprint !== fingerprint()) throw Error('The restaurant or menu changed. Scan again before archiving.');
  const archived = new Map<string, string>(); const now = new Date().toISOString();
  for (const id of selectedGroupIds) {
    const group = report.groups.find(g => g.id === id); if (!group?.confirmed) throw Error('Only confirmed duplicate groups can be archived.');
    const canonical = canonicalChoices[id] || group.canonicalId; if (!group.itemIds.includes(canonical)) throw Error('Choose a canonical item in this group.');
    group.itemIds.filter(itemId => itemId !== canonical).forEach(itemId => archived.set(itemId, canonical));
  }
  return menuTransaction(() => {
    let remapped = 0;
    for (const [id, canonical] of archived) {
      const item = db.menuItems.find(i => i.id === id)!;
      item.archivedAt = now; item.archiveReason = `Confirmed duplicate of ${canonical}`; item.isAvailable = false; item.updatedAt = now;
    }
    for (const combo of db.combos) for (const field of ['mainItemIds', 'sideItemIds', 'drinkItemIds', 'dessertItemIds'] as const) {
      combo[field] = [...new Set(combo[field].map(id => { const replacement = archived.get(id); if (replacement) remapped++; return replacement || id; }))];
    }
    for (const recipe of db.recipes) if (archived.has(recipe.menuItemId)) { recipe.menuItemId = archived.get(recipe.menuItemId)!; remapped++; }
    db.notify(); return { archived: archived.size, remapped };
  });
}
