const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => { const b = bytes(file); return b.toString(b[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
const hash = file => crypto.createHash('sha256').update(bytes(file)).digest('hex');
function tests(file) { const r = JSON.parse(read(file)); return { file, sha256: hash(file), success: r.success, files: r.testResults.length,
  passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests,
  failures: r.testResults.flatMap(t => t.assertionResults.filter(a => a.status === 'failed').map(a => a.fullName)) }; }
const affected = tests('.jamanvaar/repair22-final-affected.private.json');
if (!affected.success || affected.failed || affected.skipped) throw Error('Affected regression requires review');
const types = ['.jamanvaar/repair22-final-root-types.log', '.jamanvaar/repair22-api-types.log'];
if (types.some(file => read(file).trim())) throw Error('Type diagnostics require review');
const builds = JSON.parse(read('.jamanvaar/repair22-final-build-results.json'));
if (builds.length !== 7 || builds.some(app => app.exitCode !== 0)) throw Error('Frontend bundles incomplete');
const kitchen = JSON.parse(read('.jamanvaar/kitchen-flow-browser.json')), checkout = JSON.parse(read('.jamanvaar/financial-checkout-browser.json'));
if (kitchen.observations.length !== 14 || checkout.observations.length !== 6 || [...kitchen.observations, ...checkout.observations].some(o => o.pageErrors || o.horizontalOverflow)) throw Error('Browser regression incomplete');
const result = { generatedAt: new Date().toISOString(), baseCommit: 'ccf17d93288ede1a1bdf7bb2c150adf84ec88e72',
  programmeComplete: false, pushed: false, deployed: false, frozenReleaseGate: false,
  provisionalScores: { security: 7, codeQuality: 7, saasReadiness: 6.5 }, affected,
  beforeRepair: tests('.jamanvaar/repair22-entity-before.private.json'),
  previousFullRoot: { ...tests('.jamanvaar/repair21-full-root.private.json'), scope: 'Preceding working-tree baseline, not a new full gate after entity changes' },
  types: types.map(file => ({ file, exitCode: 0, sha256: hash(file) })),
  builds: builds.map(app => ({ ...app, logSha256: hash(`.jamanvaar/repair22-final-${app.app}-build.log`) })),
  browser: { scenarios: 20, pageErrors: 0, scope: 'Regression of actual POS/Captain/Admin components and Kiosk admission services on real Chrome/SQLite OPFS. Entity fault cases use real Node SQLite separately.',
    kitchenSha256: hash('.jamanvaar/kitchen-flow-browser.json'), checkoutSha256: hash('.jamanvaar/financial-checkout-browser.json') },
  limitations: ['Data/cursor ordering does not serialize every entity consumer or prevent all domain conflicts',
    'Consumer callbacks must merge synchronously by stable identity; partial page preparation can require replay',
    'Legacy policy, guided other-app recovery, rejection diagnostics and Core/cloud revision bridging remain',
    'No provider, physical hardware, signed native upgrade, offsite/key-loss or representative sustained-load acceptance',
    'No new complete API database-suite run; overlapping test counts are not additive'],
  sources: ['packages/sync/src/entity_sync.ts', 'packages/sync/src/outbox.ts', 'packages/database/src/db.ts',
    'tests/entity_sync_durability.test.ts', 'tests/inbound_sync_durability.test.ts'].map(file => ({ file, sha256: hash(file) })) };
fs.writeFileSync(path.join(__dirname, 'ENTITY_SYNC_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ tests: { passed: affected.passed, failed: affected.failed, files: affected.files }, builds: builds.length, browserScenarios: 20 }));
