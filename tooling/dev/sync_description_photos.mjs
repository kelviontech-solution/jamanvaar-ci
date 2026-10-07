import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ship the same description-matched photos with every independently built frontend.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let count = 0;
for (const library of ['description-matched-v1', 'template-photos-v1']) {
const source = path.join(root, 'packages/assets/menu', library);
if (!fs.existsSync(path.join(source, 'manifest.json'))) {
  if (library === 'template-photos-v1' && JSON.parse(fs.readFileSync(path.join(root, 'packages/utils/src/template_photo_catalog.json'), 'utf8')).length === 0) continue;
  throw Error(`Missing menu photo manifest: ${library}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const content = new Map();
for (const photo of manifest.photos) {
  const file = path.join(source, photo.file);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error(`Missing starter dish image: ${photo.file}`);
  const bytes = fs.readFileSync(file);
  if (photo.sha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== photo.sha256) throw new Error(`Starter dish image checksum mismatch: ${photo.file}`);
  content.set(photo.file, bytes);
}
for (const app of ['apps/kiosk-system/kiosk-user', 'apps/restaurant-system/pos', 'apps/restaurant-system/pos-admin', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'cloud/super-admin-web']) {
  const target = path.join(root, app, 'public/assets/menu', library);
  fs.mkdirSync(target, { recursive: true });
  for (const photo of manifest.photos) {
    const file = path.join(target, photo.file);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content.get(photo.file))) fs.copyFileSync(path.join(source, photo.file), file);
  }
}
count += manifest.photos.length;
}
// QR Guest's publicDir reuses POS assets.
console.log(`Packaged ${count} description-matched starter photos for all frontends.`);
