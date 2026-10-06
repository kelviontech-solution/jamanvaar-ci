const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
const { paymentRow, webhook } = require('./browser-audit-kiosk-payment.cjs');

async function owner(p, restaurant = q.state.restaurantA) {
  const recovery = p.getByRole('button', { name: 'Sign in again', exact: true });
  if (await recovery.isVisible().catch(() => false)) await recovery.click();
  if (await p.getByPlaceholder('e.g. JM9876543210').isVisible().catch(() => false)) {
    await p.getByPlaceholder('e.g. JM9876543210').fill(restaurant.restaurantCode);
    await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    const response = p.waitForResponse(r => r.url().endsWith('/tenant-auth/login-owner') && r.request().method() === 'POST');
    await p.locator('button[type=submit]').click(); q.expect((await response).status()).toBe(200);
  }
  await q.expect(p.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible({ timeout: 20000 });
}
async function cloudOrders() { return (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders; }
async function fresh(p) {
  await posNav(p, 'Billing');
  await p.getByTitle('Start fresh order', { exact: true }).click();
  await p.getByRole('button', { name: 'Quick Takeaway', exact: true }).click();
}
async function main() {
  if (!q.state.simulatedGateway) throw Error('Payment regressions require the isolated simulated gateway');
  const a = await q.open('admin'); await owner(a);
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept());
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
  const k = await q.open('kiosk');
  await q.test(a, 'B001: idle admin makes bounded fleet requests', async () => {
    await q.expect(a.getByRole('button', { name: 'Kiosk Terminals', exact: true })).toBeVisible();
    const fleet = []; const observe = r => { if (r.url().includes('/api/v1/devices/me/fleet')) fleet.push({ at: new Date().toISOString(), status: r.status() }); };
    a.on('response', observe); await a.waitForTimeout(10000); a.off('response', observe);
    q.expect(fleet.length).toBeLessThanOrEqual(2); return { durationMs: 10000, calls: fleet.length, fleet };
  });
  await q.test(p, 'B002: cashier uses configured GST18 and zero tax consistently', async () => {
    await fresh(p); await p.getByText('QA GST18 Pizza', { exact: true }).first().click();
    await q.expect(p.getByRole('button', { name: /^PAY.*118/ })).toBeVisible();
    await q.snap(p, 'gst18-pos-cart-fixed'); await fresh(p); await p.getByText('QA Pizza 01', { exact: true }).first().click();
    await q.expect(p.getByRole('button', { name: /^PAY.*299/ })).toBeVisible(); return { gst18: 118, untaxed: 299 };
  });
  await q.test(p, 'B004: SEND KOT then Instant Bill settles one backend order with one kitchen identity', async () => {
    await fresh(p); const before = new Set((await cloudOrders()).map(o => o.externalOrderId));
    await p.getByText('QA GST18 Pizza', { exact: true }).first().click();
    await p.getByRole('button', { name: 'SEND KOT', exact: true }).click();
    let sent; await q.expect(async () => { sent = (await cloudOrders()).filter(o => !before.has(o.externalOrderId)); q.expect(sent).toHaveLength(1); }).toPass({ timeout: 15000 });
    const id = sent[0].externalOrderId; await p.getByRole('button', { name: /Instant Bill/i }).first().click();
    let created;
    await q.expect(async () => { created = (await cloudOrders()).filter(o => !before.has(o.externalOrderId)); q.expect(created).toHaveLength(1); q.expect(created[0].paymentStatus).toBe('SUCCESS'); }).toPass({ timeout: 20000 });
    q.expect(created[0].externalOrderId).toBe(id); q.expect(created[0].totalAmount).toBe(11800);
    const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + created[0].meta.tokenNumber, { exact: true }) });
    await q.expect(ticket).toHaveCount(1, { timeout: 15000 });
    return { orderId: id, copies: created.length, kdsCopies: await ticket.count(), amountPaise: 11800 };
  });
  await k.getByRole('button', { name: 'Start Order', exact: true }).click(); await k.getByRole('button', { name: /English/ }).click(); await k.getByRole('button', { name: /Takeaway/i }).click();
  await k.getByRole('button', { name: 'Add QA GST18 Pizza to cart', exact: true }).click();
  const creation = k.waitForResponse(r => r.url().endsWith('/payments/orders') && r.request().method() === 'POST');
  await k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click();
  const response = await creation; q.expect(response.status()).toBe(201); const payment = await response.json(); const orderId = response.request().postDataJSON().externalOrderId;
  await q.test(k, 'B002: kiosk displayed payable and complete quote agree with gateway amount', async () => {
    q.expect(payment.amount).toBe(11800); q.expect(payment.quote.subtotal).toBe(10000); q.expect(payment.quote.taxAmount).toBe(1800);
    await q.expect(k.getByText('Total Payable: ₹118', { exact: true })).toBeVisible();
    return { amountPaise: payment.amount, subtotalPaise: payment.quote.subtotal, taxPaise: payment.quote.taxAmount };
  });
  await q.test(d, 'B006: unpaid online kiosk checkout creates no actionable kitchen ticket', async () => {
    let pending; await q.expect(async () => { pending = (await cloudOrders()).find(o => o.externalOrderId === orderId); q.expect(pending?.status).toBe('DRAFT'); }).toPass({ timeout: 15000 });
    await d.waitForTimeout(5000); q.expect(pending.paymentStatus).toBe('PENDING');
    q.expect(await d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + pending.meta.tokenNumber, { exact: true }) }).count()).toBe(0);
    return { orderId, status: pending.status, unpaidTicketCopies: 0 };
  });
  let captured;
  await q.test(k, 'B003: simulated paid kiosk order remains active and reaches KDS exactly once', async () => {
    const row = await paymentRow(payment.paymentId); const at = performance.now();
    q.expect((await webhook(row, `fix-capture-${row.id}`)).status).toBe(200);
    q.expect((await webhook(row, `fix-capture-${row.id}`)).status).toBe(200);
    await q.expect(k.getByText(/Order Confirmed|Order Placed|Order Successful|Thank you|confirmed/i).first()).toBeVisible({ timeout: 20000 });
    await q.expect(async () => { captured = (await cloudOrders()).find(o => o.externalOrderId === orderId); q.expect(captured?.paymentStatus).toBe('SUCCESS'); q.expect(captured?.status).not.toBe('COMPLETED'); }).toPass({ timeout: 20000 });
    const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + captured.meta.tokenNumber, { exact: true }) });
    await q.expect(ticket).toHaveCount(1, { timeout: 20000 }); await q.expect(ticket.getByText('QA GST18 Pizza', { exact: true })).toBeVisible();
    const paid = await paymentRow(payment.paymentId); q.expect(paid.amount).toBe(11800); q.expect(paid.platformAmount).toBe(354); q.expect(paid.restaurantAmount).toBe(11446);
    q.expect(captured.subtotal + captured.taxAmount - captured.discountAmount).toBe(captured.totalAmount);
    return { orderId, kitchenVisibleMs: +(performance.now() - at).toFixed(2), copies: 1, paymentPaise: paid.amount, feePaise: paid.platformAmount, netPaise: paid.restaurantAmount };
  });
  await q.test(d, 'Paid kiosk kitchen Ready persists and returns to cashier without refresh', async () => {
    q.expect(captured).toBeTruthy(); const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + captured.meta.tokenNumber, { exact: true }) });
    await ticket.getByRole('button', { name: /all dishes ready/i }).click();
    await q.expect(async () => { q.expect((await cloudOrders()).find(o => o.externalOrderId === orderId).status).toBe('READY'); }).toPass({ timeout: 15000 });
    await posNav(p, 'Live Orders'); await q.expect(p.getByText('#' + captured.meta.orderNumber, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await p.getByText('#' + captured.meta.orderNumber, { exact: true }).first().click();
    await q.expect(p.getByRole('button', { name: 'Mark Served at Table', exact: true })).toBeVisible();
    return { orderId, status: 'READY', amountPaise: 11800 };
  });
  await q.test(k, 'B011: successful confirmation with no printer has no undefined-printer TypeError', async () => {
    const logs = q.fs.existsSync(q.path.join(q.reportDir, 'console.jsonl')) ? q.fs.readFileSync(q.path.join(q.reportDir, 'console.jsonl'), 'utf8') : '';
    q.expect(logs).not.toContain("Cannot read properties of undefined (reading 'name')"); return { noPrinterConfigured: true, typeError: false, physicalPaper: 'not tested' };
  });
  await q.test(p, 'B005: cashier refund is denied; real manager PIN approval permits one idempotent simulated refund', async () => {
    const denied = await p.evaluate(async id => { try { await (await import('/src/cloud/cloudClient.ts')).createRefund(id, 1, 'QA cashier denial', 'Claimed Manager'); return 201; } catch(e) { return e.status; } }, payment.paymentId);
    q.expect(denied).toBe(403);
    const approved = await p.evaluate(async ({ id, pin }) => {
      const cloud = await import('/src/cloud/cloudClient.ts'); const { StaffSession } = await import('/@fs/' + 'C:/Users/OM Sanjhira/OneDrive/Desktop/k2/packages/sync/src/index.ts');
      const ok = await StaffSession.approve(pin, cloud.deviceFetch, { action: 'REFUND', paymentId: id, amountPaise: 1, idempotencyKey: crypto.randomUUID() });
      if (!ok) throw Error('Server did not verify the actual manager PIN');
      const r = await cloud.createRefund(id, 1, 'QA manager approved simulated refund', 'Ignored client name'); return { status: r.status, amount: r.amount };
    }, { id: payment.paymentId, pin: q.state.staff.Manager.pin });
    q.expect(approved.status).toBe('processed'); q.expect(approved.amount).toBe(1); return { cashierDenied: denied, managerApproved: true, refundPaise: 1, provider: 'SIMULATED' };
  });
  const stockName = 'QA Fix Cheese ' + Date.now();
  await a.getByRole('button', { name: 'Inventory & Recipes', exact: true }).click();
  await q.test(a, 'B008/B007: created inventory appears immediately and master persists in cloud', async () => {
    await a.getByRole('button', { name: 'Add Stock Item', exact: true }).click();
    await a.getByPlaceholder('e.g. Fresh Malai Paneer').fill(stockName); await a.getByPlaceholder('e.g. RAW-PAN-01').fill('QAFIX-' + Date.now());
    const inputs = a.locator('form input[type=number]'); for (const [i, value] of ['10','2','3','100'].entries()) await inputs.nth(i).fill(value);
    await a.getByRole('button', { name: 'Create Inventory Item', exact: true }).click(); await q.expect(a.getByText(stockName, { exact: true })).toBeVisible();
    let row; await q.expect(async () => { const r = await q.mustApi('GET', '/api/v1/entity-sync/INVENTORY_ITEM', undefined, q.state.adminActivation.deviceToken); row = r.entities.find(e => e.payload.name === stockName); q.expect(row?.payload.openingStock).toBe(10); }).toPass({ timeout: 15000 });
    return { inventoryId: row.externalId, openingStock: row.payload.openingStock, branchId: row.payload.branchId, immediateVisible: true };
  });
  const second = await q.open('adminprod'); await owner(second);
  await q.test(second, 'B001: production build has no idle fleet request storm', async () => {
    await q.expect(second.getByRole('button', { name: 'Kiosk Terminals', exact: true })).toBeVisible();
    let count = 0; const observe = r => { if (r.url().includes('/devices/me/fleet')) count++; }; second.on('response', observe); await second.waitForTimeout(10000); second.off('response', observe);
    q.expect(count).toBeLessThanOrEqual(2); return { calls: count, durationMs: 10000, productionBuild: true };
  });
  await second.getByRole('button', { name: 'Inventory & Recipes', exact: true }).click();
  await q.test(second, 'B007: second admin reconstructs stock and supplier masters', async () => {
    await q.expect(second.getByText(stockName, { exact: true })).toBeVisible({ timeout: 20000 });
    await q.expect(second.getByText('QA Cheese', { exact: true })).toBeVisible();
    const row = second.getByText('QA Cheese', { exact: true }).locator('xpath=ancestor::tr[1]'); await q.expect(row).toContainText('18 kg');
    await second.getByRole('button', { name: 'Purchasing & Stock Control', exact: true }).click(); await second.getByRole('tab', { name: 'Suppliers', exact: true }).click(); await q.expect(second.getByText('QA Dairy Supplier', { exact: true })).toBeVisible();
    return { stockDefinitionVisible: true, legacyCheeseStock: 18, supplierVisible: true };
  }); await q.snap(second, 'second-admin-stock-fixed'); await second._audit.ctx.close();
  const b = await q.open('admin', 'owner-b'); await owner(b, q.state.restaurantB);
  await q.test(b, 'B009: restaurant with no shift displays no invented float or reconciliation', async () => {
    await b.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await q.expect(b.getByText('No cashier shift', { exact: true })).toBeVisible();
    q.expect(await b.getByText('100% Reconciled', { exact: true }).count()).toBe(0); return { noShift: true, fabricatedFloat: false };
  }); await b._audit.ctx.close();
  await q.test(a, 'B010: cloud 401 presents explicit sign-in recovery and a clean login restores modules', async () => {
    const reject = r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'QA expired cloud session' }) });
    await a.route('**/api/v1/tenant/me/applications', reject); await a.route('**/api/v1/tenant-auth/refresh', reject); await a.reload();
    await q.expect(a.getByRole('alert').filter({ hasText: /session has expired/i })).toBeVisible({ timeout: 20000 });
    await q.snap(a, 'owner-session-expired-recovery-fixed'); await a.unrouteAll(); await owner(a);
    return { expiredSessionVisible: true, ownerModulesRecovered: true };
  });
  await q.snap(k, 'paid-kiosk-confirmation-fixed'); await q.snap(d, 'kiosk-kitchen-ready-fixed');
  await q.close();
}
if (require.main === module) main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
module.exports = { owner, fresh };
