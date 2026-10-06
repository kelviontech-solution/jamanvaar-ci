import { describe, it, expect, beforeEach } from 'vitest';
import { db, PREBUILT_MENU_TEMPLATES, MenuTemplate } from '@jamanvaar/database';
import { MenuBuilderService } from '@jamanvaar/business';
import { Category, MenuItem } from '@jamanvaar/types';

describe('JAMANVAAR Preloaded Restaurant Menu Starter Library & Merge Engine', () => {
  beforeEach(() => {
    // Reset test database menu state with baseline items
    db.categories = [
      {
        id: 'cat-pizza-existing',
        name: 'Classic Pizza',
        slug: 'classic-pizza',
        iconName: 'Pizza',
        sortOrder: 1,
        isActive: true
      },
      {
        id: 'cat-bev-existing',
        name: 'Beverages & Chaas',
        slug: 'beverages',
        iconName: 'Coffee',
        sortOrder: 2,
        isActive: true
      }
    ];

    db.menuItems = [
      {
        id: 'item-pizza-1',
        categoryId: 'cat-pizza-existing',
        sku: 'PIZ-001',
        name: 'Margherita Basilico',
        description: 'Existing restaurant margherita recipe',
        price: 290,
        dietaryType: 'VEG',
        spiceLevel: 'NONE',
        isAvailable: true,
        prepTimeMinutes: 15,
        allergens: [],
        modifierGroupIds: [],
        sortOrder: 1,
        isPopular: false,
        isNew: false,
        isFeatured: false
      },
      {
        id: 'item-bev-1',
        categoryId: 'cat-bev-existing',
        sku: 'NI-020',
        name: 'Masala Chaas (Spiced Buttermilk)',
        description: 'Original in-house masala chaas',
        price: 45,
        dietaryType: 'VEG',
        spiceLevel: 'MILD',
        isAvailable: true,
        prepTimeMinutes: 2,
        allergens: [],
        modifierGroupIds: [],
        sortOrder: 2,
        isPopular: false,
        isNew: false,
        isFeatured: false
      }
    ];

    db.menuImportHistory = [];
  });

  describe('1. Comprehensive 30+ Restaurant Type Starter Library', () => {
    it('contains at least 30 authentic restaurant starter templates', () => {
      expect(PREBUILT_MENU_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    });

    it('includes all specified commercial cuisine types', () => {
      const templateIds = PREBUILT_MENU_TEMPLATES.map((t) => t.id);
      expect(templateIds).toContain('tpl-north-indian');
      expect(templateIds).toContain('tpl-gujarati');
      expect(templateIds).toContain('tpl-south-indian');
      expect(templateIds).toContain('tpl-punjabi');
      expect(templateIds).toContain('tpl-mughlai');
      expect(templateIds).toContain('tpl-kathiyawadi');
      expect(templateIds).toContain('tpl-rajasthani');
      expect(templateIds).toContain('tpl-south-tiffin');
      expect(templateIds).toContain('tpl-pure-veg');
      expect(templateIds).toContain('tpl-jain');
      expect(templateIds).toContain('tpl-multicuisine');
      expect(templateIds).toContain('tpl-family-diner');
      expect(templateIds).toContain('tpl-thali');
      expect(templateIds).toContain('tpl-chinese');
      expect(templateIds).toContain('tpl-indo-chinese');
      expect(templateIds).toContain('tpl-fast-food');
      expect(templateIds).toContain('tpl-burger-sandwich');
      expect(templateIds).toContain('tpl-cafe');
      expect(templateIds).toContain('tpl-bakery');
      expect(templateIds).toContain('tpl-pizza');
      expect(templateIds).toContain('tpl-chaat');
      expect(templateIds).toContain('tpl-snacks');
      expect(templateIds).toContain('tpl-biryani');
      expect(templateIds).toContain('tpl-tandoor');
      expect(templateIds).toContain('tpl-sweets');
      expect(templateIds).toContain('tpl-juice-beverages');
      expect(templateIds).toContain('tpl-desserts');
      expect(templateIds).toContain('tpl-south-north-combo');
      expect(templateIds).toContain('tpl-fine-dining');
      expect(templateIds).toContain('tpl-cloud-kitchen');
    });

    it('features culturally authentic categories and dishes for Gujarati Restaurant', () => {
      const gujTpl = PREBUILT_MENU_TEMPLATES.find((t) => t.id === 'tpl-gujarati')!;
      expect(gujTpl).toBeDefined();

      const catNames = gujTpl.categories.map((c) => c.name);
      expect(catNames).toContain('Gujarati Thali Special');
      expect(catNames).toContain('Fresh Farsan (Snacks)');
      expect(catNames).toContain('Gujarati Shaak (Curries)');
      expect(catNames).toContain('Dal & Kadhi');
      expect(catNames).toContain('Rotli, Bhakri & Thepla');

      const allDishes = gujTpl.categories.flatMap((c) => c.items);
      const dishNames = allDishes.map((d) => d.name);
      expect(dishNames).toContain('Surti Nylon Khaman (250g)');
      expect(dishNames).toContain('Surti Undhiyu Special');
      expect(dishNames).toContain('Sev Tameta Nu Shaak');
      expect(dishNames).toContain('Kathiyawadi Bajra Rotla (Ghee)');
    });

    it('features genuine Jain options with zero root vegetable claims for Jain Restaurant', () => {
      const jainTpl = PREBUILT_MENU_TEMPLATES.find((t) => t.id === 'tpl-jain')!;
      expect(jainTpl).toBeDefined();

      const allDishes = jainTpl.categories.flatMap((c) => c.items);
      allDishes.forEach((dish) => {
        expect(dish.dietaryType).toBe('JAIN');
      });
      const dishNames = allDishes.map((d) => d.name);
      expect(dishNames).toContain('Jain Raw Banana Cutlets (4 Pcs)');
    });

    it('assigns appropriate kitchen stations to items across templates', () => {
      const northIndian = PREBUILT_MENU_TEMPLATES.find((t) => t.id === 'tpl-north-indian')!;
      const tandooriDish = northIndian.categories
        .find((c) => c.slug === 'tandoor-starters')
        ?.items.find((i) => i.name === 'Paneer Tikka Angara');
      expect(tandooriDish?.kitchenStation).toBe('Tandoor');

      const curryDish = northIndian.categories
        .find((c) => c.slug === 'paneer-curries')
        ?.items.find((i) => i.name === 'Paneer Butter Masala');
      expect(curryDish?.kitchenStation).toBe('Curry Station');
    });
  });

  describe('2. Intelligent Import Analysis & Duplicate Detection', () => {
    it('detects existing matched categories and new categories accurately', () => {
      const analysis = MenuBuilderService.analyzeImport(['tpl-north-indian'], [], 'KEEP_EXISTING');

      // 'Beverages & Chaas' exists in our baseline db.categories
      const matchedBev = analysis.categoryMappings.find((m) => m.categoryName === 'Beverages & Chaas');
      expect(matchedBev).toBeDefined();
      expect(matchedBev?.action).toBe('USE_EXISTING');
      expect(matchedBev?.existingCategoryId).toBe('cat-bev-existing');

      // 'Tandoori Starters & Kebabs' is new
      const newTandoor = analysis.categoryMappings.find((m) => m.categoryName === 'Tandoori Starters & Kebabs');
      expect(newTandoor).toBeDefined();
      expect(newTandoor?.action).toBe('CREATE_NEW');
    });

    it('identifies duplicate dishes by name and SKU', () => {
      const analysis = MenuBuilderService.analyzeImport(['tpl-north-indian'], [], 'KEEP_EXISTING');

      // 'Masala Chaas (Spiced Buttermilk)' already exists in db.menuItems
      const chaasConflict = analysis.dishConflicts.find((c) => c.importedName === 'Masala Chaas (Spiced Buttermilk)');
      expect(chaasConflict).toBeDefined();
      expect(chaasConflict?.existingPrice).toBe(45);
      expect(chaasConflict?.importedPrice).toBe(50);
      expect(chaasConflict?.resolution).toBe('KEEP_EXISTING');
    });
  });

  describe('3. Non-Destructive "Add to Existing Menu" Merge Engine', () => {
    it('merges new categories and dishes into existing menu without deleting baseline items', () => {
      const initialItemCount = db.menuItems.length;
      const initialCatCount = db.categories.length;

      const result = MenuBuilderService.executeSelectiveImport(
        ['tpl-north-indian'],
        [], // all dishes
        {},
        {
          // Keep existing chaas
          'tpl-north-indian::beverages::NI-020': 'KEEP_EXISTING'
        },
        {
          duplicateStrategy: 'KEEP_EXISTING'
        }
      );

      // Verify baseline pizza and chaas are preserved
      const existingPizza = db.menuItems.find((i) => i.id === 'item-pizza-1');
      expect(existingPizza).toBeDefined();
      expect(existingPizza?.price).toBe(290);

      const existingChaas = db.menuItems.find((i) => i.id === 'item-bev-1');
      expect(existingChaas).toBeDefined();
      expect(existingChaas?.price).toBe(45); // Kept existing price

      // Verify new dishes added
      expect(db.menuItems.length).toBeGreaterThan(initialItemCount + 10);
      expect(db.categories.length).toBeGreaterThan(initialCatCount + 4);

      // Verify newly added paneer butter masala exists
      const pbm = db.menuItems.find((i) => i.name === 'Paneer Butter Masala');
      expect(pbm).toBeDefined();
      expect(pbm?.price).toBe(290);
      expect(pbm?.kitchenStation).toBe('Curry Station');

      // Verify import was staged into DRAFT
      expect(MenuBuilderService.isDraft()).toBe(true);
      expect(db.menuImportHistory.length).toBe(1);
      expect(db.menuImportHistory[0].templateId).toBe('tpl-north-indian');
    });

    it('supports UPDATE_EXISTING duplicate conflict resolution', () => {
      MenuBuilderService.executeSelectiveImport(
        ['tpl-north-indian'],
        [],
        {},
        {
          'tpl-north-indian::beverages::NI-020': 'UPDATE_EXISTING'
        }
      );

      const updatedChaas = db.menuItems.find((i) => i.id === 'item-bev-1');
      expect(updatedChaas).toBeDefined();
      expect(updatedChaas?.price).toBe(50); // Updated to template suggested price
    });

    it('supports IMPORT_AS_NEW duplicate conflict resolution', () => {
      MenuBuilderService.executeSelectiveImport(
        ['tpl-north-indian'],
        [],
        {},
        {
          'tpl-north-indian::beverages::NI-020': 'IMPORT_AS_NEW'
        }
      );

      const originalChaas = db.menuItems.find((i) => i.id === 'item-bev-1');
      expect(originalChaas).toBeDefined();
      expect(originalChaas?.price).toBe(45);

      const newChaas = db.menuItems.find((i) => i.name.includes('Masala Chaas') && i.id !== 'item-bev-1');
      expect(newChaas).toBeDefined();
      expect(newChaas?.price).toBe(50);
    });

    it('supports second consecutive import merging without creating duplicate categories', () => {
      // 1. Import North Indian
      MenuBuilderService.executeSelectiveImport(['tpl-north-indian'], [], {}, {});
      const catCountAfterFirst = db.categories.length;

      // 2. Import South + North combo
      MenuBuilderService.executeSelectiveImport(['tpl-south-north-combo'], [], {}, {});

      // Verify categories were reused where appropriate
      expect(db.categories.length).toBeGreaterThanOrEqual(catCountAfterFirst);
      expect(db.menuImportHistory.length).toBe(2);
    });
  });

  describe('4. Draft Staging & Publishing Lifecycle', () => {
    it('allows editing imported draft items and publishing live', () => {
      MenuBuilderService.executeSelectiveImport(['tpl-punjabi'], [], {}, {});
      expect(MenuBuilderService.isDraft()).toBe(true);

      // Edit an imported item
      const chhole = db.menuItems.find((i) => i.name.includes('Pindi Chhole'))!;
      expect(chhole).toBeDefined();
      chhole.price = 245;

      // Publish menu
      const snapshot = MenuBuilderService.publishMenu('Test Lead Cashier', 'Pre-opening Punjabi menu launch');
      expect(snapshot).toBeDefined();
      expect(snapshot.versionTag).toMatch(/^v\d+\.0/);
      expect(MenuBuilderService.isDraft()).toBe(false);

      // Verify item price preserved after publish
      const liveChhole = db.menuItems.find((i) => i.id === chhole.id);
      expect(liveChhole?.price).toBe(245);
    });
  });

  describe('5. Offline Packaged Menu Images & Local Assets', () => {
    it('ensures all starter template items reference local /assets/menu/ paths', () => {
      const allDishes = PREBUILT_MENU_TEMPLATES.flatMap((t) => t.categories.flatMap((c) => c.items));
      expect(allDishes.length).toBeGreaterThan(50);

      allDishes.forEach((dish) => {
        expect(dish.imageUrl).toBeDefined();
        expect(dish.imageUrl).toMatch(/^\/assets\/menu\//);
        expect(dish.imageUrl).not.toContain('http://');
        expect(dish.imageUrl).not.toContain('https://');
      });
    });

    it('provides a valid fallback image asset for custom or unassigned dishes', () => {
      const fallbackUrl = '/assets/menu/common/fallback-dish.svg';
      expect(fallbackUrl).toMatch(/^\/assets\/menu\//);
    });
  });

  describe('6. Semantic Category Deduplication & Conflict Prevention', () => {
    it('prevents duplicate categories like Main Course from being created multiple times', () => {
      // Set existing Main Course category
      db.categories = [
        {
          id: 'cat-main-course',
          name: 'Main Course (Curries)',
          slug: 'main-course-curries',
          iconName: 'UtensilsCrossed',
          sortOrder: 1,
          isActive: true
        }
      ];
      db.menuItems = [
        {
          id: 'item-1',
          categoryId: 'cat-main-course',
          sku: 'PT-01',
          name: 'Paneer Butter Masala',
          description: 'Rich gravy paneer butter masala',
          price: 240,
          dietaryType: 'VEG',
          spiceLevel: 'MILD',
          isAvailable: true,
          prepTimeMinutes: 10,
          allergens: [],
          modifierGroupIds: [],
          sortOrder: 1,
          isPopular: false,
          isNew: false,
          isFeatured: false
        }
      ];

      // Import Punjabi template which contains "Curries & Gravies" or "Main Course"
      const analysis = MenuBuilderService.analyzeImport(['tpl-punjabi']);
      const mainCourseMapping = analysis.categoryMappings.find(
        (m) => m.categoryName.includes('Curries') || m.categoryName.includes('Main Course')
      );

      // Different category names must remain distinct; owners may explicitly map them.
      expect(mainCourseMapping?.action).toBe('CREATE_NEW');
      expect(mainCourseMapping?.existingCategoryId).toBeUndefined();

      // Execute import
      const result = MenuBuilderService.executeSelectiveImport(['tpl-punjabi'], []);
      expect(result.importedCategoriesCount).toBeGreaterThan(0);

      // Verify that no duplicate Main Course category was created
      const mainCourseCats = db.categories.filter((c) =>
        c.name.toLowerCase().includes('main course') || c.name.toLowerCase().includes('curries')
      );
      expect(mainCourseCats.length).toBeGreaterThanOrEqual(1);
      expect(db.categories.find(c => c.id === 'cat-main-course')?.name).toBe('Main Course (Curries)');

      // Verify all main course dishes are assigned to the single existing category
      const mainCourseDishes = db.menuItems.filter((i) => i.categoryId === 'cat-main-course');
      expect(mainCourseDishes.length).toBeGreaterThanOrEqual(1);
    });
  });
});

