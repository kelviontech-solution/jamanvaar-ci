const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
  const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
  const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.captainActivation.deviceToken);
  q.state.captainOrder = cloud.orders.find(o => o.items.some(i => i.menuItemId === q.state.pizzaId)); q.saveState();
  await q.test(d, 'Persisted Captain KOT recovers after KDS browser restart', async () => {
    await q.expect(d.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    q.expect(q.state.captainOrder.items[0].unitPrice).toBe(29900);
    q.expect(q.state.captainOrder.totalAmount).toBe(31400);
    return { orderId: q.state.captainOrder.externalOrderId, item: 'QA Pizza 01', quantity: 1, unitPricePaise: 29900, totalPaise: 31400 };
  });
  let readyAt = 0;
  await q.test(d, 'Kitchen marks all dishes ready and backend status persists', async () => {
    readyAt = performance.now();
    await d.getByRole('button', { name: /All dishes ready/i }).first().click();
    await q.expect(async () => {
      const fresh = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken);
      q.expect(fresh.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId).status).toBe('READY');
    }).toPass({ timeout: 10000 });
    return { orderId: q.state.captainOrder.externalOrderId, status: 'READY', backendMs: +(performance.now() - readyAt).toFixed(2) };
  });
  await q.test(c, 'Captain receives kitchen-ready state without refresh', async () => {
    await q.expect(c.getByText('READY', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    return { measuredFromKitchenClickMs: +(performance.now() - readyAt).toFixed(1), orderId: q.state.captainOrder.externalOrderId };
  });
  await p.getByTitle('Back to the main menu', { exact: true }).click();
  await p.getByRole('button', { name: /Live Orders/ }).first().click();
  await q.test(p, 'POS receives Captain order with same item, total and kitchen-ready status', async () => {
    await q.expect(p.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await q.expect(p.getByText(/₹314/).first()).toBeVisible();
    const fresh = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
    q.expect(fresh.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId).status).toBe('READY');
    return { orderId: q.state.captainOrder.externalOrderId, totalPaise: 31400, status: 'READY', measuredFromKitchenClickMs: +(performance.now() - readyAt).toFixed(1) };
  });
  await q.snap(p, 'pos-captain-ready-live-order'); await q.snap(c, 'captain-kitchen-ready'); await q.snap(d, 'kds-ready');
  console.log('POS buttons', (await p.getByRole('button').allTextContents()).slice(-15));
  console.log('KDS buttons', await d.getByRole('button').allTextContents());
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
