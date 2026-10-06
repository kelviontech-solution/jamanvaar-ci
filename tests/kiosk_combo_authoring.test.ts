import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { db, KioskComboAuthoring, MenuRepository, type KioskComboDraft } from '@jamanvaar/database';
beforeEach(() => { db.menuItems = []; db.categories = []; db.combos = []; db.taxGroups = []; MenuRepository.createMenuItem({ id: 'tea', name: 'Tea', price: 100, isAvailable: true }); MenuRepository.createMenuItem({ id: 'side', name: 'Side', price: 50, isAvailable: true }); });
afterEach(() => { db.menuItems = []; db.categories = []; db.combos = []; db.taxGroups = []; });
const draft = (): KioskComboDraft => ({ name: 'Cafe Bundle', description: 'Tea and side', basePrice: 120, mainItemIds: ['tea'], sideItemIds: ['side'], drinkItemIds: [], dessertItemIds: [], isAvailable: true, featured: true });
describe('editable kiosk combos are backed by real priced menu items', () => {
  it('creates a bundle using the same item ID, price and tax that checkout sends to authoritative cloud pricing', () => {
    const combo = KioskComboAuthoring.save(draft()); const priced = MenuRepository.getMenuItemById(`combo-${combo.id}`)!;
    expect(priced.price).toBe(120); expect(combo.originalPrice).toBe(150); expect(combo.savingsAmount).toBe(30); expect(priced.salesChannels).toEqual(['KIOSK']); expect(db.combos).toHaveLength(1);
  });
  it('edits one bundle in place and propagates unavailability to both the promotion and priced item', () => {
    const combo = KioskComboAuthoring.save(draft()); KioskComboAuthoring.save({ ...combo, basePrice: 110, isAvailable: false });
    expect(db.combos).toHaveLength(1); expect(MenuRepository.getMenuItemById(`combo-${combo.id}`)).toMatchObject({ price: 110, isAvailable: false });
  });
  it('rejects missing, repeated or sold-out components and invalid prices without partially saving anything', () => {
    for (const invalid of [{ ...draft(), mainItemIds: ['missing'] }, { ...draft(), sideItemIds: ['tea'] }, { ...draft(), basePrice: -1 }]) expect(() => KioskComboAuthoring.save(invalid)).toThrow();
    MenuRepository.updateMenuItem('tea', { isAvailable: false }); expect(() => KioskComboAuthoring.save(draft())).toThrow(/sold out/); expect(db.combos).toHaveLength(0);
  });
  it('preserves zero prices and rejects a name that would resolve to another existing menu item', () => {
    const combo = KioskComboAuthoring.save({ ...draft(), basePrice: 0 }); expect(MenuRepository.getMenuItemById(`combo-${combo.id}`)?.price).toBe(0);
    expect(() => KioskComboAuthoring.save({ ...draft(), name: 'Tea' })).toThrow(/distinct/);
  });
  it('keeps the advertised combo price consistent when its bundle is edited through the shared menu editor', () => {
    const combo = KioskComboAuthoring.save(draft()); MenuRepository.updateMenuItem(`combo-${combo.id}`, { price: 105, name: 'Edited Cafe Bundle' });
    expect(db.combos[0]).toMatchObject({ name: 'Edited Cafe Bundle', basePrice: 105, savingsAmount: 45 });
  });
  it('preserves non-vegetarian classification, allergens and preparation time from the chosen items', () => {
    MenuRepository.updateMenuItem('tea', { dietaryType: 'NON_VEG', allergens: ['milk'], prepTimeMinutes: 20 });
    const combo = KioskComboAuthoring.save(draft());
    expect(MenuRepository.getMenuItemById(`combo-${combo.id}`)).toMatchObject({ dietaryType: 'NON_VEG', allergens: ['milk'], prepTimeMinutes: 20 });
  });
});
