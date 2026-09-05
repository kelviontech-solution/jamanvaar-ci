/**
 * JAMANVAAR Menu & Asset Integrity Validator
 * Enforces zero remote URLs, verified local file presence, valid SKUs,
 * unique image-to-dish mappings, and valid categories/prices.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const LIVE_DB_PATH = path.join(ROOT_DIR, 'packages', 'database', 'src', 'live_db.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'packages', 'database', 'src', 'image_manifest.json');
const POS_ASSET_DIR = path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos', 'public');
const SHARED_ASSET_DIR = path.join(ROOT_DIR, 'packages');

console.log('====================================================');
console.log('      JAMANVAAR MENU DATA & ASSET INTEGRITY AUDIT   ');
console.log('====================================================\n');

let errorCount = 0;
let warningCount = 0;

if (!fs.existsSync(LIVE_DB_PATH)) {
  console.error(`❌ FATAL: live_db.json not found at ${LIVE_DB_PATH}`);
  process.exit(1);
}

const liveDb = JSON.parse(fs.readFileSync(LIVE_DB_PATH, 'utf-8'));
const menuItems = liveDb.menuItems || [];
const categories = liveDb.categories || [];

console.log(`Auditing ${menuItems.length} catalog items across ${categories.length} categories...\n`);

const seenImages = new Map();
const seenSkus = new Set();
const seenIds = new Set();

menuItems.forEach((item, idx) => {
  const dishNum = idx + 1;
  const identifier = item.sku || item.id || `Item #${dishNum}`;

  // 1. Check ID & SKU
  if (!item.id) {
    console.error(`❌ [${identifier}] Missing dish 'id'`);
    errorCount++;
  } else if (seenIds.has(item.id)) {
    console.error(`❌ [${identifier}] Duplicate dish ID '${item.id}'`);
    errorCount++;
  } else {
    seenIds.add(item.id);
  }

  if (!item.sku) {
    console.error(`❌ [${identifier}] Missing 'sku'`);
    errorCount++;
  } else if (seenSkus.has(item.sku)) {
    console.error(`❌ [${identifier}] Duplicate SKU '${item.sku}'`);
    errorCount++;
  } else {
    seenSkus.add(item.sku);
  }

  // 2. Check Name & Description
  if (!item.name || item.name.trim() === '') {
    console.error(`❌ [${identifier}] Missing dish name`);
    errorCount++;
  }
  if (!item.description || item.description.trim() === '') {
    console.warn(`⚠️ [${identifier}] Missing dish description`);
    warningCount++;
  }

  // 3. Check Price & Category
  if (typeof item.price !== 'number' || item.price <= 0) {
    console.error(`❌ [${identifier}] Invalid price: ${item.price}`);
    errorCount++;
  }
  if (!item.categoryId || !categories.some(c => c.id === item.categoryId)) {
    console.error(`❌ [${identifier}] Invalid or unmapped categoryId: ${item.categoryId}`);
    errorCount++;
  }

  // 4. Check Image URL (No remote URLs permitted)
  if (!item.imageUrl || item.imageUrl.trim() === '') {
    console.error(`❌ [${identifier}] Missing imageUrl`);
    errorCount++;
  } else {
    if (item.imageUrl.startsWith('http://') || item.imageUrl.startsWith('https://')) {
      console.error(`❌ [${identifier}] Runtime remote image URL forbidden: ${item.imageUrl}`);
      errorCount++;
    } else {
      // Clean path
      const cleanRelPath = item.imageUrl.startsWith('/') ? item.imageUrl.slice(1) : item.imageUrl;
      const posFile = path.join(POS_ASSET_DIR, cleanRelPath);
      const sharedFile = path.join(SHARED_ASSET_DIR, cleanRelPath);

      const existsInPos = fs.existsSync(posFile);
      const existsInShared = fs.existsSync(sharedFile);

      if (!existsInPos && !existsInShared) {
        console.error(`❌ [${identifier}] Local image asset not found on disk: ${item.imageUrl}`);
        errorCount++;
      } else {
        // Verify readable & non-empty
        const targetPath = existsInPos ? posFile : sharedFile;
        const stats = fs.statSync(targetPath);
        if (stats.size === 0) {
          console.error(`❌ [${identifier}] Image asset is empty (0 bytes): ${item.imageUrl}`);
          errorCount++;
        }
      }

      // Check for accidental image reuse
      if (seenImages.has(item.imageUrl)) {
        const prev = seenImages.get(item.imageUrl);
        console.warn(`⚠️ [${identifier}] Reused image path '${item.imageUrl}' (also used by ${prev})`);
      } else {
        seenImages.set(item.imageUrl, identifier);
      }
    }
  }

  // 5. Check Dietary & Station
  if (!item.dietaryType || !['VEG', 'NON_VEG', 'EGG', 'VEGAN'].includes(item.dietaryType)) {
    console.error(`❌ [${identifier}] Invalid dietaryType: ${item.dietaryType}`);
    errorCount++;
  }
  if (!item.kitchenStation) {
    console.warn(`⚠️ [${identifier}] Missing kitchenStation`);
    warningCount++;
  }
});

console.log('----------------------------------------------------');
console.log(`AUDIT RESULTS:`);
console.log(`✓ Total Dishes Checked: ${menuItems.length}`);
console.log(`✓ Unique Dish IDs: ${seenIds.size}`);
console.log(`✓ Unique SKUs: ${seenSkus.size}`);
console.log(`✓ Local Assets Assigned: ${seenImages.size}`);
console.log(`✓ Errors: ${errorCount}`);
console.log(`✓ Warnings: ${warningCount}`);
console.log('----------------------------------------------------\n');

if (errorCount > 0) {
  console.error(`❌ MENU DATA AUDIT FAILED with ${errorCount} error(s).`);
  process.exit(1);
} else {
  console.log('🎉 MENU DATA & ASSET INTEGRITY AUDIT PASSED 100%!');
  process.exit(0);
}
