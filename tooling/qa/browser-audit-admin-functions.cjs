const q = require('./browser-audit-lib.cjs');
async function waitEntity(type, predicate) {
  let row;
  await q.expect(async () => {
    const result = await q.mustApi('GET', `/api/v1/entity-sync/${type}`, undefined, q.state.adminActivation.deviceToken);
    row = result.entities.find(e => predicate(e.payload)); q.expect(row).toBeTruthy();
  }).toPass({ timeout: 15000 });
  return row;
}
async function main() {
  const a = await q.open('admin');
  await a.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
  for (const invalid of ['0', '-1', '100001']) await q.test(a, `Inline price ${invalid} rejected without changing persisted price`, async () => {
    await a.getByTitle('Click to change the price', { exact: true }).first().click();
    const price = a.getByRole('spinbutton', { name: 'New price for QA Pizza 01' });
    await price.fill(invalid); await price.press('Enter');
    await q.expect(a.getByText(invalid === '100001' ? 'Under ₹1,00,000' : 'Enter a price above 0', { exact: true })).toBeVisible();
    const row = await waitEntity('MENU_ITEM', i => i.id === q.state.pizzaId);
    q.expect(row.payload.price).toBe(299);
    await price.press('Escape');
    return { attempted: invalid, persistedPrice: 299 };
  });
  await q.test(a, 'Menu search no-results and clear restore actual dish', async () => {
    const search = a.getByPlaceholder('Search dish by name, description, SKU or tag...');
    await search.fill('qa-pizza-01'); await q.expect(a.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    await search.fill('no-such-qa-dish'); await q.expect(a.getByText('QA Pizza 01', { exact: true })).toHaveCount(0);
    await search.fill(''); await q.expect(a.getByText('QA Pizza 01', { exact: true }).first()).toBeVisible();
    return { search: 'Case-insensitive SKU, no results, clear', item: q.state.pizzaId };
  });
  await q.test(a, 'Menu CSV download contains persisted QA pizza and price', async () => {
    const download = a.waitForEvent('download');
    await a.getByRole('button', { name: 'Download CSV Template', exact: true }).click();
    const file = await download; const saved = q.path.join(q.reportDir, 'evidence', 'qa-menu-export.csv');
    await file.saveAs(saved); const content = q.fs.readFileSync(saved, 'utf8');
    q.expect(content).toContain('QA Pizza 01'); q.expect(content).toContain('299');
    return { file: 'evidence/qa-menu-export.csv', actualRowsVerified: true };
  });
  await a.getByRole('button', { name: 'Customisations & Tax', exact: true }).click();
  await q.test(a, 'Owner creates GST18 group and cloud stores percentages', async () => {
    await a.getByRole('button', { name: 'New tax group', exact: true }).click();
    await a.getByPlaceholder('e.g. GST 5%').fill('QA GST18');
    await a.getByLabel('Total GST %', { exact: true }).fill('18');
    await a.getByRole('button', { name: 'Save tax group', exact: true }).click();
    const row = await waitEntity('TAX_GROUP', t => t.name === 'QA GST18');
    q.expect(row.payload.cgstPercent).toBe(9); q.expect(row.payload.sgstPercent).toBe(9);
    q.state.tax18Id = row.externalId; q.saveState();
    return { id: row.externalId, cgstPercent: 9, sgstPercent: 9, inclusive: row.payload.isInclusive };
  });
  await a.getByRole('button', { name: 'Menu & Categories', exact: true }).click();
  await q.test(a, 'Create INR100 dish linked to GST18 and verify tax reference', async () => {
    await a.getByRole('button', { name: 'Add Dish', exact: true }).click();
    await a.getByPlaceholder('e.g. Paneer Butter Masala').fill('QA GST18 Pizza');
    await a.getByPlaceholder('e.g. 260').fill('100');
    await a.getByPlaceholder('e.g. PBM-01').fill('QA-TAX-18');
    await a.locator('form select').first().selectOption(q.state.categoryId);
    await a.getByRole('button', { name: 'Create Dish', exact: true }).click();
    const row = await waitEntity('MENU_ITEM', i => i.name === 'QA GST18 Pizza');
    q.expect(row.payload.taxGroupId).toBe(q.state.tax18Id);
    q.state.taxPizzaId = row.externalId; q.saveState();
    return { id: row.externalId, price: 100, taxGroupId: row.payload.taxGroupId };
  });
  await a.getByRole('button', { name: 'Customers CRM', exact: true }).click();
  await q.test(a, 'Owner registers customer through UI and CRM cloud persists phone', async () => {
    await a.getByRole('button', { name: 'Register New Customer', exact: true }).click();
    await a.getByPlaceholder('e.g. Ramesh Patel').fill('QA Customer');
    await a.getByPlaceholder('e.g. 9876543210', { exact: true }).fill('9891000011');
    await a.getByRole('button', { name: 'Register Customer', exact: true }).click();
    const row = await waitEntity('CUSTOMER', t => t.name === 'QA Customer');
    q.expect(row.payload.phone).toBe('9891000011'); q.state.customerId = row.externalId; q.saveState();
    return { id: row.externalId, phone: 'QA fixture phone', name: row.payload.name };
  });
  await a.getByRole('button', { name: 'Inventory & Recipes', exact: true }).click();
  await q.test(a, 'Owner creates stock item and verifies cloud quantity/cost', async () => {
    await a.getByRole('button', { name: 'Add Stock Item', exact: true }).click();
    await a.getByPlaceholder('e.g. Fresh Malai Paneer').fill('QA Cheese');
    await a.getByPlaceholder('e.g. RAW-PAN-01').fill('QA-CHEESE');
    const numbers = a.locator('form input[type=number]');
    for (const [i, value] of ['10', '2', '3', '100'].entries()) await numbers.nth(i).fill(value);
    await a.getByRole('button', { name: 'Create Inventory Item', exact: true }).click();
    const row = await waitEntity('INVENTORY_ITEM', t => t.name === 'QA Cheese');
    q.expect(row.payload.currentStock).toBe(10); q.expect(row.payload.costPerUnit).toBe(100);
    q.state.inventoryId = row.externalId; q.saveState();
    return { id: row.externalId, stock: 10, costPerUnit: 100 };
  });
  await q.snap(a, 'admin-inventory-populated');
  await a.getByRole('button', { name: 'Purchasing & Stock Control', exact: true }).click();
  for (const tab of ['Receive goods', 'Suppliers', 'Stock count', 'Reorder & expiry', 'Costing & reports']) {
    await a.getByRole('button', { name: tab, exact: true }).click(); await a.waitForTimeout(200);
    const data = await q.snap(a, 'admin-stock-tab-' + tab);
    q.append('page-coverage.jsonl', { app: 'admin', page: 'INVENTORY_CONTROL/' + tab, result: 'RENDERED', headings: data.headings, buttons: data.buttons.slice(45), inputs: data.inputs });
  }
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
module.exports = { waitEntity };
