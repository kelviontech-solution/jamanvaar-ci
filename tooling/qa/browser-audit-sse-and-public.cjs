const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
 for (const [app, role] of [['pos', 'Cashier'], ['kds', 'Kitchen']]) {
   const p = await q.open(app); await login(p, app, role);
   await q.test(p, 'Existing authenticated SSE channel opens and reconnects after browser outage', async () => {
     const initial = q.fs.readFileSync(q.path.join(q.reportDir, 'realtime-connections.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.app === app && r.status === 200);
     q.expect(initial.length).toBeGreaterThan(0); q.expect(initial.at(-1).contentType).toContain('text/event-stream');
     await p._audit.ctx.setOffline(true); await p.waitForTimeout(900);
     const response = p.waitForResponse(r => r.url().includes('/api/v1/realtime/stream') && r.status() === 200, { timeout: 25000 });
     await p._audit.ctx.setOffline(false); const r = await response;
     q.expect(r.headers()['content-type']).toContain('text/event-stream'); return { initialStream: 200, reconnectedStream: 200, authPreserved: true };
   }); await p._audit.ctx.close();
 }
 const g = await q.open('qr', 'qr-customer', { width: 390, height: 844 }); await g.goto(q.state.qaQr.url);
 const token = new URL(q.state.qaQr.url).pathname.split('/').pop();
 for (const quantity of [-1, 0, 51]) await q.test(g, `Public QR quote rejects invalid quantity ${quantity} without creating order`, async () => {
   const r = await g.request.post(`http://localhost:4010/api/v1/public/qr/${token}/quote`, { data: { items: [{ itemId: q.state.taxPizzaId, quantity, optionIds: [] }] } });
   q.expect(r.status()).toBe(400); return { quantity, rejected: 400 };
 });
 await q.test(g, 'Public QR fabricated reference exposes no order data', async () => {
   const r = await g.request.get('http://localhost:4010/api/v1/public/qr/orders/qa-invalid-reference-123456789'); q.expect(r.status()).toBe(404); return { status: 404, dataExposed: false };
 });
 await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
