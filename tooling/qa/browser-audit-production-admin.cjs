const q = require('./browser-audit-lib.cjs');
async function main() {
  const a = await q.open('adminprod');
  await q.test(a, 'Production build accepts KIOSK_ADMIN activation in merged Restaurant Admin', async () => {
    await a.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode);
    await a.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    await a.locator('button[type=submit]').click();
    await a.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(q.state.keysA.KIOSK_ADMIN.code);
    const response = a.waitForResponse(r => r.url().endsWith('/tenant-auth/activate-device'));
    await a.locator('button[type=submit]').click();
    const res = await response; q.expect(res.status()).toBe(200);
    q.state.adminProdActivation = await res.json(); q.saveState();
    await q.expect(a.getByRole('button', { name: 'Kiosk Terminals', exact: true })).toBeVisible();
    return { deviceType: 'KIOSK_ADMIN', mergedDashboard: true, productionBundle: true, deviceId: q.state.adminProdActivation.deviceId };
  });
  const calls = []; const errors = [];
  const listener = r => { if (r.url().includes('/api/v1/devices/me/fleet')) calls.push({ at: new Date().toISOString(), status: r.status() }); };
  a.on('response', listener); a.on('pageerror', e => errors.push(e.message));
  await a.waitForTimeout(10000);
  q.fs.writeFileSync(q.path.join(q.reportDir, 'production-idle-fleet.json'), JSON.stringify({ durationMs: 10000, count: calls.length, calls, pageErrors: errors, build: 'Production Vite bundle with QA API URL', source: 'No StrictMode in production' }, null, 2));
  await q.test(a, 'Idle production dashboard respects 30-second kiosk fleet polling interval', async () => {
    q.expect(calls.length).toBeLessThanOrEqual(2);
    return { durationMs: 10000, calls: calls.length };
  });
  await q.snap(a, 'production-admin-fleet-storm');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
