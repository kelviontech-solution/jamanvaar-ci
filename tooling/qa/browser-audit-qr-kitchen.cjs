const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); await posNav(p, 'Live Orders');
 const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
 let row;
 await q.test(p, 'QR guest order reaches cashier once and UI accept preserves authoritative GST18 amount', async () => {
   await q.expect(p.getByTestId('qr-inbox')).toBeVisible({ timeout: 15000 });
   const before = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken);
   row = before.orders.find(o => o.publicOrderId === q.state.qaQrOrder.publicOrderId); q.expect(row).toBeTruthy(); q.expect(row.totalAmount).toBe(11800);
   const inbox = p.getByTestId('qr-inbox'); await q.expect(inbox).toContainText('QA GST18 Pizza');
   await inbox.getByRole('button', { name: 'Accept', exact: true }).first().dblclick();
   await q.expect(async () => {
     const after = await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken); const match = after.orders.filter(o => o.externalOrderId === row.externalOrderId);
     q.expect(match).toHaveLength(1); q.expect(match[0].status).toBe('PREPARING'); q.expect(match[0].totalAmount).toBe(11800); row = match[0];
   }).toPass({ timeout: 15000 }); return { orderId: row.externalOrderId, totalAmount: 11800, taxAmount: row.taxAmount, copies: 1 };
 });
 if (row) await q.test(d, 'Accepted QR GST18 order projects one kitchen ticket with exact dish', async () => {
   const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + row.meta.tokenNumber, { exact: true }) });
   await q.expect(ticket).toHaveCount(1, { timeout: 15000 }); await q.expect(ticket).toContainText('QA GST18 Pizza');
   await ticket.getByRole('button', { name: /all dishes ready/i }).click(); return { ticketCopies: 1, dish: 'QA GST18 Pizza', sourceOrderId: row.externalOrderId };
 }); await q.snap(d, 'qr-order-kitchen-ticket'); await p._audit.ctx.close(); await d._audit.ctx.close();
 const g = await q.open('qr', 'qr-customer', { width: 390, height: 844 }); await g.goto(q.state.qaQr.url);
 await q.test(g, 'Guest status eventually shows kitchen READY for same QR order', async () => {
   await q.expect(g.getByText('Ready', { exact: true }).first()).toBeVisible({ timeout: 15000 });
   const response = await g.request.get('http://localhost:4010/api/v1/public/qr/orders/' + q.state.qaQrOrder.publicOrderId); q.expect(response.status()).toBe(200); const body = await response.json(); q.expect(body.status).toBe('READY'); q.expect(body.total).toBe(118);
   return { orderId: body.publicOrderId, status: body.status, total: body.total };
 }); await q.snap(g, 'qr-guest-kitchen-ready'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
