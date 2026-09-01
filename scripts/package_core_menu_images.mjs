import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BRAIN_DIR = 'C:\\Users\\OM Sanjhira\\.gemini\\antigravity-ide\\brain\\bb5f9ef3-93a7-4d0a-a23a-576df56af20b';

const CORE_DISH_PHOTOS = [
  {
    dishId: 'HBK-01',
    sku: 'HBK-01',
    name: 'Hara Bhara Kebab (6 Pcs)',
    category: 'Starters',
    sourcePattern: 'hara_bhara_kebab_food',
    relPath: 'north-indian/hara-bhara-kebab.jpg',
    aliasPath: 'starters/HBK-01.jpg'
  },
  {
    dishId: 'CC-02',
    sku: 'CC-02',
    name: 'Crispy Corn Salt & Pepper',
    category: 'Starters',
    sourcePattern: 'crispy_corn_food',
    relPath: 'starters/crispy-corn.jpg',
    aliasPath: 'starters/CC-02.jpg'
  },
  {
    dishId: 'CCR-03',
    sku: 'CCR-03',
    name: 'Cheese Corn Cigar Rolls (5 Pcs)',
    category: 'Starters',
    sourcePattern: 'cigar_rolls_food',
    relPath: 'starters/cheese-corn-cigar-rolls.jpg',
    aliasPath: 'starters/CCR-03.jpg'
  },
  {
    dishId: 'PT-04',
    sku: 'PT-04',
    name: 'Paneer Tikka (Tandoori Angaar)',
    category: 'Tandoor',
    sourcePattern: 'paneer_tikka_food',
    relPath: 'north-indian/paneer-tikka.jpg',
    aliasPath: 'tandoor/PT-04.jpg'
  },
  {
    dishId: 'DM-05',
    sku: 'DM-05',
    name: 'Dal Makhani (Slow Cooked)',
    category: 'Main Course',
    sourcePattern: 'dal_makhani_food',
    relPath: 'north-indian/dal-makhani.jpg',
    aliasPath: 'main-course/DM-05.jpg'
  },
  {
    dishId: 'PBM-06',
    sku: 'PBM-06',
    name: 'Paneer Butter Masala',
    category: 'Main Course',
    sourcePattern: 'paneer_butter_masala_food',
    relPath: 'north-indian/paneer-butter-masala.jpg',
    aliasPath: 'main-course/PBM-06.jpg'
  },
  {
    dishId: 'BN-07',
    sku: 'BN-07',
    name: 'Butter Naan (Tandoori)',
    category: 'Breads',
    sourcePattern: 'butter_naan_food',
    relPath: 'north-indian/butter-naan.jpg',
    aliasPath: 'breads/BN-07.jpg'
  },
  {
    dishId: 'GN-08',
    sku: 'GN-08',
    name: 'Garlic Butter Naan',
    category: 'Breads',
    sourcePattern: 'garlic_naan_food',
    relPath: 'north-indian/garlic-naan.jpg',
    aliasPath: 'breads/GN-08.jpg'
  },
  {
    dishId: 'VGB-09',
    sku: 'VGB-09',
    name: 'Royal Veg Handi Dum Biryani',
    category: 'Biryani & Rice',
    sourcePattern: 'veg_biryani_food',
    relPath: 'biryani/royal-veg-biryani.jpg',
    aliasPath: 'biryani/VGB-09.jpg'
  },
  {
    dishId: 'CC-10',
    sku: 'CC-10',
    name: 'Cold Coffee with Vanilla Ice Cream',
    category: 'Beverages',
    sourcePattern: 'cold_coffee_food',
    relPath: 'beverages/cold-coffee.jpg',
    aliasPath: 'beverages/CC-10.jpg'
  },
  {
    dishId: 'GJ-11',
    sku: 'GJ-11',
    name: 'Shahi Gulab Jamun (2 Pcs)',
    category: 'Desserts',
    sourcePattern: 'gulab_jamun_food',
    relPath: 'desserts/gulab-jamun.jpg',
    aliasPath: 'desserts/GJ-11.jpg'
  },
  {
    dishId: 'THL-12',
    sku: 'THL-12',
    name: 'Authentic Gujarati Special Thali',
    category: 'Thali & Combos',
    sourcePattern: 'gujarati_thali_food',
    relPath: 'thali/gujarati-thali.jpg',
    aliasPath: 'thali/THL-12.jpg'
  }
];

const TARGET_APP_DIRS = [
  path.join(ROOT_DIR, 'shared', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos-admin', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-user', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-admin', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'captain', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'kds', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'JAMANVAAR_DESKTOP_PACKAGE', 'assets', 'menu')
];

console.log('🚀 [JAMANVAAR] Packaging & Synchronizing Verified Authentic Food Photos...');

const brainFiles = fs.readdirSync(BRAIN_DIR);

for (const dish of CORE_DISH_PHOTOS) {
  const matchedFile = brainFiles.find(f => f.startsWith(dish.sourcePattern) && f.endsWith('.jpg'));
  if (!matchedFile) {
    console.warn(`⚠️ Warning: Source image for ${dish.name} (${dish.sourcePattern}) not found.`);
    continue;
  }

  const srcPath = path.join(BRAIN_DIR, matchedFile);
  const imgBuffer = fs.readFileSync(srcPath);

  for (const baseDir of TARGET_APP_DIRS) {
    const destRel = path.join(baseDir, dish.relPath);
    const destAlias = path.join(baseDir, dish.aliasPath);

    fs.mkdirSync(path.dirname(destRel), { recursive: true });
    fs.mkdirSync(path.dirname(destAlias), { recursive: true });

    fs.writeFileSync(destRel, imgBuffer);
    fs.writeFileSync(destAlias, imgBuffer);
  }

  console.log(`✓ Synchronized [${dish.dishId}] ${dish.name} -> ${dish.relPath} & ${dish.aliasPath}`);
}

console.log('🎉 Core verified food photos packaged successfully across all applications!');
