const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const YAML = require('js-yaml');
const workflow = YAML.load(readFileSync('.github/workflows/build-installers.yml', 'utf8'));
if (!workflow.jobs['build-desktop'] || !workflow.jobs['build-android']) throw Error('Missing release jobs');
for (const script of ['validate-release-config', 'harden-android-release', 'verify-android-identity', 'release-inventory', 'validate-sidecar-provenance']) {
  const result = spawnSync(process.execPath, ['--check', `.github/scripts/${script}.mjs`], { encoding: 'utf8', windowsHide: true });
  if (result.status) throw Error(result.stderr || 'Invalid release script');
}
const parsed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$tokens=$null; $parseErrors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .github/scripts/sign-windows.ps1),[ref]$tokens,[ref]$parseErrors); if ($parseErrors.Count) { throw "Signing script has syntax errors" }'], { encoding: 'utf8', windowsHide: true });
if (parsed.status) throw Error(parsed.stderr || 'Invalid PowerShell signing script');
console.log('Release YAML, five JavaScript release helpers and PowerShell signing script parse successfully. No signing or workflow execution performed.');
