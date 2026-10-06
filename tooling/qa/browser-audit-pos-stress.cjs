const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function orders() { return (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders; }
async function add(p, name = 'QA Pizza 01') { await p.getByText(name, { exact: true }).first().click(); }
async function fresh(p) { await p.getByTitle('Start fresh order', { exact: true }).click(); await p.getByRole('button', { name: 'Quick Takeaway', exact: true }).click(); }
async function main() {
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  p.on('dialog', dialog => dialog.accept()); // Only discards this isolated audit's unsent QA cart.
  const recovered = p.getByRole('button', { name: 'Discard', exact: true });
  if (await recovered.isVisible().catch(() => false)) await recovered.click();
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
  await posNav(p, 'Billing / Menu');
  await fresh(p); await add(p);
  await q.test(p, 'Cashier holds and recalls cart retaining amount and quantity', async () => {
    await p.getByRole('button', { name: 'Hold Order', exact: true }).click();
    await q.expect(p.getByRole('button', { name: /SEND KOT/ })).toBeDisabled();
    await p.getByText('Held Carts', { exact: true }).click();
    await p.getByRole('button', { name: 'Recall Cart', exact: true }).first().click();
    await q.expect(p.getByRole('button', { name: /SEND KOT/ })).toBeEnabled();
    return { heldAndRecalled: true };
  });
  // Discard only an unsent QA draft through the regular New Order control.
  await fresh(p); await add(p, 'QA GST18 Pizza');
  await q.test(p, 'POS GST18 item total agrees with configured eighteen percent tax', async () => {
    await q.expect(p.getByText(/₹118/).first()).toBeVisible(); return { expectedTotal: 118, base: 100, tax: 18 };
  }); await q.snap(p, 'pos-gst18-cart');
  await fresh(p); await add(p);
  const baseline = await orders(); const ids = new Set(baseline.map(o => o.externalOrderId));
  await q.test(p, 'Double click SEND KOT produces one backend order', async () => {
    await p.getByRole('button', { name: 'SEND KOT', exact: true }).dblclick();
    await q.expect(async () => q.expect((await orders()).filter(o => !ids.has(o.externalOrderId))).toHaveLength(1)).toPass({ timeout: 15000 });
    q.state.posRunningAuditOrder = (await orders()).find(o => !ids.has(o.externalOrderId)); q.saveState();
    return { orderId: q.state.posRunningAuditOrder.externalOrderId, createdOrders: 1 };
  });
  await q.test(p, 'Instant Bill settles existing running KOT instead of creating a duplicate sale', async () => {
    await p.getByRole('button', { name: /Instant Bill/ }).first().click();
    await p.waitForTimeout(5000);
    const created = (await orders()).filter(o => !ids.has(o.externalOrderId));
    q.append('data-consistency.jsonl', { feature: 'SEND_KOT_then_INSTANT_BILL', orders: created });
    q.expect(created).toHaveLength(1); q.expect(created[0].paymentStatus).toBe('SUCCESS');
    return { orderId: created[0].externalOrderId };
  }); await q.snap(p, 'pos-running-kot-instant-bill');
  await q.test(p, 'Twenty browser counter cash sales persist once each with correct aggregate', async () => {
    const before = new Set((await orders()).map(o => o.externalOrderId)); const started = performance.now();
    for (let i = 0; i < 20; i++) {
      await fresh(p); await add(p); await p.getByRole('button', { name: /Instant Bill/ }).first().click();
      await q.expect(p.getByRole('button', { name: /SEND KOT/ })).toBeDisabled();
    }
    let rows;
    await q.expect(async () => { rows = (await orders()).filter(o => !before.has(o.externalOrderId)); q.expect(rows).toHaveLength(20); }).toPass({ timeout: 20000 });
    q.expect(rows.every(o => o.paymentStatus === 'SUCCESS' && o.paymentMethod === 'CASH' && o.totalAmount === 31400)).toBe(true);
    q.expect(rows.reduce((s, o) => s + o.totalAmount, 0)).toBe(628000);
    q.state.peakCashOrders = rows.map(o => o.externalOrderId); q.saveState();
    return { browserSales: 20, uniqueOrders: rows.length, paidPaise: 628000, durationMs: +(performance.now() - started).toFixed(2) };
  });
  await q.test(p, 'Thirty browser KOT submissions persist without duplicate orders', async () => {
    const before = new Set((await orders()).map(o => o.externalOrderId)); const started = performance.now();
    for (let i = 0; i < 30; i++) {
      await fresh(p); await add(p); await p.getByRole('button', { name: 'SEND KOT', exact: true }).click();
      await q.expect(p.getByRole('button', { name: /KOT SENT|SENT TO KITCHEN/ })).toBeVisible();
    }
    let rows;
    await q.expect(async () => { rows = (await orders()).filter(o => !before.has(o.externalOrderId)); q.expect(rows).toHaveLength(30); }).toPass({ timeout: 20000 });
    q.state.peakKotOrders = rows.map(o => o.externalOrderId); q.saveState();
    return { browserKotSubmissions: 30, uniqueOrders: rows.length, durationMs: +(performance.now() - started).toFixed(2) };
  });
  await q.test(d, 'KDS receives thirty distinct browser-generated kitchen tickets', async () => {
    await d.getByRole('tab', { name: /^ACTIVE/i }).click();
    await q.expect(async () => {
      const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken);
      q.expect(cloud.orders.filter(o => q.state.peakKotOrders.includes(o.externalOrderId))).toHaveLength(30);
      q.expect(await d.getByRole('button', { name: /all dishes ready/i }).count()).toBeGreaterThanOrEqual(30);
    }).toPass({ timeout: 15000 });
    return { distinctSourceOrders: 30, readyActions: await d.getByRole('button', { name: /all dishes ready/i }).count() };
  }); await q.snap(d, 'kds-thirty-ticket-load');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
