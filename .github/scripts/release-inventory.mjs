import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths = { POS: ['pos', 'apps/restaurant-system/pos'], RestaurantAdmin: ['pos-admin', 'apps/restaurant-system/pos-admin'], Kiosk: ['kiosk', 'apps/kiosk-system/kiosk-user'], Captain: ['captain', 'apps/restaurant-system/captain'], KDS: ['kds', 'apps/restaurant-system/kds'] };
const selected = (process.env.APPS_CSV ?? '').split(',').filter(Boolean);
if (!selected.length) throw Error('No release applications selected');
const apps = selected.map(app => {
  if (!paths[app]) throw Error('Unknown release app');
  const [slug, path] = paths[app];
  const config = JSON.parse(readFileSync(`${path}/src-tauri/tauri.conf.json`, 'utf8'));
  const artifacts = ['exe', 'apk'].map(ext => {
    const file = `jamanvaar-${slug}.${ext}`;
    const bytes = readFileSync(`release-assets/${file}`);
    return { file, platform: ext === 'exe' ? 'windows-x86_64' : 'android-aarch64', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  });
  return { app, identifier: config.identifier, version: config.version, productName: config.productName, artifacts };
});
writeFileSync('release-assets/RELEASE_INVENTORY.json', JSON.stringify({ commit: process.env.GITHUB_SHA, apps }, null, 2));
console.log('Recorded per-application versions, identities and artifact hashes. A build tag is not an application version.');
