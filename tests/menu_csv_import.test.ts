import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../packages/database/src';
import { MenuBuilderService } from '../packages/business/src/menu_builder';

/**
 * BUG-014: Restaurant Admin (and Super Admin, on the restaurant's behalf) had no CSV menu
 * import at all — only export. importCSV reads exactly the columns exportCSV writes, so a
 * downloaded template round-trips, validates every row (reporting bad ones instead of
 * aborting the whole file), creates categories by name as needed, and respects a duplicate
 * strategy on re-import.
 */
describe('Menu CSV import (BUG-014)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.categories = [];
    db.menuItems = [];
  });

  const csv = (rows: string[]) => ['Category,Item Name,SKU,Price,Dietary Type,Spice Level,Description,Image URL', ...rows].join('\n');

  it('imports valid rows, creating categories that do not exist yet', () => {
    const result = MenuBuilderService.importCSV(
      csv([
        '"Starters","Veg Spring Roll","SKU-1",180,VEG,MEDIUM,"Crispy rolls",""',
        '"Main Course","Butter Chicken","SKU-2",320,NON_VEG,MILD,"Classic curry",""'
      ])
    );
    expect(result.itemsImported).toBe(2);
    expect(result.categoriesCreated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.menuItems).toHaveLength(2);
    expect(db.categories.map((c) => c.name).sort()).toEqual(['Main Course', 'Starters']);
    const item = db.menuItems.find((i) => i.sku === 'SKU-2')!;
    expect(item.price).toBe(320);
    expect(item.dietaryType).toBe('NON_VEG');
    expect(item.categoryId).toBe(db.categories.find((c) => c.name === 'Main Course')!.id);
  });

  it('reuses an existing category instead of creating a duplicate', () => {
    db.categories.push({ id: 'cat-1', name: 'Starters', slug: 'starters', sortOrder: 0, isActive: true });
    const result = MenuBuilderService.importCSV(csv(['"Starters","Paneer Tikka","SKU-1",220,VEG,SPICY,"",""']));
    expect(result.categoriesCreated).toBe(0);
    expect(db.categories).toHaveLength(1);
    expect(db.menuItems[0].categoryId).toBe('cat-1');
  });

  it('reports a bad row (missing name, non-numeric price, unknown dietary type) without aborting the rest of the file', () => {
    const result = MenuBuilderService.importCSV(
      csv([
        '"Starters","","SKU-1",180,VEG,MEDIUM,"",""',
        '"Starters","Fries","SKU-2",notanumber,VEG,MEDIUM,"",""',
        '"Starters","Wings","SKU-3",150,SPICY_NOT_A_DIET,MEDIUM,"",""',
        '"Starters","Good Dish","SKU-4",150,VEG,MEDIUM,"",""'
      ])
    );
    expect(result.itemsImported).toBe(1);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].row).toBe(2); // header is row 1
    expect(db.menuItems.map((i) => i.sku)).toEqual(['SKU-4']);
  });

  it('rejects a file with the wrong columns instead of silently importing garbage', () => {
    const result = MenuBuilderService.importCSV('Name,Cost\n"Fries",100');
    expect(result.itemsImported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/column|header/i);
  });

  it('round-trips a real exported menu back in without loss', () => {
    db.categories.push({ id: 'cat-1', name: 'Mains', slug: 'mains', sortOrder: 0, isActive: true });
    db.menuItems.push({
      id: 'mi-1', categoryId: 'cat-1', sku: 'RT-1', name: 'Roundtrip Dish', description: 'desc',
      price: 275, dietaryType: 'VEG', spiceLevel: 'MEDIUM', isPopular: false, isNew: false,
      isFeatured: false, isAvailable: true, prepTimeMinutes: 10, allergens: [], modifierGroupIds: [], sortOrder: 0
    } as any);
    const exported = MenuBuilderService.exportCSV();

    db.categories = [];
    db.menuItems = [];
    const result = MenuBuilderService.importCSV(exported);
    expect(result.itemsImported).toBe(1);
    expect(db.menuItems[0].name).toBe('Roundtrip Dish');
    expect(db.menuItems[0].price).toBe(275);
  });

  describe('duplicate handling on re-import (matched by SKU within the same category)', () => {
    function seedOne() {
      db.categories.push({ id: 'cat-1', name: 'Starters', slug: 'starters', sortOrder: 0, isActive: true });
      db.menuItems.push({
        id: 'mi-1', categoryId: 'cat-1', sku: 'SKU-1', name: 'Original Name', description: '',
        price: 100, dietaryType: 'VEG', spiceLevel: 'MILD', isPopular: false, isNew: false,
        isFeatured: false, isAvailable: true, prepTimeMinutes: 10, allergens: [], modifierGroupIds: [], sortOrder: 0
      } as any);
    }

    it('KEEP_EXISTING (default): leaves the existing item untouched and does not add a new one', () => {
      seedOne();
      const result = MenuBuilderService.importCSV(csv(['"Starters","New Name","SKU-1",999,VEG,MILD,"",""']));
      expect(db.menuItems).toHaveLength(1);
      expect(db.menuItems[0].name).toBe('Original Name');
      expect(result.itemsImported).toBe(0);
      expect(result.itemsSkipped).toBe(1);
    });

    it('REPLACE_DUPLICATE: updates the existing item in place', () => {
      seedOne();
      MenuBuilderService.importCSV(csv(['"Starters","New Name","SKU-1",999,VEG,MILD,"",""']), 'REPLACE_DUPLICATE');
      expect(db.menuItems).toHaveLength(1);
      expect(db.menuItems[0].name).toBe('New Name');
      expect(db.menuItems[0].price).toBe(999);
      expect(db.menuItems[0].id).toBe('mi-1');
    });

    it('IMPORT_AS_NEW: keeps both, giving the new one a distinct id/sku', () => {
      seedOne();
      MenuBuilderService.importCSV(csv(['"Starters","New Name","SKU-1",999,VEG,MILD,"",""']), 'IMPORT_AS_NEW');
      expect(db.menuItems).toHaveLength(2);
      const skus = new Set(db.menuItems.map((i) => i.sku));
      expect(skus.size).toBe(2);
    });

    it('SKIP_DUPLICATE: same as default, explicit', () => {
      seedOne();
      const result = MenuBuilderService.importCSV(csv(['"Starters","New Name","SKU-1",999,VEG,MILD,"",""']), 'SKIP_DUPLICATE');
      expect(db.menuItems).toHaveLength(1);
      expect(result.itemsSkipped).toBe(1);
    });
  });
});
