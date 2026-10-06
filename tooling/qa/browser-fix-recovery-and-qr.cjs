const q = require('./browser-audit-lib.cjs');
const { owner, fresh } = require('./browser-fix-regressions.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
const { posNav } = require('./browser-audit-cash-settlement.cjs');
async function orders() { return (await q.mustApi('GET', '/api/v1/orders/sync?afterSeq=0', undefined, q.state.posActivation.deviceToken)).orders; }
async function main() {
  const p = await q.open('pos'); await login(p, 'pos', 'Cashier'); p.on('dialog', d => d.accept());
  await fresh(p); const baseline = new Set((await orders()).map(row => row.externalOrderId));
  await q.test(p, 'Offline KOT is saved locally, reaches cloud once on reconnect and survives refresh', async () => {
    await p._audit.ctx.setOffline(true);
    try {
      await p.getByText('QA Pizza 01', { exact: true }).first().click(); await p.getByRole('button', { name: 'SEND KOT', exact: true }).click();
      await q.expect(p.getByRole('button', { name: /KOT SENT|SENT TO KITCHEN/ })).toBeVisible();
      q.expect((await orders()).filter(row => !baseline.has(row.externalOrderId))).toHaveLength(0);
    } finally { await p._audit.ctx.setOffline(false); }
    const began = performance.now(); let created;
    await q.expect(async () => { created = (await orders()).filter(row => !baseline.has(row.externalOrderId)); q.expect(created).toHaveLength(1); }).toPass({ timeout: 30000 });
    const ms = +(performance.now() - began).toFixed(2); await p.reload(); await login(p, 'pos', 'Cashier');
    q.expect((await orders()).filter(row => !baseline.has(row.externalOrderId))).toHaveLength(1);
    return { copies: 1, reloadCopies: 1, reconnectToCloudMs: ms, amountPaise: created[0].totalAmount };
  });
  const g = await q.open('qr', 'qr-fix-' + Date.now(), { width: 390, height: 844 }); let placed;
  await q.test(g, 'QR guest GST18 quote is INR118; double submission and refresh keep one public order', async () => {
    await g.goto(q.state.qaQr.url); await g.getByRole('button', { name: 'Add QA GST18 Pizza', exact: true }).click();
    await g.getByRole('button', { name: /View Cart/ }).click(); await q.expect(g.getByText('₹118', { exact: true }).first()).toBeVisible();
    await g.getByRole('button', { name: 'Checkout', exact: true }).click();
    const ack = g.waitForResponse(r => /\/public\/qr\/[^/]+\/orders$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await g.getByRole('button', { name: /Place order/ }).dblclick(); const res = await ack; q.expect(res.status()).toBeLessThan(300); placed = await res.json();
    await q.expect(g.getByRole('heading', { name: 'Thank you!', exact: true })).toBeVisible(); await g.reload();
    await q.expect(g.getByRole('heading', { name: 'Thank you!', exact: true })).toBeVisible();
    q.expect((await orders()).filter(row => row.publicOrderId === placed.publicOrderId)).toHaveLength(1);
    return { publicOrderId: placed.publicOrderId, total: placed.total, copies: 1, refreshPreserved: true };
  });
  if (placed) {
    const d = await q.open('kds'); await login(d, 'kds', 'Kitchen'); await d.getByRole('tab', { name: /^Active/i }).click();
    await q.test(p, 'Cashier accepts QR order once, KDS prepares it and guest receives Ready at INR118', async () => {
      await posNav(p, 'Live Orders'); let row;
      await q.expect(async () => { row = (await orders()).find(o => o.publicOrderId === placed.publicOrderId); q.expect(row).toBeTruthy(); }).toPass({ timeout: 15000 });
      const inbox = p.getByTestId('qr-inbox'); const card = inbox.getByText(row.meta.orderNumber, { exact: true }).locator("xpath=ancestor::div[.//button[normalize-space(.)='Accept']][1]");
      await q.expect(card).toBeVisible({ timeout: 15000 }); await card.getByRole('button', { name: 'Accept', exact: true }).dblclick();
      const ticket = d.getByTestId('kds-ticket').filter({ has: d.getByText('#' + row.meta.tokenNumber, { exact: true }) });
      await q.expect(ticket).toHaveCount(1, { timeout: 15000 }); await q.expect(ticket).toContainText('QA GST18 Pizza');
      await ticket.getByRole('button', { name: /all dishes ready/i }).click(); await q.expect(g.getByText('Ready', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      const matches = (await orders()).filter(o => o.publicOrderId === placed.publicOrderId); q.expect(matches).toHaveLength(1); q.expect(matches[0].status).toBe('READY'); q.expect(matches[0].totalAmount).toBe(11800);
      return { orderId: row.externalOrderId, totalAmountPaise: 11800, status: 'READY', kitchenCopies: 1 };
    }); await q.snap(g, 'qr-fixed-kitchen-ready'); await d._audit.ctx.close();
  }
  await p._audit.ctx.close(); await g._audit.ctx.close();
  const a = await q.open('admin'); await owner(a); await a.getByRole('button', { name: 'Payments & Split', exact: true }).click();
  await q.test(a, 'Route-pending bank request remains manual; gross fee net paid pending use frozen snapshots', async () => {
    await q.expect(a.getByRole('switch', { name: 'Request direct settlement to restaurant bank' })).toBeChecked();
    await q.expect(a.getByText('Manual bank transfer', { exact: true })).toBeVisible();
    const summary = await a.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPayoutSummary());
    q.expect(summary.grossCollection - summary.platformFee - summary.heldPayable - summary.unallocatedCollection).toBe(summary.netPayable);
    q.expect(summary.pendingPayout + summary.paidPayout).toBe(summary.netPayable); q.expect(summary.paidPayout).toBe(0);
    q.expect(summary.payoutMode).toBe('MANUAL'); q.expect(summary.routeStatus).toBe('PENDING');
    await q.expect(a.getByText('Gross Collection', { exact: true })).toBeVisible(); await q.expect(a.getByText('Pending (not yet transferred)', { exact: true })).toBeVisible();
    return { ...summary, realTransfer: false };
  }); await q.snap(a, 'fixed-owner-gross-fee-net-pending'); await a._audit.ctx.close();
  const b = await q.open('admin', 'owner-b'); await owner(b, q.state.restaurantB);
  await q.test(b, 'Tenant-ID query tampering cannot disclose A inventory masters, recipes, suppliers or orders to B', async () => {
    for (const type of ['INVENTORY_ITEM', 'RECIPE', 'SUPPLIER']) {
      const response = await b.request.get(`http://localhost:4010/api/v1/entity-sync/${type}?restaurantId=${q.state.restaurantA.id}`, { headers: { Authorization: `Bearer ${q.state.adminBActivation.deviceToken}` } });
      q.expect(response.status()).toBe(200); q.expect((await response.json()).entities).toHaveLength(0);
    }
    const response = await b.request.get(`http://localhost:4010/api/v1/orders/sync?afterSeq=0&restaurantId=${q.state.restaurantA.id}`, { headers: { Authorization: `Bearer ${q.state.adminBActivation.deviceToken}` } });
    q.expect(response.status()).toBe(200); q.expect((await response.json()).orders).toHaveLength(0);
    return { attempts: 4, leakedRecords: 0 };
  }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
