const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');

const viewports = [
  ['320x700', 320, 700],
  ['375x812', 375, 812],
  ['390x844', 390, 844],
  ['768x1024', 768, 1024],
  ['1366x768', 1366, 768],
  ['1920x1080', 1920, 1080]
];

async function capture(page, app, name, viewport = 'current') {
  const data = await q.snap(page, `${app}-${name}-${viewport}`);
  q.append('page-coverage.jsonl', {
    app,
    page: name,
    route: new URL(page.url()).pathname + new URL(page.url()).search,
    viewport,
    result: /something went wrong|failed to render|could not render/i.test(data.text) ? 'FAIL' : 'RENDERED',
    headings: data.headings,
    buttons: data.buttons.filter((button) => button.visible).length,
    fields: data.fields || data.inputs || [],
    overflow: data.overflow,
    unlabelledButtons: data.unlabelledButtons ?? data.buttons.filter((button) => button.visible && !button.text.trim() && !button.aria && !button.title).length,
    brokenImages: data.images ? data.images.filter((image) => image.width > 0 && !image.loaded).length : null
  });
  return data;
}

async function navigatePos(page, label) {
  let target = page.getByRole('button', { name: label, exact: true }).filter({ visible: true });
  if (!await target.count()) {
    const menu = page.getByRole('button', { name: 'Pages & categories', exact: true });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    const allPages = page.getByTitle('Back to the main menu', { exact: true }).filter({ visible: true });
    if (await allPages.count()) await allPages.click();
    target = page.getByRole('button', { name: label === 'Billing' ? 'Billing / Menu' : label, exact: true }).filter({ visible: true });
    if (!await target.count()) {
      const more = page.getByRole('button', { name: 'More tools', exact: true }).filter({ visible: true });
      if (await more.count()) await more.click();
      target = page.getByRole('button', { name: label === 'Billing' ? 'Billing / Menu' : label, exact: true }).filter({ visible: true });
    }
  }
  if (!await target.count()) throw new Error(`POS navigation is unavailable: ${label}`);
  await target.first().click();
}

async function viewportSweep(page, app, name) {
  for (const [label, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    await capture(page, app, name, label);
  }
}

async function posAudit() {
  const page = await q.open('pos');
  await login(page, 'pos', 'Cashier');
  const routes = ['Billing', 'Floor & Tables', 'Live Orders', 'Bills & Invoices', 'Kitchen & KOT', 'Customers CRM', 'Shift & Cash', 'Day History', 'POS Reports', 'Inventory & Stock', 'Settings'];
  for (const label of routes) {
    await q.test(page, `POS navigation: ${label}`, async () => {
      await navigatePos(page, label);
      await page.waitForTimeout(500);
      await capture(page, 'pos', label.replace(/\W+/g, '-').toLowerCase(), '1440x960');
      return { destinationVisible: true };
    });
  }
  await navigatePos(page, 'Billing');
  const takeaway = page.getByRole('button', { name: 'Takeaway', exact: true });
  if (await takeaway.isVisible().catch(() => false)) await takeaway.click();
  await viewportSweep(page, 'pos', 'billing-responsive');
  await page._audit.ctx.close();
}

async function kioskAudit() {
  const page = await q.open('kiosk');
  await viewportSweep(page, 'kiosk', 'welcome-responsive');
  await page.setViewportSize({ width: 390, height: 844 });
  await q.test(page, 'Kiosk welcome to menu flow', async () => {
    const start = page.getByRole('button', { name: 'Start Order', exact: true });
    if (await start.isVisible().catch(() => false)) await start.click();
    const english = page.getByRole('button', { name: /English/i }).first();
    await english.waitFor({ state: 'visible' });
    await english.click();
    const takeaway = page.getByRole('button', { name: /Takeaway/i }).first();
    await takeaway.waitFor({ state: 'visible' });
    await takeaway.click();
    await q.expect(page.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await capture(page, 'kiosk', 'menu', '390x844');
    return { welcome: true, language: true, orderType: true, menu: true };
  });
  await q.test(page, 'Kiosk add-to-cart and payment-review flow', async () => {
    await page.getByRole('button', { name: 'Add QA Pizza 01 to cart', exact: true }).click();
    await page.getByRole('button', { name: /Cart/i }).first().click();
    await capture(page, 'kiosk', 'cart', '390x844');
    const payment = page.getByRole('button', { name: 'Proceed to Payment', exact: true });
    await payment.click();
    await capture(page, 'kiosk', 'payment-review', '390x844');
    return { cartVisible: true, paymentReviewVisible: true, submitted: false };
  });
  await page._audit.ctx.close();
}

async function captainAudit() {
  const page = await q.open('captain', 'captain', { width: 390, height: 844 });
  await login(page, 'captain', 'Captain');
  for (const label of ['My Tables', 'Active Orders', 'Food Ready', 'Messages']) {
    const button = page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
    if (!await button.isVisible().catch(() => false)) continue;
    await button.click();
    await capture(page, 'captain', label.replace(/\W+/g, '-').toLowerCase(), '390x844');
  }
  await viewportSweep(page, 'captain', 'primary-responsive');
  await page._audit.ctx.close();
}

async function kdsAudit() {
  const page = await q.open('kds');
  await login(page, 'kds', 'Kitchen');
  for (const label of ['Active', 'Cooking', 'Ready', 'Served', 'Expo']) {
    const tab = page.getByRole('tab', { name: new RegExp(`^${label}`, 'i') }).first();
    if (!await tab.isVisible().catch(() => false)) continue;
    await tab.click();
    await capture(page, 'kds', label.toLowerCase(), '1440x960');
  }
  await viewportSweep(page, 'kds', 'active-responsive');
  await page._audit.ctx.close();
}

async function qrAdminAudit() {
  const page = await q.open('admin');
  await page.evaluate(() => {
    history.pushState(null, '', '/restaurant-admin/qr-ordering');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForTimeout(800);
  const consoleRoot = page.getByTestId('qr-console');
  await consoleRoot.waitFor({ state: 'visible' });
  const navigationSource = q.fs.readFileSync(q.path.join(q.root, 'apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts'), 'utf8');
  const pageBlock = navigationSource.slice(navigationSource.indexOf('export const QR_PAGES'), navigationSource.indexOf('] as const'));
  const sections = [...pageBlock.matchAll(/id:\s*["']([^"']+)["'][\s\S]*?label:\s*["']([^"']+)["']/g)]
    .map((match) => ({ id: match[1], label: match[2] }));
  for (const { id, label } of sections) {
    await page.evaluate((tab) => {
      const url = new URL(location.href);
      url.searchParams.set('tab', tab);
      if (tab !== 'ADVANCED') url.searchParams.delete('feature');
      history.pushState(null, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    }, id);
    await page.waitForTimeout(250);
    await capture(page, 'qr-admin', label, '1440x960');
  }
  await viewportSweep(page, 'qr-admin', 'workspace-responsive');
  await page._audit.ctx.close();
}

async function qrGuestAudit() {
  await q.mustApi('POST', '/api/v1/menu/publish', {}, q.state.adminActivation.deviceToken);
  const tables = await q.mustApi('GET', '/api/v1/restaurant/qr/tables', undefined, q.state.adminActivation.deviceToken);
  const existing = tables.find((table) => table.tableId === q.state.tableId && table.qr?.status === 'ACTIVE' && table.qr.url);
  const generated = existing?.qr ?? await q.mustApi('POST', `/api/v1/restaurant/qr/tables/${q.state.tableId}/generate`, { branchId: q.state.branchA.id }, q.state.adminActivation.deviceToken);
  const token = String(generated.url).split('/q/').pop();
  const page = await q.open('qr', 'qr-guest', { width: 390, height: 844 });
  await page.goto(`http://localhost:5190/q/${token}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await viewportSweep(page, 'qr-guest', 'menu-responsive');
  await q.test(page, 'QR guest menu and cart flow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const add = page.getByRole('button', { name: /Add QA Pizza 01/i }).first();
    await add.click();
    const cart = page.getByRole('button', { name: /View Cart/i }).first();
    await cart.click();
    await capture(page, 'qr-guest', 'cart', '390x844');
    return { menu: true, cart: true, checkoutSubmitted: false };
  });
  await page._audit.ctx.close();
}

async function main() {
  const audits = { pos: posAudit, kiosk: kioskAudit, captain: captainAudit, kds: kdsAudit, 'qr-admin': qrAdminAudit, 'qr-guest': qrGuestAudit };
  const selected = process.argv[2];
  if (selected) {
    if (!audits[selected]) throw new Error(`Unknown role audit: ${selected}`);
    await audits[selected]();
  } else {
    for (const audit of Object.values(audits)) await audit();
  }
  await q.close();
}

main().catch(async (error) => {
  console.error(q.scrub(error.message));
  await q.close();
  process.exitCode = 1;
});
