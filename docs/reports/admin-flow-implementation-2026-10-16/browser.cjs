const q = require('../qr-admin-audit-2026-10-14/qa.cjs'),
  { chromium } = require('playwright/test');
const dir = q.path.join(__dirname, 'evidence');
q.fs.mkdirSync(dir, { recursive: true });
const stamp = Date.now(),
  results = [],
  errors = [];
let browser, ctx, p, superPage, f, planId, bid2;
const extraFixtures = [];
const expect = q.expect.configure({ timeout: 30000 });
async function api(method, url, data, token = q.state.platformToken) {
  const res = await fetch((process.env.JAMANVAAR_QA_API_BASE || 'http://127.0.0.1:4012') + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const body = await res.json();
  if (res.status >= 400) throw Error(q.scrub(url + ' ' + res.status + ' ' + JSON.stringify(body)).slice(0, 700));
  return body;
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, passed: false, error: q.scrub(e.message).slice(0, 900) });
    await p?.screenshot({ path: q.path.join(dir, 'failure.png') }).catch(() => {});
    q.fs.writeFileSync(q.path.join(dir, 'browser-errors.json'), q.scrub(JSON.stringify({ pageErrors: errors }, null, 2)));
    throw e;
  }
}
async function snap(page, name) {
  await page.screenshot({ path: q.path.join(dir, name + '.png'), fullPage: false, mask: [page.locator('.activation-code-display')] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
}
async function main() {
  if (!new URL(q.state.databaseUrl).pathname.includes('test')) throw Error('Isolated QA database required');
  const login = await api('POST', '/api/v1/platform-auth/login', { email: q.state.platformEmail, password: q.state.platformPassword }, null),
    mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')));
  q.state.platformToken = (
    await api('POST', '/api/v1/platform-auth/verify-otp', { otpToken: login.otpToken, otp: mail[q.state.platformEmail].otp }, null)
  ).accessToken;
  f = await api('POST', '/api/v1/restaurants', {
    name: 'Garden House Flow QA',
    mobile: '9' + String(stamp).slice(-9),
    ownerName: 'QA Flow Owner',
    ownerEmail: 'flow-' + stamp + '@example.invalid',
    ownerPassword: q.state.ownerPassword,
    skipInviteEmail: true
  });
  planId = (
    await api('POST', '/api/v1/plans', {
      tier: 'PRO',
      name: 'QA Admin Flow ' + stamp,
      priceMonthly: 10000,
      maxBranches: 5,
      maxDevices: 10,
      maxUsers: 10,
      entitlements: { posTerminal: true, restaurantAdmin: true, selfOrderKiosk: true }
    })
  ).id;
  await api('POST', '/api/v1/subscriptions', {
    restaurantId: f.restaurant.id,
    planId,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    applications: ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']
  });
  bid2 = (await api('POST', '/api/v1/branches', { restaurantId: f.restaurant.id, name: 'Takeaway branch', code: 'TAKEAWAY' })).id;
  const code = (
    await api('POST', '/api/v1/activation-keys', {
      restaurantId: f.restaurant.id,
      branchId: f.branch.id,
      allowedDeviceType: 'POS_ADMIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    })
  ).code;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:5316/pos-admin/');
  await p.getByPlaceholder('e.g. JM9876543210').fill(f.restaurant.restaurantCode);
  await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
  await p.locator('summary').filter({ hasText: 'Connecting a new device?' }).click();
  await p.getByLabel('Admin activation key (optional)').fill(code);
  await p.getByRole('button', { name: 'Sign In', exact: true }).click();
  await p.waitForURL(/restaurant-admin/);
  await check('One owner launch summary separates product stages and supports takeaway/paperless setup', async () => {
    const workspace = p.getByLabel('Branch workspace', { exact: true });
    await expect(workspace).toBeVisible();
    if ((await workspace.inputValue()) !== f.branch.id) await workspace.selectOption(f.branch.id);
    await expect(p.getByRole('region', { name: 'Launch and handover' })).toBeVisible();
    await p.getByText('How does this branch serve customers?', { exact: true }).click();
    await p.getByLabel('Table service (turn off for takeaway only)', { exact: true }).uncheck();
    await expect(p.getByLabel('Printed receipts (turn off for paperless service)', { exact: true })).toBeEnabled();
    await p.getByLabel('Printed receipts (turn off for paperless service)', { exact: true }).uncheck();
    await expect(p.getByRole('button', { name: /Set up tables for table service/ })).toHaveCount(0);
    await p.getByText('Purchased → enabled for branch → configured → verified', { exact: true }).click();
    await expect(p.getByRole('columnheader', { name: 'Purchased', exact: true })).toBeVisible();
    await p.getByRole('button',{name:'What customers can order',exact:true}).click();await p.getByLabel('Preview channel',{exact:true}).selectOption('POS');await expect(p.getByText(/No orderable published dishes/)).toBeVisible();await p.getByRole('button',{name:'Hide channel menu preview',exact:true}).click();
    await snap(p, 'owner-launch-desktop');
  });
  await check('Welcome editor offers Keep editing, Save draft and Restore without publishing', async () => {
    await p.getByRole('button', { name: 'Customer experience & private preview', exact: true }).click();
    await expect(p.getByTestId('kiosk-welcome-manager')).toBeVisible();
    const field = p.getByLabel('Welcome Welcome greeting', { exact: true });
    await field.fill('A special welcome');
    await p.getByRole('button', { name: 'Menu & checkout', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Keep your unfinished changes?', exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(field).toHaveValue('A special welcome');
    await p.getByRole('button', { name: 'Menu & checkout', exact: true }).click();
    await p.getByRole('button', { name: 'Save draft & leave', exact: true }).click();
    await expect(p.getByTestId('kiosk-content-panel')).toBeVisible();
    await p.getByRole('button', { name: 'Welcome & language', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Restore your saved draft?', exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Restore preview', exact: true }).click();
    await expect(p.getByLabel('Welcome Welcome greeting', { exact: true })).toHaveValue('A special welcome');
    await p.getByRole('button', { name: 'Menu & checkout', exact: true }).click();
    await p.getByRole('button', { name: 'Discard changes', exact: true }).click();
  });
  await check('Appearance edits are protected and receipts are accessible inside Customer experience', async () => {
    await p.getByLabel('Kiosk logo URL', { exact: true }).fill('https://example.invalid/preview-logo.png');
    await p.getByRole('button', { name: 'Receipt', exact: true }).click();
    await p.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Receipt & E-Bill System', exact: true })).toBeVisible();
  });
  await check('Channel preview shows the actual empty publication state', async () => {
    await p.getByRole('button', { name: 'What customers can order', exact: true }).click();
    await expect(p.getByText(/No orderable published dishes/)).toBeVisible();
    await p.getByLabel('Preview channel', { exact: true }).selectOption('QR');
    await expect(p.getByText(/No orderable published dishes/)).toBeVisible();
    await snap(p, 'channel-menu-empty');
  });
  const session = await p.evaluate(() => ({ token: localStorage.getItem('jamanvaar_cloud_device_token') }));
  const category = { id: 'flow-cat', name: 'Chef specials', isActive: true, sortOrder: 0 },
    dish = {
      id: 'flow-dish',
      name: 'Paneer bowl',
      categoryId: 'flow-cat',
      price: 120,
      isAvailable: true,
      isKioskEnabled: true,
      isQrOrderingEnabled: true,
      salesChannels: ['POS', 'KIOSK', 'QR'],
      sortOrder: 0
    };
  for (const [type, payload] of [
    ['MENU_CATEGORY', category],
    ['MENU_ITEM', dish]
  ])
    await api(
      'POST',
      '/api/v1/entity-sync/' + type,
      { events: [{ eventId: require('crypto').randomUUID(), externalId: payload.id, operation: 'UPSERT', payload, occurredAt: new Date().toISOString() }] },
      session.token
    );
  await api('POST', '/api/v1/menu/publish', { note: 'QA private journey' }, session.token);
  await check('Private journey preserves cart on cancellation and simulates receipt keyboard without real writes', async () => {
    await p.getByRole('button', { name: 'Private journey preview', exact: true }).click();
    await p.getByRole('button', { name: 'Start Order', exact: true }).click();
    await p
      .getByRole('button', { name: /English/ })
      .first()
      .click();
    await p.getByRole('button', { name: 'Add Paneer bowl', exact: true }).click();
    await p.getByRole('button', { name: /Review cart/ }).click();
    await p.getByRole('button', { name: 'Continue to simulated payment', exact: true }).click();
    await p.getByRole('button', { name: 'Simulate online payment cancellation', exact: true }).click();
    await expect(p.getByText(/Practice payment cancelled. Cart preserved/)).toBeVisible();
    await p.getByRole('button', { name: 'Simulate successful online payment', exact: true }).click();
    await p.getByLabel('Practice receipt contact', { exact: true }).fill('guest@example.invalid');
    await expect(p.getByText('Practice receipt keyboard', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    await p.getByRole('button', { name: 'Simulate send receipt', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Practice complete', exact: true })).toBeVisible();
    await snap(p, 'private-rehearsal');
  });
  await check('Customer workspace fits a mobile viewport', async () => {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForFunction(() => {
      const aside = document.querySelector('aside');
      return !aside || aside.getBoundingClientRect().right <= 1;
    });
    await snap(p, 'customer-experience-mobile');
    await p.setViewportSize({ width: 1440, height: 1000 });
  });
  superPage = await ctx.newPage();
  superPage.setDefaultTimeout(45000);
  superPage.on('pageerror', (e) => errors.push(e.message));
  await superPage.goto('http://localhost:5380/login');
  await superPage.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(q.state.platformEmail);
  await superPage.getByPlaceholder('Enter your password').fill(q.state.platformPassword);
  await superPage.locator('button[type=submit]').click();
  await superPage.getByPlaceholder('123456').waitFor();
  const otp = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')));
  await superPage.getByPlaceholder('123456').fill(otp[q.state.platformEmail].otp);
  await superPage.locator('button[type=submit]').click();
  await expect(superPage).not.toHaveURL(/\/login/);
  await check('Super Admin has guided branch setup, readiness and owner handover', async () => {
    await superPage.goto('http://localhost:5380/restaurants/' + f.restaurant.id);
    await expect(superPage.getByRole('region', { name: 'Restaurant setup and handover' })).toBeVisible();
    await superPage.getByRole('button', { name: '5. Readiness checks', exact: true }).click();
    await expect(superPage.getByRole('columnheader', { name: 'Enabled for branch', exact: true })).toBeVisible();
    await superPage.getByLabel('Setup branch', { exact: true }).selectOption(bid2);
    await expect(superPage.getByText('Takeaway branch', { exact: true }).last()).toBeVisible();
    await snap(superPage, 'super-guided-setup');
  });
  await check('Super Admin issues a scoped kiosk key directly from the restaurant request', async () => {
    await p.getByRole('button', { name: 'Kiosk Terminals', exact: true }).click();
    await p.getByRole('button', { name: 'Request activation key', exact: true }).click();
    await p.getByLabel('Terminal name', { exact: true }).fill('Private journey kiosk');
    const sent = p.waitForResponse((r) => r.url().endsWith('/tenant/support-tickets') && r.request().method() === 'POST' && r.ok());
    await p.getByRole('button', { name: 'Send key request', exact: true }).click();
    const ticket = await (await sent).json();
    await superPage.goto('http://localhost:5380/tickets?open=' + ticket.id);
    await superPage.getByLabel('I reviewed the requested branch and terminal name.', { exact: true }).check();
    await superPage.getByRole('button', { name: 'Issue kiosk key from this request', exact: true }).click();
    await expect(superPage.getByText('Key issued. Share securely with the owner.', { exact: true })).toBeVisible();
    await snap(superPage, 'support-key-issuance');
  });
  await check('Launch handover shortcut opens the exact Operations task', async () => {
    await p.getByRole('button', { name: 'Today', exact: true }).click();
    await p.getByRole('button', { name: 'Owner / manager handover', exact: true }).click();
    await expect(p).toHaveURL(/\/restaurant-admin\/operations\?opsTask=handover/);
    await expect(p.getByRole('heading', { name: 'Prepare a branch handover', exact: true })).toBeVisible();
  });
  await check('Branch license editing retains the effective saved allocation', async () => {
    const view = await api('GET', `/api/v1/branches/${bid2}/licenses`),
      feature = view.features.find((f) => f.appCode === 'KIOSK')?.legacyEntitlementKey;
    const input = {
      appCode: 'KIOSK',
      enabled: false,
      deviceQuota: 3,
      disabledFeatures: feature ? [feature] : [],
      effectiveAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 172800000).toISOString(),
      expectedRevision: view.apps.find((a) => a.appCode === 'KIOSK').revision
    };
    const preview = await api('POST', `/api/v1/branches/${bid2}/licenses/preview`, input);
    await api('POST', `/api/v1/branches/${bid2}/licenses`, { ...input, previewHash: preview.previewHash, acknowledgeImpact: true });
    await superPage.goto('http://localhost:5380/branches/' + bid2);
    await superPage.getByRole('button', { name: 'Branch Licensing', exact: true }).click();
    await superPage.getByLabel('Product', { exact: true }).selectOption('KIOSK');
    await expect(superPage.locator('input[name="enabled"]')).not.toBeChecked();
    await expect(superPage.locator('input[name="quota"]')).toHaveValue('3');
    await expect(superPage.locator('input[name="expires"]')).not.toHaveValue('');
    if (feature) {
      await superPage.getByText('Disable optional features in this branch', { exact: true }).click();
      await expect(superPage.locator('input[name="feature"]').filter({ visible: true }).first()).toBeVisible();
      expect(await superPage.locator('input[name="feature"]:checked').count()).toBe(1);
    }
    await snap(superPage, 'saved-branch-allocation');
  });
  await check('Activation quota preview reloads when the selected branch changes', async () => {
    await superPage.goto('http://localhost:5380/restaurants/' + f.restaurant.id);
    await superPage.getByRole('button', { name: 'Generate Key', exact: true }).click();
    await superPage.locator('form select').first().selectOption('KIOSK');
    await superPage.getByLabel('Branch', { exact: true }).selectOption(bid2);
    await expect(superPage.getByRole('button', { name: 'Generate key', exact: true })).toBeDisabled();
    await expect(superPage.getByText(/Product unavailable: branch product disabled/)).toBeVisible();
    await superPage.getByLabel('Branch', { exact: true }).selectOption(f.branch.id);
    await expect(superPage.getByRole('button', { name: 'Generate key', exact: true })).toBeEnabled();
    await expect(superPage.getByText(/Capacity available. Capacity is checked again/)).toBeVisible();
    await snap(superPage, 'branch-aware-quota');
  });
  await check('Kiosk-only owner starts with launch steps and a smaller authorized console', async () => {
    const restaurant = await api('POST', '/api/v1/restaurants', {
      name: 'Kiosk-only Flow QA',
      mobile: '9' + String(Date.now()).slice(-9),
      ownerName: 'QA kiosk owner',
      ownerEmail: 'kiosk-flow-' + stamp + '@example.invalid',
      ownerPassword: q.state.ownerPassword,
      skipInviteEmail: true
    });
    extraFixtures.push(restaurant.restaurant.id);
    const plan = await api('POST', '/api/v1/plans', {
      tier: 'PRO',
      productFamily: 'KIOSK',
      name: 'Kiosk-only QA ' + stamp,
      priceMonthly: 10000,
      maxBranches: 2,
      maxDevices: 5,
      maxUsers: 5,
      entitlements: { selfOrderKiosk: true }
    });
    await api('POST', '/api/v1/subscriptions', {
      restaurantId: restaurant.restaurant.id,
      planId: plan.id,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      applications: ['KIOSK', 'KIOSK_ADMIN']
    });
    const key = await api('POST', '/api/v1/activation-keys', {
      restaurantId: restaurant.restaurant.id,
      branchId: restaurant.branch.id,
      allowedDeviceType: 'POS_ADMIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const isolated = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
      page = await isolated.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:5316/pos-admin/');
    await page.getByPlaceholder('e.g. JM9876543210').fill(restaurant.restaurant.restaurantCode);
    await page.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    await page.locator('summary').filter({ hasText: 'Connecting a new device?' }).click();
    await page.getByLabel('Admin activation key (optional)').fill(key.code);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/kiosk-admin/);
    await expect(page.getByRole('navigation', { name: 'Kiosk launch steps', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Billing / Invoices', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '2. Customer experience', exact: true }).click();
    await expect(page).toHaveURL(/kiosk-admin\/customer-experience/);
    await expect(page.getByTestId('kiosk-welcome-manager')).toBeVisible();
    await snap(page, 'kiosk-only-workspace');
    await isolated.close();
  });
  expect(errors).toEqual([]);
}
main()
  .catch((e) => {
    console.log('FAIL', q.scrub(e.message).slice(0, 950));
    if (!results.some((r) => !r.passed)) results.push({ name: 'Harness setup', passed: false, error: q.scrub(e.message).slice(0, 950) });
  })
  .finally(async () => {
    q.fs.writeFileSync(
      q.path.join(dir, 'browser-results.json'),
      JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.passed).length, total: results.length, tests: results }, null, 2)
    );
    await browser?.close();
    if (f) await require('./cleanup.cjs')([f.restaurant.id,...extraFixtures]).catch(e=>console.log('QA fixture cleanup:',q.scrub(e.message).slice(0,200)));
    console.log('Admin workflow browser', results.filter((r) => r.passed).length + '/' + results.length);
    if (results.some((r) => !r.passed)) process.exitCode = 1;
  });
