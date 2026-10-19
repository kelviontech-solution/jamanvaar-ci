const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const { build, loadConfigFromFile } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'apps/restaurant-system/pos/vite.config.ts'));
  const { chromium } = require('playwright');
  const theme = require('tailwindcss/loadConfig')(path.join(root, 'apps/restaurant-system/pos/tailwind.config.js'));
  theme.content = [path.join(root, 'apps/restaurant-system/pos/src/**/*.{ts,tsx}'), path.join(root, 'packages/ui/src/**/*.{ts,tsx}')];
  const outDir = path.join(root, '.jamanvaar/financial-browser-build');
  await build({ root, configFile: false, plugins: [react()], worker: { format: 'es' }, resolve: loaded.config.resolve,
    define: loaded.config.define, css: { postcss: { plugins: [require('tailwindcss')(theme), require('autoprefixer')()] } },
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(__dirname, 'financial-checkout-browser.html') } } });
  const server = require('node:http').createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(outDir, '.' + pathname);
    if (!file.startsWith(outDir + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : 'text/html');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(5531, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const observations = [];
  try {
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => { errors.push(error.message); console.error('Fixture runtime:', error.stack); });
      page.on('console', message => { if (message.type() === 'error') console.error('Fixture console:', message.text()); });
      const url = `http://127.0.0.1:5531/docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.html?case=pause-${width}`;
      await page.goto(url);
      const button = page.getByRole('button', { name: 'Confirm and settle payment' });
      try { await button.waitFor(); } catch (error) { console.error('Fixture body:', await page.locator('body').innerText()); throw error; }
      await page.evaluate(() => window.__checkout.mode('pause'));
      await button.click();
      await page.waitForFunction(() => window.__checkout.state().entered);
      const before = await page.evaluate(() => window.__checkout.state());
      assert.equal(before.cart, 1); assert.equal(before.receipt, false); assert.equal(before.printed, 0); assert.equal(before.drawer, 0);
      assert.equal(await button.isDisabled(), true);
      await page.screenshot({ path: path.join(root, `.jamanvaar/checkout-saving-${width}.png`), fullPage: true });
      await page.evaluate(() => window.__checkout.release());
      await page.getByRole('status').waitFor();
      await page.waitForFunction(() => !window.__checkout.state().pending);
      const after = await page.evaluate(() => window.__checkout.state());
      assert.equal(after.paid, 1); assert.equal(after.cart, 0); assert.equal(after.drawer, 1); assert.equal(after.pending, false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      assert.deepEqual(errors, []);
      observations.push({ width, scenario: 'delayed-real-SQLite-acknowledgement', before, after, pageErrors: errors.length });
      await context.close();
    }
    const context = await browser.newContext(), page = await context.newPage();
    const lostErrors = []; page.on('pageerror', error => lostErrors.push(error.message));
    page.setDefaultTimeout(15000);
    const url = 'http://127.0.0.1:5531/docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.html?case=lost-reload';
    await page.goto(url); await page.getByRole('button', { name: 'Confirm and settle payment' }).waitFor();
    await page.evaluate(() => window.__checkout.mode('lost'));
    await page.getByRole('button', { name: 'Confirm and settle payment' }).click();
    await page.getByText(/Saving could not be confirmed/).waitFor();
    const lost = await page.evaluate(() => window.__checkout.state());
    assert.equal(lost.cart, 1); assert.equal(lost.printed, 0);
    await page.reload(); await page.getByRole('button', { name: 'Confirm and settle payment' }).waitFor();
    await page.getByRole('button', { name: 'Confirm and settle payment' }).click();
    await page.getByRole('status').waitFor();
    await page.waitForFunction(() => !window.__checkout.state().pending);
    const recovered = await page.evaluate(() => window.__checkout.state());
    assert.equal(recovered.orders, 1); assert.equal(recovered.paid, 1); assert.equal(recovered.printed, 0); assert.equal(recovered.drawer, 0);
    assert.deepEqual(lostErrors, []);
    observations.push({ scenario: 'lost-acknowledgement-close-reopen-real-OPFS', lost, recovered, pageErrors: lostErrors.length });
    await context.close();
    const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
    const recoveryPage = await recoveryContext.newPage(); recoveryPage.setDefaultTimeout(15000);
    const recoveryErrors = []; recoveryPage.on('pageerror', error => recoveryErrors.push(error.message));
    await recoveryPage.goto('http://127.0.0.1:5531/docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.html?case=protected-export&screen=recovery');
    const password = recoveryPage.getByLabel('Recovery passphrase', { exact: true });
    await password.fill('fixture recovery passphrase 2026');
    await recoveryPage.getByLabel('Confirm passphrase for a new backup').fill('fixture recovery passphrase 2026');
    const downloadEvent = recoveryPage.waitForEvent('download');
    await recoveryPage.getByRole('button', { name: 'Download encrypted device backup' }).click();
    const download = await downloadEvent, recoveryFile = path.join(root, '.jamanvaar/browser-device-recovery.jvrecovery');
    await download.saveAs(recoveryFile);
    assert.equal(JSON.parse(fs.readFileSync(recoveryFile, 'utf8')).format, 'jamanvaar-protected-local-recovery');
    await recoveryPage.getByRole('status').filter({ hasText: 'Encrypted recovery file prepared' }).waitFor();
    await password.fill('wrong fixture recovery passphrase');
    await recoveryPage.getByLabel('Verify encrypted device recovery file').setInputFiles(recoveryFile);
    await recoveryPage.getByRole('alert').filter({ hasText: 'passphrase is incorrect' }).waitFor();
    await password.fill('fixture recovery passphrase 2026');
    await recoveryPage.getByLabel('Verify encrypted device recovery file').setInputFiles(recoveryFile);
    await recoveryPage.getByRole('status').filter({ hasText: 'File decrypted' }).waitFor();
    const verification = await recoveryPage.evaluate(() => window.__checkout.state());
    assert.equal(verification.orders, 0);
    assert.equal(await recoveryPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await recoveryPage.screenshot({ path: path.join(root, '.jamanvaar/protected-recovery-390.png'), fullPage: true });
    assert.deepEqual(recoveryErrors, []);
    observations.push({ scenario: 'actual-protected-recovery-download-wrong-password-then-verify', unchangedLiveOrders: verification.orders, pageErrors: recoveryErrors.length });
    await recoveryContext.close();
    for (const width of [390, 1366]) {
      const recoveryContext = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await recoveryContext.newPage(), errors = []; page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      const recoveryUrl = `http://127.0.0.1:5531/docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.html?case=manager-recovery-${width}`;
      await page.goto(recoveryUrl);
      await page.getByRole('button', { name: 'Confirm and settle payment' }).waitFor();
      await page.evaluate(() => window.__checkout.mode('lost'));
      await page.getByRole('button', { name: 'Confirm and settle payment' }).click();
      await page.getByText(/Saving could not be confirmed/).waitFor();
      await page.goto(`${recoveryUrl}&screen=interrupted`);
      await page.getByRole('button', { name: 'Restore and review original bill' }).click();
      await page.getByRole('heading', { name: /Recovered bill/ }).waitFor();
      const beforeReview = await page.evaluate(() => window.__checkout.state());
      assert.equal(beforeReview.pending, true); assert.equal(beforeReview.orders, 1);
      assert.equal(await page.getByText('Balance due', { exact: true }).evaluate(element => element.nextElementSibling.textContent), '₹0');
      const finish = page.getByRole('button', { name: 'Finish reviewed recovery' });
      assert.equal(await finish.isDisabled(), true);
      await page.getByLabel('How to handle the current cart').selectOption('RECOVERED_BILL');
      const reviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(reviewOverflow, false);
      await page.screenshot({ path: path.join(root, `.jamanvaar/interrupted-operation-review-${width}.png`), fullPage: true });
      await page.getByRole('checkbox').check();
      await finish.click();
      await page.getByRole('status').filter({ hasText: 'Recovery finished' }).waitFor();
      const recovered = await page.evaluate(() => window.__checkout.state());
      assert.equal(recovered.pending, false); assert.equal(recovered.orders, 1); assert.equal(recovered.paid, 1);
      assert.equal(recovered.cart, 0); assert.equal(recovered.printed, 0); assert.equal(recovered.drawer, 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(root, `.jamanvaar/interrupted-operation-recovered-${width}.png`), fullPage: true });
      observations.push({ scenario: 'manager-reviewed-original-operation-after-refresh', width, recovered, pageErrors: errors.length, horizontalOverflow: overflow, reviewHorizontalOverflow: reviewOverflow });
      await recoveryContext.close();
    }
    fs.writeFileSync(path.join(root, '.jamanvaar/financial-checkout-browser.json'), JSON.stringify({
      scope: 'Actual POS payment component/store and real SQLite OPFS worker; isolated identities and simulated hardware. Not native power-loss or real printer acceptance.', observations
    }, null, 2));
    console.log(JSON.stringify(observations, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
