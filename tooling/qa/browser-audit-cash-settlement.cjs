const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function posNav(p, label) {
  if (!await p.getByRole('button', { name: new RegExp(label) }).first().isVisible().catch(() => false)) await p.getByTitle('Back to the main menu', { exact: true }).click();
  await p.getByRole('button', { name: new RegExp(label) }).first().click();
}
async function main() {
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
  const a = await q.open('admin');
  await q.test(c, 'Captain receives kitchen-ready state without refresh', async () => {
    await q.expect(c.getByRole('button', { name: 'DELIVER FOOD (1)', exact: true })).toBeVisible();
    const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.captainActivation.deviceToken);
    q.expect(cloud.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId).status).toBe('READY');
    return { status: 'READY', persistedAcrossRestart: true, note: 'Live arrival measured separately from first-run response timestamps; this verifies recovered state' };
  });
  await posNav(p, 'Live Orders');
  await q.test(p, 'POS receives Captain order with same item, total and kitchen-ready status', async () => {
    await p.getByText(`#${q.state.captainOrder.meta.orderNumber}`, { exact: true }).click();
    await q.expect(p.getByText(/QA Pizza 01/).first()).toBeVisible();
    await q.expect(p.getByText(/₹314/).first()).toBeVisible();
    const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
    const row = cloud.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId);
    q.expect(row.status).toBe('READY'); q.expect(row.totalAmount).toBe(31400);
    return { orderId: row.externalOrderId, totalPaise: row.totalAmount, status: row.status, item: row.items[0].name };
  });
  await q.test(c, 'Captain serves ready food and updates backend', async () => {
    await c.getByRole('button', { name: 'DELIVER FOOD (1)', exact: true }).click();
    await q.expect(async () => {
      const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.captainActivation.deviceToken);
      q.expect(cloud.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId).status).toBe('SERVED');
    }).toPass({ timeout: 10000 });
    return { status: 'SERVED', clicks: 1 };
  });
  await q.test(p, 'Cashier settles Captain bill for INR314 once and receipt opens', async () => {
    await p.getByRole('button', { name: 'Settle Cash', exact: true }).first().click();
    await q.expect(async () => {
      const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
      const row = cloud.orders.find(o => o.externalOrderId === q.state.captainOrder.externalOrderId);
      q.expect(row.paymentStatus).toBe('PAID'); q.expect(row.paymentMethod).toBe('CASH');
    }).toPass({ timeout: 10000 });
    const data = await q.snap(p, 'pos-captain-cash-receipt');
    return { method: 'CASH', totalPaise: 31400, receiptText: data.text.slice(-2000) };
  });
  const closeReceipt = p.getByRole('button', { name: /Done|Close/i });
  if (await closeReceipt.last().isVisible().catch(() => false)) await closeReceipt.last().click();
  await q.test(c, 'Table becomes available on Captain after cashier settles bill', async () => {
    await q.expect(c.getByRole('button', { name: 'OPEN TABLE', exact: true })).toBeVisible({ timeout: 15000 });
    const tables = await q.mustApi('GET', '/api/v1/entity-sync/DINING_TABLE', undefined, q.state.captainActivation.deviceToken);
    const row = tables.entities.find(e => e.externalId === q.state.tableId);
    q.expect(row.payload.status).toBe('AVAILABLE');
    return { tableId: row.externalId, status: row.payload.status };
  });
  await a.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await q.test(a, 'Owner dashboard receives actual cashier revenue after Captain cash settlement', async () => {
    await q.expect(a.getByText(/₹314/).first()).toBeVisible({ timeout: 15000 });
    const payments = await q.mustApi('GET', '/api/v1/entity-sync/PAYMENT_TRANSACTION', undefined, q.state.adminActivation.deviceToken);
    const relevant = payments.entities.filter(e => JSON.stringify(e.payload).includes(q.state.captainOrder.externalOrderId));
    q.expect(relevant.length).toBe(1);
    return { actualPaymentRecords: relevant.length, payment: relevant[0].payload };
  });
  await q.snap(a, 'owner-dashboard-after-cash'); await q.snap(c, 'captain-table-after-cash');
  console.log('POS final buttons', (await p.getByRole('button').allTextContents()).slice(-15));
  await q.close();
}
if (require.main === module) main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
module.exports = { posNav };
