const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function paymentRow(id) {
  const db = new PrismaClient({ datasources: { db: { url: q.state.databaseUrl } } });
  try { return await db.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL app.is_platform_context='true'"); return tx.paymentTransaction.findUnique({ where: { id }, include: { order: true } }); }); }
  finally { await db.$disconnect(); }
}
async function webhook(row, eventId, amount = row.amount, badSignature = false) {
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `qa_pay_${row.id}`, amount, currency: 'INR', status: 'captured', notes: { payment_ref: row.providerOrderId } } } } });
  const signature = badSignature ? 'bad-signature' : crypto.createHmac('sha256', q.state.jwtSecret).update(payload).digest('hex');
  const res = await fetch(`http://localhost:4010/api/v1/payments/razorpay/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId }, body: payload });
  return { status: res.status, body: await res.json() };
}
async function main() {
  if (!q.state.simulatedGateway) throw Error('This stage requires explicitly simulated gateway');
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  const k = await q.open('kiosk');
  await k.getByRole('button', { name: 'Start Order', exact: true }).click();
  await k.getByRole('button', { name: /English/ }).click();
  await k.getByRole('button', { name: /Takeaway/i }).click();
  await k.getByRole('button', { name: 'Add QA Pizza 01 to cart', exact: true }).click();
  const creation = k.waitForResponse(r => r.url().endsWith('/api/v1/payments/orders') && r.request().method() === 'POST');
  await k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click();
  const res = await creation; q.expect(res.status()).toBe(201);
  const body = await res.json(); const request = res.request().postDataJSON();
  q.state.kioskPayment = { ...body, externalOrderId: request.externalOrderId }; q.saveState();
  let row = await paymentRow(body.paymentId);
  await q.test(k, 'Kiosk displayed payable matches authoritative payment amount', async () => {
    await q.expect(k.getByText(`Total Payable: ₹${body.amount / 100}`, { exact: true })).toBeVisible();
    return { paymentId: body.paymentId, authoritativePaise: body.amount };
  });
  await q.snap(k, 'kiosk-ui-vs-payment-amount');
  await q.test(k, 'SIMULATED invalid webhook signature rejected; payment remains pending', async () => {
    const response = await webhook(row, `qa-invalid-${row.id}`, row.amount, true);
    q.expect(response.status).toBe(200); // Invalid deliveries are acknowledged but never settle money.
    q.expect((await paymentRow(row.id)).status).toBe('PENDING');
    return { status: response.status, amountPaise: row.amount, paymentStatus: 'PENDING' };
  });
  await q.test(k, 'SIMULATED signed amount manipulation cannot mark payment paid', async () => {
    const response = await webhook(row, `qa-wrong-amount-${row.id}`, row.amount - 1);
    q.expect(response.status).toBe(200);
    q.expect((await paymentRow(row.id)).status).toBe('PENDING');
    return { providerAck: response.status, alteredAmountRejected: true };
  });
  let paidAt = 0;
  await q.test(k, 'SIMULATED valid payment and duplicate webhook produce one paid transaction with 3% fee', async () => {
    paidAt = performance.now();
    const first = await webhook(row, `qa-success-${row.id}`);
    const second = await webhook(row, `qa-success-${row.id}`);
    q.expect(first.status).toBe(200); q.expect(second.status).toBe(200);
    row = await paymentRow(row.id);
    q.expect(row.status).toBe('SUCCESS'); q.expect(row.commissionBps).toBe(300);
    q.expect(row.platformAmount).toBe(Math.round(row.amount * 0.03));
    q.expect(row.restaurantAmount).toBe(row.amount - row.platformAmount);
    q.expect(row.order.status).toBe('PAID');
    return { paymentId: row.id, amount: row.amount, fee: row.platformAmount, net: row.restaurantAmount, commissionBps: row.commissionBps, provider: 'simulated', duplicateAcknowledged: true };
  });
  await q.test(k, 'SIMULATED kiosk receives paid status, shows confirmation and emits one KOT', async () => {
    await q.expect(k.getByText(/Order Confirmed|Order Placed|Order Successful|Thank you|confirmed/i).first()).toBeVisible({ timeout: 20000 });
    await q.expect(async () => {
      const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kioskActivation.deviceToken);
      const match = cloud.orders.filter(o => o.externalOrderId === q.state.kioskPayment.externalOrderId);
      q.expect(match.length).toBe(1);
      q.state.kioskSyncedOrder = match[0];
    }).toPass({ timeout: 20000 });
    q.saveState();
    return { orderId: q.state.kioskSyncedOrder.externalOrderId, paymentStatus: q.state.kioskSyncedOrder.paymentStatus, elapsedFromWebhookMs: +(performance.now() - paidAt).toFixed(2), paymentAmountPaise: row.amount, syncedAmountPaise: q.state.kioskSyncedOrder.totalAmount };
  });
  await q.test(d, 'SIMULATED paid kiosk item reaches KDS and matches backend order ID', async () => {
    await q.expect(d.getByText('#' + q.state.kioskSyncedOrder.meta.tokenNumber, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    const cloud = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.kdsActivation.deviceToken);
    q.expect(cloud.orders.some(o => o.externalOrderId === q.state.kioskPayment.externalOrderId)).toBe(true);
    return { orderId: q.state.kioskPayment.externalOrderId, elapsedFromWebhookMs: +(performance.now() - paidAt).toFixed(2) };
  });
  await q.test(k, 'SIMULATED synced kiosk order financial total matches gateway payment', async () => {
    q.expect(q.state.kioskSyncedOrder.totalAmount).toBe(row.amount);
    return { paymentAmountPaise: row.amount, syncedAmountPaise: q.state.kioskSyncedOrder.totalAmount };
  });
  await q.test(k, 'SIMULATED kiosk receipt tax components reconcile with authoritative tax', async () => {
    q.expect(q.state.kioskSyncedOrder.meta.cgstPaise + q.state.kioskSyncedOrder.meta.sgstPaise).toBe(row.order.taxAmount);
    return { orderTaxPaise: row.order.taxAmount, receiptCgstPaise: q.state.kioskSyncedOrder.meta.cgstPaise, receiptSgstPaise: q.state.kioskSyncedOrder.meta.sgstPaise };
  });
  await q.snap(k, 'kiosk-simulated-paid-confirmation'); await q.snap(d, 'kds-kiosk-paid-ticket');
  console.log('Confirmation buttons', (await k.getByRole('button').allTextContents()).slice(-15));
  await q.close();
}
if (require.main === module) main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
module.exports = { paymentRow, webhook };
