const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
  const b = await q.open('admin', 'owner-b');
  await q.test(b, 'Restaurant B owner authenticates and activates own Restaurant Admin', async () => {
    await b.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantB.restaurantCode);
    await b.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
    await b.locator('button[type=submit]').click();
    await b.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(q.state.keysB.POS_ADMIN.code);
    const response = b.waitForResponse(r => r.url().endsWith('/tenant-auth/activate-device'));
    await b.locator('button[type=submit]').click();
    const res = await response; q.expect(res.status()).toBe(200);
    q.state.adminBActivation = await res.json(); q.saveState();
    await q.expect(b.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible();
    return { restaurantId: q.state.restaurantB.id, ownBranch: q.state.branchB.id };
  });
  await b.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
  await q.test(b, 'Restaurant B UI cannot see restaurant A dishes or staff', async () => {
    await q.expect(b.getByText('This restaurant has no menu yet', { exact: true })).toBeVisible();
    q.expect(await b.getByText('QA Pizza 01', { exact: true }).count()).toBe(0);
    await b.getByRole('button', { name: 'Staff & Roles (RBAC)', exact: true }).click();
    await q.expect(b.getByText('No staff yet.', { exact: true })).toBeVisible();
    return { menuEmpty: true, staffEmpty: true, tenantARecordsVisible: false };
  });
  for (const type of ['MENU_ITEM', 'MENU_CATEGORY', 'STAFF_USER', 'DINING_TABLE', 'CUSTOMER', 'INVENTORY_ITEM', 'RESERVATION', 'SHIFT']) await q.test(b, `Direct browser API tenant-ID tampering cannot leak A ${type}`, async () => {
    const response = await b.request.get(`http://localhost:4010/api/v1/entity-sync/${type}?restaurantId=${q.state.restaurantA.id}`, { headers: { Authorization: `Bearer ${q.state.adminBActivation.deviceToken}` } });
    q.expect(response.status()).toBe(200); const body = await response.json();
    q.expect(body.entities).toHaveLength(0);
    q.expect(JSON.stringify(body)).not.toContain(q.state.restaurantA.id);
    return { endpoint: `/api/v1/entity-sync/${type}`, status: 200, leakedRecords: 0, queryRestaurantIdIgnoredForAuthorization: true };
  });
  await q.test(b, 'Direct browser API B cannot retrieve A orders despite restaurant query tampering', async () => {
    const response = await b.request.get(`http://localhost:4010/api/v1/orders/sync?afterSeq=0&restaurantId=${q.state.restaurantA.id}`, { headers: { Authorization: `Bearer ${q.state.adminBActivation.deviceToken}` } });
    q.expect(response.status()).toBe(200); q.expect((await response.json()).orders).toHaveLength(0);
    return { status: 200, leakedOrders: 0 };
  });
  await q.test(b, 'Tenant owner token cannot access another tenant payment connection or platform administration', async () => {
    for (const endpoint of [`/api/v1/restaurants/${q.state.restaurantA.id}/payment-connection`, `/api/v1/restaurants/${q.state.restaurantA.id}`, '/api/v1/platform/users']) {
      const response = await b.request.get(`http://localhost:4010${endpoint}`, { headers: { Authorization: `Bearer ${q.state.adminBActivation.accessToken}` } });
      q.expect([401, 403]).toContain(response.status());
    }
    return { protectedRoutes: 3, allowed: false };
  });
  await q.snap(b, 'restaurant-b-isolated-empty-staff'); await b._audit.ctx.close();
  const key = await q.mustApi('POST', '/api/v1/activation-keys', { restaurantId: q.state.restaurantA.id, branchId: q.state.branchA2.id, allowedDeviceType: 'POS', label: 'QA Branch A2 POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const p2 = await q.open('pos', 'pos-branch-a2');
  await q.test(p2, 'Branch A2 POS activates on its own branch', async () => {
    await p2.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(key.code);
    const response = p2.waitForResponse(r => r.url().endsWith('/activation/redeem'));
    await p2.locator('button[type=submit]').click(); const res = await response; q.expect(res.status()).toBe(201);
    q.state.branch2PosActivation = await res.json(); q.saveState();
    q.expect(q.state.branch2PosActivation.branchId).toBe(q.state.branchA2.id);
    const button = p2.getByRole('button', { name: /continue/i }).first();
    if (await button.isVisible().catch(() => false)) await button.click();
    await p2.waitForTimeout(800); await login(p2, 'pos', 'Cashier');
    return { branchId: q.state.branch2PosActivation.branchId };
  });
  await q.test(p2, 'Branch A2 shares restaurant menu but cannot see A1 floor/orders', async () => {
    await q.expect(p2.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    const token = q.state.branch2PosActivation.deviceToken;
    const floor = await p2.request.get('http://localhost:4010/api/v1/entity-sync/DINING_TABLE', { headers: { Authorization: `Bearer ${token}` } });
    q.expect((await floor.json()).entities.some(e => e.externalId === q.state.tableId)).toBe(false);
    const orders = await p2.request.get('http://localhost:4010/api/v1/orders/sync?afterSeq=0', { headers: { Authorization: `Bearer ${token}` } });
    q.expect((await orders.json()).orders).toHaveLength(0);
    return { menuShared: true, a1TablesVisible: false, a1OrdersVisible: false };
  });
  await q.snap(p2, 'branch-a2-shared-menu'); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
