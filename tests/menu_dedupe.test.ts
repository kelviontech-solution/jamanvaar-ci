import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository } from '@jamanvaar/database';

describe('a menu never keeps the same dish twice', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('createMenuItem returns the existing dish instead of adding a copy', () => {
    const first = MenuRepository.createMenuItem({ name: 'Paneer Tikka Angara', sku: 'NI-001', categoryId: db.categories[0].id, price: 280 });
    const count = db.menuItems.length;
    const again = MenuRepository.createMenuItem({ name: '  paneer-tikka ANGARA ', sku: 'ZZ-9', categoryId: db.categories[0].id, price: 300 });
    expect(again.id).toBe(first.id);
    expect(db.menuItems.length).toBe(count);
  });

  it('removeDuplicateDishes keeps the best copy, drops the rest, and re-points combos', () => {
    const cat = db.categories[0].id;
    const keep = { ...MenuRepository.createMenuItem({ name: 'Veg Seekh Kebab', sku: 'A-1', categoryId: cat, imageUrl: 'https://x/y.jpg' }) };
    db.menuItems.push({ ...keep, id: 'dup-1', imageUrl: '', sku: 'A-2' } as never, { ...keep, id: 'dup-2', imageUrl: '', sku: 'A-1' } as never);
    db.combos.push({ id: 'cmb', name: 'C', mainItemIds: ['dup-1'], sideItemIds: [], drinkItemIds: [], dessertItemIds: ['dup-2'] } as never);
    const res = MenuRepository.removeDuplicateDishes();
    expect(res.removed).toBe(2);
    expect(db.menuItems.filter((i) => i.name === 'Veg Seekh Kebab')).toHaveLength(1);
    const combo = db.combos.find((c) => c.id === 'cmb')!;
    expect(combo.mainItemIds).toEqual([keep.id]);
    expect(combo.dessertItemIds).toEqual([keep.id]);
    expect(MenuRepository.removeDuplicateDishes().removed).toBe(0);
  });
});
