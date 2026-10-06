const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function page(p, key) { const data = await q.snap(p, key); q.append('page-coverage.jsonl', { app: p._audit.app, page: key, result: 'RENDERED', headings: data.headings, buttons: data.buttons, inputs: data.inputs, overflow: data.overflow }); return data; }
async function main() {
 const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
 for (const label of ['Food Ready', 'Messages']) {
   await c.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first().click(); await page(c, 'captain-' + label);
 }
 for (const label of ['Live KOT Tickets & Kitchen Stations', 'Guest Service Requests', 'Shift & Performance Dashboard']) {
   await c.getByRole('button', { name: 'More', exact: true }).click();
   await c.getByRole('button', { name: new RegExp(label.replace('&', '&')) }).click(); await page(c, 'captain-more-' + label);
 }
 await c.getByRole('button', { name: 'Connection and alert settings', exact: true }).click(); await page(c, 'captain-connection-settings');
 await c._audit.ctx.close();
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
 await d.getByRole('tab', { name: /^Active/i }).click();
 await q.test(d, 'Corrected KDS tab selector verifies thirty distinct browser generated tickets', async () => {
   const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken);
   q.expect(cloud.orders.filter(o => q.state.peakKotOrders.includes(o.externalOrderId))).toHaveLength(30);
   await q.expect(d.getByRole('button', { name: /all dishes ready/i })).toHaveCount(33, { timeout: 15000 });
   return { thirtySourceOrdersRecovered: true, preparingTicketActions: await d.getByRole('button', { name: /all dishes ready/i }).count() };
 }); await page(d, 'kds-thirty-ticket-load-corrected');
 for (const tab of ['Active', 'Cooking', 'Ready', 'Served', 'Expo']) { await d.getByRole('tab', { name: new RegExp('^' + tab, 'i') }).first().click(); await page(d, 'kds-tab-' + tab); }
 await d.getByRole('button', { name: 'Main Kitchen', exact: true }).click(); await page(d, 'kds-main-kitchen-station');
 await d.getByRole('button', { name: 'All stations', exact: true }).click();
 await d.getByRole('button', { name: 'Switch station or log out', exact: true }).click(); await page(d, 'kds-switch-station'); await d._audit.ctx.close();
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
 const draft = p.getByRole('button', { name: 'Discard', exact: true }); if (await draft.isVisible().catch(() => false)) await draft.click();
 for (const tab of ['Floor & Tables', 'Live Orders', 'Bills & Invoices', 'Kitchen & KOT', 'Customers CRM', 'Shift & Cash', 'Day History', 'POS Reports', 'Inventory & Stock', 'Settings']) { await posNav(p, tab); await page(p, 'pos-full-nav-' + tab); }
 for (const tab of ['Hardware & Printers', 'Reports & Design', 'Instant Bill', 'Local DB & Sync', 'Subscription & License']) {
   const button = p.getByRole('button', { name: new RegExp(tab.replace('&', '&')) }).first(); if (await button.isVisible().catch(() => false)) { await button.click(); await page(p, 'pos-settings-' + tab); }
 }
 await p.getByTitle('Print Queue', { exact: true }).first().click(); await page(p, 'pos-print-queue-no-hardware'); await p._audit.ctx.close();
 for (const app of ['super', 'admin', 'pos', 'captain', 'kds', 'kiosk']) {
   const u = await q.open(app, 'unauth-' + app, { width: 390, height: 844 });
   await q.test(u, 'Fresh unauthenticated mobile browser receives gate rather than tenant records', async () => {
     const text = await u.locator('body').innerText(); q.expect(text).not.toContain(q.state.restaurantA.name);
     q.expect(/sign in|login|activation|activate|unlock|restaurant code/i.test(text)).toBe(true); return { viewport: '390x844', gated: true };
   }); await page(u, 'unauth-mobile-' + app); await u._audit.ctx.close();
 }
 await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
