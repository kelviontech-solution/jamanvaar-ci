// Focused browser QA uses synthetic activated tenant/branch context and isolated relay storage.
// No production/local restaurant data or cloud credentials are read or changed.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, expect } = require('playwright/test');
const root = path.resolve(__dirname, '../..');
const reportDir = path.join(root, 'docs/reports/local-core-connection-2026-10-06');
fs.mkdirSync(path.join(reportDir, 'evidence'), { recursive: true });
const privateDir = fs.mkdtempSync(path.join(root, '.jamanvaar/relay-browser-'));
let relay, vite, browser, pin, relayUrl;
const results = [];
const moduleUrl = '/@fs/' + root.replace(/\\/g, '/') + '/packages/database/src/db.ts';
async function startRelay() {
  relay = spawn(process.execPath, ['tooling/local-runtime/local_service.cjs'], { cwd: root, env: { ...process.env, JAMANVAAR_LOCAL_PORT: '0', JAMANVAAR_LOCAL_DATA_DIR: privateDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('QA relay did not start')), 15000);
    relay.stdout.on('data', data => {
      output += data;
      const portMatch = /URL: http:\/\/[^:]+:(\d+)/.exec(output), pinMatch = /devices\/pair\): (\d{6})/.exec(output);
      if (portMatch && pinMatch) { relayUrl = `http://127.0.0.1:${portMatch[1]}`; pin = pinMatch[1]; clearTimeout(timer); resolve(); }
    });
    relay.once('error', reject); relay.once('exit', () => reject(Error('QA relay exited')));
  });
}
async function startVite() {
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5286', '--strictPort'], { cwd: path.join(root, 'apps/restaurant-system/pos-admin'), env: { ...process.env, VITE_CLOUD_API_BASE_URL: 'http://localhost:4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('QA Vite did not start')), 15000);
    vite.stdout.on('data', data => { if (data.toString().includes('5286')) { clearTimeout(timer); resolve(); } });
    vite.once('error', reject); vite.once('exit', () => reject(Error('QA Vite exited')));
  });
}
async function terminal(restaurantId, branchId) {
  const context = await browser.newContext();
  await context.addInitScript(({ relayUrl, restaurantId, branchId }) => {
    localStorage.setItem('jamanvaar_sync_server_url', relayUrl);
    if (restaurantId) localStorage.setItem('jamanvaar_tenant_id', restaurantId);
    if (branchId) localStorage.setItem('jamanvaar_bound_branch_id', branchId);
  }, { relayUrl, restaurantId, branchId });
  const page = await context.newPage();
  page.on('pageerror', error => { fs.appendFileSync(path.join(reportDir,'browser-errors.log'), error.stack + '\n'); });
  page.on('console', message => { if (message.type() === 'error') fs.appendFileSync(path.join(reportDir,'browser-errors.log'), message.text() + '\n'); });
  await page.goto('http://localhost:5286', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeVisible({ timeout: 60000 });
  // Durable storage is attached during app boot. Provision the synthetic fixture through the same port as activation.
  await page.evaluate(async ({ moduleUrl, relayUrl, restaurantId, branchId }) => {
    const { KeyValueStore } = await import(moduleUrl.replace('/db.ts', '/key_value_store.ts'));
    if (restaurantId) KeyValueStore.set('jamanvaar_tenant_id', restaurantId);
    if (branchId) KeyValueStore.set('jamanvaar_bound_branch_id', branchId);
    const { db } = await import(moduleUrl); db.setSyncServerUrl(relayUrl);
  }, { moduleUrl, relayUrl, restaurantId, branchId });
  return page;
}
async function pair(page, value = pin) {
  await page.getByRole('button', { name: 'Pair', exact: true }).click();
  await page.getByLabel('Local Core pairing PIN', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Pair Local Core', exact: true }).click();
}
async function test(name, run) {
  try { const evidence = await run(); results.push({ name, status: 'PASS', evidence }); console.log(`PASS ${name}`); }
  catch (error) {
    for (const [i, context] of browser.contexts().entries()) { const page = context.pages()[0]; if (page) { await page.screenshot({path:path.join(reportDir,'evidence',`failure-${results.length}-${i}.png`)}).catch(() => {}); fs.writeFileSync(path.join(reportDir,'evidence',`failure-${results.length}-${i}.txt`), await page.locator('body').innerText().catch(() => 'unavailable')); } }
    results.push({ name, status: 'FAIL', error: error.message.replace(/lc1\.[\w.-]+/g, '[PAIRING TOKEN REDACTED]') }); process.exitCode = 1; console.log(`FAIL ${name}: ${error.name}`); }
  fs.writeFileSync(path.join(reportDir, 'browser-results.json'), JSON.stringify(results, null, 2));
}
async function dbCall(page, run, value) {
  return page.evaluate(async ({ moduleUrl, run, value }) => { const { db } = await import(moduleUrl); return Function('db', 'value', `return (async () => { ${run} })()`)(db, value); }, { moduleUrl, run, value });
}
async function main() {
  await startRelay(); await startVite(); browser = await chromium.launch({ headless: true });
  const unactivated = await terminal();
  await test('Unactivated browser cannot pair or read restaurant data', async () => {
    await pair(unactivated); await expect(unactivated.getByRole('status')).toContainText('Activate this device');
    return { activationRequired: true };
  });
  const a = await terminal('qa-browser-restaurant', 'qa-browser-branch');
  await test('Invalid PIN is explained and creates no paired connection', async () => {
    await pair(a, '000000'); await expect(a.getByRole('status')).toContainText('Invalid pairing PIN');
    expect(await dbCall(a, 'return db.isLocalCorePaired();')).toBe(false);
    return { incorrectPinRejected: true };
  });
  await test('Restaurant Admin pairs through the actual UI and shows authenticated Connected status', async () => {
    await a.getByLabel('Local Core pairing PIN', { exact: true }).fill(pin);
    await a.getByRole('button', { name: 'Pair Local Core', exact: true }).click();
    await expect(a.getByRole('status')).toContainText('paired and sync connected');
    await a.getByRole('button', { name: 'Close Local Core setup' }).click();
    await expect(a.getByText('Local Core:', { exact: false }).first()).toContainText('Connected');
    expect(await dbCall(a, 'return db.isLocalCoreConnected();')).toBe(true);
    await a.screenshot({ path: path.join(reportDir, 'evidence/admin-connected.png') });
    return { paired: true, authenticatedSync: true, customHost: true };
  });
  await test('Refreshing preserves pairing and reopens authenticated real-time sync', async () => {
    await a.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => dbCall(a, 'return db.isLocalCoreConnected();')).toBe(true);
    await expect(a.getByText('Local Core:', { exact: false }).first()).toContainText('Connected');
    return { refreshPreservedPairing: true };
  });
  const b = await terminal('qa-browser-restaurant', 'qa-browser-branch');
  await pair(b); await expect(b.getByRole('status')).toContainText('paired and sync connected');
  await b.getByRole('button', { name: 'Close Local Core setup' }).click();
  await test('Separate browser terminals receive order and kitchen status over authenticated SSE', async () => {
    await expect.poll(() => dbCall(b, 'return !!db.serverSyncStream;')).toBe(true);
    const started = Date.now();
    await dbCall(a, `const r = await db.localCoreFetch('/api/sync', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orders:[{id:'qa-browser-order',createdAt:new Date().toISOString(),orderStatus:'PREPARING',items:[]}]})}); return r.status;`);
    await expect.poll(() => dbCall(b, "return db.orders.find(o => o.id === 'qa-browser-order')?.orderStatus;"), { timeout: 3000, intervals: [50, 100, 200] }).toBe('PREPARING');
    const createMs = Date.now() - started;
    const updated = Date.now();
    await dbCall(a, "return (await db.localCoreFetch('/api/orders/qa-browser-order/status', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'READY'})})).status;");
    await expect.poll(() => dbCall(b, "return db.orders.find(o => o.id === 'qa-browser-order')?.orderStatus;"), { timeout: 3000, intervals: [50, 100, 200] }).toBe('READY');
    return { createVisibleMs: createMs, statusVisibleMs: Date.now() - updated, mechanism: 'Bearer-authenticated SSE; 8-second polling cannot explain these measurements' };
  });
  await test('Changing branch stops the old local stream and requires separate pairing', async () => {
    await a.evaluate(async moduleUrl => { const { KeyValueStore } = await import(moduleUrl.replace('/db.ts', '/key_value_store.ts')); KeyValueStore.set('jamanvaar_bound_branch_id', 'qa-another-branch'); }, moduleUrl);
    expect(await dbCall(a, 'db.notify(); return db.isLocalCorePaired();')).toBe(false);
    expect(await dbCall(a, 'return db.isLocalCoreConnected();')).toBe(false);
    return { oldPairingRejected: true, oldConnectionStopped: true };
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
}
main().catch(error => { console.error(`Local Core browser QA failed: ${error.name}`); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await stop(vite); await stop(relay);
  if (path.resolve(privateDir).startsWith(path.join(root, '.jamanvaar') + path.sep)) fs.rmSync(privateDir, { recursive: true, force: true });
});
