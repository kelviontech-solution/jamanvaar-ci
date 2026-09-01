import { describe, it, expect, beforeEach } from 'vitest';
import { db, PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { MenuBuilderService } from '@jamanvaar/business';

describe('Smart Preloaded Menu Library & Menu Builder', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('should have comprehensive starter templates loaded in library', () => {
    expect(PREBUILT_MENU_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    const pizzaTpl = PREBUILT_MENU_TEMPLATES.find((t) => t.id === 'tpl-pizza');
    expect(pizzaTpl).toBeDefined();
    expect(pizzaTpl?.name).toBe('Pizza Restaurant');
    expect(pizzaTpl?.categories.length).toBeGreaterThan(0);
  });

  it('should import selected prebuilt template into DRAFT mode', () => {
    const initialItemCount = db.menuItems.length;
    const res = MenuBuilderService.importTemplates(['tpl-pizza'], {
      importCategories: true,
      importItems: true,
      importImages: true,
      importModifiers: true,
      importCombos: true,
      importSuggestedPrices: true,
      duplicateStrategy: 'IMPORT_AS_NEW'
    });

    expect(res.importedItemsCount).toBeGreaterThan(0);
    expect(db.menuItems.length).toBe(initialItemCount + res.importedItemsCount);
    expect(MenuBuilderService.isDraft()).toBe(true);
  });

  it('should calculate menu completeness score and identify missing data', () => {
    const report = MenuBuilderService.getCompletenessReport();
    expect(report.score).toBeGreaterThan(0);
    expect(report.totalItems).toBe(db.menuItems.length);

    // Add item with zero price
    db.menuItems.push({
      id: 'test-zero-price',
      categoryId: db.categories[0].id,
      sku: 'ZERO-01',
      name: 'Zero Price Test Dish',
      description: 'Test description',
      price: 0,
      dietaryType: 'VEG',
      spiceLevel: 'NONE',
      isPopular: false,
      isNew: false,
      isFeatured: false,
      isAvailable: true,
      prepTimeMinutes: 10,
      allergens: [],
      modifierGroupIds: [],
      sortOrder: 99
    });

    const updatedReport = MenuBuilderService.getCompletenessReport();
    const zeroIssue = updatedReport.issues.find((i) => i.itemId === 'test-zero-price');
    expect(zeroIssue).toBeDefined();
    expect(zeroIssue?.issueType).toBe('MISSING_PRICE');
    expect(updatedReport.isPublishReady).toBe(false);
  });

  it('should apply bulk percentage and rounding price adjustments', () => {
    const sampleItem = db.menuItems[0];
    const initialPrice = sampleItem.price;

    const res = MenuBuilderService.applyBulkPriceAdjustment({
      percentageDelta: 10, // +10%
      roundToNearest: 5
    });

    expect(res.updatedCount).toBeGreaterThan(0);
    expect(MenuBuilderService.isDraft()).toBe(true);
    expect(db.menuItems[0].price).not.toBe(initialPrice);
  });

  it('should publish menu with version snapshot and support rollback', () => {
    const snapshot = MenuBuilderService.publishMenu('Test POS Admin', 'Test release notes');
    expect(snapshot.versionTag).toBeDefined();
    expect(snapshot.itemsCount).toBe(db.menuItems.length);
    expect(MenuBuilderService.isDraft()).toBe(false);

    // Rollback test
    const versions = MenuBuilderService.getVersions();
    expect(versions.length).toBeGreaterThan(0);
    const rollbackSuccess = MenuBuilderService.rollbackToVersion(versions[0].id);
    expect(rollbackSuccess).toBe(true);
  });

  it('should export menu to JSON and CSV and import back safely', () => {
    const jsonStr = MenuBuilderService.exportJSON();
    expect(jsonStr).toContain('JAMANVAAR Restaurant');

    const csvStr = MenuBuilderService.exportCSV();
    expect(csvStr).toContain('Category,Item Name,SKU,Price');

    const importRes = MenuBuilderService.importJSON(jsonStr);
    expect(importRes.itemsCount).toBe(db.menuItems.length);
  });
});
