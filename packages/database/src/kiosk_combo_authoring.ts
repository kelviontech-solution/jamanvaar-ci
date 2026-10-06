import { db } from './db';
import { ComboRepository, MenuRepository, AuditRepository } from './repositories';
import { newAuthoringId } from './menu_authoring';
import type { ComboDeal } from '@jamanvaar/types';
import { menuItemBranchIntersection } from './menu_identity';

export type KioskComboDraft = Omit<ComboDeal, 'id' | 'originalPrice' | 'savingsAmount'> & { id?: string; taxGroupId?: string };
/** A combo is a real priced menu bundle, so customer checkout and cloud pricing use the same ID and tax. */
export class KioskComboAuthoring {
  static save(draft: KioskComboDraft): ComboDeal {
    const name = draft.name.trim();
    if (!name || name.length > 200 || draft.description.length > 2000) throw Error('Use a combo name of 1–200 characters and a description up to 2000 characters.');
    if (!Number.isFinite(draft.basePrice) || draft.basePrice < 0 || draft.basePrice > 1_000_000) throw Error('Use a valid non-negative combo price.');
    const ids = [...draft.mainItemIds, ...draft.sideItemIds, ...draft.drinkItemIds, ...draft.dessertItemIds];
    if (ids.some(id => id.startsWith('combo-'))) throw Error('Choose individual dishes as combo components.');
    if (!ids.length) throw Error('Choose at least one menu item for this combo.');
    if (new Set(ids).size !== ids.length) throw Error('Select each item only once across the combo groups.');
    const parts = ids.map(id => MenuRepository.getMenuItemById(id));
    if (parts.some(item => !item || item.archivedAt)) throw Error('A selected menu item no longer exists. Choose another item.');
    const branchIds = menuItemBranchIntersection(parts as Array<{ branchIds?: string[] }>);
    if (branchIds && !branchIds.length) throw Error('These components are restricted to different branches. Choose items that can be served together.');
    if (draft.isAvailable && parts.some(item => !item!.isAvailable)) throw Error('An included item is sold out. Make the combo unavailable or change its items.');
    if (draft.taxGroupId && !db.taxGroups.some(tax => tax.id === draft.taxGroupId && tax.isActive)) throw Error('Select an active tax group.');
    if (draft.imageUrl && !/^https?:\/\//i.test(draft.imageUrl) && !/^\/(?!\/)/.test(draft.imageUrl) && !/^data:image\/(png|jpeg|webp);base64,/i.test(draft.imageUrl)) throw Error('Use an HTTP(S), local asset, PNG, JPEG or WebP image.');
    const id = draft.id || newAuthoringId('combo'); const menuId = `combo-${id}`;
    if (MenuRepository.findDuplicateDish(name, { excludeId: menuId })) throw Error('This name is already used by a menu item. Give the combo a distinct name.');
    const originalPrice = Math.round(parts.reduce((sum, item) => sum + item!.price, 0) * 100) / 100;
    const { taxGroupId, ...data } = draft;
    const combo: ComboDeal = { ...data, id, name, basePrice: Math.round(draft.basePrice * 100) / 100, originalPrice, savingsAmount: Math.max(0, Math.round((originalPrice - draft.basePrice) * 100) / 100), updatedAt: new Date().toISOString() };
    db.batch(() => {
      const existingBundle = MenuRepository.getMenuItemById(menuId);
      const categoryId = existingBundle?.categoryId || MenuRepository.getAllCategories().find(c => c.name === 'Combos' || c.name === 'Combos & Deals')?.id || 'cat-kiosk-combos';
      if (!MenuRepository.getCategoryById(categoryId)) MenuRepository.createCategory({ id: 'cat-kiosk-combos', name: 'Combos & Deals', isActive: true });
      const menu = { id: menuId, categoryId, sku: `COMBO-${id}`, name, description: combo.description, price: combo.basePrice, imageUrl: combo.imageUrl, translations: combo.translations, isAvailable: combo.isAvailable, isFeatured: combo.featured === true, branchIds, dietaryType: parts.some(item => item!.dietaryType === 'NON_VEG') ? 'NON_VEG' as const : parts.some(item => item!.dietaryType === 'EGG') ? 'EGG' as const : parts.every(item => item!.dietaryType === 'JAIN') ? 'JAIN' as const : parts.every(item => item!.dietaryType === 'VEGAN') ? 'VEGAN' as const : 'VEG' as const, allergens: [...new Set(parts.flatMap(item => item!.allergens || []))], prepTimeMinutes: Math.max(1, ...parts.map(item => item!.prepTimeMinutes || 1)), taxGroupId, salesChannels: ['KIOSK' as const] };
      const existing = MenuRepository.getMenuItemById(menuId);
      if (existing) MenuRepository.updateMenuItem(menuId, menu);
      else { const item = MenuRepository.createMenuItem(menu); item.price = combo.basePrice; }
      if (draft.id && ComboRepository.getComboById(draft.id)) ComboRepository.updateCombo(id, combo);
      else { db.combos.push(combo); db.notify(); }
      AuditRepository.log({ action: 'KIOSK_COMBO_SAVED', category: 'MENU', username: 'Restaurant Admin', details: `Saved kiosk combo ${name} with its priced menu bundle.` });
    });
    return combo;
  }
}
