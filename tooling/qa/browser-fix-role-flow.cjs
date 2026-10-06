const q = require('./browser-audit-lib.cjs');
const { owner } = require('./browser-fix-regressions.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
const { paymentRow, webhook } = require('./browser-audit-kiosk-payment.cjs');
async function platform(p) {
  if (await p.getByPlaceholder('e.g. superadmin@jamanvaar.app').isVisible().catch(() => false)) {
    await p.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(q.state.platformEmail);
    await p.getByPlaceholder('Enter your password').fill(q.state.platformPassword);
    await p.locator('button[type=submit]').click(); await p.getByPlaceholder('123456').waitFor();
    const mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')));
    await p.getByPlaceholder('123456').fill(mail[q.state.platformEmail].otp); await p.locator('button[type=submit]').click();
  }
  await q.expect(p.getByRole('button', { name: 'Logout', exact: true })).toBeVisible({ timeout: 15000 });
}
async function main() {
 const a = await q.open('admin'); await owner(a);
 const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
 const label = 'QF' + String(Date.now()).slice(-6); let order;
 await q.test(a, 'Owner creates a new branch table for a clean Captain tax and kitchen flow', async () => {
   await a.getByRole('button', { name: 'Floor / Tables', exact: true }).click(); await a.getByRole('button', { name: 'Add Dining Table', exact: true }).click();
   await a.getByPlaceholder('e.g. 15').fill(label); const zone = a.getByPlaceholder('e.g. Garden Terrace'); if (await zone.isVisible()) await zone.fill('QA Main Hall'); await a.getByRole('button', { name: 'Create Table', exact: true }).click();
   await q.expect(async () => { const r = await q.mustApi('GET', '/api/v1/entity-sync/DINING_TABLE', undefined, q.state.adminActivation.deviceToken); q.expect(r.entities.some(e => e.payload.tableNumber === label)).toBe(true); }).toPass({ timeout: 15000 }); return { table: label, branch: q.state.branchA.id };
 });
 await q.test(c, 'Captain creates a GST18 order and KDS receives the same item ID and INR118 total', async () => {
   await c.getByRole('button', { name: 'My Tables', exact: true }).click();
   await c.getByRole('button', { name: 'All Floor Tables', exact: true }).click();
   const card = c.getByText('TABLE ' + label, { exact: true }).locator("xpath=ancestor::div[.//button[normalize-space(.)='OPEN TABLE']][1]");
   await q.expect(card).toBeVisible({ timeout: 15000 }); await card.getByRole('button', { name: 'OPEN TABLE', exact: true }).click();
   await c.getByRole('button', { name: 'Seat & Take Order', exact: true }).click();
   await c.getByRole('button', { name: 'Add QA GST18 Pizza', exact: true }).click(); const at = performance.now();
   await c.getByRole('button', { name: 'SEND KOT (1)', exact: true }).click();
   await q.expect(async () => { const r = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.captainActivation.deviceToken); order = r.orders.find(o => o.tableLabel === label); q.expect(order?.totalAmount).toBe(11800); }).toPass({ timeout: 15000 });
   q.expect(order.items[0].menuItemId).toBe(q.state.taxPizzaId); q.expect(order.taxAmount).toBe(1800);
   const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) }); await q.expect(ticket).toHaveCount(1, { timeout: 15000 });
   return { orderId: order.externalOrderId, table: label, amountPaise: order.totalAmount, taxPaise: order.taxAmount, captainToKdsMs: +(performance.now() - at).toFixed(2) };
 });
 if (order) await q.test(d, 'KDS Ready returns to Captain and POS; cashier settles the same INR118 Captain order once', async () => {
   const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) }); await ticket.getByRole('button', { name: /all dishes ready/i }).click();
   const close = c.getByRole('button', { name: 'Close', exact: true }); if (await close.isVisible()) await close.click();
   await c.locator('nav:visible').getByRole('button', { name: /Food Ready/ }).click();
   await q.expect(c.getByRole('heading', { name: 'Food Ready for Delivery', exact: true })).toBeVisible();
   const ready = c.getByText('TABLE ' + label, { exact: true }).locator("xpath=ancestor::div[.//button[contains(.,'DELIVER ALL READY ITEMS')]][1]");
   await q.expect(ready.getByText('QA GST18 Pizza', { exact: true })).toBeVisible({ timeout: 15000 });
   await posNav(p, 'Live Orders'); const number = p.getByText('#' + order.meta.orderNumber, { exact: true }).first(); await q.expect(number).toBeVisible({ timeout: 15000 }); await number.click();
   const card = number.locator('xpath=ancestor::div[.//button[contains(.,"Settle Cash")]][1]'); await card.getByRole('button', { name: 'Settle Cash', exact: true }).click();
   await q.expect(async () => { const r = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken); const match = r.orders.filter(o => o.externalOrderId === order.externalOrderId); q.expect(match).toHaveLength(1); q.expect(match[0].paymentStatus).toBe('SUCCESS'); q.expect(match[0].totalAmount).toBe(11800); }).toPass({ timeout: 20000 }); return { orderId: order.externalOrderId, paidAmountPaise: 11800, copies: 1 };
 });
 const s = await q.open('super'); await platform(s);
 await q.test(s, 'B012: real restaurant provisioning points kiosk keys to merged Restaurant Admin', async () => {
   await s.goto('http://localhost:5180/restaurants/' + q.state.restaurantA.id); await q.expect(s.getByText(/merged Restaurant Admin/)).toBeVisible();
   q.expect(await s.locator('body').innerText()).not.toContain('http://localhost:5173'); return { kioskManagementUrl: 'http://localhost:5176', standaloneRetiredLink: false };
 }); await q.snap(s, 'merged-admin-provisioning-fixed');
 await q.test(s, 'Super Admin positive commission edit affects new kiosk payment and preserves earlier snapshot', async () => {
   const before = await paymentRow(q.state.kioskPayment.paymentId); q.expect(before.commissionBps).toBe(300);
   await s.goto('http://localhost:5180/payment-connections');
   const rate = s.getByRole('spinbutton').first();
   const save = s.getByRole('button', { name: 'Save', exact: true }).first();
   await q.expect(save).toBeEnabled(); await q.expect(rate).toHaveValue('3');
   async function setRate(value) {
     await rate.fill(String(value)); s.once('dialog', dialog => dialog.accept(q.state.platformPassword));
     const [ack] = await Promise.all([s.waitForResponse(r => r.url().endsWith('/payments/commission-config') && r.request().method() === 'PATCH'), save.click()]); q.expect(ack.status()).toBe(200); q.expect((await ack.json()).defaultBps).toBe(value * 100);
     await q.expect(save).toBeEnabled(); await q.expect(rate).toHaveValue(String(value));
   }
   try {
     await setRate(4);
     const k = await q.open('kiosk'); await k.getByRole('button', { name: 'Start Order', exact: true }).click(); await k.getByRole('button', { name: /English/ }).click(); await k.getByRole('button', { name: /Takeaway/i }).click();
     await k.getByRole('button', { name: 'Add QA GST18 Pizza to cart', exact: true }).click(); const ack = k.waitForResponse(r => r.url().endsWith('/payments/orders') && r.request().method() === 'POST'); await k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click(); const result = await (await ack).json();
     const created = await paymentRow(result.paymentId); q.expect(created.commissionBps).toBe(400); q.expect(created.platformAmount).toBe(472); q.expect(created.restaurantAmount).toBe(11328);
     q.expect((await webhook(created, 'commission-positive-' + created.id)).status).toBe(200); await q.expect(k.getByText(/Order Confirmed|Order Placed|Order Successful|Thank you|confirmed/i).first()).toBeVisible({ timeout: 20000 });
     const older = await paymentRow(q.state.kioskPayment.paymentId); q.expect(older.commissionBps).toBe(300); q.expect(older.platformAmount).toBe(before.platformAmount);
     await k._audit.ctx.close(); return { newRateBps: 400, newFeePaise: 472, historicalRateBps: 300, historicalFeePreserved: true, realFunds: false };
   } finally { await setRate(3); }
 });
 await q.snap(c, 'captain-gst18-ready-fixed'); await q.snap(p, 'captain-gst18-settlement-fixed'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
