// Runs `npm audit --omit=dev` and fails only on high/critical advisories that are not on the
// explicit allowlist below. Equivalent in spirit to `cargo audit --ignore <ID>` (used for the
// zip-crate advisories in quality-security.yml's rust-audit job) — npm audit has no built-in
// per-advisory ignore flag, so this gives it one, scoped and documented the same way.
import { spawnSync } from 'node:child_process';

// Each entry: the GHSA id from the advisory URL, the package it's on, and why it's allowed.
// Remove an entry once the real fix (usually a major-version bump) lands and is verified.
const ALLOWLIST = [
  {
    id: 'GHSA-mrhx-c7xc-m3w5',
    package: 'zod',
    reason:
      "Zod can exhaust memory validating oversized constrained collections. The only fix is " +
      'zod v3->v4, a breaking migration across every validation schema in cloud/api — not a ' +
      'safe mechanical bump. Decision made with the project owner on 2026-10-25: ship today, ' +
      'do the v4 migration as separate, properly-tested work.'
  }
];

// shell: true so this resolves npm.cmd on Windows (local verification) as well as the real
// executable on CI's Linux runners. Node warns that shell:true args aren't escaped, but every
// arg here is a static literal (no external/user input reaches this call), so there is nothing
// to inject.
const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', shell: true });
// npm audit exits non-zero when it finds anything, same as a normal run — only `error.code` (a
// real npm failure, not "found vulnerabilities") should abort before we get to parse output.
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stdout);
  console.error(result.stderr);
  throw new Error('npm audit did not produce parseable JSON');
}
if (report.error) {
  console.error(result.stderr || JSON.stringify(report.error));
  throw new Error(`npm audit failed to run: ${report.error.summary ?? report.error.code}`);
}

const vulnerabilities = report.vulnerabilities ?? {};
const blocking = [];
const allowed = [];

for (const [name, v] of Object.entries(vulnerabilities)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  const ids = (v.via ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry.url))
    .filter(Boolean)
    .map((url) => url.split('/').pop());
  const entryAllowed = ALLOWLIST.find((a) => a.package === name && ids.includes(a.id));
  if (entryAllowed) allowed.push({ name, severity: v.severity, ...entryAllowed });
  else blocking.push({ name, severity: v.severity, ids });
}

if (allowed.length) {
  console.log('Allowed (tracked) advisories:');
  for (const a of allowed) console.log(`  - ${a.name} (${a.severity}) ${a.id}: ${a.reason}`);
}

if (blocking.length) {
  console.error('\nBlocking high/critical advisories not on the allowlist:');
  for (const b of blocking) console.error(`  - ${b.name} (${b.severity}) ${b.ids.join(', ')}`);
  console.error('\nFull npm audit output:\n');
  console.error(JSON.stringify(report, null, 2));
  throw new Error(`${blocking.length} unallowed high/critical advisory(ies) found`);
}

console.log('\nNo unallowed high/critical production npm advisories.');
