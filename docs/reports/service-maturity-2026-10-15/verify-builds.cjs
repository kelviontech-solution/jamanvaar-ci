const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
async function run(name, args, env = process.env, cwd = root) {
  return new Promise(resolve => {
    const log = fs.createWriteStream(path.join(root, '.jamanvaar', 'maturity-build-' + name + '.log'));
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true });
    child.stdout.pipe(log); child.stderr.pipe(log);
    child.on('error', () => resolve({ name, exitCode: -1 }));
    child.on('close', code => { console.log(name, code === 0 ? 'PASS' : 'FAIL'); resolve({ name, exitCode: code }); });
  });
}
(async () => {
  const file = path.join(__dirname, 'evidence', 'verification-builds.json');
  const apiOnly = process.argv[2] === 'api';
  const results = apiOnly && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).results.filter(r => r.name !== 'api') : [];
  results.push(await run('api', [path.join(root, 'cloud/api/node_modules/@nestjs/cli/bin/nest.js'), 'build'], process.env, path.join(root, 'cloud/api')));
  if (!apiOnly) results.push(await run('seven-web-apps', ['docs/reports/full-app-browser-audit-2026-10-13/build-apps.cjs', 'admin', 'pos', 'kiosk', 'captain', 'kds', 'super', 'qr'], { ...process.env, JAMANVAAR_QA_SKIP_PUBLIC: '1' }));
  fs.writeFileSync(path.join(__dirname, 'evidence', 'verification-builds.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  if (results.some(r => r.exitCode !== 0)) process.exitCode = 1;
})();
