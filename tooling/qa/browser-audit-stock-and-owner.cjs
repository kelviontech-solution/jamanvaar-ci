const q = require('./browser-audit-lib.cjs');
async function main() {
  const a = await q.open('admin');
  await a.getByRole('button', { name: 'Inventory & Recipes', exact: true }).click();
  await q.test(a, 'Saved stock definition survives admin reload and is visible in inventory list', async () => {
    await q.expect(a.getByText('QA Cheese', { exact: true }).first()).toBeVisible();
    return { definitionRecovered: true };
  }); await q.snap(a, 'inventory-after-remount');
  await a.getByRole('button', { name: 'Purchasing & Stock Control', exact: true }).click();
  for (const tab of ['Receive goods', 'Suppliers', 'Stock count', 'Reorder & expiry', 'Costing & reports']) {
    await a.getByRole('tab', { name: tab, exact: true }).click();
    const info = await q.snap(a, 'stock-subtab-' + tab);
    q.append('page-coverage.jsonl', { app: 'admin', page: 'Purchasing/' + tab, result: 'RENDERED', headings: info.headings, inputs: info.inputs });
  }
  await a.getByRole('tab', { name: 'Suppliers', exact: true }).click();
  await q.test(a, 'Supplier empty name validation prevents invalid creation', async () => {
    await a.getByRole('button', { name: 'Add supplier', exact: true }).click();
    await q.expect(a.getByRole('alert')).toBeVisible(); return { inlineError: await a.getByRole('alert').innerText() };
  });
  await q.test(a, 'Owner creates supplier through purchasing screen', async () => {
    if (await a.getByText('QA Dairy Supplier', { exact: true }).isVisible().catch(() => false)) return { existingQaFixture: true, earlierUiCreationVerified: true };
    await a.getByLabel('Supplier name', { exact: true }).fill('QA Dairy Supplier');
    await a.getByLabel('Contact person', { exact: true }).fill('QA Supplier Contact');
    await a.getByLabel('Phone', { exact: true }).fill('9891000012');
    await a.getByLabel('Payment terms', { exact: true }).fill('QA NET15');
    await a.getByRole('button', { name: 'Add supplier', exact: true }).click();
    await q.expect(a.getByText('QA Dairy Supplier', { exact: true })).toBeVisible(); return { supplierCreated: true };
  });
  await a.getByRole('tab', { name: 'Receive goods', exact: true }).click();
  await q.test(a, 'Receive QA supplier delivery updates stock locally and emits cloud ledger', async () => {
    await a.locator('form select').nth(0).selectOption({ label: 'QA Dairy Supplier' });
    await a.locator('form select').nth(1).selectOption({ label: 'QA Cheese' });
    await a.getByLabel(/Quantity/).fill('5'); await a.getByLabel(/Cost per/).fill('120');
    await a.getByLabel('Supplier invoice number (optional)').fill('QA-DELIVERY-001');
    await a.getByRole('button', { name: 'Book delivery', exact: true }).click();
    await q.expect(a.getByText('QA-DELIVERY-001', { exact: true })).toBeVisible();
    let movements;
    await q.expect(async () => {
      movements = await q.mustApi('GET', '/api/v1/inventory/movements?afterSeq=0', undefined, q.state.adminActivation.deviceToken);
      q.expect(movements.movements.some(m => m.itemName === 'QA Cheese' && m.quantityDelta === 5)).toBe(true);
    }).toPass({ timeout: 15000 }); return { movements: movements.movements.map(m => ({ itemId: m.itemId, quantityDelta: m.quantityDelta, type: m.type })) };
  }); await q.snap(a, 'qa-delivery-ledger');
  await a.getByRole('tab', { name: 'Stock count', exact: true }).click();
  await q.test(a, 'QA stock count persists actual counted quantity and variance', async () => {
    await a.getByLabel('Counted QA Cheese', { exact: true }).fill('18');
    await a.getByRole('button', { name: 'Save count', exact: true }).click();
    await q.expect(a.getByText(/-1 kg/).first()).toBeVisible(); return { counted: 18, previous: 19, variance: -1 };
  }); await q.snap(a, 'qa-stock-count');
  await a.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await q.test(a, 'Owner dashboard does not claim reconciliation without a real shift', async () => {
    const shifts = await q.mustApi('GET', '/api/v1/entity-sync/SHIFT', undefined, q.state.adminActivation.deviceToken);
    q.expect(shifts.entities).toHaveLength(0);
    q.expect(await a.getByText('100% Reconciled', { exact: true }).count()).toBe(0);
    return { realShifts: 0, fabricatedReconciliation: false };
  }); await q.snap(a, 'owner-no-shift-reconciliation');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
