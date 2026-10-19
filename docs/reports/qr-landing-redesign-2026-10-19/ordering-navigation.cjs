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
    const fresh=await browser.newContext({viewport:{width:390,height:844}});
    await fresh.route('http://localhost:4000/**',async route=>{await route.fulfill({response:await route.fetch({url:route.request().url().replace('localhost','127.0.0.1'),timeout:15000})});});
    const scan=await fresh.newPage(),freshErrors=[];scan.on('pageerror',e=>freshErrors.push(e.message));
    const plain=destination.split('#')[0],token=new URL(plain).pathname.split('/').at(-1);
    const describe=scan.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/public/qr/'+token);
    await scan.goto(plain,{waitUntil:'domcontentloaded'});
    const description=await (await describe).json();
    await scan.locator('ul.items .item').first().waitFor({timeout:20000});
    assert.equal(await scan.locator('.rp-hero').count(),0,'Fresh ordering QR scans must open menu even for legacy page-first settings');
    await scan.getByRole('button',{name:'About & contact',exact:true}).click();await scan.locator('.rp-hero').waitFor();
    assert.deepEqual(freshErrors,[]);
    results.push({source:'real local ordering QR without hash',storedEntryMode:description.restaurantPage?.content.entryMode,mode:description.mode,opensOrderingDirectly:true,aboutPageStillReachable:true,runtimeErrors:0});
    await fresh.unrouteAll({behavior:'ignoreErrors'});await fresh.close();
    await context.unrouteAll({behavior:'ignoreErrors'});await context.close();
  } finally {fs.writeFileSync(path.join(__dirname,'ordering-navigation-results.json'),JSON.stringify(results,null,2));for(const c of browser.contexts())await c.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
