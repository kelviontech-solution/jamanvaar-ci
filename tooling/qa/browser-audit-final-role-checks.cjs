const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); await posNav(p, 'Shift & Cash');
 await q.test(p, 'Cashier closes QA zero-float shift with counted INR314 and zero variance', async () => {
   await p.getByRole('button', { name: 'Close Shift', exact: true }).click();
   await p.locator('form input[placeholder="0"]').last().fill('314');
   await q.expect(p.getByText('✓ MATCHED (₹0)', { exact: true })).toBeVisible();
   await p.getByRole('button', { name: 'Finalize & Close Shift', exact: true }).click();
   await q.expect(async () => {
     const r = await q.mustApi('GET', '/api/v1/entity-sync/SHIFT', undefined, q.state.posActivation.deviceToken); const row = r.entities.find(e => e.externalId === q.state.qaShiftId);
     q.expect(row.payload.status).toBe('CLOSED'); q.expect(row.payload.cashVariance).toBe(0); q.expect(row.payload.actualCash).toBe(314);
   }).toPass({ timeout: 15000 }); return { closed: true, actual: 314, variance: 0 };
 }); await q.snap(p, 'pos-qa-shift-closed'); await p._audit.ctx.close();
 const a = await q.open('admin');
 await q.test(a, 'Corrected owner shift field verifies zero float cash ledger and closed variance', async () => {
   const r = await q.mustApi('GET', '/api/v1/entity-sync/SHIFT', undefined, q.state.adminActivation.deviceToken); const row = r.entities.find(e => e.externalId === q.state.qaShiftId);
   q.expect(row.payload.openingCash).toBe(0); q.expect(row.payload.totalCashSales).toBe(314); q.expect(row.payload.expectedCash).toBe(314); q.expect(row.payload.status).toBe('CLOSED');
   await a.getByRole('button', { name: 'Shift & Cash Drawer', exact: true }).click(); await q.expect(a.getByText('QA Cashier', { exact: true }).first()).toBeVisible();
   return { openingFloat: 0, totalCashSales: 314, expectedCash: 314, status: 'CLOSED' };
 });
 await a.getByRole('button', { name: 'Purchasing & Stock Control', exact: true }).click(); await a.getByRole('tab', { name: 'Stock count', exact: true }).click();
 await q.test(a, 'Corrected stock count confirms saved eighteen kg and negative one cloud adjustment', async () => {
   await q.expect(a.getByRole('row').filter({ hasText: 'QA Cheese' })).toContainText('18 kg');
   const r = await q.mustApi('GET', '/api/v1/inventory/movements?afterSeq=0', undefined, q.state.adminActivation.deviceToken);
   q.expect(r.movements.some(m => m.itemName === 'QA Cheese' && m.quantityDelta === -1)).toBe(true); return { stock: 18, cloudAdjustment: -1 };
 }); await q.snap(a, 'stock-count-corrected-saved-quantity'); await a._audit.ctx.close();
 const s = await q.open('super');
 const owners = await q.mustApi('GET', '/api/v1/owners'); const owner = owners.find(o => o.restaurantId === q.state.restaurantA.id);
 await q.test(s, 'Super Admin owner detail renders real restaurant owner and dashboard aliases recover', async () => {
   await s.goto('http://localhost:5180/owners/' + owner.id); await q.expect(s.getByText('QA Owner A', { exact: true }).first()).toBeVisible(); await q.snap(s, 'super-owner-a-detail');
   q.append('page-coverage.jsonl', { app: 'super', route: '/owners/:id', actual: '/owners/' + owner.id, result: 'RENDERED', resolvedOriginalFixtureBlock: true });
   for (const route of ['/dashboard', '/qa-nonexistent-route']) { await s.goto('http://localhost:5180' + route); await q.expect(s.getByRole('heading', { name: 'Platform Control Center', exact: true })).toBeVisible(); }
   return { ownerDetail: true, dashboardAlias: true, unknownRouteRecovery: true };
 }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
