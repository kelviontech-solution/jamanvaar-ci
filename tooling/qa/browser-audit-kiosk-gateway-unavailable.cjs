const q = require('./browser-audit-lib.cjs');
async function main() {
  const k = await q.open('kiosk');
  await k.getByRole('button', { name: 'Start Order', exact: true }).click();
  await k.getByRole('button', { name: /English/ }).click();
  await k.getByRole('button', { name: /Takeaway/i }).click();
  await k.getByRole('button', { name: 'Add QA Pizza 01 to cart', exact: true }).click();
  await k.getByRole('button', { name: 'Proceed to Payment', exact: true }).click();
  await k.waitForTimeout(1000);
  const data = await q.snap(k, 'kiosk-payment-methods');
  console.log(JSON.stringify({ text: data.text.slice(-1800), buttons: data.buttons.slice(-15), inputs: data.inputs }));
  await q.test(k, 'Unconfigured Razorpay shows recoverable QR error; no false payment success', async () => {
    const upi = k.getByRole('button', { name: /UPI|QR|Scan/i });
    if (await upi.first().isVisible()) await upi.first().click();
    await k.waitForTimeout(1200);
    const data = await q.snap(k, 'kiosk-gateway-unavailable');
    console.log('Gateway error screen', data.text.slice(-1600));
    q.expect(data.text).toMatch(/unavailable|not configured|could not|try again|not active|cash.*counter/i);
    q.expect(data.text).not.toMatch(/payment successful/i);
    return { realProvider: 'unconfigured', falseSuccess: false, message: data.text.slice(-1000) };
  });
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
