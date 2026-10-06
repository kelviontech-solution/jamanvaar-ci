// Exercise the actual merged console with a fresh kiosk-only fixture on the isolated QA API.
process.env.JAMANVAAR_QA_REPORT_DIR = 'docs/reports/merged-admin-key-fix-2026-10-06';
const q = require('./browser-audit-lib.cjs');
const crypto = require('node:crypto');
q.ports.admin = 5286; // Dedicated QA Vite instance; the user's admin on 5176 stays untouched.

async function main() {
  const challenge = await q.mustApi('POST', '/api/v1/platform-auth/login', { email: q.state.platformEmail, password: q.state.platformPassword });
  const mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')))[q.state.platformEmail];
  const verified = await q.mustApi('POST', '/api/v1/platform-auth/verify-otp', { otpToken: challenge.otpToken, otp: mail.otp });
  q.state.platformToken = verified.accessToken;
  const stamp = Date.now();
  const created = await q.mustApi('POST', '/api/v1/restaurants', {
    name: `QA Kiosk Only Merged Admin ${stamp}`, ownerName: 'QA Merged Owner', ownerEmail: `qa-merged-${stamp}@example.invalid`,
    mobile: '98' + String(crypto.randomInt(10000000, 100000000)), ownerPassword: q.state.ownerPassword, skipInviteEmail: true
  });
  const restaurant = created.restaurant;
  const plan = await q.mustApi('POST', '/api/v1/plans', {
    name: `QA Kiosk Only Plan ${stamp}`, tier: 'PRO', productFamily: 'KIOSK', priceMonthly: 100000,
    maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
  });
  const subscription = await q.mustApi('POST', '/api/v1/subscriptions', {
    restaurantId: restaurant.id, planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString(), applications: ['KIOSK', 'KIOSK_ADMIN']
  });
  const key = await q.mustApi('POST', '/api/v1/activation-keys', {
    restaurantId: restaurant.id, allowedDeviceType: 'KIOSK_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString()
  });
  q.state.mergedKioskFixture = { restaurant, planId: plan.id, subscriptionId: subscription.id, activationKey: key.code };
  q.saveState();
  const p = await q.open('admin', `merged-kiosk-${stamp}`);
  await q.test(p, 'KIOSK_ADMIN key opens merged Restaurant Admin on a kiosk-only plan without APP_DISABLED', async () => {
    await p.getByPlaceholder('e.g. JM9876543210').fill(restaurant.restaurantCode);
    await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    await p.getByRole('button', { name: 'Sign In to Admin', exact: true }).click();
    await q.expect(p.getByRole('heading', { name: 'Activate Restaurant Admin Console', exact: true })).toBeVisible({ timeout: 20000 });
    await p.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(key.code);
    const response = p.waitForResponse(r => r.url().endsWith('/tenant-auth/activate-device') && r.request().method() === 'POST');
    await p.getByRole('button', { name: 'Activate & Enter Portal', exact: true }).click();
    const activated = await response; q.expect(activated.status()).toBe(200);
    const body = await activated.json();
    q.expect((await q.api('PATCH', '/api/v1/devices/me/heartbeat', {}, body.deviceToken)).status).toBe(200);
    q.expect((await q.api('GET', '/api/v1/devices/me/fleet', undefined, body.deviceToken)).status).toBe(200);
    await q.expect(p.getByRole('button', { name: 'Kiosk Terminals', exact: true })).toBeVisible({ timeout: 20000 });
    await q.expect(p.getByText('App not enabled', { exact: true })).toHaveCount(0);
    await q.expect(p.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible();
    await q.expect(p.getByRole('button', { name: 'Billing / Invoices', exact: true })).toHaveCount(0);
    await p.getByRole('button', { name: 'Kiosk Terminals', exact: true }).click();
    await q.snap(p, 'kiosk-only-merged-admin-active');
    return { keyType: 'KIOSK_ADMIN', consoleType: 'POS_ADMIN', heartbeatStatus: 200, fleetStatus: 200, posOnlyModulesHidden: true, falseLock: false };
  });
  await q.test(p, 'Refresh keeps kiosk-only merged admin connected and the kiosk settings accessible', async () => {
    await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await q.expect(p.getByRole('button', { name: 'Kiosk Terminals', exact: true })).toBeVisible({ timeout: 25000 });
    await p.getByRole('button', { name: 'Restaurant Settings', exact: true }).click();
    await q.expect(p.getByText('App not enabled', { exact: true })).toHaveCount(0);
    await q.expect(p.getByText(/Direct settlement/i).first()).toBeVisible({ timeout: 20000 });
    await q.snap(p, 'kiosk-only-settings-after-refresh');
    return { refreshPreserved: true, kioskSettingsVisible: true, falseLock: false };
  });
  await q.close();
}
main().catch(async e => { console.error('Merged-admin QA failed:', e.name); await q.close(); process.exitCode = 1; });
