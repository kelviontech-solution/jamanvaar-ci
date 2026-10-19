const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = [];
  try {
    for (const [name, url] of [['reference', 'https://restaurant.kelviontech.in/'], ['local', 'http://localhost:5190/q/site/jamanvaar-demo-restaurant-Ny2fFTbr']]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(__dirname, `${name}-before-desktop.png`), fullPage: true });
        out.push({ name, url, title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 22000),
          images: await page.locator('img').evaluateAll(images => images.map(i => ({ src: i.currentSrc, alt: i.alt, loaded: i.complete && i.naturalWidth > 0 }))), errors });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(__dirname, `${name}-before-mobile.png`), fullPage: true });
      } catch (e) { out.push({ name, error: e.message }); }
      await context.close();
    }
    fs.writeFileSync(path.join(__dirname, 'inspection.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out.map(({name, title, error, images, errors}) => ({name, title, error, images, errors})), null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
