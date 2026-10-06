const q = require('./browser-audit-lib.cjs');
async function main() {
 const c = await q.open('captain', 'captain', { width: 390, height: 844 });
 await q.test(c, 'Corrected cashier PIN denial accepts generic privacy preserving error', async () => {
   await c.locator('input[type=password]').fill(q.state.staff.Cashier.pin);
   await c.getByRole('button', { name: 'Unlock Captain Terminal', exact: true }).click();
   await q.expect(c.getByText('Invalid staff PIN code. Please enter your authorized 4-digit PIN.', { exact: true })).toBeVisible();
   await q.expect(c.locator('input[type=password]')).toBeVisible(); return { cashierAccepted: false, noProtectedFloorAccess: true };
 }); await c._audit.ctx.close();
 const s = await q.open('super');
 await q.test(s, 'Corrected FAULT SIMULATION restaurant API503 shows error and Retry recovers', async () => {
   let injected = 0;
   const pattern = '**/api/v1/restaurants';
   await s.route(pattern, route => { injected++; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA simulated temporary outage' }) }); });
   await s.goto('http://localhost:5180/restaurants');
   await q.expect(s.getByText('QA simulated temporary outage', { exact: true })).toBeVisible(); q.expect(injected).toBeGreaterThan(0);
   await q.snap(s, 'super-api503-corrected'); await s.unroute(pattern);
   await s.getByRole('button', { name: 'Retry', exact: true }).click();
   await q.expect(s.getByText(q.state.restaurantA.name, { exact: true }).first()).toBeVisible(); return { injected503: injected, recovered: true };
 }); await s._audit.ctx.close();
 const a = await q.open('adminprod');
 if (!await a.getByRole('button', { name: 'Inventory & Recipes', exact: true }).count()) {
   await a.getByRole('button', { name: 'Logout', exact: true }).click();
   await a.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode); await a.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
   await a.locator('button[type=submit]').click(); await q.expect(a.getByRole('button', { name: 'Inventory & Recipes', exact: true })).toBeVisible({ timeout: 15000 });
 }
 await a.getByRole('button', { name: 'Inventory & Recipes', exact: true }).click();
 await q.test(a, 'Second Restaurant Admin receives stock definition created on first device', async () => {
   await q.expect(a.getByText('QA Cheese', { exact: true }).first()).toBeVisible({ timeout: 15000 }); return { definitionSynced: true };
 }); await q.snap(a, 'second-admin-stock-definition-missing'); await a._audit.ctx.close();
 const first = await q.open('admin');
 await first.getByRole('button', { name: 'Purchasing & Stock Control', exact: true }).click(); await first.getByRole('tab', { name: 'Stock count', exact: true }).click();
 await q.test(first, 'Corrected stock count check reads saved quantity and cloud adjustment rather than cleared input', async () => {
   const row = first.getByRole('row').filter({ hasText: 'QA Cheese' }); await q.expect(row).toContainText('18 kg');
   const result = await q.mustApi('GET', '/api/v1/inventory/movements?afterSeq=0', undefined, q.state.adminActivation.deviceToken);
   q.expect(result.movements.some(m => m.itemName === 'QA Cheese' && m.quantityDelta === -1)).toBe(true); return { savedQuantity: 18, persistedAdjustment: -1 };
 }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
