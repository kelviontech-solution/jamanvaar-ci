const fs = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const run = (name, script, args) => spawnSync(process.execPath, [resolve(__dirname, 'run-check.cjs'), name, 'powershell.exe', '-NoProfile', '-NonInteractive', '-File', resolve(__dirname, script), ...args], { windowsHide: true, encoding: 'utf8' });
for (const app of ['pos-admin', 'pos', 'captain', 'kiosk']) {
  let result = run(`android-${app}-init`, 'android-validation.ps1', ['-Stage', 'init', '-App', app]);
  if (result.status) { process.stdout.write(result.stdout || result.stderr); process.exit(result.status); }
  result = run(`android-${app}-release`, 'android-validation.ps1', ['-Stage', 'build', '-App', app]);
  if (result.status) {
    const log = fs.readFileSync(resolve(__dirname, `evidence/android-${app}-release.log`), 'utf8');
    if (!log.includes('Creation symbolic link is not allowed') || !/Finished[\s\S]*?release/.test(log)) { process.stdout.write(result.stdout || result.stderr); process.exit(result.status); }
    console.log(`${app}: Rust compiled; using verified copy for the known Windows symlink limitation`);
    result = run(`android-${app}-gradle`, 'android-gradle-validation.ps1', ['-App', app]);
    if (result.status) { process.stdout.write(result.stdout || result.stderr); process.exit(result.status); }
  }
  console.log(`${app}: unsigned Android release validation passed; signing and installed-device acceptance remain separate`);
}
