// Summarize retained evidence without deleting unsuccessful attempts or reading credentials.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'docs/reports/browser-fixes-2026-10-06');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n');
const csv = rows => rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const builds = read('production-builds-final.json');
const kiosk = builds.find(row => row.workspace === '@jamanvaar/kiosk-user');
if (kiosk.exitCode !== 0) {
  const bytes = fs.readFileSync(path.join(dir, 'kiosk-user-build-final.log'));
  const log = bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8');
  if (!log.includes('built in 5.39s')) throw Error('Successful kiosk recheck evidence missing');
  kiosk.initialExitCode = kiosk.exitCode;
  kiosk.exitCode = 0;
  kiosk.recheckEvidence = 'kiosk-user-build-final.log';
  kiosk.note = 'Initial undefined setter compile error corrected; subsequent build exited 0.';
  write('production-builds-final.json', builds);
}
const attempts = fs.readFileSync(path.join(dir, 'test-matrix.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const latest = new Map();
for (const row of attempts) latest.set(`${row.app}|${row.feature}`, row);
const reviewed = [...latest.values()];
if (reviewed.some(row => row.result !== 'PASS')) throw Error('An unresolved latest browser scenario remains');
fs.writeFileSync(path.join(dir, 'TEST_MATRIX.csv'), csv([
  ['Latest attempt', 'App', 'Scenario', 'Result', 'Duration ms', 'Evidence'],
  ...reviewed.map(row => [row.id, row.app, row.feature, row.result, row.ms, JSON.stringify(row.evidence)])
]));
const dispositions = {
  'pos-1791263039658': ['HARNESS_CORRECTED', 'Cold/HMR module instance did not share the displayed cart; test now reads the mounted app store.'],
  'pos-1791263041033': ['HARNESS_CORRECTED', 'Same initial cart-store instance mismatch; subsequent real UI flow passed.'],
  'kiosk-1791263064473': ['APPLICATION_FIXED', 'B003: paid DRAFT-to-CONFIRMED order required KOT reconciliation even with unchanged lines.'],
  'kds-1791263086284': ['DEPENDENCY_FIXED', 'Could not ready the missing B003 ticket; paid kitchen flow passed after reconciliation fix.'],
  'pos-1791263576070': ['APPLICATION_FIXED', 'B004 follow-up: financial completion must not silently mark submitted kitchen work served.'],
  'admin-1791264250899': ['HARNESS_CORRECTED', 'Wrong table-form placeholder; corrected selector and owner table creation passed.'],
  'captain-1791264263253': ['DEPENDENCY_RECHECKED', 'Table-creation prerequisite failed in this attempt; clean table flow subsequently passed.'],
  'super-1791264307888': ['HARNESS_CORRECTED', 'Ambiguous Save button; selector now scoped to commission editor.'],
  'captain-1791264673163': ['HARNESS_CORRECTED', 'Table-card ancestor selector corrected; actual order creation subsequently passed.'],
  'kds-1791264901625': ['HARNESS_CORRECTED', 'Captain workspace overlay intercepted a floor filter; close modal and use visible bottom navigation.'],
  'super-1791264929838': ['HARNESS_CORRECTED', 'Test filled commission before asynchronous configuration loaded; wait for loaded value and save acknowledgement.'],
  'kds-1791265744227': ['TIMEOUT_RECHECKED', 'Cloud DRAFT missing within 15 seconds during concurrent builds; retained as timeout, latest isolated unpaid-admission test passed.'],
  'kds-1791266004997': ['HARNESS_CORRECTED', 'Food Ready floor filter selected instead of bottom navigation; selector corrected.'],
  'kds-1791266138707': ['APPLICATION_FIXED', 'B013: POS current-day view hid imported Captain order with another terminal business-day ID.'],
  'qr-1791266984336': ['HARNESS_CORRECTED', 'Wrong response-path predicate timed out despite successful order; corrected predicate and duplicate/refresh checks passed.']
};
fs.writeFileSync(path.join(dir, 'ATTEMPT_DISPOSITIONS.csv'), csv([
  ['Attempt', 'App', 'Scenario', 'Raw result', 'Disposition', 'Explanation', 'Latest scenario result', 'Screenshot'],
  ...attempts.map(row => {
    if (row.result !== 'PASS' && !dispositions[row.id]) throw Error(`Unreviewed failed attempt ${row.id}`);
    const disposition = dispositions[row.id] ?? ['PASS', 'Successful observed attempt; latest scenario evidence retained separately.'];
    return [row.id, row.app, row.feature, row.result, ...disposition, latest.get(`${row.app}|${row.feature}`).result, row.screenshot];
  })
]));
const runtime = read('runtime-complete-tests.json');
const apiPrimary = read('api-complete-tests.json');
const apiExtended = read('api-extended-tests-final.json');
const apiFiles = new Map();
for (const suite of [apiPrimary, apiExtended]) for (const file of suite.testResults) apiFiles.set(file.name, file);
const apiBuild = read('api-build-final.json');
const typechecks = read('typecheck-final.json');
const failures = [runtime, apiPrimary, apiExtended].map(suite => suite.numFailedTests);
if (failures.some(Boolean) || builds.some(row => row.exitCode !== 0) || apiBuild.exitCode !== 0 || typechecks.some(row => row.exitCode !== 0)) throw Error('A final verification gate has failed');
const summary = {
  date: '2026-10-06', environment: 'Isolated local PostgreSQL, Playwright Chromium, simulated payment provider; production not deployed',
  runtime: { tests: runtime.numTotalTests, passed: runtime.numPassedTests, files: runtime.testResults.length, evidence: 'runtime-complete-tests.json' },
  backendPrimary: { tests: apiPrimary.numTotalTests, passed: apiPrimary.numPassedTests, files: apiPrimary.testResults.length, evidence: 'api-complete-tests.json' },
  backendExtended: { tests: apiExtended.numTotalTests, passed: apiExtended.numPassedTests, files: apiExtended.testResults.length, evidence: 'api-extended-tests-final.json' },
  backendDeduplicated: {
    files: apiFiles.size,
    tests: [...apiFiles.values()].reduce((sum, file) => sum + file.assertionResults.length, 0),
    passed: [...apiFiles.values()].reduce((sum, file) => sum + file.assertionResults.filter(test => test.status === 'passed').length, 0),
    note: 'Latest results by suite file; overlapping entity-sync suite counted once. Targeted backend suites, not the entire API test catalogue.'
  },
  browser: { attempts: attempts.length, rawFailedAttempts: attempts.filter(row => row.result !== 'PASS').length, distinctScenarios: reviewed.length, latestPassed: reviewed.length, reviewedMatrix: 'TEST_MATRIX.csv', history: 'ATTEMPT_DISPOSITIONS.csv' },
  typechecks, apiBuild: { command: apiBuild.command, exitCode: apiBuild.exitCode }, frontendBuilds: builds,
  adminMainJavascript: { beforeGzipKB: 3293.35, afterGzipKB: 403.01, reductionPercent: +(100 * (1 - 403.01 / 3293.35)).toFixed(2), caveat: 'External image requests and other chunks excluded; not a measured WAN speed improvement.' },
  productionCertification: false
};
write('verification-summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
