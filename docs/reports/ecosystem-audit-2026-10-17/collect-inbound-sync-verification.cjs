const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => { const b = bytes(file); return b.toString(b[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
function tests(file) {
  const r = JSON.parse(read(file));
  return { file, sha256: hash(file), success: r.success, files: r.testResults.length,
    passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests,
    failures: r.testResults.flatMap(t => t.assertionResults.filter(a => a.status === 'failed').map(a => a.fullName)) };
}
const final = tests('.jamanvaar/repair20-verified-sync-financial.private.json');
if (!final.success || final.failed || final.skipped || final.files !== 17) throw Error('Affected regression incomplete');
const types = ['.jamanvaar/repair20-header-root-types.log', '.jamanvaar/repair20-api-types.log'];
if (types.some(file => read(file).trim())) throw Error('Type diagnostics require review');
const builds = JSON.parse(read('.jamanvaar/repair20-verified-build-results.json'));
if (builds.length !== 7 || builds.some(app => app.exitCode !== 0)) throw Error('Production bundles incomplete');
const kitchen = JSON.parse(read('.jamanvaar/kitchen-flow-browser.json'));
const checkout = JSON.parse(read('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 14 || checkout.observations.length !== 4 ||
    [...kitchen.observations, ...checkout.observations].some(o => o.pageErrors || o.horizontalOverflow)) throw Error('Browser regression incomplete');
const result = {
  generatedAt: new Date().toISOString(), baseCommit: 'ccf17d93288ede1a1bdf7bb2c150adf84ec88e72',
  programmeComplete: false, pushed: false, deployed: false,
  provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  priorStage: { file: 'CANCELLATION_BALANCES_VERIFICATION.json', sha256: hash('docs/reports/ecosystem-audit-2026-10-17/CANCELLATION_BALANCES_VERIFICATION.json') },
  tests: final,
  intermediate: [tests('.jamanvaar/repair20-inbound-before.private.json'), tests('.jamanvaar/repair20-legacy-quantity-before.private.json'),
    tests('.jamanvaar/repair20-final-sync-financial.private.json')],
  intermediateExplanation: 'Four initial admission failures and a separate future-clock quantity overwrite were reproduced before source repair. The first wider follow-up also expected a startup-normalized SYNCING status to remain unchanged; the fixture now models a live push after transport configuration without dropping data assertions.',
  types: types.map(file => ({ file, exitCode: 0, sha256: hash(file) })),
  productionBundles: builds.map(app => ({ ...app, logSha256: hash(app.app === 'pos' ? '.jamanvaar/repair20-header-pos-build.log' : `.jamanvaar/repair20-verified-${app.app}-build.log`) })),
  browser: { scenarios: kitchen.observations.length + checkout.observations.length,
    scope: 'Regression of actual POS/Captain/Admin components, Kiosk admission service and payment/protected-recovery fixtures on Chrome/SQLite OPFS. New inbound fault cases use real Node SQLite; these browser checks do not directly exercise the inbound fault injector.',
    pageErrors: 0, mobileOverflowAssertions: 'passed', kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  remaining: ['The cursor barrier is not serializable cross-device command admission or complete replay recovery',
    'Legacy memory/synchronous stores retain compatibility and are not certified as SQLite durable',
    'Generic pending-operation recovery, operator-facing sync preparation diagnostics and original signing/provider/hardware acceptance remain',
    'The previous full-root gate had 2378 passes and one timing failure; no clean new full-root or full API database gate is asserted',
    'Ten work packages remain incomplete; source, deployment, installed recovery, load and pilot gates are distinct'],
  sources: ['packages/database/src/db.ts', 'packages/sync/src/outbox.ts', 'tests/inbound_sync_durability.test.ts',
    'apps/restaurant-system/pos/src/components/cart/PosCart.tsx',
    'docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs'].map(file => ({ file, sha256: hash(file) }))
};
fs.writeFileSync(path.join(__dirname, 'INBOUND_SYNC_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ tests: { passed: final.passed, failed: final.failed, files: final.files }, bundles: builds.length, browser: result.browser.scenarios }));
