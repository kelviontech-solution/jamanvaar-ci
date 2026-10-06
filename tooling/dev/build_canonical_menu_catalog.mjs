/**
 * JAMANVAAR Canonical Menu Catalog & Asset Pipeline Builder
 * Enforces single source of truth for POS Admin & POS Terminal,
 * generates image_manifest.json, updates live_db.json and seed databases,
 * Bundled sample data is used only for image metadata. Restaurant databases are never overwritten.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const LIVE_DB_PATH = path.join(ROOT_DIR, 'packages', 'database', 'src', 'live_db.json');
const DESKTOP_DB_PATH = path.join(ROOT_DIR, 'JAMANVAAR_DESKTOP_PACKAGE', 'server', 'live_db.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'packages', 'database', 'src', 'image_manifest.json');

// Canonical Master Menu Items for the Flagship Restaurant
export const CANONICAL_MASTER_DISHES = [
  {
    id: 'item-hbk',
    sku: 'HBK-01',
    name: 'Hara Bhara Kebab (6 Pcs)',
    categoryId: 'cat-starters',
    categoryName: 'Starters',
    description: 'Crispy spinach, green pea and paneer patties served with fresh mint chutney.',
    price: 220,
    imageUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 12,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 1,
    kitchenStation: 'Kitchen',
    inStock: true
  },
  {
    id: 'item-cc',
    sku: 'CC-02',
    name: 'Crispy Corn Salt & Pepper',
    categoryId: 'cat-starters',
    categoryName: 'Starters',
    description: 'Golden fried sweet corn tossed with bell peppers, green chillies & aromatic herbs.',
    price: 240,
    imageUrl: '/assets/menu/starters/crispy-corn.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: [],
    modifierGroupIds: ['mod-spice-level'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 2,
    kitchenStation: 'Kitchen',
    inStock: true
  },
  {
    id: 'item-crolls',
    sku: 'CCR-03',
    name: 'Cheese Corn Cigar Rolls (5 Pcs)',
    categoryId: 'cat-starters',
    categoryName: 'Starters',
    description: 'Golden crispy rolls filled with melted mozzarella, sweet corn and herbs served with sweet chilli dip.',
    price: 210,
    imageUrl: '/assets/menu/starters/cheese-corn-cigar-rolls.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: true,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 12,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 3,
    kitchenStation: 'Kitchen',
    inStock: true
  },
  {
    id: 'item-pt',
    sku: 'PT-04',
    name: 'Paneer Tikka (Tandoori Angaar)',
    categoryId: 'cat-tandoor',
    categoryName: 'Tandoor & Kebab',
    description: 'Fresh malai cottage cheese cubes marinated in spiced curd and grilled over charcoal embers.',
    price: 260,
    imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 15,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 4,
    kitchenStation: 'Tandoor',
    inStock: true
  },
  {
    id: 'item-dm',
    sku: 'DM-05',
    name: 'Dal Makhani (Slow Cooked)',
    categoryId: 'cat-main-course',
    categoryName: 'Main Course',
    description: 'Slow-cooked black urad lentils simmered overnight with butter, tomatoes and fresh cream.',
    price: 195,
    imageUrl: '/assets/menu/north-indian/dal-makhani.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 5,
    kitchenStation: 'Curry Station',
    inStock: true
  },
  {
    id: 'item-pbm',
    sku: 'PBM-06',
    name: 'Paneer Butter Masala',
    categoryId: 'cat-main-course',
    categoryName: 'Main Course',
    description: 'Soft cottage cheese simmered in a luscious makhani gravy enriched with butter and cream.',
    price: 250,
    imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 14,
    allergens: ['Dairy', 'Nuts'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 6,
    kitchenStation: 'Curry Station',
    inStock: true
  },
  {
    id: 'item-bn',
    sku: 'BN-07',
    name: 'Butter Naan (Tandoori)',
    categoryId: 'cat-breads',
    categoryName: 'Naan & Roti',
    description: 'Traditional clay-tandoor baked leavened bread brushed with melted pure Amul butter.',
    price: 60,
    imageUrl: '/assets/menu/north-indian/butter-naan.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: false,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Gluten', 'Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 7,
    kitchenStation: 'Tandoor',
    inStock: true
  },
  {
    id: 'item-gn',
    sku: 'GN-08',
    name: 'Garlic Butter Naan',
    categoryId: 'cat-breads',
    categoryName: 'Naan & Roti',
    description: 'Fluffy tandoori bread generously garnished with minced roasted garlic, fresh coriander and butter.',
    price: 75,
    imageUrl: '/assets/menu/north-indian/garlic-naan.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: false,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Gluten', 'Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 8,
    kitchenStation: 'Tandoor',
    inStock: true
  },
  {
    id: 'item-vgb-hnd',
    sku: 'VGB-09',
    name: 'Royal Veg Handi Dum Biryani',
    categoryId: 'cat-biryani',
    categoryName: 'Biryani & Rice',
    description: 'Farm fresh seasonal vegetables and paneer simmered in rich saffron infused basmati rice.',
    price: 240,
    imageUrl: '/assets/menu/biryani/royal-veg-biryani.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 15,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 9,
    kitchenStation: 'Biryani Station',
    inStock: true
  },
  {
    id: 'item-cc-ice',
    sku: 'CC-10',
    name: 'Cold Coffee with Vanilla Ice Cream',
    categoryId: 'cat-beverages',
    categoryName: 'Beverages',
    description: 'Rich blended espresso with chilled milk and a velvety scoop of vanilla ice cream.',
    price: 120,
    imageUrl: '/assets/menu/beverages/cold-coffee.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: true,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 10,
    kitchenStation: 'Beverages',
    inStock: true
  },
  {
    id: 'item-gj-2',
    sku: 'GJ-11',
    name: 'Shahi Gulab Jamun (2 Pcs)',
    categoryId: 'cat-desserts',
    categoryName: 'Desserts',
    description: 'Warm, soft khoya dumplings soaked in fragrant green cardamom and saffron syrup.',
    price: 80,
    imageUrl: '/assets/menu/desserts/gulab-jamun.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 4,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 11,
    kitchenStation: 'Dessert Station',
    inStock: true
  },
  {
    id: 'item-thali-guj',
    sku: 'THL-12',
    name: 'Authentic Gujarati Special Thali',
    categoryId: 'cat-main-course',
    categoryName: 'Main Course',
    description: '2 Veg Sabzi, Gujarati Kadhi, Dal, 4 Phulka Roti, Jeera Rice, Farsan, Sweet, Pickle & Masala Chhas.',
    price: 280,
    imageUrl: '/assets/menu/thali/gujarati-thali.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: ['mod-spice-level'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 12,
    kitchenStation: 'Curry Station',
    inStock: true
  }
];

export const CANONICAL_CATEGORIES = [
  { id: 'cat-starters', name: 'Starters', slug: 'starters', iconName: 'Flame', sortOrder: 1, isActive: true },
  { id: 'cat-tandoor', name: 'Tandoor & Kebab', slug: 'tandoor', iconName: 'Flame', sortOrder: 2, isActive: true },
  { id: 'cat-main-course', name: 'Main Course', slug: 'main-course', iconName: 'Utensils', sortOrder: 3, isActive: true },
  { id: 'cat-breads', name: 'Naan & Roti', slug: 'breads', iconName: 'Wheat', sortOrder: 4, isActive: true },
  { id: 'cat-biryani', name: 'Biryani & Rice', slug: 'biryani', iconName: 'Soup', sortOrder: 5, isActive: true },
  { id: 'cat-beverages', name: 'Beverages', slug: 'beverages', iconName: 'Coffee', sortOrder: 6, isActive: true },
  { id: 'cat-desserts', name: 'Desserts', slug: 'desserts', iconName: 'IceCream', sortOrder: 7, isActive: true }
];

/** Build image metadata only. A production build must never replace a restaurant's stored menu. */
export function buildImageManifest(targetPath = MANIFEST_PATH) {
  const manifest = { version: '2.0.0', updatedAt: new Date().toISOString(), totalDishes: CANONICAL_MASTER_DISHES.length, items: {} };
  for (const dish of CANONICAL_MASTER_DISHES) manifest.items[dish.sku] = {
    id: dish.id, sku: dish.sku, name: dish.name, category: dish.categoryName,
    description: dish.description, price: dish.price, localAsset: dish.imageUrl,
    kitchenStation: dish.kitchenStation, dietaryType: dish.dietaryType, verified: true, status: 'BUNDLED_OFFLINE'
  };
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const outputIndex = process.argv.indexOf('--manifest-output');
  const target = outputIndex >= 0 ? process.argv[outputIndex + 1] : MANIFEST_PATH;
  if (!target) throw Error('Supply a path after --manifest-output.');
  const manifest = buildImageManifest(path.resolve(target));
  console.log(`Generated image metadata for ${manifest.totalDishes} bundled sample dishes. Restaurant databases were not modified.`);
}
