const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept());
 const restore = p.getByRole('button', { name: 'Discard', exact: true }); if (await restore.isVisible().catch(() => false)) await restore.click();
 await posNav(p, 'Billing / Menu');
 await p.getByTitle('Start fresh order', { exact: true }).click(); await p.getByRole('button', { name: 'Quick Takeaway', exact: true }).click();
 const before = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
 const ids = new Set(before.orders.map(o => o.externalOrderId));
 await q.test(p, 'Cashier can create one local KOT during genuine browser network outage', async () => {
   await p._audit.ctx.setOffline(true);
   await p.getByText('QA Pizza 01', { exact: true }).first().click();
   await p.getByRole('button', { name: 'SEND KOT', exact: true }).click();
   await q.expect(p.getByRole('button', { name: /KOT SENT|SENT TO KITCHEN/ })).toBeVisible();
   const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
   q.expect(cloud.orders.filter(o => !ids.has(o.externalOrderId))).toHaveLength(0);
   await q.snap(p, 'pos-offline-kot-queued'); return { localKotCreated: true, cloudOrdersCreatedWhileOffline: 0 };
 });
 await q.test(p, 'Reconnect sends offline KOT once and refresh does not duplicate it', async () => {
   const began = performance.now(); await p._audit.ctx.setOffline(false); let created;
   await q.expect(async () => {
     created = (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders.filter(o => !ids.has(o.externalOrderId)); q.expect(created).toHaveLength(1);
   }).toPass({ timeout: 30000 }); const lag = +(performance.now() - began).toFixed(2);
   await p.reload(); await p.waitForTimeout(4000);
   const after = (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders.filter(o => !ids.has(o.externalOrderId));
   q.expect(after).toHaveLength(1); q.expect(after[0].externalOrderId).toBe(created[0].externalOrderId);
   return { orderId: after[0].externalOrderId, reconnectToCloudMs: lag, cloudCopies: 1, reloadCopies: 1 };
 }); await q.snap(p, 'pos-reconnected-kot'); await p._audit.ctx.close();
 const c = await q.open('captain', 'captain', { width: 390, height: 844 });
 await q.test(c, 'Captain terminal refuses cashier PIN for a disallowed role', async () => {
   const input = c.locator('input[type=password]'); await q.expect(input).toBeVisible();
   await input.fill(q.state.staff.Cashier.pin); await c.getByRole('button', { name: 'Unlock Captain Terminal', exact: true }).click();
   await q.expect(input).toBeVisible(); await q.expect(c.getByText(/not.*allowed|cannot.*captain|not.*captain|not.*permitted|only.*captain/i).first()).toBeVisible();
   return { disallowedRole: 'CASHIER', accepted: false };
 }); await q.snap(c, 'captain-denied-cashier-role'); await login(c, 'captain', 'Captain');
 await q.test(c, 'Captain UI remains usable while offline and reconnect recovers tables', async () => {
   await c._audit.ctx.setOffline(true); await c.waitForTimeout(1500); await c.getByRole('button', { name: 'Orders', exact: true }).click();
   await q.expect(c.getByRole('heading', { name: 'Active Dining Orders', exact: true })).toBeVisible();
   await c._audit.ctx.setOffline(false); await c.getByRole('button', { name: /^1\s*My Tables$/ }).click();
   await q.expect(c.getByRole('button', { name: 'OPEN TABLE', exact: true })).toBeVisible({ timeout: 15000 });
   return { navigationOffline: true, reconnectRecovered: true };
 }); await c._audit.ctx.close();
 const s = await q.open('super');
 await q.test(s, 'FAULT SIMULATION restaurant API 503 shows recoverable error', async () => {
   await s.route('**/api/v1/restaurants?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA simulated temporary outage' }) }));
   await s.goto('http://localhost:5180/restaurants');
   await q.expect(s.getByText('QA simulated temporary outage', { exact: true })).toBeVisible();
   await q.expect(s.getByRole('button', { name: /Retry|Try again/i }).first()).toBeVisible();
   await q.snap(s, 'super-api503-recoverable'); await s.unroute('**/api/v1/restaurants?*');
   await s.getByRole('button', { name: /Retry|Try again/i }).first().click();
   await q.expect(s.getByText(q.state.restaurantA.name, { exact: true }).first()).toBeVisible();
   return { injectedStatus: 503, recoveredViaUserRetry: true };
 }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
