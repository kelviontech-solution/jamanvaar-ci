import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, MenuItemSync } from '@jamanvaar/database';

/**
 * Deleting a dish in Restaurant Admin must make it disappear and stay gone. Deletion archives the dish
 * (keeps the record so the archive travels to other devices) instead of removing the row, which other
 * devices would otherwise re-create from their own copies.
 */
describe('deleting a dish archives it and the archive reaches the sync payload', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('an archived dish is hidden from the menu list but kept in the record set', () => {
    const cat = db.categories[0];
    const created = MenuRepository.createMenuItem({ name: 'Archive Me Dish', categoryId: cat.id, price: 99 });
    expect(MenuRepository.getAllMenuItems().some((i) => i.id === created.id)).toBe(true);

    expect(MenuRepository.deleteMenuItem(created.id)).toBe(true);

    expect(MenuRepository.getAllMenuItems().some((i) => i.id === created.id)).toBe(false);
    const kept = db.menuItems.find((i) => i.id === created.id);
    expect(kept?.archivedAt).toBeTruthy();
  });

  it('the archived dish is part of what syncs, so other devices hide it too', () => {
    const cat = db.categories[0];
    const created = MenuRepository.createMenuItem({ name: 'Sync Archive Dish', categoryId: cat.id, price: 50 });
    MenuItemSync.stampChanges();
    MenuItemSync.markPushed(MenuItemSync.collectSyncRecords());

    MenuRepository.deleteMenuItem(created.id);

    const outgoing = MenuItemSync.collectSyncRecords().find((r) => r.externalId === created.id);
    expect(outgoing).toBeDefined();
    expect(outgoing!.payload.archivedAt).toBeTruthy();
  });

  it('archiving twice is a no-op the second time', () => {
    const cat = db.categories[0];
    const created = MenuRepository.createMenuItem({ name: 'Twice Dish', categoryId: cat.id, price: 40 });
    expect(MenuRepository.deleteMenuItem(created.id)).toBe(true);
    expect(MenuRepository.deleteMenuItem(created.id)).toBe(false);
  });
});
