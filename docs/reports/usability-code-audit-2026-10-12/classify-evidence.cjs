const fs = require('node:fs');
const path = require('node:path');
const after = process.argv.includes('--after');
const dir = path.join(__dirname, 'evidence', ...(after ? ['after'] : []));
const scan = JSON.parse(fs.readFileSync(path.join(dir, 'SOURCE_SCAN.json'), 'utf8'));
const unused = JSON.parse(fs.readFileSync(path.join(dir, 'UNUSED_DECLARATIONS.json'), 'utf8'));
const groups = {};
for (const candidate of scan.unreachableCandidates) {
  const file = candidate.file;
  const group = /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes('/__tests__/')
    ? 'tests-not-runtime-dead-code'
    : file.startsWith('packages/branch-core/') ? 'separate-service-entrypoint'
    : file.startsWith('packages/database/src/durable/') ? 'durable-database-drivers-and-worker'
    : file.endsWith('/seed-options.ts') ? 'seed-cli-helper'
    : file.startsWith('packages/validation/') ? 'public-library-exports-review-consumers'
    : 'review-candidate';
  (groups[group] ||= []).push(file);
}
const byFile = {};
for (const d of unused.diagnostics) byFile[d.file] = (byFile[d.file] || 0) + 1;
const result = {
  checkedAt: new Date().toISOString(),
  scope: 'Classification of static reachability candidates; not deletion authorization or proof of runtime behavior.',
  counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
  groups,
  unusedDeclarationCount: unused.count,
  mostUnused: Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([file, count]) => ({file, count})),
};
fs.writeFileSync(path.join(dir, 'CANDIDATE_CLASSIFICATION.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({counts: result.counts, unusedDeclarationCount: result.unusedDeclarationCount}, null, 2));
if (!after) fs.writeFileSync(path.join(dir, 'BROWSER_COVERAGE.json'), JSON.stringify({
  status: 'INCOMPLETE_PRELIMINARY_ONLY',
  scope: 'Isolated, unauthenticated, current-source local Vite/CDP probes. Backend requests were intercepted; no real orders, payments or production data were changed.',
  captured: ['restaurant-admin activation/login', 'QR public site', 'QR admin login'],
  viewports: ['1366x768', '390x844'],
  limitation: 'First harness run produced six captures with a Tailwind content-configuration warning. After correcting the harness working directory, the subsequent run exited without completing coverage. These captures are not authenticated UI acceptance evidence. Other apps and full operational workflows were not browser-verified in this assessment.',
}, null, 2));
