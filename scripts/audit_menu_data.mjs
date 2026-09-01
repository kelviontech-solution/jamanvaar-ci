import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const seedPath = path.join(ROOT_DIR, 'shared', 'database', 'src', 'seed.ts');
const livePath = path.join(ROOT_DIR, 'shared', 'database', 'src', 'live_db.json');
const templatesPath = path.join(ROOT_DIR, 'shared', 'database', 'src', 'menu_templates_data.ts');
const imageMetaPath = path.join(ROOT_DIR, 'shared', 'database', 'src', 'image_metadata.json');

console.log('=== JAMANVAAR MENU DATA AUDIT ===\n');

// 1. Inspect live_db.json
if (fs.existsSync(livePath)) {
  const liveDb = JSON.parse(fs.readFileSync(livePath, 'utf-8'));
  console.log(`[live_db.json] Menu Items: ${liveDb.menuItems?.length || 0}`);
  if (liveDb.menuItems) {
    liveDb.menuItems.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.sku || item.id}] "${item.name}" -> Image: ${item.imageUrl}`);
    });
  }
}

// 2. Inspect image_metadata.json
if (fs.existsSync(imageMetaPath)) {
  const meta = JSON.parse(fs.readFileSync(imageMetaPath, 'utf-8'));
  console.log(`\n[image_metadata.json] Registered Items: ${meta.items?.length || 0}`);
}
