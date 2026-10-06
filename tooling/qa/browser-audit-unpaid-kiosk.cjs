const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
 const k = await q.open('kiosk');
 await k.getByRole('button', { name: 'Start Order', exact: true }).click(); await k.getByRole('button', { name: /English/ }).click(); await k.getByRole('button', { name: /Takeaway/i }).click();
 await k.getByRole('button', { name: 'Add QA GST18 Pizza to cart', exact: true }).click();
 const [res] = await Promise.all([k.waitForResponse(r => r.url().endsWith('/payments/orders') && r.request().method() === 'POST'), k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click()]);
 q.expect(res.status()).toBe(201); const id = res.request().postDataJSON().externalOrderId; const payment = await res.json();
 await q.test(k, 'GST18 kiosk payable agrees with server amount before payment', async () => {
   q.expect(payment.amount).toBe(11800); await q.expect(k.getByText('Total Payable: ₹118', { exact: true })).toBeVisible(); return { authoritative: 11800 };
 });
 await q.test(d, 'Unpaid online kiosk checkout is withheld from kitchen until payment or explicit cash confirmation', async () => {
   let order; await q.expect(async () => {
     const rows = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken); order = rows.orders.find(o => o.externalOrderId === id); q.expect(order).toBeTruthy();
   }).toPass({ timeout: 15000 }); await d.waitForTimeout(5000);
   const tickets = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + order.meta.tokenNumber, { exact: true }) });
   q.append('data-consistency.jsonl', { feature: 'unpaid-kiosk-checkout', orderId: id, paymentId: payment.paymentId, backendPaymentPaise: payment.amount, syncedTotalPaise: order.totalAmount, status: order.status, paymentStatus: order.paymentStatus, displayedTickets: await tickets.count(), neverConfirmedCash: true });
   q.expect(order.paymentStatus).toBe('PENDING'); q.expect(await tickets.count()).toBe(0); return { excludedFromKitchen: true };
 }); await q.snap(k, 'gst18-kiosk-unpaid-amount'); await q.snap(d, 'kds-unpaid-checkout-visible'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
