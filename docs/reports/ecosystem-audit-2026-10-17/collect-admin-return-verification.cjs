// Publish aggregate verification only; raw logs and fixture records stay private.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => fs.readFileSync(path.join(root, file));
const text = file => { const b = bytes(file); return b.toString(b[0] === 0xff && b[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
function tests(file, scope) {
  const r = JSON.parse(text(file));
  return { scope, sha256: hash(file), files: r.testResults.length, passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests,
    success: r.success, failures: r.testResults.flatMap(f => f.assertionResults.filter(a => a.status === 'failed').map(a => ({
      file: path.relative(root, f.name).replaceAll('\\', '/'), test: a.fullName }))) };
}
const full = tests('.jamanvaar/repair18-full-root.private.json', 'Full root regression; two workers; explicit 30-second test/hook budgets');
const entitlementRetry = tests('.jamanvaar/repair18-entitlements.private.json', 'Unchanged entitlement file rerun alone; does not replace the failed broad gate');
if (!entitlementRetry.success || entitlementRetry.failed) throw Error('Entitlement follow-up failed');
if (full.failed && (full.failed !== 1 || full.failures[0]?.file !== 'tests/pos_admin_entitlements.test.ts')) throw Error('Unexpected full-suite failure requires triage');
const kitchen = JSON.parse(text('.jamanvaar/kitchen-flow-browser.json'));
const checkout = JSON.parse(text('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 12 || checkout.observations.length !== 4 ||
    [...kitchen.observations, ...checkout.observations].some(o => o.pageErrors !== 0)) throw Error('Incomplete browser checks');
const buildFile = '.jamanvaar/repair18-build-results.json', builds = JSON.parse(text(buildFile));
if (builds.length !== 4 || builds.some(app => app.exitCode !== 0)) throw Error('Production builds incomplete');
const typeFile = '.jamanvaar/repair18-final-types.log';
if (text(typeFile).trim()) throw Error('Root type gate has diagnostics');
const files = [
  'packages/database/src/db.ts', 'packages/database/src/durable/financial_request.ts',
  'apps/kiosk-system/kiosk-user/src/App.tsx', 'apps/kiosk-system/kiosk-user/src/kioskAdmission.ts',
  'apps/restaurant-system/captain/src/store/captainStore.ts',
  'apps/restaurant-system/captain/src/components/modals/CaptainCancelDishModal.tsx',
  'apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx',
  'apps/restaurant-system/pos/src/store/posStore.ts', 'apps/restaurant-system/pos/src/services/financialActions.ts',
  'apps/restaurant-system/pos/src/components/bills/PosBillsView.tsx', 'apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx',
  'apps/restaurant-system/pos/src/components/cart/PosCart.tsx',
  'apps/restaurant-system/pos-admin/src/components/billing/billingCommands.ts',
  'apps/restaurant-system/pos-admin/src/components/orders/OrdersModule.tsx',
  'apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx',
  'tests/admin_durable_billing.test.ts', 'tests/financial_repository_commit.test.ts', 'tests/kiosk_durable_admission.test.ts',
  'tests/captain_durable_submission.test.ts', 'tests/usability_remaining_gaps.test.tsx',
  'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs', 'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.tsx'
];
const result = { generatedAt: new Date().toISOString(), baseCommit: 'ccf17d93288ede1a1bdf7bb2c150adf84ec88e72',
  programmeComplete: false, pushed: false, deployed: false, provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  cleanFullRootGate: full.success && !full.failed,
  tests: [full, entitlementRetry, tests('.jamanvaar/repair18-final-financial.private.json', 'Earlier focused Admin/POS check; overlaps full run'),
    tests('.jamanvaar/repair17-bounded-financial.private.json', 'Preceding stage financial checks; overlaps full run'),
    tests('.jamanvaar/repair17-bounded-affected.private.json', 'Preceding timing-affected files; overlaps full run')],
  intermediateRuns: [tests('.jamanvaar/repair18-financial.private.json', 'New Admin fixture initially lacked browser session storage'),
    tests('.jamanvaar/repair17-final-root.private.json', 'Earlier failed broad refresh, retained separately')],
  rootTypeGate: { command: 'node node_modules/typescript/bin/tsc -b', exitCode: 0, logSha256: hash(typeFile) },
  productionBuilds: builds.map(app => ({ ...app, logSha256: hash(`.jamanvaar/repair18-${app.app}-build.log`) })),
  browser: { kitchenScope: 'Actual POS cart/Bills, Captain workspace and Admin order-detail components. Kiosk admission service fixture. Real SQLite OPFS; fixture identities/approvals and hardware.',
    checkoutScope: checkout.scope, scenarios: [...kitchen.observations.map(o => ({ screen: o.screen, mode: o.mode, width: o.width, pageErrors: o.pageErrors, horizontalOverflow: o.horizontalOverflow })),
      ...checkout.observations.map(o => ({ scenario: o.scenario, width: o.width, pageErrors: o.pageErrors }))],
    kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  limitations: ['EC-01/W03 and the ten work packages remain incomplete', 'POS running-dish removal, sync admission and legacy-policy/guided recovery remain',
    'The latest broad root gate contains an entitlement first-test timing failure; its unchanged isolated follow-up is separate evidence',
    'Cloud/manual return and local ledger are separate transactions; full reconciliation remains', 'No provider/manual-payment acceptance, signed native update or physical hardware acceptance',
    'No full activated Kiosk journey, authentication audit, offsite/key-loss recovery, sustained representative load or restaurant pilot',
    'No new full API database-suite run; backend source unchanged in this stage'],
  sources: files.map(file => ({ file, sha256: hash(file) })) };
fs.writeFileSync(path.join(__dirname, 'ADMIN_RETURN_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ root: full, builds: builds.length, browserScenarios: result.browser.scenarios.length, programmeComplete: false }));
