import { previewMenuCsv, applyMenuCsv } from './menu_csv';
import { executeTemplateImport, exactCategory, existingTemplateItem } from './menu_template_import';
import { normalizeMenuText, KeyValueStore } from '@jamanvaar/database';
import { Category, ComboDeal, DietaryType, MenuItem, ModifierGroup, SpiceLevel } from '@jamanvaar/types';
import { db, MenuRepository, ComboRepository, PREBUILT_MENU_TEMPLATES, MenuTemplate, MenuImportRecord } from '@jamanvaar/database';
import { generateUUID, toCsvRow } from '@jamanvaar/utils';

export interface MenuCompletenessIssue {
  itemId: string;
  itemName: string;
  categoryName: string;
  issueType: 'MISSING_PRICE' | 'MISSING_IMAGE' | 'MISSING_DESCRIPTION' | 'ZERO_PREP_TIME';
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface MenuCompletenessReport {
  score: number; // 0 to 100
  totalItems: number;
  totalCategories: number;
  readyItemsCount: number;
  issues: MenuCompletenessIssue[];
  isPublishReady: boolean;
}

export interface MenuVersionSnapshot {
  id: string;
  versionNumber: number;
  versionTag: string;
  publishedAt: string;
  publishedBy: string;
  notes?: string;
  categoriesCount: number;
  itemsCount: number;
  combosCount: number;
  categories: Category[];
  menuItems: MenuItem[];
  combos: ComboDeal[];
}

export interface BulkPriceOptions {
  categoryIds?: string[];
  percentageDelta?: number; // e.g. +10 for +10%, -5 for -5%
  fixedDelta?: number; // e.g. +10 for +₹10
  roundToNearest?: 1 | 5 | 10;
}

export interface TemplateImportOptions {
  importCategories: boolean;
  importItems: boolean;
  importImages: boolean;
  importModifiers: boolean;
  importCombos: boolean;
  importSuggestedPrices: boolean;
  duplicateStrategy: 'KEEP_EXISTING' | 'REPLACE_DUPLICATE' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE';
  selectedOnly?: boolean;
  selectedCategoryKeys?: string[];
  taxGroupId?: string;
}

export interface CategoryMapping {
  templateId: string;
  categorySlug: string;
  categoryName: string;
  action: 'USE_EXISTING' | 'CREATE_NEW';
  existingCategoryId?: string;
  existingCategoryName?: string;
  dishesCount: number;
}

export interface DishConflict {
  key: string;
  templateId: string;
  categoryName: string;
  importedName: string;
  importedSku: string;
  importedPrice: number;
  importedDescription: string;
  importedStation?: string;
  importedDietary: DietaryType;
  existingItemId: string;
  existingName: string;
  existingSku: string;
  existingPrice: number;
  existingCategoryName: string;
  resolution: 'KEEP_EXISTING' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE';
}

export interface ImportAnalysisResult {
  categoryMappings: CategoryMapping[];
  dishConflicts: DishConflict[];
  totalDishesToImport: number;
  newCategoriesCount: number;
  matchedCategoriesCount: number;
  conflictingDishesCount: number;
}

export interface ImportExecutionResult {
  importedCategoriesCount: number;
  matchedCategoriesCount: number;
  importedItemsCount: number;
  updatedItemsCount: number;
  skippedItemsCount: number;
  importedCombosCount: number;
  stationsAssignedCount: number;
  importedVariantsCount?: number;
  importedAddonsCount?: number;
  summaryMessage: string;
}

// In-memory / DB version store
const menuVersions: MenuVersionSnapshot[] = [];
let versionTenant: string | null | undefined;
function tenantMenuVersions(): MenuVersionSnapshot[] {
  const tenant = KeyValueStore.get('jamanvaar_tenant_id');
  if (tenant !== versionTenant) { menuVersions.splice(0); versionTenant = tenant; }
  return menuVersions;
}
let isMenuInDraft = false;

/**
 * Returns a normalized canonical category identifier for semantic grouping
 * (e.g. "Main Course (Curries)" -> "MAIN_COURSE", "Curries & Gravies" -> "MAIN_COURSE")
 */
export function getCanonicalCategoryKey(name: string): string {
  if (!name) return 'GENERAL';
  const upper = name.trim().toUpperCase();
  if (
    upper.includes('MAIN COURSE') ||
    upper.includes('CURR') ||
    upper.includes('GRAV') ||
    upper.includes('SABZI') ||
    upper.includes('DAL') ||
    upper.includes('PANEER SPECIAL')
  ) {
    return 'MAIN_COURSE';
  }
  if (
    upper.includes('NAAN') ||
    upper.includes('ROTI') ||
    upper.includes('BREAD') ||
    upper.includes('PARATHA') ||
    upper.includes('KULCHA')
  ) {
    return 'BREADS';
  }
  if (
    upper.includes('TANDOOR') ||
    upper.includes('KEBAB') ||
    upper.includes('TIKKA') ||
    upper.includes('PLATTER')
  ) {
    return 'TANDOOR';
  }
  if (
    upper.includes('STARTER') ||
    upper.includes('QUICK BITE') ||
    upper.includes('APPETIZER') ||
    upper.includes('SNACK')
  ) {
    return 'STARTERS';
  }
  if (
    upper.includes('BIRYANI') ||
    upper.includes('RICE') ||
    upper.includes('PULAO') ||
    upper.includes('KHICHDI')
  ) {
    return 'BIRYANI_RICE';
  }
  if (
    upper.includes('BEVERAGE') ||
    upper.includes('DRINK') ||
    upper.includes('SHAKE') ||
    upper.includes('JUICE') ||
    upper.includes('TEA') ||
    upper.includes('COFFEE') ||
    upper.includes('LASSI') ||
    upper.includes('CHAAS')
  ) {
    return 'BEVERAGES';
  }
  if (
    upper.includes('DESSERT') ||
    upper.includes('SWEET') ||
    upper.includes('MITHAI') ||
    upper.includes('ICE CREAM') ||
    upper.includes('HALWA') ||
    upper.includes('KHEER')
  ) {
    return 'DESSERTS';
  }
  if (upper.includes('PIZZA') || upper.includes('PASTA') || upper.includes('ITALIAN')) {
    return 'PIZZA_PASTA';
  }
  if (
    upper.includes('BURGER') ||
    upper.includes('SANDWICH') ||
    upper.includes('WRAP') ||
    upper.includes('FRIES')
  ) {
    return 'BURGERS_SNACKS';
  }
  if (upper.includes('GUJARATI') || upper.includes('KATHIYAWADI') || upper.includes('THALI')) {
    return 'GUJARATI';
  }
  if (
    upper.includes('SOUTH INDIAN') ||
    upper.includes('DOSA') ||
    upper.includes('IDLI') ||
    upper.includes('VADA') ||
    upper.includes('UTTAPAM')
  ) {
    return 'SOUTH_INDIAN';
  }
  if (
    upper.includes('CHINESE') ||
    upper.includes('NOODLE') ||
    upper.includes('MOMO') ||
    upper.includes('MANCHURIAN') ||
    upper.includes('FRIED RICE')
  ) {
    return 'CHINESE';
  }
  if (
    upper.includes('CHAAT') ||
    upper.includes('PANI PURI') ||
    upper.includes('SEV PURI') ||
    upper.includes('BHEL') ||
    upper.includes('PAV BHAJI') ||
    upper.includes('SAMOSA')
  ) {
    return 'CHAAT';
  }
  if (upper.includes('SOUP') || upper.includes('SALAD')) {
    return 'SOUPS_SALADS';
  }
  return upper.replace(/[^A-Z0-9]/g, '') || 'GENERAL';
}

/**
 * Intelligently matches a template category against existing active categories in DB
 */
export function matchExistingCategory(templateCatName: string, existingCategories: Category[]): Category | undefined {
  if (!templateCatName || existingCategories.length === 0) return undefined;
  return existingCategories.find(c => normalizeMenuText(c.name) === normalizeMenuText(templateCatName));
}

export class MenuBuilderService {
  /**
   * Check if current menu is in Draft staging mode
   */
  public static isDraft(): boolean {
    return isMenuInDraft;
  }

  public static setDraftMode(val: boolean): void {
    isMenuInDraft = val;
    db.notify();
  }

  /**
   * Calculate completeness score & detect missing data
   */
  public static getCompletenessReport(): MenuCompletenessReport {
    const items = db.menuItems.filter(item => !item.archivedAt);
    const categories = db.categories;
    const issues: MenuCompletenessIssue[] = [];

    if (items.length === 0) {
      return {
        score: 0,
        totalItems: 0,
        totalCategories: categories.length,
        readyItemsCount: 0,
        issues: [
          {
            itemId: 'all',
            itemName: 'No Items Found',
            categoryName: 'General',
            issueType: 'MISSING_PRICE',
            message: 'Menu has 0 items. Load a prebuilt template or create items to publish.',
            severity: 'ERROR'
          }
        ],
        isPublishReady: false
      };
    }

    let readyCount = 0;

    items.forEach((item) => {
      let itemHasIssue = false;
      const cat = categories.find((c) => c.id === item.categoryId);
      const catName = cat?.name || 'Unassigned';

      // 1. Missing or zero price
      if (!item.price || item.price <= 0) {
        issues.push({
          itemId: item.id,
          itemName: item.name,
          categoryName: catName,
          issueType: 'MISSING_PRICE',
          message: `Price not set for "${item.name}"`,
          severity: 'ERROR'
        });
        itemHasIssue = true;
      }

      // 2. Missing image or generic placeholder
      if (!item.imageUrl || item.imageUrl.trim() === '') {
        issues.push({
          itemId: item.id,
          itemName: item.name,
          categoryName: catName,
          issueType: 'MISSING_IMAGE',
          message: `Missing photo for "${item.name}"`,
          severity: 'WARNING'
        });
      }

      // 3. Missing description
      if (!item.description || item.description.trim().length < 3) {
        issues.push({
          itemId: item.id,
          itemName: item.name,
          categoryName: catName,
          issueType: 'MISSING_DESCRIPTION',
          message: `Add description for "${item.name}" to help customers choose`,
          severity: 'WARNING'
        });
      }

      if (!itemHasIssue) {
        readyCount++;
      }
    });

    const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

    // Score calculation
    const baseRatio = readyCount / items.length;
    const penalty = Math.min(30, warningCount * 2 + errorCount * 10);
    const score = Math.max(10, Math.min(100, Math.round(baseRatio * 100 - penalty + (errorCount === 0 ? 10 : 0))));

    return {
      score,
      totalItems: items.length,
      totalCategories: categories.length,
      readyItemsCount: readyCount,
      issues,
      isPublishReady: errorCount === 0 && items.length > 0
    };
  }

  /**
   * Bulk adjust prices across menu items or categories
   */
  public static applyBulkPriceAdjustment(options: BulkPriceOptions): { updatedCount: number; message: string } {
    let count = 0;
    const { categoryIds, percentageDelta = 0, fixedDelta = 0, roundToNearest = 1 } = options;

    db.menuItems = db.menuItems.map((item) => {
      if (item.archivedAt) return item;
      if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(item.categoryId)) {
        return item;
      }

      let newPrice = item.price;

      if (percentageDelta !== 0) {
        newPrice = newPrice * (1 + percentageDelta / 100);
      }

      if (fixedDelta !== 0) {
        newPrice = newPrice + fixedDelta;
      }

      // Apply rounding
      if (roundToNearest > 1) {
        newPrice = Math.round(newPrice / roundToNearest) * roundToNearest;
      } else {
        newPrice = Math.round(newPrice);
      }

      newPrice = Math.max(5, newPrice); // minimum ₹5

      if (newPrice !== item.price) {
        count++;
        const combo = db.combos.find(c => `combo-${c.id}` === item.id);
        if (combo) { combo.basePrice = newPrice; combo.savingsAmount = Math.max(0, Math.round((combo.originalPrice - newPrice) * 100) / 100); combo.updatedAt = new Date().toISOString(); }
        return { ...item, price: newPrice, updatedAt: new Date().toISOString() };
      }
      return item;
    });

    isMenuInDraft = true;
    db.notify();
    return {
      updatedCount: count,
      message: `Successfully adjusted prices for ${count} items. Menu is in DRAFT mode.`
    };
  }

  /**
   * Intelligent Import Analysis: Compares template categories and items against existing DB
   */
  public static analyzeImport(
    templateIds: string[],
    selectedItemKeys?: string[],
    defaultResolution: 'KEEP_EXISTING' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE' = 'KEEP_EXISTING'
  ): ImportAnalysisResult {
    const selectedTemplates = PREBUILT_MENU_TEMPLATES.filter((t) => templateIds.includes(t.id));
    if (selectedTemplates.length === 0) {
      throw new Error('No valid templates selected for analysis.');
    }

    const categoryMappings: CategoryMapping[] = [];
    const dishConflicts: DishConflict[] = [];
    let totalDishes = 0;

    selectedTemplates.forEach((template) => {
      template.categories.forEach((catTpl) => {
        // Count selected items for this category
        const itemsToConsider = catTpl.items.filter((item) => {
          if (!selectedItemKeys || selectedItemKeys.length === 0) return true;
          const key = `${template.id}::${catTpl.slug}::${item.sku}`;
          return selectedItemKeys.includes(key);
        });

        if (itemsToConsider.length === 0) return;

        totalDishes += itemsToConsider.length;

        // Check if category matches existing category in db with semantic canonical matching
        const existingCat = exactCategory(catTpl.name);

        categoryMappings.push({
          templateId: template.id,
          categorySlug: catTpl.slug,
          categoryName: catTpl.name,
          action: existingCat ? 'USE_EXISTING' : 'CREATE_NEW',
          existingCategoryId: existingCat?.id,
          existingCategoryName: existingCat?.name,
          dishesCount: itemsToConsider.length
        });

        // Check for dish conflicts
        itemsToConsider.forEach((itemTpl) => {
          const itemKey = `${template.id}::${catTpl.slug}::${itemTpl.sku}`;
          const existingDish = existingTemplateItem(itemKey, itemTpl, existingCat);

          if (existingDish) {
            const existingCatName = db.categories.find((c) => c.id === existingDish.categoryId)?.name || 'General';
            dishConflicts.push({
              key: itemKey,
              templateId: template.id,
              categoryName: catTpl.name,
              importedName: itemTpl.name,
              importedSku: itemTpl.sku,
              importedPrice: itemTpl.suggestedPrice,
              importedDescription: itemTpl.description,
              importedStation: itemTpl.kitchenStation,
              importedDietary: itemTpl.dietaryType,
              existingItemId: existingDish.id,
              existingName: existingDish.name,
              existingSku: existingDish.sku,
              existingPrice: existingDish.price,
              existingCategoryName: existingCatName,
              resolution: defaultResolution
            });
          }
        });
      });
    });

    const newCategoriesCount = categoryMappings.filter((m) => m.action === 'CREATE_NEW').length;
    const matchedCategoriesCount = categoryMappings.filter((m) => m.action === 'USE_EXISTING').length;

    return {
      categoryMappings,
      dishConflicts,
      totalDishesToImport: totalDishes,
      newCategoriesCount,
      matchedCategoriesCount,
      conflictingDishesCount: dishConflicts.length
    };
  }

  /**
   * Non-Destructive Selective Import into Draft Menu with Custom Category Mappings & Conflict Resolutions
   */
  public static executeSelectiveImport(
    templateIds: string[],
    selectedItemKeys: string[],
    customCategoryMappings: Record<string, { action: 'USE_EXISTING' | 'CREATE_NEW'; existingCategoryId?: string }> = {},
    dishConflictResolutions: Record<string, 'KEEP_EXISTING' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE'> = {},
    options: Partial<TemplateImportOptions> = {}
  ): ImportExecutionResult {
    const result = executeTemplateImport(templateIds, selectedItemKeys, customCategoryMappings, dishConflictResolutions, options);
    isMenuInDraft = true;
    return result;
  }

  /**
   * Helper to infer kitchen station for KOT routing
   */
  public static inferKitchenStation(categoryName: string, dishName: string): string {
    const text = `${categoryName} ${dishName}`.toLowerCase();
    if (text.includes('tandoor') || text.includes('tikka') || text.includes('naan') || text.includes('roti') || text.includes('paratha') || text.includes('kebab')) {
      return 'Tandoor';
    }
    if (text.includes('dosa') || text.includes('idli') || text.includes('vada') || text.includes('uttapam') || text.includes('pongal')) {
      return 'South Indian Station';
    }
    if (text.includes('pizza') || text.includes('garlic bread')) {
      return 'Pizza Station';
    }
    if (text.includes('chaat') || text.includes('puri') || text.includes('bhel') || text.includes('pav bhaji')) {
      return 'Chaat Counter';
    }
    if (text.includes('noodle') || text.includes('fried rice') || text.includes('manchurian') || text.includes('chilli paneer') || text.includes('momo')) {
      return 'Chinese Wok';
    }
    if (text.includes('burger') || text.includes('fries') || text.includes('sandwich') || text.includes('wrap')) {
      return 'Fry Station';
    }
    if (text.includes('coffee') || text.includes('tea') || text.includes('chai') || text.includes('juice') || text.includes('shake') || text.includes('beverage') || text.includes('chaas') || text.includes('lassi')) {
      return 'Beverages & Bar';
    }
    if (text.includes('sweet') || text.includes('halwa') || text.includes('jamun') || text.includes('ice cream') || text.includes('pastry') || text.includes('cake') || text.includes('dessert') || text.includes('mithai')) {
      return 'Dessert Counter';
    }
    if (text.includes('dal') || text.includes('paneer') || text.includes('shaak') || text.includes('curry') || text.includes('gravy') || text.includes('sabzi') || text.includes('biryani') || text.includes('khichdi')) {
      return 'Curry Station';
    }
    return 'Main Kitchen';
  }

  /**
   * Import Prebuilt Menu Templates (Legacy standard wrapper)
   */
  public static importTemplates(
    templateIds: string[],
    options: TemplateImportOptions
  ): { importedCategoriesCount: number; importedItemsCount: number; importedCombosCount: number } {
    const result = this.executeSelectiveImport(templateIds, [], {}, {}, options);
    return {
      importedCategoriesCount: result.importedCategoriesCount,
      importedItemsCount: result.importedItemsCount + result.updatedItemsCount,
      importedCombosCount: result.importedCombosCount
    };
  }

  /**
   * Publish current Draft menu to live kiosk and record a version snapshot
   */
  public static publishMenu(publishedBy: string = 'Admin', notes?: string): MenuVersionSnapshot {
    const report = this.getCompletenessReport();
    if (!report.isPublishReady) {
      const errorMsg = report.issues
        .filter((i) => i.severity === 'ERROR')
        .map((i) => i.message)
        .join('; ');
      throw new Error(`Cannot publish menu with critical issues: ${errorMsg}`);
    }

    const versionNumber = tenantMenuVersions().length + 1;
    const versionTag = `v${versionNumber}.0`;

    const snapshot: MenuVersionSnapshot = {
      id: `ver-${Date.now()}`,
      versionNumber,
      versionTag,
      publishedAt: new Date().toISOString(),
      publishedBy,
      notes: notes || `Published ${db.menuItems.length} items across ${db.categories.length} categories`,
      categoriesCount: db.categories.length,
      itemsCount: db.menuItems.length,
      combosCount: db.combos.length,
      categories: JSON.parse(JSON.stringify(db.categories)),
      menuItems: JSON.parse(JSON.stringify(db.menuItems)),
      combos: JSON.parse(JSON.stringify(db.combos))
    };

    tenantMenuVersions().unshift(snapshot);
    isMenuInDraft = false;
    db.notify();
    return snapshot;
  }

  /**
   * Rollback to a specific past version
   */
  public static rollbackToVersion(versionId: string): boolean {
    const target = tenantMenuVersions().find((v) => v.id === versionId);
    if (!target) return false;

    db.categories = JSON.parse(JSON.stringify(target.categories));
    db.menuItems = JSON.parse(JSON.stringify(target.menuItems));
    db.combos = JSON.parse(JSON.stringify(target.combos));
    isMenuInDraft = false;
    db.notify();
    return true;
  }

  public static getVersions(): MenuVersionSnapshot[] {
    return tenantMenuVersions();
  }

  public static getImportHistory(): MenuImportRecord[] {
    return db.menuImportHistory || [];
  }

  /**
   * Export full menu as JSON
   */
  public static exportJSON(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      restaurant: db.restaurant.name || '',
      version: tenantMenuVersions()[0]?.versionTag || 'v1.0',
      categories: db.categories,
      menuItems: db.menuItems,
      combos: db.combos,
      modifierGroups: db.modifierGroups
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export full menu as CSV
   */
  public static exportCSV(): string {
    // B2-061: dish name/description/category are free text a staff member (or, for name,
    // effectively any authenticated device) can set to anything, including a leading `=`/`+`/
    // `-`/`@` — a classic CSV/formula-injection payload that fires the moment this file is
    // opened in Excel/Sheets. toCsvRow escapes quotes *and* neutralises that leading character
    // on every field, not just the ones that happened to get a manual `.replace()` before.
    const headers = ['Category', 'Item Name', 'SKU', 'Price', 'Dietary Type', 'Spice Level', 'Description', 'Image URL'];
    const rows = db.menuItems.filter(item => !item.archivedAt).map((item) => {
      const cat = db.categories.find((c) => c.id === item.categoryId)?.name || 'General';
      return toCsvRow([cat, item.name, item.sku || '', item.price, item.dietaryType, item.spiceLevel, item.description || '', item.imageUrl || '']);
    });

    return [toCsvRow(headers), ...rows].join('\r\n');
  }

  /**
   * BUG-014: Restaurant Admin (and Super Admin, on the restaurant's behalf) had CSV export
   * but no import — a restaurant's menu could never actually come from a CSV file. Reads
   * exactly the columns `exportCSV()` writes, validates every row and reports bad ones by
   * row number instead of aborting the whole file, resolves categories by name (creating
   * one if it doesn't exist, matching `matchExistingCategory`'s fuzzy rules otherwise), and
   * a duplicate (same SKU within the same category) is handled per `duplicateStrategy`.
   */
  public static importCSV(
    csvText: string,
    duplicateStrategy: 'KEEP_EXISTING' | 'REPLACE_DUPLICATE' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE' = 'KEEP_EXISTING'
  ): { itemsImported: number; itemsSkipped: number; categoriesCreated: number; errors: Array<{ row: number; message: string }> } {
    return applyMenuCsv(previewMenuCsv(csvText), duplicateStrategy);
  }

  /**
   * Import menu from JSON
   */
  public static importJSON(jsonString: string): { itemsCount: number; categoriesCount: number } {
    const parsed = JSON.parse(jsonString);
    if (!parsed.categories || !Array.isArray(parsed.categories) || !parsed.menuItems || !Array.isArray(parsed.menuItems)) {
      throw new Error('Invalid JAMANVAAR Menu JSON format. Required fields: categories, menuItems.');
    }

    db.categories = parsed.categories;
    db.menuItems = parsed.menuItems;
    if (parsed.combos && Array.isArray(parsed.combos)) {
      db.combos = parsed.combos;
    }
    if (parsed.modifierGroups && Array.isArray(parsed.modifierGroups)) {
      db.modifierGroups = parsed.modifierGroups;
    }

    isMenuInDraft = true;
    db.notify();
    return {
      itemsCount: db.menuItems.length,
      categoriesCount: db.categories.length
    };
  }

  /**
   * Alias helper methods for POS Menu operations
   */
  public static applyTemplate(templateId: string, options: TemplateImportOptions): { importedCategories: number; importedItems: number; importedCombos: number } {
    const res = this.importTemplates([templateId], options);
    return {
      importedCategories: res.importedCategoriesCount,
      importedItems: res.importedItemsCount,
      importedCombos: res.importedCombosCount
    };
  }

  public static bulkUpdatePrices(options: BulkPriceOptions): number {
    const res = this.applyBulkPriceAdjustment(options);
    return res.updatedCount;
  }

  public static exportMenuJson(): string {
    return this.exportJSON();
  }

  public static importMenuJson(jsonString: string): { itemsCount: number; categoriesCount: number } {
    return this.importJSON(jsonString);
  }
}
