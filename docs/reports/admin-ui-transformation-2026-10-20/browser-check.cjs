const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../../..');
const app = path.join(root, 'apps/restaurant-system/pos-admin');
const launch = {
  branch: { id: 'branch-a', name: 'Main Dining & Kitchen' },
  preferences: { version: 1, tableService: true, printedReceipts: true },
  products: [{ appCode: 'KIOSK_ADMIN', purchased: true, enabled: true, configured: false, ready: false, reason: 'NEEDS_SETUP', nextAction: 'KIOSKS' }],
  channels: ['KIOSK'], publishedMenuVersion: 1, unpublishedChanges: true,
  checks: [
    { id: 'menu', label: 'Publish the menu to this branch', done: true, page: 'MENU' },
    { id: 'tables', label: 'Configure tables and QR codes for table service', done: false, page: 'TABLES' },
    { id: 'kiosk', label: 'Connect at least one kiosk and confirm it received the menu', done: false, page: 'KIOSKS' },
    { id: 'printer', label: 'Verify receipts print correctly on the branch printer', done: false, page: 'PRINTERS' },
    { id: 'test-KIOSK', label: 'Verify a real order through the kiosk channel', done: false, page: 'OPERATIONS_HUB' }
  ],
  delivery: [{ id: 'k1', name: 'Front kiosk', online: true, isLocked: false, menuReceived: false, menuVersion: 0, configurationReceived: false, configurationStatus: 'PENDING', error: null }],
  handovers: [], paymentNote: 'Payments are verified per channel.'
};
(async () => {
  const { createServer, loadConfigFromFile } = await import('vite'), react = (await import('@vitejs/plugin-react')).default;
  const config = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(app, 'vite.config.ts'));
  const tw = (await import(pathToFileURL(path.join(app, 'tailwind.config.js')).href)).default;
  tw.content = [path.join(app, 'src/**/*.{js,ts,jsx,tsx}'), path.join(root, 'packages/ui/src/**/*.{js,ts,jsx,tsx}'), path.join(__dirname, 'fixture.tsx')];
  const tailwind = (await import('tailwindcss')).default, autoprefixer = (await import('autoprefixer')).default;
  const fixture = '/docs/reports/admin-ui-transformation-2026-10-20/fixture.html';
  const server = await createServer({
    root, configFile: false, publicDir: path.join(app, 'public'), resolve: config.config.resolve,
    plugins: [react(), { name: 'fixture-stubs', enforce: 'pre', load(id) {
      id = id.replaceAll('\\', '/');
      if (id.endsWith('/components/operations/operationsClient.ts')) return `export async function ops(){return ${JSON.stringify(launch)};}`;
      if (id.endsWith('/components/kiosk/CustomerExperience.tsx')) return 'export const ChannelMenuPreview=()=>null;';
    } }],
    css: { postcss: { plugins: [tailwind(tw), autoprefixer()] } },
    server: { host: '127.0.0.1', port: 5547, strictPort: true, watch: null, fs: { allow: [root] } }
  });
  await server.listen();
  const { chromium } = require('playwright'); const browser = await chromium.launch({ headless: true }); const results = [];
  const section = 'section[aria-label="Launch and handover"]';
  try {
    for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 740]]) {
      const page = await browser.newPage({ viewport: { width, height } }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:5547' + fixture);
      await page.getByRole('heading', { name: 'Launch & handover' }).waitFor();
      await page.getByText('Verify a real order through the kiosk channel').waitFor();
      const m = await page.evaluate((section) => ({
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        floatingDisplay: !!document.querySelector('.jv-display-control'),
        displayToggle: !!document.querySelector('[role=switch][aria-label="Display Button"]'),
        sizeContrast: !!document.querySelector('select.jv-display-select'),
        steps: [...document.querySelectorAll('nav[aria-label="Kiosk launch steps"] button')].map(b => b.textContent.trim()),
        checks: document.querySelectorAll(section + ' .grid > button').length,
        disclosures: document.querySelectorAll('details.jv-disclosure').length,
        undersizedTargets: [...document.querySelectorAll(section + ' button, ' + section + ' summary')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).length
      }), section);
      assert.equal(m.overflowX, false, `overflow at ${width}`);
      assert.equal(m.floatingDisplay, false); assert.equal(m.displayToggle, false); assert.equal(m.sizeContrast, true);
      assert.equal(m.steps.length, 5); assert.equal(m.checks, 5); assert.equal(m.disclosures, 3); assert.equal(m.undersizedTargets, 0);
      const summary = page.getByText('Purchased → enabled for branch → configured → verified');
      await summary.click(); assert.equal(await page.locator('details.jv-disclosure[open]').count(), 1);
      await summary.click(); assert.equal(await page.locator('details.jv-disclosure[open]').count(), 0);
      await page.getByRole('button', { name: /Configure tables/ }).click();
      assert.deepEqual(await page.evaluate(() => window.__navigated), ['TABLES']);
      await page.getByRole('button', { name: 'Refresh readiness' }).click();
      assert.equal(await page.getByRole('heading', { name: 'Launch & handover' }).count(), 1);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(__dirname, `admin-${width}.png`), fullPage: true });
      results.push({ width, ...m }); await page.close();
    }
    const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await rm.goto('http://127.0.0.1:5547' + fixture); await rm.getByRole('heading', { name: 'Launch & handover' }).waitFor();
    await rm.getByText('Purchased → enabled for branch → configured → verified').click();
    const anim = await rm.evaluate(() => getComputedStyle(document.querySelector('details.jv-disclosure[open] > div')).animationName);
    assert.equal(anim, 'none'); results.push({ reducedMotionDisclosureAnimation: anim });
    console.log(JSON.stringify(results, null, 2));
  } finally { fs.writeFileSync(path.join(__dirname, 'browser-results.json'), JSON.stringify(results, null, 2)); await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
