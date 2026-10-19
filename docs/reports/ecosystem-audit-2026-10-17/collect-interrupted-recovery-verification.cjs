const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => { const b = bytes(file); return b.toString(b[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
function testResult(file) { const r = JSON.parse(read(file)); return { file, sha256: hash(file), files: r.testResults.length,
  passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests, success: r.success,
  failures: r.testResults.flatMap(t => t.assertionResults.filter(a => a.status === 'failed').map(a => a.fullName)) }; }
const focused = testResult('.jamanvaar/repair21-draft-followup.private.json');
if (!focused.success || focused.failed || focused.skipped) throw Error('Affected regression incomplete');
const types = ['.jamanvaar/repair21-draft-root-types.log', '.jamanvaar/repair21-post-template-api-types.log'];
if (types.some(file => read(file).trim())) throw Error('Type diagnostics require review');
const builds = JSON.parse(read('.jamanvaar/repair21-build-results.json'));
if (builds.length !== 7 || builds.some(app => app.exitCode !== 0)) throw Error('Production bundles incomplete');
const kitchen = JSON.parse(read('.jamanvaar/kitchen-flow-browser.json'));
const checkout = JSON.parse(read('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 14 || checkout.observations.length !== 6 ||
    [...kitchen.observations, ...checkout.observations].some(o => o.pageErrors || o.horizontalOverflow)) throw Error('Browser regression incomplete');
const fullFile = '.jamanvaar/repair21-full-root.private.json';
const full = fs.existsSync(path.join(root, fullFile)) ? testResult(fullFile) : null;
const sources = ['packages/database/src/db.ts', 'apps/restaurant-system/pos/src/services/interruptedOperationRecovery.ts',
  'apps/restaurant-system/pos/src/components/settings/InterruptedOperationRecoveryPanel.tsx',
  'apps/restaurant-system/pos/src/components/settings/PosSettingsView.tsx', 'tests/financial_repository_commit.test.ts',
  'docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.tsx',
  'docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.cjs', 'apps/qr-guest/src/App.tsx'];
const result = { generatedAt: new Date().toISOString(), baseCommit: 'ccf17d93288ede1a1bdf7bb2c150adf84ec88e72',
  programmeComplete: false, pushed: false, deployed: false, provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 },
  focused, fullRoot: full, cleanFullRootGate: !!full?.success && full.failed === 0,
  frozenReleaseGate: false,
  intermediate: [testResult('.jamanvaar/repair21-final-affected.private.json')],
  intermediateExplanation: 'Initial final-acknowledgement fault setup wrapped its existing mock recursively; fixed without removing the assertion. Actual already-acknowledged replay adoption was then repaired and covered.',
  types: types.map(file => ({ file, exitCode: 0, sha256: hash(file) })),
  workspaceContext: 'QR template schema/types/styles were edited concurrently during the broad run. A missing exhaustive guest-page color mapping was repaired. A later saved-draft recovery guard has its own affected regression, type/build/browser follow-up. The broad run is working-tree regression evidence, not a frozen release certificate.',
  productionBundles: builds.map(app => ({ ...app, scope: 'Recovery-stage frontend bundle; QR guest additionally refreshed after concurrent template mapping fix',
    logSha256: hash(app.app === 'pos' ? '.jamanvaar/repair21-draft-pos-build.log' : app.app === 'qr-guest' ? '.jamanvaar/repair21-final-qr-guest-build.log' : `.jamanvaar/repair21-${app.app}-build.log`) })),
  browser: { scope: 'Real Chrome/SQLite OPFS with actual POS recovery/payment/cart/Bills and Captain/Admin components, Kiosk admission service fixture, fixture identities and hardware.',
    scenarios: kitchen.observations.length + checkout.observations.length, pageErrors: 0, mobileOverflowAssertions: 'passed',
    recoveryScenarios: checkout.observations.filter(o => o.scenario === 'manager-reviewed-original-operation-after-refresh').map(o => ({ scenario: o.scenario, width: o.width, pageErrors: o.pageErrors, horizontalOverflow: o.horizontalOverflow, reviewHorizontalOverflow: o.reviewHorizontalOverflow })),
    kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  limits: ['POS manager recovery UI only; equivalent guided Captain/Kiosk/Admin recovery remains', 'Human decision about a separate cart remains necessary',
    'Local role checks do not make clients tamper-proof; protected backend authority remains separate',
    'Ten work packages remain incomplete; no provider/physical hardware/original signed upgrade/offsite key-loss or representative load acceptance',
    'No new full API database-suite run; prior broad root timing failures remain historical evidence'],
  sources: sources.map(file => ({ file, sha256: hash(file) })) };
fs.writeFileSync(path.join(__dirname, 'INTERRUPTED_OPERATION_RECOVERY_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ focused, fullRoot: full && { passed: full.passed, failed: full.failed, files: full.files }, builds: builds.length, browserScenarios: result.browser.scenarios }));
