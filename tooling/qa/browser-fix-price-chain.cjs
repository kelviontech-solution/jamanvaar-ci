const q = require('./browser-audit-lib.cjs');
const { owner, fresh } = require('./browser-fix-regressions.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
const { paymentRow, webhook } = require('./browser-audit-kiosk-payment.cjs');
async function main() {
 const a = await q.open('admin'); await owner(a); await a.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept()); await fresh(p);
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
 const k = await q.open('kiosk'); await k.getByRole('button', { name: 'Start Order', exact: true }).click(); await k.getByRole('button', { name: /English/ }).click(); await k.getByRole('button', { name: /Takeaway/i }).click();
 const rows = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM', undefined, q.state.adminActivation.deviceToken);
 const beforePrice = rows.entities.find(row => row.externalId === q.state.pizzaId).payload.price;
 async function editPrice(value) {
   await a.getByRole('heading', { name: 'QA Pizza 01', exact: true }).locator('..').getByTitle('Click to change the price', { exact: true }).click();
   const input = a.getByRole('spinbutton', { name: 'New price for QA Pizza 01', exact: true }); await input.fill(String(value)); await input.press('Enter');
   await q.expect(async () => { const rows = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM', undefined, q.state.adminActivation.deviceToken); q.expect(rows.entities.find(row => row.externalId === q.state.pizzaId).payload.price).toBe(value); }).toPass({ timeout: 15000 });
 }
 try {
   await q.test(a, 'Owner price edit reaches kiosk, paid order, POS, KDS and collection report with the same amount', async () => {
     const summaryBefore = await a.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPayoutSummary());
     const start = performance.now(); await editPrice(301);
     await q.expect(k.getByRole('button', { name: 'Add QA Pizza 01 to cart', exact: true }).locator('xpath=ancestor::div[.//h3 or .//h4][1]')).toContainText('301', { timeout: 15000 });
     const menuVisibleMs = +(performance.now() - start).toFixed(2);
     await k.getByRole('button', { name: 'Add QA Pizza 01 to cart', exact: true }).click();
     const ack = k.waitForResponse(r => r.url().endsWith('/payments/orders') && r.request().method() === 'POST'); await k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click();
     const response = await ack; q.expect(response.status()).toBe(201); const quote = await response.json(); q.expect(quote.amount).toBe(30100); q.expect(quote.quote.taxAmount).toBe(0);
     const id = response.request().postDataJSON().externalOrderId; const payment = await paymentRow(quote.paymentId); q.expect((await webhook(payment, 'price-chain-' + payment.id)).status).toBe(200);
     await q.expect(k.getByText(/Order Confirmed|Order Placed|Order Successful|Thank you|confirmed/i).first()).toBeVisible({ timeout: 20000 });
     let order; await q.expect(async () => { const rows = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken); order = rows.orders.find(row => row.externalOrderId === id); q.expect(order?.paymentStatus).toBe('SUCCESS'); q.expect(order?.totalAmount).toBe(30100); }).toPass({ timeout: 15000 });
     q.expect(order.items[0].unitPrice).toBe(30100); const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) });
     await q.expect(ticket).toHaveCount(1, { timeout: 15000 }); await q.expect(ticket).toContainText('QA Pizza 01');
     await posNav(p, 'Live Orders'); const number = p.getByText('#' + order.meta.orderNumber, { exact: true }).first(); await q.expect(number).toBeVisible({ timeout: 15000 }); await number.click(); await q.expect(p.getByText('₹301', { exact: true }).first()).toBeVisible();
     const summaryAfter = await a.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPayoutSummary());
     q.expect(summaryAfter.grossCollection - summaryBefore.grossCollection).toBe(30100); q.expect(summaryAfter.platformFee - summaryBefore.platformFee).toBe(903); q.expect(summaryAfter.netPayable - summaryBefore.netPayable).toBe(29197);
     await q.snap(p, 'price-chain-pos-same-paid-amount');
     return { orderId: id, menuVisibleMs, amountPaise: 30100, taxPaise: 0, feePaise: 903, netPaise: 29197, kitchenCopies: 1, realPayment: false };
   });
 } finally { await editPrice(beforePrice); }
 await q.test(a, 'Current owner session authorizes a simulated refund and client cannot choose its audit actor', async () => {
   const r = await a.evaluate(async id => (await import('/src/cloud/cloudClient.ts')).createRefund(id, 1, 'QA owner authorization proof', 'Forged cashier actor'), q.state.kioskPayment.paymentId);
   q.expect(r.status).toBe('processed'); q.expect(r.amount).toBe(1); return { currentOwnerProof: true, amountPaise: 1, provider: 'SIMULATED' };
 }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
