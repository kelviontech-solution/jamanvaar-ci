// Actual merged Admin + customer Kiosk, isolated API/database; owns and cleans up only its QA processes.
process.env.JAMANVAAR_QA_REPORT_DIR = 'docs/reports/kiosk-management-2026-10-06';
const q = require('./browser-audit-lib.cjs'); const { spawn } = require('node:child_process');
q.ports.admin = 5286; q.ports.kiosk = 5284;
const children = []; const logStreams = [];
function start(script, args, cwd = q.root, env = {}) {
  const stream = q.fs.createWriteStream(q.path.join(q.root, 'logs', `kiosk-management-qa-server-${children.length}.log`)); logStreams.push(stream);
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream); child.stderr.pipe(stream); children.push(child); return child;
}
async function ready(port) {
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) }); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  } throw Error(`QA service did not start on ${port}`);
}
async function main() {
  for (const port of [q.state.port, 5286, 5284]) {
    try { await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(300) }); throw Error(`Port ${port} is already occupied; no process was stopped`); }
    catch (error) { if (error.message.includes('already occupied')) throw error; }
  }
  start(q.path.join(q.root, 'tooling/qa/browser-audit-server.cjs'), []);
  const vite = q.path.join(q.root, 'node_modules/vite/bin/vite.js');
  for (const [app, port] of [['apps/restaurant-system/pos-admin', 5286], ['apps/kiosk-system/kiosk-user', 5284]]) start(vite, ['--host', 'localhost', '--port', String(port), '--strictPort'], q.path.join(q.root, app), { VITE_CLOUD_API_BASE_URL: `http://localhost:${q.state.port}`, VITE_BRANCH_CORE_URL: '' });
  await Promise.all([ready(q.state.port), ready(5286), ready(5284)]);
  const challenge = await q.mustApi('POST', '/api/v1/platform-auth/login', { email: q.state.platformEmail, password: q.state.platformPassword });
  const mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')))[q.state.platformEmail];
  q.state.platformToken = (await q.mustApi('POST', '/api/v1/platform-auth/verify-otp', { otpToken: challenge.otpToken, otp: mail.otp })).accessToken; q.saveState();
  const fixture = q.state.mergedKioskFixture; if (!fixture) throw Error('Run browser-merged-admin-key.cjs first to provision a kiosk-only QA fixture');
  // Repeated QA runs keep their scoped fixtures/evidence; increase only this throw-away plan's capacity.
  await q.mustApi('PATCH', `/api/v1/plans/${fixture.planId}`, { maxDevices: 20 });
  await q.mustApi('PATCH', `/api/v1/subscriptions/${fixture.subscriptionId}/applications/KIOSK`, { deviceQuota: 20 });
  const stamp = fixture.restaurant.name.match(/(\d+)$/)[1];
  const admin = await q.open('admin', `merged-kiosk-${stamp}`);
  const kiosk = await q.open('kiosk', `kiosk-management-${Date.now()}`);
  const welcomeHeading = `My Restaurant QA Welcome ${Date.now()}`;
  const comboName = `QA Cafe Bundle ${Date.now()}`;
  let deviceId; let kioskToken; let adminToken; let propagationMs;
  await q.test(admin, 'Kiosk-only merged console exposes menu, customisations, receipts and appearance while POS billing stays gated', async () => {
    if (await admin.getByPlaceholder('Enter owner password').isVisible()) {
      await admin.getByPlaceholder('e.g. JM9876543210').fill(fixture.restaurant.restaurantCode);
      await admin.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword); await admin.getByRole('button', { name: 'Sign In to Admin', exact: true }).click();
    }
    for (const label of ['Menu & Categories', 'Customisations & Tax', 'Receipt & E-Bill', 'Kiosk Appearance & Content', 'Kiosk Combos & Deals']) await q.expect(admin.getByRole('button', { name: label, exact: true })).toBeVisible({ timeout: 30000 });
    await q.expect(admin.getByRole('button', { name: 'Billing / Invoices', exact: true })).toHaveCount(0);
    await q.expect(admin.getByText('App not enabled', { exact: true })).toHaveCount(0);
    adminToken = await admin.evaluate(() => localStorage.getItem('jamanvaar_cloud_device_token'));
    await admin.getByRole('button', { name: 'Menu & Categories', exact: true }).click(); await q.snap(admin, 'kiosk-only-menu-editor');
    return { mergedConsole: true, sharedMenuAndReceiptEditing: true, posBillingHidden: true };
  });
  await q.test(kiosk, 'Customer kiosk activates with its own KIOSK key and loads the restaurant through real auth', async () => {
    const key = await q.mustApi('POST', '/api/v1/activation-keys', { restaurantId: fixture.restaurant.id, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await kiosk.locator('#kiosk-restaurant-code').fill(fixture.restaurant.restaurantCode); await kiosk.locator('#kiosk-activation-key').fill(key.code);
    const activated = kiosk.waitForResponse(r => r.url().endsWith('/activation/redeem') && r.request().method() === 'POST');
    await kiosk.getByRole('button', { name: 'Activate Kiosk', exact: true }).click(); const response = await activated; q.expect([200, 201]).toContain(response.status());
    const result = await response.json(); deviceId = result.device.id; kioskToken = result.deviceToken;
    await q.expect(kiosk.getByRole('button', { name: /^(Start Order|Order From Our Cafe)$/ })).toBeVisible({ timeout: 30000 });
    return { activationStatus: response.status(), authenticated: true };
  });
  await q.test(admin, 'Publish welcome text, promotion, logo, accent and customer wording; kiosk receives changes without refresh', async () => {
    await admin.getByRole('button', { name: 'Kiosk Appearance & Content', exact: true }).click();
    await admin.getByLabel('Welcome heading', { exact: true }).fill(welcomeHeading);
    await admin.getByLabel('Start order button', { exact: true }).fill('Order From Our Cafe');
    await admin.getByLabel('Promotion banner text', { exact: true }).fill('Fresh cafe specials today');
    await admin.getByText('Show promotion banner', { exact: true }).locator('input').check();
    await admin.getByLabel('Kiosk accent color').fill('#225588');
    await admin.getByLabel('Kiosk logo URL').fill('/jamanvaar-logo-mark.png');
    await admin.getByLabel('Search kiosk wording').fill('choose your language');
    await admin.getByLabel('Kiosk wording screen_choose_your_language_8e2d06').fill('Choose Your Cafe Language');
    const before = performance.now(); await admin.getByRole('button', { name: 'Save & Publish Kiosk Settings', exact: true }).click();
    await q.expect(admin.getByRole('status').filter({ hasText: 'Kiosk settings published' }).first()).toBeVisible({ timeout: 25000 });
    await q.expect(kiosk.getByRole('heading', { name: welcomeHeading, exact: true })).toBeVisible({ timeout: 25000 }); propagationMs = Math.round(performance.now() - before);
    await q.expect(kiosk.getByText('Fresh cafe specials today', { exact: true })).toBeVisible();
    await kiosk.getByRole('button', { name: 'Order From Our Cafe', exact: true }).click();
    await q.expect(kiosk.getByRole('heading', { name: 'Choose Your Cafe Language', exact: true })).toBeVisible({ timeout: 10000 });
    await q.snap(kiosk, 'live-customer-wording'); await q.snap(admin, 'kiosk-content-editor');
    return { propagationMs, noKioskRefresh: true, languageScreenUpdated: true };
  });
  await q.test(admin, 'Receipt editing publishes footer, thank-you message and 58mm size to the same kiosk configuration', async () => {
    await admin.getByRole('button', { name: 'Receipt & E-Bill', exact: true }).click();
    const form = admin.locator('form'); await form.locator('input[type=text]').nth(0).fill('Thank you from our QA cafe'); await form.locator('input[type=text]').nth(1).fill('QA cafe receipt footer');
    await admin.getByRole('button', { name: /58mm/ }).click(); await admin.getByRole('button', { name: 'Save Receipt Settings', exact: true }).click();
    await q.expect(admin.getByRole('status').filter({ hasText: 'Receipt settings published' })).toBeVisible({ timeout: 25000 });
    const snapshot = await q.mustApi('GET', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', undefined, kioskToken);
    q.expect(snapshot.entities[0].payload.receipt).toMatchObject({ footerMessage: 'QA cafe receipt footer', thankYouMessage: 'Thank you from our QA cafe', paperSize: '58mm' });
    await kiosk.waitForFunction(async modulePath => (await import(modulePath)).db.receiptConfig.footerMessage === 'QA cafe receipt footer', '/@fs/' + q.path.join(q.root, 'packages/database/src/index.ts').replace(/\\/g, '/'), { timeout: 25000 });
    await q.snap(admin, 'receipt-editor'); return { footerPublished: true, kioskApplied: true, paperSize: '58mm' };
  });
  await q.test(kiosk, 'Refresh retains cloud-published appearance and wording', async () => {
    await kiosk.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await q.expect(kiosk.getByRole('heading', { name: welcomeHeading, exact: true })).toBeVisible({ timeout: 25000 });
    await q.expect(kiosk.getByRole('button', { name: 'Order From Our Cafe', exact: true })).toBeVisible();
    return { reloadPreservedConfiguration: true };
  });
  await q.test(admin, 'Create an editable combo in the kiosk-only console with a real priced bundle', async () => {
    const updatedAt = new Date().toISOString();
    for (const [type, externalId, payload] of [
      ['MENU_CATEGORY', 'qa-kiosk-management-category', { id: 'qa-kiosk-management-category', name: 'QA Cafe', isActive: true, sortOrder: 1, updatedAt }],
      ['MENU_ITEM', 'qa-kiosk-management-tea', { id: 'qa-kiosk-management-tea', name: 'QA Kiosk Management Tea', description: 'Isolated QA tea', categoryId: 'qa-kiosk-management-category', price: 100, isAvailable: true, dietaryType: 'VEG', salesChannels: ['KIOSK'], modifierGroupIds: [], updatedAt }]
    ]) {
      const result = await q.mustApi('POST', `/api/v1/entity-sync/${type}`, { events: [{ externalId, payload }] }, adminToken); q.expect(result.results[0].status).toBe('ok');
    }
    await admin.getByRole('button', { name: 'Kiosk Combos & Deals', exact: true }).click();
    await admin.getByLabel('Combo name', { exact: true }).fill(comboName); await admin.getByLabel('Combo description', { exact: true }).fill('Our QA cafe tea bundle');
    await admin.getByLabel('Combo price', { exact: true }).fill('90');
    await q.expect(admin.getByRole('group', { name: 'Main items', exact: true }).getByRole('checkbox', { name: /QA Kiosk Management Tea/ })).toBeVisible({ timeout: 25000 });
    await admin.getByRole('group', { name: 'Main items', exact: true }).getByRole('checkbox', { name: /QA Kiosk Management Tea/ }).check();
    await admin.getByRole('button', { name: 'Save Combo', exact: true }).click();
    await q.expect(admin.getByRole('status').filter({ hasText: 'Combo saved' }).first()).toBeVisible({ timeout: 25000 });
    const menu = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM?afterSeq=0', undefined, kioskToken);
    q.expect(menu.entities.find(item => item.payload.name === comboName)?.payload.price).toBe(90);
    await q.snap(admin, 'generic-combo-editor'); return { genericBundleCreated: true, authoritativeMenuPrice: 90 };
  });
  await q.test(kiosk, 'SIMULATED customer payment blocks remote logout; paid confirmation uses the edited receipt and orders remain synced', async () => {
    if (!q.state.simulatedGateway) throw Error('This check requires the isolated simulated payment gateway');
    const adminDeviceId = await admin.evaluate(() => localStorage.getItem('jamanvaar_cloud_device_id'));
    const owner = await q.mustApi('POST', '/api/v1/tenant-auth/login-owner', { restaurantId: fixture.restaurant.id, password: q.state.ownerPassword, deviceType: 'POS_ADMIN', deviceId: adminDeviceId, deviceToken: adminToken }, null);
    q.expect(owner.accessToken).toBeTruthy();
    await q.mustApi('POST', '/api/v1/tenant/payment-connection/request-platform-payments', {}, owner.accessToken);
    const connection = await q.mustApi('GET', `/api/v1/restaurants/${fixture.restaurant.id}/payment-connection`);
    if (connection.status !== 'ACTIVE') await q.mustApi('PATCH', `/api/v1/restaurants/${fixture.restaurant.id}/payment-connection/approve`, { password: q.state.platformPassword });
    await kiosk.getByRole('button', { name: 'Order From Our Cafe', exact: true }).click();
    await kiosk.getByRole('button', { name: /English/ }).click(); await kiosk.getByRole('button', { name: /Takeaway/i }).click();
    await q.expect(kiosk.getByRole('button', { name: `Add ${comboName} to cart`, exact: true })).toBeVisible({ timeout: 25000 });
    await kiosk.getByRole('button', { name: `Add ${comboName} to cart`, exact: true }).click();
    const [created] = await Promise.all([kiosk.waitForResponse(r => r.url().endsWith('/payments/orders') && r.request().method() === 'POST', { timeout: 30000 }), kiosk.getByRole('button', { name: 'Proceed to Payment', exact: true }).click()]);
    q.expect(created.status()).toBe(201); const payment = await created.json();
    const externalOrderId = created.request().postDataJSON().externalOrderId;
    const busyLogout = await q.mustApi('POST', `/api/v1/devices/me/fleet/${deviceId}/commands`, { commandType: 'FORCE_LOGOUT' }, adminToken);
    await q.expect(async () => {
      const history = await q.mustApi('GET', `/api/v1/devices/${deviceId}/commands`);
      q.expect(history.find(command => command.id === busyLogout.id)?.status).toBe('FAILED');
    }).toPass({ timeout: 25000 });
    q.expect((await q.api('GET', '/api/v1/orders/sync', undefined, kioskToken)).status).toBe(200);
    await q.expect(kiosk.getByRole('heading', { name: 'Activate This Kiosk', exact: true })).toHaveCount(0);
    const { paymentRow, webhook } = require('./browser-audit-kiosk-payment.cjs'); const row = await paymentRow(payment.paymentId);
    q.expect((await webhook(row, `qa-kiosk-management-${row.id}`)).status).toBe(200);
    await q.expect(kiosk.getByText('QA cafe receipt footer', { exact: true }).first()).toBeVisible({ timeout: 25000 });
    await q.snap(kiosk, 'paid-custom-receipt');
    await q.expect(async () => {
      const synced = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, kioskToken);
      const matching = synced.orders.filter(order => order.externalOrderId === externalOrderId);
      q.expect(matching).toHaveLength(1); q.expect(matching[0].paymentStatus).toBe('SUCCESS'); q.expect(matching[0].totalAmount).toBe(row.amount);
    }).toPass({ timeout: 25000 });
    await kiosk.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); await q.expect(kiosk.getByRole('heading', { name: welcomeHeading, exact: true })).toBeVisible({ timeout: 25000 });
    return { realFunds: false, gateway: 'SIMULATED', busyLogoutRejected: true, receiptRendered: true, oneSyncedPaidOrder: true, amountPaise: row.amount };
  });
  await q.test(admin, 'Offline kiosk receives queued logout after reconnect, acknowledges it, returns to activation and refuses the old credential', async () => {
    await kiosk.context().setOffline(true);
    await admin.getByRole('button', { name: 'Kiosk Terminals', exact: true }).click();
    await q.expect(admin.getByRole('button', { name: 'Log out kiosk', exact: true }).first()).toBeVisible({ timeout: 25000 });
    // Pick the exact terminal by its assigned name, with no dependency on fixture roster ordering.
    const fleet = await q.mustApi('GET', '/api/v1/devices/me/fleet', undefined, adminToken); const terminal = fleet.devices.find(d => d.id === deviceId);
    q.expect(terminal).toBeTruthy();
    const terminalCard = admin.getByTestId(`kiosk-terminal-${deviceId}`);
    await terminalCard.getByRole('button', { name: 'Log out kiosk', exact: true }).click();
    const [response] = await Promise.all([admin.waitForResponse(r => r.url().endsWith(`/fleet/${deviceId}/commands`) && r.request().method() === 'POST', { timeout: 30000 }), admin.getByRole('dialog').getByRole('button', { name: 'Log out kiosk', exact: true }).click()]);
    q.expect(response.status()).toBe(201); const command = await response.json();
    await q.expect(kiosk.getByRole('heading', { name: welcomeHeading, exact: true })).toBeVisible();
    q.expect((await q.api('GET', '/api/v1/orders/sync', undefined, kioskToken)).status).toBe(200);
    await kiosk.context().setOffline(false);
    await q.expect(kiosk.getByRole('heading', { name: 'Activate This Kiosk', exact: true })).toBeVisible({ timeout: 30000 });
    q.expect((await q.api('GET', '/api/v1/orders/sync', undefined, kioskToken)).status).toBe(401);
    const history = await q.mustApi('GET', `/api/v1/devices/${deviceId}/commands`); q.expect(history.find(c => c.id === command.id).status).toBe('SUCCEEDED');
    await q.snap(kiosk, 'remote-logout-activation'); return { commandAcknowledged: true, credentialRevoked: true, customerActivationRestored: true, oldCredentialStatus: 401 };
  });
}
main().catch(error => { console.error('Kiosk management browser QA:', error.message); process.exitCode = 1; }).finally(async () => {
  await q.close(); for (const child of children) child.kill(); for (const stream of logStreams) stream.end();
});
