// Produces a sanitized aggregate ledger; never copies raw test logs or environment values.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative));
const readText = relative => { const bytes = read(relative); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = relative => crypto.createHash('sha256').update(read(relative)).digest('hex');
function testRun(relative, scope) {
  const report = JSON.parse(read(relative).toString('utf8'));
  if (!report.success || report.numFailedTests || report.numFailedTestSuites) throw Error(`Verification failed: ${scope}`);
  return { scope, source: relative, sha256: hash(relative), files: report.testResults.length,
    passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests };
}
const browserPath = '.jamanvaar/financial-checkout-browser.json';
const browser = JSON.parse(read(browserPath).toString('utf8'));
if (browser.observations.length !== 4 || browser.observations.some(row => row.pageErrors !== 0)) throw Error('Incomplete browser acceptance');
for (const log of ['.jamanvaar/repair16-final-types.log', '.jamanvaar/repair16-api-types.log']) {
  if (readText(log).trim()) throw Error(`Type gate was not clean: ${log}`);
}
for (const log of ['.jamanvaar/repair16-pos-build.log', '.jamanvaar/repair16-admin-build.log']) {
  if (!readText(log).includes('built in')) throw Error(`Missing build completion: ${log}`);
}
const sources = [
  'packages/database/src/db.ts', 'packages/database/src/repositories.ts', 'packages/database/src/index.ts',
  'packages/database/src/durable/protected_recovery.ts',
  'apps/restaurant-system/pos/src/store/posStore.ts',
  'apps/restaurant-system/pos/src/components/payment/PosPaymentModal.tsx',
  'apps/restaurant-system/pos/src/components/settings/DeviceRecoveryPanel.tsx',
  'apps/restaurant-system/pos/src/components/settings/PosSettingsView.tsx',
  'apps/restaurant-system/pos-admin/src/components/backup/BackupRestoreModule.tsx',
  'apps/restaurant-system/pos-admin/src/components/RestoreModal.tsx',
  'tests/financial_repository_commit.test.ts',
  'docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.cjs',
  'docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.tsx'
];
const result = {
  generatedAt: new Date().toISOString(), programmeComplete: false, deployed: false,
  provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  tests: [testRun('.jamanvaar/repair16-full-root.private.json', 'Full root regression'),
    testRun('.jamanvaar/repair16-affected.private.json', 'Earlier affected-file run; overlaps full root'),
    testRun('.jamanvaar/repair16-financial.private.json', 'Earlier financial/offline run; overlaps full root')],
  typeGates: [{ command: 'node node_modules/typescript/bin/tsc -b --pretty false', exitCode: 0 },
    { command: 'node node_modules/typescript/bin/tsc --noEmit -p cloud/api/tsconfig.json --pretty false', exitCode: 0 }],
  viteBuilds: [{ app: 'POS', processExitCode: 0, logSha256: hash('.jamanvaar/repair16-pos-build.log') },
    { app: 'Restaurant Admin', processExitCode: 0, logSha256: hash('.jamanvaar/repair16-admin-build.log') }],
  browser: { scope: browser.scope, sourceSha256: hash(browserPath), scenarios: browser.observations.map(row => ({ name: row.scenario, width: row.width, pageErrors: row.pageErrors })) },
  limitations: ['Other financial caller adoption remains', 'No provider payment sandbox acceptance', 'No physical printer/drawer acceptance',
    'No signed installed-device update or native power-loss acceptance', 'No sustained production capacity or restaurant pilot',
    'Encrypted-file verification does not install a restore or verify an off-device copy'],
  sources: sources.map(file => ({ file, sha256: hash(file) }))
};
fs.writeFileSync(path.join(__dirname, 'FINANCIAL_CHECKOUT_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ fullRoot: result.tests[0], browserScenarios: result.browser.scenarios.length, programmeComplete: false }));
