const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { paymentRow } = require('./browser-audit-kiosk-payment.cjs');
async function main() {
 if (!q.state.simulatedGateway) throw Error('Simulated provider required for QA refund security test');
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
 await q.test(p, 'Security: server rejects cashier refund without manager authorization', async () => {
   const result = await p.evaluate(async paymentId => {
     const m = await import('/src/cloud/cloudClient.ts');
     try { return { allowed: true, result: await m.createRefund(paymentId, 1, 'QA simulated RBAC denial probe - one paise', 'QA Cashier') }; }
     catch (e) { return { allowed: false, status: e.status, message: e.message }; }
   }, q.state.kioskPayment.paymentId);
   q.append('data-consistency.jsonl', { feature: 'cashier-refund-without-manager', result, provider: 'SIMULATED', actualStaffRole: 'CASHIER' });
   const row = await paymentRow(q.state.kioskPayment.paymentId);
   q.append('data-consistency.jsonl', { feature: 'payment-after-rbac-probe', id: row.id, status: row.status, commissionBps: row.commissionBps, amount: row.amount, fee: row.platformAmount, net: row.restaurantAmount });
   q.expect(result.allowed).toBe(false); q.expect([401, 403]).toContain(result.status);
   return { denied: true, status: result.status };
 }); await q.snap(p, 'cashier-refund-api-permission-probe'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
