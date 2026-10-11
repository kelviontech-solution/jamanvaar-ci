const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
// Reuse compiled dependencies without changing platform identities or release profiles.
const env = { ...process.env, CARGO_TARGET_DIR: resolve('apps/restaurant-system/kds/src-tauri/target') };
for (const app of ['pos-admin', 'pos', 'captain', 'kds', 'kiosk']) {
  const path = app === 'kiosk' ? 'apps/kiosk-system/kiosk-user' : `apps/restaurant-system/${app}`;
  const result = spawnSync(process.execPath, [resolve(__dirname, 'run-check.cjs'), `native-${app}-production`, 'cargo', 'build', '--release', '--locked', '--offline', '--features', 'tauri/custom-protocol', '--manifest-path', `${path}/src-tauri/Cargo.toml`], { env, encoding: 'utf8', windowsHide: true });
  process.stdout.write(`${app}: ${result.status === 0 ? 'optimized build passed' : 'build failed'}\n`);
  if (result.status) { process.stdout.write(result.stdout || result.stderr); process.exit(result.status); }
}
