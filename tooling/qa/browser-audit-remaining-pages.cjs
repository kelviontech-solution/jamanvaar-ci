const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function main() {
  const b = await q.open('admin', 'owner-b');
  await q.test(b, 'Corrected actual platform routes reject tenant owner token', async () => {
    const results = [];
    for (const endpoint of [`/api/v1/restaurants/${q.state.restaurantA.id}/payment-connection`, `/api/v1/restaurants/${q.state.restaurantA.id}`, '/api/v1/platform-users']) {
      const r = await b.request.get('http://localhost:4010' + endpoint, { headers: { Authorization: `Bearer ${q.state.adminBActivation.accessToken}` } });
      results.push({ endpoint, status: r.status() }); q.expect([401, 403]).toContain(r.status());
    }
    return results;
  }); await b._audit.ctx.close();
  const p2 = await q.open('pos', 'pos-branch-a2');
  const cont = p2.getByRole('button', { name: /continue/i }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click();
  await login(p2, 'pos', 'Cashier');
  await q.test(p2, 'Recovered branch A2 shares menu while floor and orders remain branch scoped', async () => {
    q.expect(q.state.branch2PosActivation.device.branchId).toBe(q.state.branchA2.id);
    await q.expect(p2.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    const headers = { Authorization: `Bearer ${q.state.branch2PosActivation.deviceToken}` };
    const floor = await (await p2.request.get('http://localhost:4010/api/v1/entity-sync/DINING_TABLE', { headers })).json();
    const orders = await (await p2.request.get('http://localhost:4010/api/v1/orders/sync?afterSeq=0', { headers })).json();
    q.expect(floor.entities.some(e => e.externalId === q.state.tableId)).toBe(false);
    q.expect(orders.orders).toHaveLength(0);
    return { correctBranch: true, sharedMenu: true, otherBranchTables: 0, otherBranchOrders: 0 };
  }); await q.snap(p2, 'branch-a2-isolation-corrected'); await p2._audit.ctx.close();
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier');
  await posNav(p, 'Live Orders');
  const info = await q.snap(p, 'pos-navigation-inventory'); console.log('POSNAV', JSON.stringify(info.buttons));
  for (const label of ['Dashboard', 'Live Orders', 'Table Layout', 'Customers', 'Reports', 'Inventory', 'Expenses', 'Shift', 'Settings']) {
    const button = p.getByRole('button', { name: new RegExp(label) }).first();
    if (!await button.isVisible().catch(() => false)) { q.append('page-coverage.jsonl', { app: 'pos', page: label, result: 'NOT_PRESENT_FOR_CASHIER' }); continue; }
    await button.click(); await p.waitForTimeout(300); const data = await q.snap(p, 'pos-page-' + label);
    q.append('page-coverage.jsonl', { app: 'pos', page: label, result: 'RENDERED', headings: data.headings, buttons: data.buttons, inputs: data.inputs });
  } await p._audit.ctx.close();
  const c = await q.open('captain', 'captain', { width: 390, height: 844 }); await login(c, 'captain', 'Captain');
  const ci = await q.snap(c, 'captain-navigation-inventory'); console.log('CAPTAINNAV', JSON.stringify(ci.buttons));
  for (const label of ['My Tables', 'Orders', 'More']) {
    const button = c.getByRole('button', { name: label, exact: true });
    if (!await button.isVisible().catch(() => false)) continue;
    await button.click(); await c.waitForTimeout(300); const data = await q.snap(c, 'captain-page-' + label);
    q.append('page-coverage.jsonl', { app: 'captain', page: label, result: 'RENDERED', headings: data.headings, buttons: data.buttons, inputs: data.inputs });
    console.log(label, JSON.stringify({ text: data.text.slice(-1600), buttons: data.buttons.slice(-25) }));
  } await c._audit.ctx.close();
  const d = await q.open('kds'); await login(d, 'kds', 'Kitchen');
  const di = await q.snap(d, 'kds-navigation-inventory'); console.log('KDSNAV', JSON.stringify(di.buttons));
  for (const label of ['Cooking', 'Ready', 'Served', 'All', 'Expo']) {
    const button = d.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (!await button.isVisible().catch(() => false)) continue;
    await button.click(); await d.waitForTimeout(300); const data = await q.snap(d, 'kds-page-' + label);
    q.append('page-coverage.jsonl', { app: 'kds', page: label, result: 'RENDERED', headings: data.headings, buttons: data.buttons, inputs: data.inputs });
  } await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
