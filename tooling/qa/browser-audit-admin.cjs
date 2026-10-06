const q = require('./browser-audit-lib.cjs');
async function main() {
  const p = await q.open('admin');
  await q.snap(p, 'admin-login');
  await q.test(p, 'Restaurant owner login and branch-bound POS Admin device activation', async () => {
    await p.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode);
    await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    const login = p.waitForResponse(r => r.url().endsWith('/tenant-auth/login-owner'));
    await p.locator('button[type=submit]').click();
    q.expect((await login).status()).toBe(200);
    await p.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(q.state.keysA.POS_ADMIN.code);
    const activation = p.waitForResponse(r => r.url().endsWith('/tenant-auth/activate-device'));
    await p.locator('button[type=submit]').click();
    const res = await activation;
    q.expect(res.status()).toBe(200);
    q.state.adminActivation = await res.json(); q.saveState();
    await p.waitForTimeout(3500);
    return { endpoint: '/api/v1/tenant-auth/activate-device', status: 200, branch: q.state.branchA.id };
  });
  await q.snap(p, 'admin-after-activation');
  console.log('Admin headings', await p.locator('h1,h2').allTextContents());
  console.log('Admin buttons', (await p.getByRole('button').allTextContents()).slice(0, 40));
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
