const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const { build, loadConfigFromFile } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'apps/restaurant-system/pos/vite.config.ts'));
  const { chromium } = require('playwright');
  const theme = require('tailwindcss/loadConfig')(path.join(root, 'apps/restaurant-system/pos/tailwind.config.js'));
  theme.content = [path.join(root, 'apps/restaurant-system/captain/src/**/*.{ts,tsx}'), path.join(root, 'apps/restaurant-system/pos/src/**/*.{ts,tsx}'), path.join(root, 'apps/restaurant-system/pos-admin/src/**/*.{ts,tsx}'), path.join(root, 'packages/ui/src/**/*.{ts,tsx}')];
  const outDir = path.join(root, '.jamanvaar/kitchen-browser-build');
  await build({ root, configFile: false, plugins: [react()], worker: { format: 'es' }, resolve: loaded.config.resolve,
    define: loaded.config.define, css: { postcss: { plugins: [require('tailwindcss')(theme), require('autoprefixer')()] } },
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(__dirname, 'kitchen-flow-browser.html') } } });
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
  await new Promise(resolve => server.listen(5532, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const observations = [];
  try {
    for (const screen of ['pos', 'captain', 'kiosk']) for (const mode of ['pause', 'lost']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
      page.on('pageerror', error => { errors.push(error.message); console.error('Fixture runtime:', error.stack); });
      await page.goto(`http://127.0.0.1:5532/docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.html?screen=${screen}`);
      const button = screen === 'kiosk' ? page.getByRole('button', { name: 'Confirm kiosk order' })
        : page.getByRole('button', { name: /SEND KOT/i }).first();
      await button.waitFor(); await page.evaluate(value => window.__kitchen.mode(value), mode);
      await button.click();
      await page.waitForFunction(() => window.__kitchen.state().entered, undefined, { timeout: 15000 });
      if (mode === 'pause') {
        const waiting = await page.evaluate(() => window.__kitchen.state());
        assert.equal(waiting.kots, 0); assert.equal(waiting.posSent, 0); assert.equal(waiting.captainSent, 0);
        await page.screenshot({ path: path.join(root, `.jamanvaar/kitchen-${screen}-saving-390.png`), fullPage: true });
        await page.evaluate(() => window.__kitchen.release());
      } else {
        const dismiss = page.getByRole('button', { name: /^(OK|Got it|Close)$/i });
        if (screen !== 'kiosk') { await dismiss.last().waitFor(); await dismiss.last().click(); }
        await page.getByRole('button', { name: screen === 'kiosk' ? 'Confirm kiosk order' : /SEND KOT/i }).first().click();
      }
      await page.waitForFunction(() => window.__kitchen.state().kots === 1 && !window.__kitchen.state().pending, undefined, { timeout: 15000 });
      const result = await page.evaluate(() => window.__kitchen.state());
      assert.equal(result.orders, 1); assert.equal(result.paid, 0);
      if (screen === 'pos') assert.equal(result.posSent, 1);
      if (screen === 'captain') assert.equal(result.captainSent, 1);
      assert.deepEqual(errors, []);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false);
      observations.push({ screen, mode, width: 390, result, pageErrors: errors.length, horizontalOverflow: overflow });
      await context.close();
    }
    for (const mode of ['pause', 'lost']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5532/docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.html?screen=refund');
      await page.getByTitle('Issue Manager Refund').first().click();
      await page.locator('input[type=number]').fill('20');
      await page.getByRole('checkbox').check();
      await page.evaluate(value => window.__kitchen.mode(value), mode);
      await page.getByRole('button', { name: 'Confirm Refund', exact: true }).click();
      await page.waitForFunction(() => window.__kitchen.state().entered, undefined, { timeout: 15000 });
      if (mode === 'pause') {
        assert.equal((await page.evaluate(() => window.__kitchen.state())).refunded, 0);
        await page.evaluate(() => window.__kitchen.release());
      } else {
        await page.getByText(/Lost kitchen-save response/i).waitFor().catch(() => page.getByText(/Injected lost kitchen-save response/i).waitFor());
        await page.getByRole('button', { name: 'Confirm Refund', exact: true }).click();
      }
      await page.waitForFunction(() => window.__kitchen.state().refunded === 20 && !window.__kitchen.state().pending, undefined, { timeout: 15000 });
      const result = await page.evaluate(() => window.__kitchen.state());
      assert.equal(result.returnEvents, 1); assert.equal(result.returnCashOuts, 1); assert.equal(result.orders, 1);
      assert.deepEqual(errors, []);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false);
      await page.screenshot({ path: path.join(root, `.jamanvaar/kitchen-refund-${mode}-390.png`), fullPage: true });
      observations.push({ screen: 'refund', mode, width: 390, result, pageErrors: errors.length, horizontalOverflow: overflow });
      await context.close();
    }
    for (const screen of ['admin-refund', 'admin-void']) for (const mode of ['pause', 'lost']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:5532/docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.html?screen=${screen}`);
      const isRefund = screen === 'admin-refund';
      await page.getByRole('button', { name: isRefund ? 'Refund Order' : 'Void Order', exact: true }).click();
      if (isRefund) {
        await page.getByPlaceholder('Reason (e.g. Food return)').fill('Guest returned meal');
        await page.getByRole('checkbox').check();
      } else await page.getByPlaceholder('e.g. Customer cancelled before cooking / duplicate bill').fill('Guest left');
      const submitName = isRefund ? 'Record returned payment' : 'Confirm Void Order';
      await page.evaluate(value => window.__kitchen.mode(value), mode);
      await page.getByRole('button', { name: submitName, exact: true }).click();
      await page.waitForFunction(() => window.__kitchen.state().entered, undefined, { timeout: 15000 });
      if (mode === 'pause') {
        const state = await page.evaluate(() => window.__kitchen.state());
        assert.equal(state.refunded, 0); assert.equal(state.cancelled, 0);
        await page.evaluate(() => window.__kitchen.release());
      } else {
        await page.getByText('Injected lost kitchen-save response', { exact: true }).waitFor();
        await page.getByRole('button', { name: submitName, exact: true }).click();
      }
      await page.waitForFunction(refund => { const state = window.__kitchen.state(); return !state.pending && (refund ? state.refunded > 0 : state.cancelled === 1); }, isRefund, { timeout: 15000 });
      const result = await page.evaluate(() => window.__kitchen.state());
      assert.equal(result.orders, 1); assert.deepEqual(errors, []);
      if (!isRefund) assert.match((await page.getByLabel('Order activity').textContent()).replace(/\s+/g, ' '), /Balance due ₹0(?:\D|$)/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false);
      await page.screenshot({ path: path.join(root, `.jamanvaar/kitchen-${screen}-${mode}-390.png`), fullPage: true });
      observations.push({ screen, mode, width: 390, result, pageErrors: errors.length, horizontalOverflow: overflow });
      await context.close();
    }
    for (const mode of ['pause', 'lost']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5532/docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.html?screen=pos-cancel');
      const cancel = async () => {
        await page.getByRole('button', { name: 'Cancel Test meal (sent to kitchen)', exact: true }).click();
        await page.getByLabel('Reason', { exact: true }).fill('Guest changed mind');
        await page.getByRole('button', { name: 'Cancel dish', exact: true }).click();
      };
      await page.waitForFunction(() => window.__kitchen !== undefined, undefined, { timeout: 15000 });
      await page.evaluate(value => window.__kitchen.mode(value), mode);
      await cancel();
      await page.waitForFunction(() => window.__kitchen.state().entered, undefined, { timeout: 15000 });
      if (mode === 'pause') {
        const waiting = await page.evaluate(() => window.__kitchen.state());
        assert.equal(waiting.cancelledLines, 0); assert.equal(waiting.cartLines, 2);
        await page.evaluate(() => window.__kitchen.release());
      } else {
        await page.getByText('Injected lost kitchen-save response', { exact: true }).waitFor();
        await page.getByRole('button', { name: /^(OK|Got it|Close)$/i }).last().click();
        await cancel();
      }
      await page.waitForFunction(() => { const s = window.__kitchen.state(); return s.cancelledLines === 1 && s.cartLines === 1 && !s.pending; }, undefined, { timeout: 15000 });
      const result = await page.evaluate(() => window.__kitchen.state());
      assert.equal(result.orders, 1); assert.equal(result.kots, 1); assert.deepEqual(errors, []);
      assert.equal(await page.getByText('New Order — Unsaved', { exact: true }).count(), 0);
      await page.getByText(/Saved on this device/, { exact: false }).first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false);
      await page.screenshot({ path: path.join(root, `.jamanvaar/kitchen-pos-cancel-${mode}-390.png`), fullPage: true });
      observations.push({ screen: 'pos-cancel', mode, width: 390, result, pageErrors: errors.length, horizontalOverflow: overflow });
      await context.close();
    }
    fs.writeFileSync(path.join(root, '.jamanvaar/kitchen-flow-browser.json'), JSON.stringify({ scope: 'Actual POS cart and Captain workspace components/actions; kiosk admission service fixture. Real SQLite OPFS, simulated identities and hardware; no provider or installed-device acceptance.', observations }, null, 2));
    console.log(JSON.stringify(observations, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
