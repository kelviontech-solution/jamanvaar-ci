const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept());
 const draft = p.getByRole('button', { name: 'Discard', exact: true }); if (await draft.isVisible().catch(() => false)) await draft.click();
 await posNav(p, 'Billing / Menu'); await p.getByTitle('Start fresh order').click(); await p.getByRole('button', { name: 'Quick Takeaway', exact: true }).click();
 await p.getByText('QA Pizza 01', { exact: true }).first().click();
 const old = new Set((await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders.map(o => o.externalOrderId));
 const timeline = { createdAt: new Date().toISOString(), environment: 'local actual API and PostgreSQL, cloud sync only, no LAN core' }; const started = performance.now(); let order;
 await q.test(p, 'Measured POS KOT creation reaches backend and KDS with matching item amount and ID', async () => {
   const [r] = await Promise.all([p.waitForResponse(r => r.url().includes('/orders/sync') && r.request().method() === 'POST'), p.getByRole('button', { name: 'SEND KOT', exact: true }).click()]);
   q.expect(r.status()).toBe(201); timeline.posToBackendAckMs = +(performance.now() - started).toFixed(2);
   order = (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders.find(o => !old.has(o.externalOrderId));
   q.expect(order.items[0].unitPrice).toBe(29900); q.expect(order.totalAmount).toBe(31400);
   timeline.orderId = order.externalOrderId; timeline.orderNumber = order.meta.orderNumber; timeline.token = order.meta.tokenNumber;
   const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) });
   await q.expect(ticket).toHaveCount(1, { timeout: 15000 }); await q.expect(ticket.getByText('QA Pizza 01', { exact: true })).toBeVisible();
   timeline.posToKdsVisibleMs = +(performance.now() - started).toFixed(2);
   return { ...timeline, itemUnitPricePaise: 29900, orderTotalPaise: 31400, kdsTickets: 1 };
 });
 if (order) await q.test(d, 'Measured kitchen ready update persists and returns to cashier without refreshing', async () => {
   const ready = performance.now(); const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) });
   const [r] = await Promise.all([d.waitForResponse(r => r.url().includes('/orders/sync') && r.request().method() === 'POST'), ticket.getByRole('button', { name: /all dishes ready/i }).click()]);
   q.expect(r.status()).toBe(201); timeline.kdsReadyToBackendAckMs = +(performance.now() - ready).toFixed(2);
   await posNav(p, 'Live Orders'); await p.getByText('#' + order.meta.orderNumber, { exact: true }).first().click();
   await q.expect(p.getByRole('button', { name: 'Mark Served at Table', exact: true })).toBeVisible({ timeout: 15000 });
   timeline.kdsReadyToPosVisibleMs = +(performance.now() - ready).toFixed(2);
   const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
   q.expect(cloud.orders.find(o => o.externalOrderId === order.externalOrderId).status).toBe('READY'); return timeline;
 });
 if (order) await q.test(p, 'Measured running POS order cash settlement updates same order once', async () => {
   const card = p.getByText('#' + order.meta.orderNumber, { exact: true }).first().locator('xpath=ancestor::div[.//button[contains(.,"Settle Cash")]][1]');
   const at = performance.now(); await card.getByRole('button', { name: 'Settle Cash', exact: true }).click();
   await q.expect(async () => {
     const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
     const matched = cloud.orders.filter(o => o.externalOrderId === order.externalOrderId); q.expect(matched).toHaveLength(1); q.expect(matched[0].paymentStatus).toBe('SUCCESS'); q.expect(matched[0].totalAmount).toBe(31400);
   }).toPass({ timeout: 15000 }); timeline.cashToBackendMs = +(performance.now() - at).toFixed(2); return timeline;
 });
 q.fs.writeFileSync(q.path.join(q.reportDir, 'realtime-flow-timeline.json'), JSON.stringify(timeline, null, 2));
 await q.snap(d, 'measured-kds-pos-flow'); await q.snap(p, 'measured-pos-ready-settlement');
 await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
