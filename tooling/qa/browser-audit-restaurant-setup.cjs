const q = require('./browser-audit-lib.cjs');
const token = q.state.adminActivation.deviceToken;
async function entity(type, name) {
  let last;
  for (let i = 0; i < 30; i++) {
    const r = await q.mustApi('GET', `/api/v1/entity-sync/${type}`, undefined, token);
    last = r.entities?.find(e => e.payload?.name === name || e.payload?.fullName === name || e.payload?.tableNumber === name);
    if (last) return last;
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error(`${type} ${name} not persisted to cloud after 15s`);
}
async function main() {
  const p = await q.open('admin');
  const cancel = p.getByRole('button', { name: 'Cancel', exact: true }).last();
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
  await p.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
  await q.test(p, 'Create menu category in UI and verify cloud persistence', async () => {
    const prior = await q.mustApi('GET', '/api/v1/entity-sync/MENU_CATEGORY', undefined, token);
    if (!prior.entities.some(e => e.payload.name === 'QA Pizza')) {
      await p.getByRole('button', { name: 'Add Category', exact: true }).click();
      await p.getByPlaceholder('e.g. Starters & Appetizers').fill('QA Pizza');
      await p.getByRole('button', { name: 'Create Category', exact: true }).click();
    }
    const e = await entity('MENU_CATEGORY', 'QA Pizza');
    q.state.categoryId = e.externalId; q.saveState();
    return { endpoint: '/api/v1/entity-sync/MENU_CATEGORY', externalId: e.externalId, name: e.payload.name };
  });
  await q.test(p, 'Create pizza at INR249 in UI and verify cloud persistence', async () => {
    await p.getByRole('button', { name: 'Add Dish', exact: true }).click();
    await p.getByPlaceholder('e.g. Paneer Butter Masala').fill('QA Pizza 01');
    await p.getByPlaceholder('e.g. 260').fill('249');
    await p.getByPlaceholder('e.g. PBM-01').fill('QA-PIZZA-01');
    await p.locator('form select').first().selectOption(q.state.categoryId);
    await p.getByRole('button', { name: 'Create Dish', exact: true }).click();
    const e = await entity('MENU_ITEM', 'QA Pizza 01');
    q.expect(e.payload.price).toBe(249);
    q.state.pizzaId = e.externalId; q.saveState();
    return { endpoint: '/api/v1/entity-sync/MENU_ITEM', externalId: e.externalId, price: e.payload.price };
  });
  await q.snap(p, 'admin-menu-populated');
  await p.getByRole('button', { name: 'Floor / Tables', exact: true }).click();
  await q.test(p, 'Create table QA01 through owner UI and persist', async () => {
    await p.getByRole('button', { name: 'Add Dining Table', exact: true }).click();
    await p.getByPlaceholder('e.g. 15').fill('QA01');
    const zone = p.getByPlaceholder('e.g. Garden Terrace');
    if (await zone.isVisible()) await zone.fill('QA Main Hall');
    await p.getByRole('button', { name: 'Create Table', exact: true }).click();
    const e = await entity('DINING_TABLE', 'QA01');
    q.state.tableId = e.externalId; q.saveState();
    return { endpoint: '/api/v1/entity-sync/DINING_TABLE', externalId: e.externalId };
  });
  await p.getByRole('button', { name: 'Staff & Roles (RBAC)', exact: true }).click();
  q.state.staff = {};
  for (const [role, id] of [['Cashier', 'role-cashier'], ['Captain', 'role-captain'], ['Kitchen', 'role-chef'], ['Manager', 'role-manager']]) {
    await q.test(p, `Create ${role} staff, issue PIN and persist hashed credential`, async () => {
      await p.getByRole('button', { name: 'Add Employee', exact: true }).click();
      await p.getByPlaceholder("Employee's full name").fill(`QA ${role}`);
      await p.locator('form select').selectOption(id);
      await p.getByRole('button', { name: 'Create Staff Member & Issue PIN', exact: true }).click();
      const pinLocator = p.locator('div.text-3xl.font-mono');
      await pinLocator.waitFor();
      const pin = (await pinLocator.textContent()).trim();
      q.expect(pin).toMatch(/^\d{4}$/);
      q.state.staff[role] = { pin, roleId: id }; q.saveState();
      await p.getByRole('button', { name: 'Done', exact: true }).click();
      const e = await entity('STAFF_USER', `QA ${role}`);
      q.expect(e.payload.pinHash.startsWith('pinv2:')).toBe(true);
      q.expect(e.payload.pinCode).toBeUndefined();
      return { endpoint: '/api/v1/entity-sync/STAFF_USER', externalId: e.externalId, roleId: e.payload.roleId, hashed: true, plaintext: false };
    });
    if (await p.getByRole('button', { name: 'Cancel', exact: true }).last().isVisible().catch(() => false)) await p.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  }
  await q.snap(p, 'admin-staff-populated');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
