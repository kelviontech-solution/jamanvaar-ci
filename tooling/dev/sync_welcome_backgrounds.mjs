import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const library = 'kiosk-welcome-v1';
const source = path.join(root, 'packages/assets/branding', library);
if (!fs.existsSync(path.join(source, 'manifest.json'))) throw Error('Missing kiosk welcome background manifest');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const serverCatalog = JSON.parse(fs.readFileSync(path.join(root, 'cloud/api/src/modules/platform-settings/welcome-builtins.json'), 'utf8'));
if (serverCatalog.length !== manifest.backgrounds.length || manifest.backgrounds.some((b, i) => serverCatalog[i]?.id !== b.id || serverCatalog[i]?.name !== b.name || serverCatalog[i]?.imageUrl !== `/assets/branding/${library}/${b.file}` || serverCatalog[i]?.landscapeImageUrl !== `/assets/branding/${library}/${b.landscapeFile}`)) throw Error('Welcome server catalog must match the canonical background manifest');
for (const photo of manifest.backgrounds) for (const [file, hash] of [[photo.file, photo.sha256], [photo.thumbnail, photo.thumbnailSha256], [photo.landscapeFile, photo.landscapeSha256], [photo.landscapeThumbnail, photo.landscapeThumbnailSha256]]) {
  const bytes = fs.readFileSync(path.join(source, file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw Error(`Kiosk background checksum mismatch: ${file}`);
  for (const app of ['apps/kiosk-system/kiosk-user', 'apps/restaurant-system/pos-admin', 'cloud/super-admin-web']) {
    const target = path.join(root, app, 'public/assets/branding', library, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.copyFileSync(path.join(source, file), target);
  }
}
console.log(`Packaged ${manifest.backgrounds.length} kiosk welcome backgrounds and thumbnails for Kiosk, Restaurant/Kiosk Admin and Super Admin.`);
