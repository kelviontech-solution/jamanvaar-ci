const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('http://localhost:4000/**', async route => {
      try { await route.fulfill({ response: await route.fetch({ url: route.request().url().replace('localhost', '127.0.0.1'), timeout: 15000 }) }); }
      catch(error) { if(!/disposed|closed|cancel/i.test(error.message))throw error; }
    });
    const page = await context.newPage(); const errors = []; const forbidden = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if(request.method() === 'POST' && /\/orders(?:\?|$|\/)|\/payment(?:s|\?|$|\/)/.test(request.url()))forbidden.push(request.url()); });
    await page.goto('http://localhost:5190/q/site/jamanvaar-demo-restaurant-Ny2fFTbr', { waitUntil: 'domcontentloaded' });
    await page.locator('.rp-header .rp-nav-order').waitFor();
    const destination = await page.locator('.rp-header .rp-nav-order').getAttribute('href');
    assert.match(destination, /\/q\/[^/]+#menu$/);
    await page.getByRole('button', { name: 'Open page navigation' }).click();
    await page.locator('.rp-nav').getByRole('link', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false);
    await page.screenshot({ path: path.join(__dirname, 'website-menu-mobile.png') });
    await page.getByRole('button', { name: 'Close restaurant menu' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open page navigation');
    await page.locator('.rp-header .rp-nav-order').click();
    await page.waitForURL(destination);
    await page.locator('ul.items .item').first().waitFor({timeout:20000});
    assert.equal(await page.locator('.rp-hero').count(),0,'Order online must bypass the restaurant introduction');
    const dishes=await page.locator('ul.items .item').count();assert.ok(dishes>0);
    assert.deepEqual(forbidden,[],'Navigation must not place an order or initiate a payment');assert.deepEqual(errors,[]);
    await page.screenshot({ path: path.join(__dirname, 'website-order-destination-mobile.png') });
    results.push({source:'real local public page',navigation:'same tab',landingMenuHidden:true,onDemandMenu:true,orderDestinationHash:'menu',orderingDishes:dishes,ordersCreated:0,paymentsInitiated:0,runtimeErrors:0});
    await context.unrouteAll({behavior:'ignoreErrors'});await context.close();
  } finally {fs.writeFileSync(path.join(__dirname,'ordering-navigation-results.json'),JSON.stringify(results,null,2));for(const c of browser.contexts())await c.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
