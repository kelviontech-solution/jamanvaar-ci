const q = require('./browser-audit-lib.cjs');
async function main() {
  const a = await q.open('admin');
  await a.getByRole('button', { name: 'Payments & Split', exact: true }).click();
  await q.test(a, 'Default Jamanvaar collection requests online payment activation', async () => {
    const response = a.waitForResponse(r => r.url().endsWith('/payment-connection/request-platform-payments'));
    await a.getByRole('button', { name: 'Request online payment activation', exact: true }).click();
    q.expect((await response).status()).toBe(201);
    const row = await q.mustApi('GET', '/api/v1/tenant/payment-connection', undefined, q.state.adminActivation.accessToken);
    q.expect(row.directSettlementRequested).toBe(false);
    q.expect(row.status).toBe('PENDING_VERIFICATION');
    return { defaultCollection: 'Jamanvaar', status: row.status, directSettlementRequested: row.directSettlementRequested };
  });
  await q.test(a, 'Owner saves audit bank metadata, account masked by API', async () => {
    await a.getByRole('button', { name: 'Update bank details', exact: true }).click();
    await a.getByLabel('Account holder name', { exact: true }).fill('QA Owner A');
    await a.getByLabel('Bank name', { exact: true }).fill('QA Bank - Simulated');
    await a.getByLabel('Account number', { exact: true }).fill('1234500001');
    await a.getByLabel('IFSC', { exact: true }).fill('HDFC0000001');
    const response = a.waitForResponse(r => r.url().endsWith('/payment-connection/bank-details') && r.request().method() === 'PATCH');
    await a.getByRole('button', { name: 'Save for verification', exact: true }).click();
    q.expect((await response).status()).toBe(200);
    const row = await q.mustApi('GET', '/api/v1/tenant/payment-connection', undefined, q.state.adminActivation.accessToken);
    q.expect(JSON.stringify(row)).not.toContain('1234500001');
    q.expect(row.bankVerificationStatus).toBe('PENDING_VERIFICATION');
    return { masked: true, bankVerificationStatus: row.bankVerificationStatus, fakeBank: true };
  });
  await q.test(a, 'Route-pending toggle saves request while manual payout remains effective', async () => {
    await a.getByRole('switch', { name: 'Request direct settlement to restaurant bank' }).check();
    await q.expect(a.getByText('Direct settlement requested - awaiting Route activation and linked account verification.', { exact: true })).toBeVisible();
    const row = await q.mustApi('GET', '/api/v1/tenant/payment-connection', undefined, q.state.adminActivation.accessToken);
    q.expect(row.directSettlementRequested).toBe(true);
    return { requested: true, actualSettlement: 'manual', activation: 'pending Route', endpoint: '/api/v1/tenant/payment-connection/settlement-preference' };
  });
  await q.snap(a, 'admin-payment-request-bank-masked');
  await a._audit.ctx.close();
  const s = await q.open('super');
  await s.goto('http://localhost:5180/payment-connections'); await s.waitForTimeout(500);
  await q.test(s, 'Platform owner approves online payments with password step-up', async () => {
    await s.getByRole('button', { name: 'Approve', exact: true }).click();
    const inputs = await s.locator('input[type=password]').count();
    q.expect(inputs).toBe(1);
    await s.locator('input[type=password]').fill(q.state.platformPassword);
    const response = s.waitForResponse(r => r.url().endsWith('/payment-connection/approve') && r.request().method() === 'PATCH');
    await s.getByRole('button', { name: /Confirm/i }).last().click();
    q.expect((await response).status()).toBe(200);
    const row = await q.mustApi('GET', `/api/v1/restaurants/${q.state.restaurantA.id}/payment-connection`);
    q.expect(row.status).toBe('ACTIVE');
    return { status: row.status, bankVerificationStatus: row.bankVerificationStatus, passwordStepUp: true };
  });
  await q.snap(s, 'super-payment-connection-reviewed');
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
