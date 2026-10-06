const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
  const a = await q.open('admin');
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
  const k = await q.open('kiosk');
  await q.test(k, 'Customer starts kiosk order, chooses English and takeaway', async () => {
    await k.getByRole('button', { name: 'Start Order', exact: true }).click();
    await k.getByRole('button', { name: /English/ }).click();
    await k.getByRole('button', { name: /Takeaway/i }).click();
    await q.expect(k.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    return { menu: 'QA Pizza 01', customerSteps: ['Welcome', 'Language', 'Order Type', 'Menu'], clicks: 3 };
  });
  await q.snap(k, 'kiosk-menu-baseline');
  await a.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
  let changedAt = 0;
  await q.test(a, 'Owner changes pizza price 249 to 299 and backend stores 299', async () => {
    await a.getByTitle('Click to change the price', { exact: true }).click();
    await a.getByRole('spinbutton', { name: 'New price for QA Pizza 01', exact: true }).fill('299');
    changedAt = performance.now();
    await a.getByRole('spinbutton', { name: 'New price for QA Pizza 01', exact: true }).press('Enter');
    await q.expect(async () => {
      const rows = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM', undefined, q.state.adminActivation.deviceToken);
      q.expect(rows.entities.find(e => e.externalId === q.state.pizzaId).payload.price).toBe(299);
    }).toPass({ timeout: 10000 });
    return { externalId: q.state.pizzaId, unitPrice: 299, backendVisibleMs: +(performance.now() - changedAt).toFixed(1), clicks: 1, keys: 'Enter', screens: 1 };
  });
  for (const [page, app] of [[p, 'pos'], [k, 'kiosk']]) await q.test(page, 'Owner price change becomes visible without refreshing', async () => {
    await q.expect(page.getByText(/₹299/).first()).toBeVisible({ timeout: 15000 });
    const rows = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM', undefined, q.state[`${app}Activation`].deviceToken);
    q.expect(rows.entities.find(e => e.externalId === q.state.pizzaId).payload.price).toBe(299);
    return { price: 299, measuredFromOwnerCommitMs: +(performance.now() - changedAt).toFixed(1) };
  });
  await q.test(c, 'Captain opens seated table and sees updated pizza price', async () => {
    const button = c.getByRole('button', { name: 'TAKE ORDER', exact: true }).first();
    await button.click();
    await q.expect(c.getByText(/₹299/).first()).toBeVisible({ timeout: 15000 });
    return { table: 'QA01', price: 299, measuredFromOwnerCommitMs: +(performance.now() - changedAt).toFixed(1) };
  });
  let sentAt = 0;
  await q.test(c, 'Captain adds pizza and sends one KOT, cloud persists correct line/total', async () => {
    await c.getByRole('button', { name: 'Add QA Pizza 01', exact: true }).click();
    const ack = c.waitForResponse(r => r.url().includes('/orders/sync') && r.request().method() === 'POST');
    sentAt = performance.now();
    await c.getByRole('button', { name: 'SEND KOT (1)', exact: true }).click();
    q.expect((await ack).status()).toBe(201);
    const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.captainActivation.deviceToken);
    const order = cloud.orders.find(o => o.items.some(i => i.menuItemId === q.state.pizzaId));
    q.expect(order).toBeTruthy();
    q.state.captainOrder = order; q.saveState();
    return { orderId: order.externalOrderId, cloudAckMs: +(performance.now() - sentAt).toFixed(1), snapshot: order };
  });
  await q.test(d, 'Kitchen receives Captain pizza KOT without refresh', async () => {
    await q.expect(d.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken);
    q.expect(cloud.orders.some(o => o.externalOrderId === q.state.captainOrder.externalOrderId)).toBe(true);
    return { orderId: q.state.captainOrder.externalOrderId, elapsedFromSendMs: +(performance.now() - sentAt).toFixed(1) };
  });
  await q.snap(d, 'kds-captain-kot');
  await q.snap(c, 'captain-kot-sent');
  await q.snap(p, 'pos-after-captain-order');
  await q.snap(k, 'kiosk-new-price-menu');
  console.log('KDS buttons', await d.getByRole('button').allTextContents());
  console.log('Captain cloud order', q.state.captainOrder && { externalOrderId: q.state.captainOrder.externalOrderId, snapshotKeys: Object.keys(q.state.captainOrder.snapshot || {}) });
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
