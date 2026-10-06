const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
 const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept());
 await posNav(p, 'Shift & Cash');
 await q.test(p, 'Cashier opens QA shift with zero float and backend records actual zero', async () => {
   await p.getByRole('button', { name: '+ Open New Shift', exact: true }).click();
   await p.locator('form input[type=number]').fill('0');
   await p.getByPlaceholder('e.g. Starting drawer for morning shift').fill('QA zero float audit');
   await p.getByRole('button', { name: 'Start Shift', exact: true }).click(); await p.waitForTimeout(1400);
   let row;
   await q.expect(async () => {
     const records = await q.mustApi('GET', '/api/v1/entity-sync/SHIFT', undefined, q.state.posActivation.deviceToken);
     row = records.entities.find(e => e.payload.notes === 'QA zero float audit' || e.payload.openingNotes === 'QA zero float audit');
     if (!row) row = records.entities.find(e => e.payload.status === 'OPEN'); q.expect(row).toBeTruthy(); q.expect(row.payload.openingCash).toBe(0);
   }).toPass({ timeout: 15000 }); q.state.qaShiftId = row.externalId; q.saveState(); return { id: row.externalId, openingCash: 0 };
 });
 await posNav(p, 'Billing / Menu'); await p.getByTitle('Start fresh order').click(); await p.getByRole('button', { name: 'Quick Takeaway', exact: true }).click(); await p.getByText('QA Pizza 01', { exact: true }).first().click();
 await p.getByRole('button', { name: /Instant Bill/ }).first().click();
 const a = await q.open('admin');
 if (!await a.getByRole('button', { name: 'Shift & Cash Drawer', exact: true }).count()) {
   await a.getByRole('button', { name: 'Logout', exact: true }).click();
   await a.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode); await a.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword); await a.locator('button[type=submit]').click();
   await q.expect(a.getByRole('button', { name: 'Shift & Cash Drawer', exact: true })).toBeVisible({ timeout: 15000 });
 }
 await a.getByRole('button', { name: 'Shift & Cash Drawer', exact: true }).click();
 await q.test(a, 'Owner receives actual cashier zero float and cash INR314 shift ledger', async () => {
   await q.expect(async () => {
     const rows = await q.mustApi('GET', '/api/v1/entity-sync/SHIFT', undefined, q.state.adminActivation.deviceToken);
     const row = rows.entities.find(e => e.externalId === q.state.qaShiftId); q.expect(row.payload.openingCash).toBe(0); q.expect(row.payload.cashSales).toBe(314); q.expect(row.payload.expectedCash).toBe(314);
   }).toPass({ timeout: 15000 }); await q.expect(a.getByText(/QA Cashier/).first()).toBeVisible(); return { openingCash: 0, cashSales: 314, expectedCash: 314 };
 }); await q.snap(a, 'owner-actual-shift-ledger'); await a._audit.ctx.close();
 await posNav(p, 'Shift & Cash');
 await q.snap(p, 'pos-shift-before-close'); console.log('SHIFT BUTTONS', (await p.getByRole('button').allTextContents()).slice(-18));
 await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
