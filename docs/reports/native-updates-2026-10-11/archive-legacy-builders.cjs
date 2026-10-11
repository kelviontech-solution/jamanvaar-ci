const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const reason = 'Legacy browser-wrapper release packaging is disabled: use .github/workflows/build-installers.yml with preserved Tauri identities and signed updater artifacts. Existing wrapper installations require a tested migration. No output files were changed.';
const names = ['build_windows_installers.cjs', 'build_production_suite_v2.cjs', 'build_and_deploy_autostart_suite.cjs', 'deploy_mcafee_safe_suite.cjs', 'package_zip_release.cjs', 'build_full_native_app_suite.ps1', 'build_desktop_executables.ps1', 'build_clean_antivirus_safe_package.ps1', 'deploy_mcafee_safe_suite.ps1'];
for (const name of names) {
  const file = `tooling/installers/${name}`;
  const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (source.includes(reason)) continue;
  if (name.endsWith('.ps1')) {
    if (source.includes('<#') || source.includes('#>')) throw Error('Review archived PowerShell comment boundaries before changing this file');
    fs.writeFileSync(file, `\uFEFF# Archived wrapper builder; migration reference only.\nthrow '${reason}'\n<#\n${source}\n#>\n`);
  } else fs.writeFileSync(file, `// Archived wrapper builder; migration reference only.\nthrow new Error(${JSON.stringify(reason)});\n${source}`);
}
const results = names.map(name => {
  const file = `tooling/installers/${name}`;
  const args = name.endsWith('.ps1') ? ['-NoProfile', '-NonInteractive', '-File', file] : [file];
  const processResult = spawnSync(name.endsWith('.ps1') ? 'powershell.exe' : process.execPath, args, { encoding: 'utf8', windowsHide: true });
  const rejected = processResult.status !== 0 && `${processResult.stdout}${processResult.stderr}`.includes('Legacy browser-wrapper release packaging is disabled');
  return { file, rejectedBeforeMutation: rejected, exitCode: processResult.status };
});
fs.writeFileSync(`${__dirname}/evidence/LEGACY_BUILD_GATES.json`, JSON.stringify({ reason, results }, null, 2));
if (results.some(x => !x.rejectedBeforeMutation)) throw Error('A legacy script failed to show its early release gate');
console.log(`Verified ${results.length} additional archived release/deployment entry points reject before altering files or running installed apps.`);
