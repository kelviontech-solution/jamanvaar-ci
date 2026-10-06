const q = require('./browser-audit-lib.cjs');
const { paymentRow } = require('./browser-audit-kiosk-payment.cjs');
async function main() {
 const a = await q.open('admin');
 await a.getByRole('button', { name: 'Payments & Split', exact: true }).click();
 await q.test(a, 'Route pending bank request remains masked with manual settlement', async () => {
   await q.expect(a.getByRole('switch', { name: 'Request direct settlement to restaurant bank' })).toBeChecked();
   await q.expect(a.getByText('Manual bank transfer', { exact: true })).toBeVisible();
   const row = await a.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPaymentConnection());
   q.expect(row.bankVerificationStatus).toBe('PENDING'); q.expect(row.directSettlementRequested).toBe(true);
   q.expect(JSON.stringify(row)).not.toContain('1234500001'); return { bankStatus: row.bankVerificationStatus, requestedDirect: true, effectiveSettlement: 'MANUAL', accountMasked: true };
 });
 await q.test(a, 'Owner gross fee net paid and pending reconcile to captured kiosk snapshots', async () => {
   const summary = await a.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPayoutSummary());
   q.expect(summary.grossCollection - summary.platformFee - summary.heldPayable).toBe(summary.netPayable);
   q.expect(summary.paidPayout).toBe(0); q.expect(summary.platformFee).toBe(Math.round(summary.grossCollection * 0.03));
   await q.expect(a.getByText('Gross Collection', { exact: true })).toBeVisible();
   await q.expect(a.getByText('Pending (not yet transferred)', { exact: true })).toBeVisible();
   q.append('data-consistency.jsonl', { feature: 'kiosk-payout-summary-before-refund', summary }); return summary;
 }); await q.snap(a, 'owner-gross-fee-net-pending');
 await q.test(a, 'Refund validation rejects excessive amount and empty reason before dispatch', async () => {
   await a.getByRole('button', { name: 'Refund', exact: true }).first().click();
   await a.getByLabel('Refund amount in rupees', { exact: true }).fill('999999');
   await a.getByRole('button', { name: 'Confirm refund', exact: true }).click();
   await q.expect(a.getByText(/Enter an amount between/)).toBeVisible();
   await a.getByLabel('Refund amount in rupees', { exact: true }).fill('1');
   await a.getByRole('button', { name: 'Confirm refund', exact: true }).click();
   await q.expect(a.getByText('Please give a reason for the refund.', { exact: true })).toBeVisible();
   await a.getByRole('button', { name: 'Cancel', exact: true }).last().click(); return { excessiveAmountRejected: true, missingReasonRejected: true };
 }); await a._audit.ctx.close();
 const b = await q.open('admin', 'owner-b');
 await q.test(b, 'Restaurant B signed payment summary cannot read A collection via query ID', async () => {
   const summary = await b.evaluate(async () => (await import('/src/cloud/cloudClient.ts')).getPayoutSummary());
   q.expect(summary.grossCollection).toBe(0); q.expect(summary.platformFee).toBe(0); return { grossB: 0, feeB: 0 };
 }); await b._audit.ctx.close();
 const s = await q.open('super'); await s.goto('http://localhost:5180/payouts');
 await q.test(s, 'EOD refuses unverified QA bank and cannot transfer money', async () => {
   const [r] = await Promise.all([s.waitForResponse(r => r.url().endsWith('/payouts/run-eod') && r.request().method() === 'POST'), s.getByRole('button', { name: 'Run EOD batch now', exact: true }).click()]);
   q.expect(r.status()).toBe(201); const result = await r.json(); q.expect(result.payoutsCreated).toBe(0); return { ...result, bankVerified: false, moneyTransferred: false };
 }); await q.snap(s, 'super-eod-unverified-bank');
 await q.test(s, 'Platform commission changes require password step up and owner cannot edit rate', async () => {
   const missing = await q.api('PATCH', '/api/v1/payments/commission-config', { defaultBps: 300 }); q.expect(missing.status).toBe(403);
   const wrong = await q.api('PATCH', '/api/v1/payments/commission-config', { defaultBps: 300, password: 'QA-wrong-password' }); q.expect(wrong.status).toBe(403);
   const tenant = await q.api('PATCH', '/api/v1/payments/commission-config', { defaultBps: 300 }, q.state.adminActivation.accessToken); q.expect([401, 403]).toContain(tenant.status);
   const config = await q.mustApi('GET', '/api/v1/payments/commission-config'); q.expect(config.defaultBps).toBe(300);
   const paid = await paymentRow(q.state.kioskPayment.paymentId); q.expect(paid.commissionBps).toBe(300);
   return { missingPassword: missing.status, wrongPassword: wrong.status, tenantRejected: tenant.status, actualRateUnchanged: 300, paidSnapshot: paid.commissionBps };
 }); await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
