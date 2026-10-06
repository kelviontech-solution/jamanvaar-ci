import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { MenuBuilderService } from '@jamanvaar/business';

describe('JAMANVAAR POS — Advanced Menu CRUD, Categories & Preloaded Starter Presets', () => {
  beforeEach(() => {
    // Reset database to known initial state
  });

  it('should support full Category CRUD operations', () => {
    const initialCount = db.categories.length;

    // 1. CREATE Category
    const newCat = MenuRepository.createCategory({
      name: 'Tandoori Platters & Kebabs',
      slug: 'tandoori-platters',
      description: 'Charcoal roasted specialties'
    });

    expect(newCat.id).toBeDefined();
    expect(db.categories.length).toBe(initialCount + 1);

    // 2. READ Category
    const fetched = db.categories.find((c) => c.id === newCat.id);
    expect(fetched?.name).toBe('Tandoori Platters & Kebabs');

    // 3. UPDATE Category
    const updated = MenuRepository.updateCategory(newCat.id, {
      name: 'Signature Tandoor Platters'
    });
    expect(updated?.name).toBe('Signature Tandoor Platters');

    // 4. DELETE Category
    const deleted = MenuRepository.deleteCategory(newCat.id);
    expect(deleted).toBe(true);
    expect(db.categories.find((c) => c.id === newCat.id)).toBeUndefined();
  });

  it('should support full Menu Item CRUD operations', () => {
    const initialCount = db.menuItems.length;

    // 1. CREATE Item
    const newItem = MenuRepository.createMenuItem({
      name: 'Paneer Angara Tikka',
      sku: 'PAT-991',
      price: 260,
      dietaryType: 'VEG',
      kitchenStation: 'Tandoor',
      isAvailable: true
    });

    expect(newItem.id).toBeDefined();
    expect(newItem.sku).toBe('PAT-991');
    expect(db.menuItems.length).toBe(initialCount + 1);

    // 2. READ Item
    const found = MenuRepository.getMenuItemById(newItem.id);
    expect(found?.name).toBe('Paneer Angara Tikka');
    expect(found?.price).toBe(260);

    // 3. UPDATE Item Price & Station
    const updated = MenuRepository.updateMenuItem(newItem.id, {
      price: 280,
      kitchenStation: 'Main Kitchen'
    });
    expect(updated?.price).toBe(280);
    expect(updated?.kitchenStation).toBe('Main Kitchen');

    // 4. 86 Availability Toggle
    const toggled = MenuRepository.toggleItemAvailability(newItem.id, false);
    expect(toggled?.isAvailable).toBe(false);

    // 5. DELETE Item
    const deleted = MenuRepository.deleteMenuItem(newItem.id);
    expect(deleted).toBe(true);
    expect(MenuRepository.getMenuItemById(newItem.id)?.archivedAt).toBeTruthy();
    expect(MenuRepository.getAllMenuItems().some(i => i.id === newItem.id)).toBe(false);
  });

  it('persists Hindi/Gujarati translations passed to createMenuItem (previously silently dropped)', () => {
    // createMenuItem used to hand-construct its return value field-by-field
    // without copying `translations` through at all, so a dish created
    // with a translation attached would still show up English-only on the
    // customer kiosk no matter what language was selected.
    const item = MenuRepository.createMenuItem({
      name: 'Chilli Garlic Noodles',
      sku: 'CGN-01',
      price: 210,
      translations: {
        hi: { name: 'चिल्ली गार्लिक नूडल्स' },
        gu: { name: 'ચિલી ગાર્લિક નૂડલ્સ' }
      }
    });

    expect(item.translations?.hi?.name).toBe('चिल्ली गार्लिक नूडल्स');
    expect(item.translations?.gu?.name).toBe('ચિલી ગાર્લિક નૂડલ્સ');

    const persisted = MenuRepository.getMenuItemById(item.id);
    expect(persisted?.translations?.hi?.name).toBe('चिल्ली गार्लिक नूडल्स');
  });

  it('should load Preloaded Starter Menu Presets (Pizza & Cafe, North Indian, etc.)', () => {
    // Verify starter templates are available
    expect(PREBUILT_MENU_TEMPLATES.length).toBeGreaterThanOrEqual(8);

    const pizzaTpl = PREBUILT_MENU_TEMPLATES.find((t) => t.id === 'tpl-pizza');
    expect(pizzaTpl).toBeDefined();
    expect(pizzaTpl?.name).toContain('Pizza');

    // Apply Pizza starter template
    const res = MenuBuilderService.applyTemplate('tpl-pizza', {
      importCategories: true,
      importItems: true,
      importImages: true,
      importModifiers: true,
      importCombos: true,
      importSuggestedPrices: true,
      duplicateStrategy: 'KEEP_EXISTING'
    });

    expect(res.importedCategories).toBeGreaterThan(0);
    expect(res.importedItems).toBeGreaterThan(0);

    // Check that items became normal editable database items
    const margherita = db.menuItems.find((i) => i.name.includes('Margherita'));
    expect(margherita).toBeDefined();
    expect(margherita?.price).toBeGreaterThan(0);
  });

  it('should execute Bulk Price Adjustments correctly', () => {
    const originalPrices = db.menuItems.map((i) => i.price);

    // Bulk price increase of +10% rounded to nearest 5
    const updatedCount = MenuBuilderService.bulkUpdatePrices({
      percentageDelta: 10,
      roundToNearest: 5
    });

    expect(updatedCount).toBe(db.menuItems.filter((item, i) => !item.archivedAt && item.price !== originalPrices[i]).length);
    const newPrices = db.menuItems.map((i) => i.price);
    expect(newPrices[0]).toBeGreaterThanOrEqual(originalPrices[0]);
  });

  it('should support JSON Menu Export and Import', () => {
    const exportedJson = MenuBuilderService.exportMenuJson();
    expect(exportedJson).toBeDefined();

    const parsed = JSON.parse(exportedJson);
    expect(parsed.menuItems).toBeDefined();
    expect(parsed.categories).toBeDefined();
    expect(parsed.menuItems.length).toBe(db.menuItems.length);
  });
});
