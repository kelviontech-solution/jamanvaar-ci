// Public aggregate evidence only. Raw fixture records and logs remain local.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => { const b = bytes(file); return b.toString(b[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
const testsFile = '.jamanvaar/repair19-final-financial.private.json';
const tests = JSON.parse(read(testsFile));
if (!tests.success || tests.numFailedTests || tests.numPendingTests) throw Error('Focused regression incomplete');
const typeFiles = ['.jamanvaar/repair19-final-types.log', '.jamanvaar/repair19-final-api-types.log'];
if (typeFiles.some(file => read(file).trim())) throw Error('Type diagnostics require review');
const builds = JSON.parse(read('.jamanvaar/repair19-verified-build-results.json'));
if (builds.length !== 7 || builds.some(app => app.exitCode !== 0)) throw Error('Production bundles incomplete');
const kitchen = JSON.parse(read('.jamanvaar/kitchen-flow-browser.json'));
const checkout = JSON.parse(read('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 14 || checkout.observations.length !== 4 ||
    [...kitchen.observations, ...checkout.observations].some(o => o.pageErrors || o.horizontalOverflow)) throw Error('Browser checks incomplete');
const files = [
  'packages/types/src/order_balance.ts', 'packages/types/src/index.ts', 'packages/database/src/payment_position.ts',
  'packages/utils/src/outstanding_bill.ts', 'packages/ui/src/ThermalReceiptView.tsx', 'packages/ui/src/OrderActivityView.tsx',
  'packages/business/src/saved_order_pricing.ts', 'packages/business/src/index.ts',
  'apps/restaurant-system/pos/src/store/posStore.ts', 'apps/restaurant-system/pos/src/components/cart/PosCart.tsx',
  'apps/restaurant-system/captain/src/store/captainStore.ts', 'tests/saved_order_pricing.test.ts',
  'tests/financial_repository_commit.test.ts', 'tests/audit_receipt_and_csv_regressions.test.tsx',
  'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.tsx',
  'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs'
];
const evidence = {
  generatedAt: new Date().toISOString(), baseCommit: 'ccf17d93288ede1a1bdf7bb2c150adf84ec88e72',
  programmeComplete: false, pushed: false, deployed: false,
  provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  focusedTests: { files: tests.testResults.length, passed: tests.numPassedTests, failed: tests.numFailedTests,
    skipped: tests.numPendingTests, success: tests.success, sha256: hash(testsFile) },
  types: typeFiles.map(file => ({ file, exitCode: 0, sha256: hash(file) })),
  productionBundles: builds.map(app => ({ ...app, logSha256: hash(`.jamanvaar/repair19-verified-${app.app}-build.log`) })),
  browser: { scope: 'Actual POS cart/Bills/payment and Admin/Captain components; Kiosk admission service fixture. Real Chrome and SQLite OPFS; fixture staff approvals and hardware.',
    scenarios: [...kitchen.observations.map(o => ({ screen: o.screen, mode: o.mode, width: o.width, pageErrors: o.pageErrors, horizontalOverflow: o.horizontalOverflow })),
      ...checkout.observations.map(o => ({ scenario: o.scenario, width: o.width, pageErrors: o.pageErrors }))],
    kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  reproducedBeforeRepair: ['POS trash re-added the cancelled dish', 'Accepted tax snapshot overwritten by cart recomputation after catalog tax change',
    'Cancelled local activity fallback showed an amount due', 'Recalled prices/percentage discount metadata used current catalog or accepted amount as percentage'],
  broadGate: { refreshed: false, previousLedger: 'ADMIN_RETURN_VERIFICATION.json', previousPassed: 2378, previousFailed: 1,
    explanation: 'The unchanged entitlement-file follow-up passed 8 tests in isolation. This does not make the previous broad run a clean gate.' },
  limitations: ['EC-01/W03 and the ten work packages remain incomplete', 'No all-report financial dictionary or historical missing-tax-snapshot migration',
    'Inbound sync/command admission, legacy policy, held/back routes and generic pending-operation recovery remain',
    'No provider/manual-return production acceptance, physical hardware, signed existing-installation upgrade, offsite/key-loss drill or representative sustained load',
    'No newly authenticated every-page audit or full API database-suite rerun'],
  sources: files.map(file => ({ file, sha256: hash(file) }))
};
fs.writeFileSync(path.join(__dirname, 'CANCELLATION_BALANCES_VERIFICATION.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ focusedTests: evidence.focusedTests, bundles: builds.length, browserScenarios: evidence.browser.scenarios.length }));
