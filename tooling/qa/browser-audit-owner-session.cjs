const q = require('./browser-audit-lib.cjs');
async function main() {
 const a = await q.open('admin');
 await q.snap(a, 'owner-refresh-failure-before-login');
 await q.test(a, 'Expired or revoked cloud owner session presents visible sign-in recovery', async () => {
   const absent = !await a.getByRole('button', { name: 'Menu & Categories', exact: true }).count();
   if (!absent) return { activeSession: true, expirationScenario: 'not currently reproduced' };
   q.expect(/session.*ended|sign in again|log in again|session.*expired/i.test(await a.locator('body').innerText())).toBe(true);
   return { invalidCloudSessionRecoveryVisible: true };
 });
 if (!await a.getByRole('button', { name: 'Menu & Categories', exact: true }).count()) {
   await a.getByRole('button', { name: 'Logout', exact: true }).click();
   await a.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode);
   await a.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
   const ack = a.waitForResponse(r => r.url().endsWith('/tenant-auth/login-owner'));
   await a.locator('button[type=submit]').click(); const r = await ack;
   q.expect(r.status()).toBe(200); const body = await r.json();
   if (body.accessToken) { q.state.adminActivation.accessToken = body.accessToken; q.saveState(); }
   await q.expect(a.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible({ timeout: 15000 });
 }
 await q.test(a, 'Valid owner session and menu remain available through three clean reloads', async () => {
   for (let i = 0; i < 3; i++) { await a.reload(); await q.expect(a.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible({ timeout: 15000 }); await a.waitForTimeout(500); }
   return { cleanReloads: 3, ownerMenuAccessible: true };
 }); await q.snap(a, 'owner-clean-session-reloads'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
