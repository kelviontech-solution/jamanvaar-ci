const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const logDir = path.join(root, '.jamanvaar/browser-audit');
const children = [];
const start = (label, args, cwd, env) => {
  const log = fs.openSync(path.join(logDir, `${label}.log`), 'a');
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log, log], windowsHide: true });
  children.push(child);
  child.on('exit', code => console.log(`${label} exited ${code}`));
};
const env = { ...process.env, VITE_CLOUD_API_BASE_URL: 'http://localhost:4010', VITE_API_BASE_URL: 'http://localhost:4010' };
start('api', [path.join(__dirname, 'browser-audit-server.cjs')], root, env);
for (const [label, rel] of Object.entries({ super: 'cloud/super-admin-web', admin: 'apps/restaurant-system/pos-admin', pos: 'apps/restaurant-system/pos', captain: 'apps/restaurant-system/captain', kds: 'apps/restaurant-system/kds', kiosk: 'apps/kiosk-system/kiosk-user', qr: 'apps/qr-guest' })) {
  start(label, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost'], path.join(root, rel), env);
}
console.log('QA API and seven Vite apps started; only these child processes belong to this audit.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); setTimeout(() => process.exit(), 500); });
