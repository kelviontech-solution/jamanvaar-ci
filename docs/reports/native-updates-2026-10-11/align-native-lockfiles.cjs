const { readFileSync, writeFileSync } = require('node:fs');
const paths = ['apps/restaurant-system/pos', 'apps/restaurant-system/pos-admin', 'apps/restaurant-system/captain', 'apps/kiosk-system/kiosk-user'];
const source = readFileSync('apps/restaurant-system/kds/src-tauri/Cargo.lock', 'utf8');
for (const app of paths) {
  const manifest = readFileSync(`${app}/src-tauri/Cargo.toml`, 'utf8');
  const name = /^name = "([^"]+)"/m.exec(manifest)[1];
  // These five manifests share exactly the same dependency requirements. Preserve
  // the already audited KDS resolution, including updater/plugin dependencies,
  // rather than incidentally resolving newer registry versions during a check.
  writeFileSync(`${app}/src-tauri/Cargo.lock`, source.replace('name = "jamanvaar-kds"', `name = "${name}"`));
}
