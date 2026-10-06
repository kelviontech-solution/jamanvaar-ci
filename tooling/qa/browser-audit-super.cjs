const q = require('./browser-audit-lib.cjs');
async function main() {
  const p = await q.open('super');
  if (await p.getByRole('button', { name: 'Logout', exact: true }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Logout', exact: true }).click();
  await q.snap(p, 'super-before-login');
  await q.test(p, 'Invalid credentials rejected in browser', async () => {
    await p.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(q.state.platformEmail);
    await p.getByPlaceholder('Enter your password').fill('invalid-audit-password');
    const response = p.waitForResponse(r => r.url().endsWith('/platform-auth/login') && r.request().method() === 'POST');
    await p.locator('button[type=submit]').click();
    q.expect((await response).status()).toBe(401);
    await q.expect(p.getByText('Invalid email or password', { exact: true })).toBeVisible();
    return { endpoint: '/api/v1/platform-auth/login', status: 401, protectedDashboard: false };
  });
  await q.test(p, 'Platform owner credential + actual OTP login', async () => {
    await p.getByPlaceholder('Enter your password').fill(q.state.platformPassword);
    await p.locator('button[type=submit]').click();
    await p.getByPlaceholder('123456').waitFor();
    const mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')));
    await p.getByPlaceholder('123456').fill(mail[q.state.platformEmail].otp);
    const response = p.waitForResponse(r => r.url().endsWith('/platform-auth/verify-otp'));
    await p.locator('button[type=submit]').click();
    const res = await response;
    q.expect(res.status()).toBe(200);
    q.state.platformToken = (await res.json()).accessToken; q.saveState();
    await p.waitForURL('http://localhost:5180/');
    await q.expect(p.getByText('Total Restaurants', { exact: true }).first()).toBeVisible();
    return { endpoint: '/api/v1/platform-auth/verify-otp', status: 200, delivery: 'Local captured email; SMTP delivery not tested' };
  });
  await p.goto('http://localhost:5180/restaurants');
  await p.waitForTimeout(800);
  await q.snap(p, 'super-restaurants-empty');
  for (const suffix of ['A', 'B']) {
    await q.test(p, `Quick-create QA restaurant ${suffix}, persist owner, trial and initial key`, async () => {
      await p.getByRole('button', { name: /Quick create/i }).click();
      await p.getByPlaceholder('e.g. Havmor Restaurant').fill(`QA-Restaurant-${suffix}-${q.state.stamp}`);
      await p.getByPlaceholder('10-digit mobile, e.g. 9876543210').fill(suffix === 'A' ? '9891000001' : '9891000002');
      await p.getByPlaceholder('e.g. Ramesh Patel').fill(`QA Owner ${suffix}`);
      await p.getByPlaceholder('owner@restaurant.com').fill(`qa-owner-${suffix.toLowerCase()}@example.invalid`);
      await p.locator('.modal input[type=password]').fill(q.state.ownerPassword);
      const response = p.waitForResponse(r => r.url().endsWith('/api/v1/restaurants') && r.request().method() === 'POST');
      await p.getByRole('button', { name: 'Create & Activate Restaurant', exact: true }).click();
      const res = await response;
      q.expect(res.status()).toBe(201);
      const created = (await res.json()).restaurant;
      q.state[`restaurant${suffix}`] = created; q.saveState();
      await p.getByRole('button', { name: 'View Restaurant Workspace', exact: true }).waitFor();
      const detail = await q.mustApi('GET', `/api/v1/restaurants/${created.id}`);
      q.expect(detail.subscriptions.length).toBeGreaterThan(0);
      await p.getByRole('button', { name: 'View Restaurant Workspace', exact: true }).click();
      return { restaurantId: created.id, restaurantCode: created.restaurantCode, subscriptions: detail.subscriptions.map(s => ({ status: s.status, planId: s.planId })) };
    });
    if (await p.getByRole('button', { name: 'Close', exact: true }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Close', exact: true }).click();
    await p.goto('http://localhost:5180/restaurants');
  }
  await q.snap(p, 'super-restaurants-populated');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
