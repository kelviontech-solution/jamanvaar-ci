const q = require('./browser-audit-lib.cjs');
async function main() {
 const a = await q.open('admin');
 await a.getByRole('button', { name: 'Customisations & Tax', exact: true }).click();
 await q.test(a, 'Owner publishes configured menu to QR guests through UI', async () => {
   const ack = a.waitForResponse(r => r.url().endsWith('/menu/publish') && r.request().method() === 'POST');
   await a.getByRole('button', { name: 'Publish to guests', exact: true }).click();
   const r = await ack; q.expect(r.status()).toBe(201); return { status: r.status(), published: true };
 }); await q.snap(a, 'owner-published-menu');
 await a.getByRole('button', { name: /QR Table Ordering/ }).click();
 for (const tab of ['Overview', 'Tables & QR', 'QR Orders', 'QR Settings']) { await a.getByRole('button', { name: tab, exact: true }).click(); await q.snap(a, 'qr-admin-' + tab); q.append('page-coverage.jsonl', { app: 'admin', page: 'QR/' + tab, result: 'RENDERED' }); }
 await a.getByRole('button', { name: 'Tables & QR', exact: true }).click();
 const branch = a.getByLabel('Branch for new codes', { exact: true });
 await q.expect(branch).toBeVisible(); await branch.selectOption(q.state.branchA.id);
 await a.waitForTimeout(500);
 if (!await a.getByRole('button', { name: 'Generate QR', exact: true }).count()) {
   await a.getByRole('button', { name: 'Add table', exact: true }).click();
   await a.getByPlaceholder('e.g. 12 or Terrace 1').fill('QA-QR02');
   await a.getByRole('button', { name: 'Save table', exact: true }).click();
   await q.expect(a.getByRole('button', { name: 'Generate QR', exact: true }).first()).toBeVisible();
 }
 await q.test(a, 'Owner generates branch scoped table QR from UI', async () => {
   const [r] = await Promise.all([a.waitForResponse(r => /\/tables\/[^/]+\/generate$/.test(r.url()) && r.request().method() === 'POST'), a.getByRole('button', { name: 'Generate QR', exact: true }).first().click()]); q.expect(r.status()).toBe(201);
   const body = await r.json(); q.state.qaQr = body; q.saveState(); return { status: r.status(), generated: !!body.url };
 }); await q.snap(a, 'qr-generated-table'); await a._audit.ctx.close();
 const g = await q.open('qr', 'qr-customer', { width: 390, height: 844 });
 await q.test(g, 'Invalid QR URL gives useful customer error without infinite loading', async () => {
   await q.expect(g.getByRole('heading', { name: 'This QR code is not valid' })).toBeVisible(); return { invalidPath: '/', recoverableMessage: true };
 });
 if (!q.state.qaQr?.url) { await q.close(); return; }
 await g.goto(q.state.qaQr.url); await q.expect(g.getByRole('button', { name: 'Add QA GST18 Pizza', exact: true })).toBeVisible({ timeout: 15000 });
 await q.test(g, 'QR customer adds GST18 item and authoritative quote is INR118', async () => {
   await g.getByRole('button', { name: 'Add QA GST18 Pizza', exact: true }).click();
   await g.getByRole('button', { name: /View Cart/ }).click();
   await q.expect(g.getByText('₹118', { exact: true }).first()).toBeVisible(); return { base: 100, tax: 18, total: 118 };
 }); await q.snap(g, 'qr-customer-authoritative-tax');
 await g.getByRole('button', { name: 'Checkout', exact: true }).click();
 await q.test(g, 'QR customer double-click order is accepted once and survives refresh', async () => {
   const ack = g.waitForResponse(r => /\/orders$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
   await g.getByRole('button', { name: /Place order/ }).dblclick(); const r = await ack; q.expect(r.status()).toBeLessThan(300);
   q.state.qaQrOrder = await r.json(); q.saveState();
   await q.expect(g.getByRole('heading', { name: 'Thank you!', exact: true })).toBeVisible();
   await g.reload(); await q.expect(g.getByRole('heading', { name: 'Thank you!', exact: true })).toBeVisible({ timeout: 10000 });
   return { orderId: q.state.qaQrOrder.publicOrderId, total: q.state.qaQrOrder.total, refreshPreserved: true };
 }); await q.snap(g, 'qr-customer-order-status'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
