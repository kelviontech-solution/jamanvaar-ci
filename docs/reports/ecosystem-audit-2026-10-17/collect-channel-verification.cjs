// Aggregate only sanitized results; never publish raw logs, credentials or fixture customer data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = relative => fs.readFileSync(path.join(root, relative));
const read = relative => { const b = bytes(relative); return b.toString(b[0] === 0xff && b[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = relative => crypto.createHash('sha256').update(bytes(relative)).digest('hex');
function testRun(relative, scope) {
  const result = JSON.parse(read(relative));
  return { scope, reportSha256: hash(relative), files: result.testResults.length, passed: result.numPassedTests,
    failed: result.numFailedTests, skipped: result.numPendingTests, success: result.success,
    failures: result.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed')
      .map(test => ({ file: path.relative(root, file.name).replaceAll('\\', '/'), test: test.fullName }))) };
}
const kitchen = JSON.parse(read('.jamanvaar/kitchen-flow-browser.json'));
const checkout = JSON.parse(read('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 8 || checkout.observations.length !== 4 ||
    [...kitchen.observations, ...checkout.observations].some(row => row.pageErrors !== 0)) throw Error('Browser scenarios incomplete');
const builds = JSON.parse(read('.jamanvaar/repair17-build-results.json'));
if (builds.length !== 3 || builds.some(app => app.exitCode !== 0)) throw Error('Affected production builds incomplete');
const typeLog = '.jamanvaar/repair17-verified-types.log';
if (read(typeLog).trim()) throw Error('Root type gate contains diagnostics');
const sources = [
  'packages/database/src/db.ts', 'packages/database/src/index.ts', 'packages/database/src/durable/financial_request.ts',
  'apps/kiosk-system/kiosk-user/src/App.tsx', 'apps/kiosk-system/kiosk-user/src/kioskAdmission.ts',
  'apps/restaurant-system/captain/src/store/captainStore.ts',
  'apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx',
  'apps/restaurant-system/captain/src/components/modals/CaptainCancelDishModal.tsx',
  'apps/restaurant-system/pos/src/store/posStore.ts', 'apps/restaurant-system/pos/src/services/financialActions.ts',
  'apps/restaurant-system/pos/src/components/cart/PosCart.tsx',
  'apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx',
  'apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx',
  'tests/kiosk_durable_admission.test.ts', 'tests/captain_durable_submission.test.ts', 'tests/financial_repository_commit.test.ts',
  'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs',
  'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.tsx'
];
const finalFocused = testRun('.jamanvaar/repair17-bounded-financial.private.json', 'Final financial subset; one worker and explicit 30-second test/hook budgets');
if (!finalFocused.success || finalFocused.failed) throw Error('Final financial subset failed');
const result = { generatedAt: new Date().toISOString(), programmeComplete: false, deployed: false,
  provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  tests: [testRun('.jamanvaar/repair17-final-root.private.json', 'Full root refresh; source corrections overlapped the run; not a frozen release gate'), finalFocused],
  intermediateRuns: [testRun('.jamanvaar/repair17-root.private.json', 'Earlier full refresh, required-choice fixtures corrected subsequently'),
    testRun('.jamanvaar/repair17-financial.private.json', 'Earlier affected-file run, cancellation assertion corrected subsequently'),
    testRun('.jamanvaar/repair17-final-financial.private.json', 'Intermediate tax fixture correction was invalid and was reverted'),
    testRun('.jamanvaar/repair17-verified-financial.private.json', 'Concurrent-load failures retained separately; see final bounded subset')],
  typeGate: { command: 'node node_modules/typescript/bin/tsc -b', exitCode: 0, logSha256: hash(typeLog) },
  productionBuilds: builds.map(app => ({ ...app, logSha256: hash(`.jamanvaar/repair17-serial-${app.app}-build.log`) })),
  browser: { kitchenScope: kitchen.scope, checkoutScope: checkout.scope,
    scenarios: [...kitchen.observations.map(row => ({ screen: row.screen, mode: row.mode, width: row.width, pageErrors: row.pageErrors, horizontalOverflow: row.horizontalOverflow })),
      ...checkout.observations.map(row => ({ scenario: row.scenario, width: row.width, pageErrors: row.pageErrors }))],
    kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  limitations: ['Other financial callers and guided pending-operation recovery remain', 'Kiosk browser coverage is a service fixture, not the complete activated app',
    'Staff approval identities and hardware are fixtures', 'No provider/manual-return acceptance or distributed refund recovery drill',
    'No signed Windows/Android upgrade or native power-loss acceptance', 'No offsite/key-loss recovery, production-scale capacity or restaurant pilot',
    'No new full API database-suite run; backend source unchanged in this stage', 'Interrupted parallel production builds are not counted as completed builds'],
  sources: sources.map(file => ({ file, sha256: hash(file) })) };
fs.writeFileSync(path.join(__dirname, 'CHANNEL_DURABILITY_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ tests: result.tests.map(({ scope, files, passed, failed }) => ({ scope, files, passed, failed })),
  browserScenarios: result.browser.scenarios.length, builds: builds.length, programmeComplete: false }));
