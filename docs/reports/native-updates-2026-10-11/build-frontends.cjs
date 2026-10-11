const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const builds = { 'super-admin': 'cloud/super-admin-web', 'restaurant-admin': 'apps/restaurant-system/pos-admin', pos: 'apps/restaurant-system/pos', captain: 'apps/restaurant-system/captain', kds: 'apps/restaurant-system/kds', kiosk: 'apps/kiosk-system/kiosk-user', 'qr-guest': 'apps/qr-guest' };
const npm = process.env.npm_execpath || resolve(process.execPath, '../node_modules/npm/bin/npm-cli.js');
for (const [name, workspace] of Object.entries(builds)) {
  const result = spawnSync(process.execPath, [resolve(__dirname, 'run-check.cjs'), `build-${name}`, process.execPath, npm, 'run', 'build', '--workspace', workspace], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || result.stderr); process.exit(result.status || 1);
  }
  console.log(`${name}: build passed`);
}
