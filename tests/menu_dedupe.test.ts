import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, scanMenuDuplicates, archiveConfirmedDuplicates } from '@jamanvaar/database';

describe('a menu never keeps the same dish twice', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('createMenuItem returns the existing dish instead of adding a copy', () => {
    const first = MenuRepository.createMenuItem({ name: 'Paneer Tikka Angara', sku: 'NI-001', categoryId: db.categories[0].id, price: 280 });
    const count = db.menuItems.length;
    const again = MenuRepository.createMenuItem({ name: '  paneer-tikka ANGARA ', sku: 'ZZ-9', categoryId: db.categories[0].id, price: 300 });
    expect(again.id).toBe(first.id);
    expect(db.menuItems.length).toBe(count);
  });

  it('archives confirmed copies only after review and leaves questionable copies for verification', () => {
    const cat = db.categories[0].id;
    const keep = { ...MenuRepository.createMenuItem({ name: 'Veg Seekh Kebab', sku: 'A-1', categoryId: cat, description: 'Freshly grilled kebab', imageUrl: 'https://x/y.jpg' }) };
    db.menuItems.push({ ...keep, id: 'dup-1', imageUrl: '', sku: 'A-2' } as never, { ...keep, id: 'dup-2' } as never);
    // The group includes an unrelated SKU/content pair: it is not confirmed, so no automatic removal.
    const report = scanMenuDuplicates();
    const group = report.groups.find(g => g.itemIds.includes(keep.id))!;
    expect(group.confirmed).toBe(false);
    expect(() => archiveConfirmedDuplicates(report, [group.id])).toThrow(/confirmed/);
    expect(db.menuItems.filter(i => i.name === 'Veg Seekh Kebab')).toHaveLength(3);
  });
});
