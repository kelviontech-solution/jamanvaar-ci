const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
for (const app of ['pos', 'pos-admin', 'captain', 'kds', 'kiosk']) {
  const path = app === 'kiosk' ? 'apps/kiosk-system/kiosk-user' : `apps/restaurant-system/${app}`;
  const run = spawnSync(process.execPath, [resolve(__dirname, 'run-check.cjs'), `native-${app}-metadata`, 'cargo', 'metadata', '--locked', '--offline', '--no-deps', '--format-version', '1', '--manifest-path', `${path}/src-tauri/Cargo.toml`], { encoding: 'utf8', windowsHide: true });
  if (run.status) { process.stdout.write(run.stdout || run.stderr); process.exit(run.status); }
  console.log(`${app}: locked native dependency metadata passed`);
}
