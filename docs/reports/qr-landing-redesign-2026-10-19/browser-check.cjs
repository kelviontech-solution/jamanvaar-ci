const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const { createServer, loadConfigFromFile } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const tailwind = (await import('tailwindcss')).default;
  const tailwindConfig = (await import(require('node:url').pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
  const config = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'apps/restaurant-system/pos-admin/vite.config.ts'));
  const mockClient = `export * from '/apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts?original';
  export async function cloudQrAccount(){return {role:'OWNER',branchId:'branch-a'}}
  export async function request(path,options={}){
    const fixture=window.__pageFixture; const data=fixture.data;
    if(path.endsWith('/entitlement'))return {enabled:true,source:'PLAN',limits:{},planName:'Fixture QR plan',validUntil:null};
    if(path.includes('/ai-config'))return {state:'OFF'};
    if(path.includes('/qr-page/print-design?')){
      const branch=new URL(path,location.origin).searchParams.get('scope');
      fixture.qrDesigns ||= {};
      const current=fixture.qrDesigns[branch]||{version:0,design:{template:'website',accent:'#0B253A',instruction:'Scan to visit our restaurant',footer:'Menu · Story · Contact',showLogo:true,layout:'CARD'}};
      if(options.method==='PUT'){if(current.version!==options.body.version)throw Error('Stale design');fixture.qrDesigns[branch]={version:current.version+1,design:structuredClone(options.body.design)};fixture.websiteQrSaves=(fixture.websiteQrSaves||0)+1;}
      return structuredClone(fixture.qrDesigns[branch]||current);
    }
    if(path.includes('/qr-page/print-data?')){
      const branch=new URL(path,location.origin).searchParams.get('scope');
      if(branch==='branch-b')throw Error('Publish and enable the business page before generating its QR poster.');
      const design=fixture.qrDesigns?.[branch]?.design||{template:'website',accent:'#0B253A',instruction:'Scan to visit our restaurant',footer:'Menu · Story · Contact',showLogo:true,layout:'CARD'};
      return {restaurantName:data.restaurantName,branchName:'Riverside',tableLabel:'VISIT OUR WEBSITE',tagline:'Menu · Story · Contact',url:'https://example.test/q/site/river-house-branch-a',logoUrl:null,design:structuredClone(design)};
    }
    if(path.includes('/launch?'))return {pageEnabled:true,health:{checks:[],scope:'Fixture branch'},testCurrent:false,currentPublication:data.publishedAt,branchRequired:true,recentOrders:[]};
    if(path.includes('/engagement?'))return {counts:{},description:'Isolated fixture'};
    if(path.includes('/publish?')){fixture.publishes++;data.published=structuredClone(data.draft);data.publishedAt=new Date().toISOString();data.version++;}
    else if(options.method==='PUT'){fixture.saves++;data.draft=structuredClone(options.body.content);data.version++;}
    return structuredClone(data);
  }
  export const qrApi=request;`;
  const server = await createServer({ root, configFile: false, publicDir: false, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'qrcode'], entries: [path.join(__dirname, 'browser-fixture.html')] }, plugins: [react(), { name: 'isolated-page-admin-transport', enforce: 'pre', load(id) { const source = id.replaceAll('\\', '/'); if (source.endsWith('/pos-admin/src/cloud/cloudClient.ts')) return mockClient;  } }], css: {postcss:{plugins:[tailwind({...tailwindConfig,content:[path.join(root,'apps/restaurant-system/pos-admin/src/**/*.{ts,tsx}'),path.join(root,'packages/ui/src/**/*.{ts,tsx}')]})]}}, resolve: config.config.resolve, define: config.config.define, server: { host: '127.0.0.1', port: 5542, strictPort: true, watch: null, fs: { allow: [root] } } });
  await server.listen();
  console.log('Fixture server ready.');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const fixturesOnly = process.argv.includes('--fixtures-only');
  const recommendations = process.argv.includes('--recommendations') || process.argv.includes('--recommendations-only');
  const twoCodes = process.argv.includes('--two-codes');
  const mobileOnly = process.argv.includes('--mobile');
  const results = fixturesOnly ? JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-results.json'), 'utf8')).filter(row => row.screen === 'real-public-page') : [];
  const fixtureUrl = 'http://127.0.0.1:5542/docs/reports/qr-landing-redesign-2026-10-19/browser-fixture.html';
  try {
    if(twoCodes){
      for(const layout of ['workspace','integrated'])for(const width of [1440,390]){
        console.log('Checking separate QR workflow',layout,width);
        const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
        const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`${fixtureUrl}?screen=console&layout=${layout}&tab=WEBSITE_QR&twoCodes=1`,{waitUntil:'domcontentloaded'});
        await page.getByRole('img',{name:'Restaurant Page QR poster preview'}).waitFor();
        await page.getByRole('button',{name:'Warm café',exact:true}).click();
        await page.getByLabel('Message below the QR').fill('Discover River House');
        await page.getByLabel('Print format').selectOption('TENT');
        assert.equal(await page.getByRole('button',{name:'Download PNG',exact:true}).isDisabled(),true);
        await page.getByRole('button',{name:'Save QR design',exact:true}).click();
        await page.getByText('Restaurant page QR design saved for this branch. Table QR designs are unchanged.').waitFor();
        assert.equal(await page.evaluate(()=>window.__pageFixture.websiteQrSaves),1);
        const [svgDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download SVG',exact:true}).click()]);
        const svg=fs.readFileSync(await svgDownload.path(),'utf8');assert.ok(svg.includes('Discover River House'));
        const [pngDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download PNG',exact:true}).click()]);
        const png=await require('sharp')(await pngDownload.path()).resize({width:640}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        assert.equal(require('jsqr')(new Uint8ClampedArray(png.data),png.info.width,png.info.height)?.data,'https://example.test/q/site/river-house-branch-a');
        const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Print / Save PDF',exact:true}).click();const popup=await popupPromise;
        await popup.evaluate(()=>window.print=()=>{});await popup.locator('svg').first().waitFor();assert.equal(await popup.locator('svg[viewBox="0 0 640 860"]').count(),2,'Tent layout prints two sides');await popup.close();
        await page.getByLabel('Branch to print',{exact:true}).selectOption('branch-b');
        await page.getByText('Get this branch page ready to print').waitFor();
        assert.equal(await page.getByRole('button',{name:'Heritage evening',exact:true}).getAttribute('aria-pressed'),'true');
        assert.equal(await page.getByRole('button',{name:'Download PNG',exact:true}).isDisabled(),true);
        await page.getByLabel('Branch to print',{exact:true}).selectOption('branch-a');
        await page.getByRole('img',{name:'Restaurant Page QR poster preview'}).waitFor();
        assert.equal(await page.getByLabel('Message below the QR').inputValue(),'Discover River House');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await page.screenshot({path:path.join(__dirname,`two-qr-types-${layout}-${width}.png`),fullPage:width===390});
        assert.deepEqual(errors,[]);results.push({layout,width,savedBranchDesign:true,svgDownload:true,pngDecoded:true,twoSidedPrintPreview:true,unpublishedBranchBlocked:true,overflow:false});await context.close();
      }
      console.log(JSON.stringify(results,null,2));return;
    }
    // Local API listens on IPv4; the existing Vite guest server listens on IPv6.
    // Forward only the local API transport. Responses remain from the real API.
    const context = await browser.newContext();
    await context.route('http://localhost:4000/**', async route => {
      try {
        const response = await route.fetch({ url: route.request().url().replace('localhost', '127.0.0.1'), timeout: 10000 });
        await route.fulfill({ response });
      } catch (error) { if (!/disposed|closed|cancel/i.test(error.message)) throw error; }
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    for (const width of fixturesOnly || recommendations ? [] : mobileOnly ? [320, 360, 390, 430, 667] : [1440, 960, 430, 390, 360]) {
      console.log('Checking public width', width);
      await page.setViewportSize({ width, height: mobileOnly && width === 667 ? 375 : 900 });
      await page.goto('http://localhost:5190/q/site/jamanvaar-demo-restaurant-Ny2fFTbr', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.locator('.rp-hero-photo img').waitFor();
      console.log('Public hero rendered', width);
      await page.waitForFunction(() => { const image = document.querySelector('.rp-hero-photo img'); return image?.complete && image.naturalWidth > 0; }, undefined, { timeout: 20000, polling: 100 });
      console.log('Public photo loaded', width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.equal(await page.locator('#rp-menu').count(), 0, 'Full menu must not appear in the landing-page scroll');
      if(mobileOnly) {
        await page.waitForFunction(()=>document.querySelector('.rp-sticky-action')?.hidden===true);
        const touch=await page.locator('.rp-nav-toggle').boundingBox();assert.ok(touch.width>=44&&touch.height>=44);
        for(const field of await page.locator('.rp-reserve-form input, .rp-reserve-form textarea').all()) assert.ok(await field.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16),'Phone inputs must avoid small text / automatic zoom');
      }
      if (width < 760) await page.getByRole('button', { name: 'Open page navigation' }).click();
      await page.locator('.rp-nav').getByRole('link', { name: 'Menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Explore our menu', exact: true }).waitFor();
      if(mobileOnly) {
        assert.ok(await page.getByRole('searchbox').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
        const layout=await page.evaluate(()=>{const dialog=document.querySelector('dialog').getBoundingClientRect(),menu=document.querySelector('#rp-menu').getBoundingClientRect(),footer=document.querySelector('.rp-menu-dialog-order')?.getBoundingClientRect();return {right:dialog.right,bottom:dialog.bottom,width:innerWidth,height:innerHeight,menuBottom:menu.bottom,footerTop:footer?.top??innerHeight}});
        assert.ok(layout.right<=layout.width+1&&layout.bottom<=layout.height+1,'Menu must fit the phone viewport');
        assert.ok(layout.menuBottom<=layout.footerTop+1,'The order action must not cover menu content');
      }
      assert.equal(await page.locator('#rp-menu .rp-dish').count(), 8);
      await page.getByRole('searchbox').fill('no-dish-with-this-name');
      await page.getByText('No matching dishes. Try another search.').waitFor();
      await page.getByRole('searchbox').fill('');
      console.log('Public search verified', width);
      for (let more = 0; more < 4 && await page.getByRole('button', { name: /Show more dishes/ }).count(); more++) await page.getByRole('button', { name: /Show more dishes/ }).click();
      const count = await page.locator('#rp-menu .rp-dish').count(); assert.equal(count, 40);
      console.log('Public full menu verified', width);
      await page.getByRole('button', { name: 'Close restaurant menu' }).click();
      assert.equal(await page.locator('dialog').count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      if(mobileOnly) {
        await page.evaluate(()=>{const hero=document.querySelector('.rp-hero').getBoundingClientRect();scrollTo({top:scrollY+hero.bottom+10,behavior:'instant'});});
        await page.waitForFunction(()=>document.querySelector('.rp-sticky-action')?.hidden===false);
        const showcase=page.getByRole('region',{name:'Signature dishes; scroll to explore'});
        await showcase.focus();await page.keyboard.press('ArrowRight');
        await page.waitForFunction(()=>document.querySelector('.rp-signatures .rp-dishes').scrollLeft>0);
        await page.locator('.rp-footer').scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>document.querySelector('.rp-sticky-action')?.hidden===true);
      }
      if (width < 760) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.getByRole('button', { name: 'Open page navigation' }).click();
        assert.equal(await page.locator('.rp-nav').isVisible(), true);
        await page.locator('.rp-nav').getByRole('link', { name: 'Menu', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'Open page navigation' }).getAttribute('aria-expanded'), 'false');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').count(), 0);
      }
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(__dirname, `${mobileOnly?'mobile-refinement':'website'}-public-${width}.png`), fullPage: width === 390 || width === 1440 });
      results.push({ screen: 'real-public-page', width, menuItemsAccessible: count, menuOnDemand: true, mobileRefinement:mobileOnly, overflow: false });
    }
    assert.deepEqual(errors, []); await context.unrouteAll({ behavior: 'ignoreErrors' }); await context.close();
    if(recommendations)for(const layout of ['workspace','integrated'])for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${fixtureUrl}?screen=console&layout=${layout}&tab=RESTAURANT_PAGE`,{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'Business page studio'}).waitFor();
      if(width<1101)await page.getByRole('button',{name:'Browse workspace',exact:true}).click();
      const nav=page.getByRole('navigation',{name:'QR administration'});
      assert.ok(await nav.getByRole('button').count()<15,'Daily navigation should stay compact');
      await page.getByRole('searchbox',{name:'Find a tool'}).fill('payment');
      await nav.getByRole('button',{name:'Payment Settings',exact:true}).waitFor();
      await page.getByRole('searchbox',{name:'Find a tool'}).fill('');
      await nav.getByRole('button',{name:'All tools & setup',exact:true}).click();
      const allPages=await page.evaluate(async()=>{const module=await import('/apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts');return module.QR_PAGES.map(page=>page.label);});
      for(const label of allPages)await nav.getByRole('button',{name:label,exact:true}).waitFor();
      if(width<1101){await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Browse workspace',exact:true}).getAttribute('aria-expanded'),'false');}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(__dirname,`recommendations-console-${layout}-${width}.png`),fullPage:false});
      assert.deepEqual(errors,[]);results.push({screen:'shared-qr-console',layout,width,allToolsReachable:allPages.length,search:true,overflow:false});await page.close();
    }
    if(recommendations)for(const width of [320,390,1440]){
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${fixtureUrl}?enhanced=1`,{waitUntil:'domcontentloaded'});
      await page.locator('.rp-opening-status').waitFor();
      const signatures=await page.locator('#rp-signatures .rp-dish h3').allTextContents();
      assert.deepEqual(signatures,['Royal Gujarati Grand Thali','House dish 11','House dish 21']);
      if(width<760)await page.getByRole('button',{name:'Open page navigation'}).click();
      await page.locator('.rp-nav').getByRole('link',{name:'Menu',exact:true}).click();
      await page.getByRole('button',{name:'Drinks',exact:true}).click();
      assert.equal(await page.locator('#rp-menu .rp-dish').count(),8);
      await page.getByRole('searchbox').fill('House dish 11');
      assert.equal(await page.locator('#rp-menu .rp-dish').count(),1);
      await page.getByRole('button',{name:'Meals',exact:true}).click();
      assert.equal(await page.locator('#rp-menu .rp-dish').count(),0,'Search and category must combine');
      await page.keyboard.press('Escape');
      await page.locator('.rp-languages button').nth(1).click();
      await page.getByRole('heading',{name:'નદી કિનારે ભોજન'}).waitFor();
      if(width<760)await page.locator('.rp-nav-toggle').click();
      await page.locator('.rp-nav a').first().click();
      await page.getByRole('button',{name:'પીણાં',exact:true}).click();
      assert.equal(await page.locator('#rp-menu .rp-dish h3').first().textContent(),'વાનગી 11');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(__dirname,`recommendations-public-${width}.png`),fullPage:true});
      assert.deepEqual(errors,[]);results.push({screen:'recommendations',width,signatureVariety:true,categoriesAndSearch:true,translatedNavigationAndDishes:true,openingStatus:true,overflow:false});await page.close();
    }
    for (const template of process.argv.includes('--recommendations-only')?[]:['HERITAGE', 'CAFE', 'MODERN', 'INDIAN']) for (const width of mobileOnly?[320,390]:[1440, 390]) {
      console.log('Checking template', template, width);
      const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${fixtureUrl}?template=${template}${mobileOnly?'&longName=1':''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.rp-hero').waitFor(); await page.waitForTimeout(400);
      await page.waitForFunction(() => { const image = document.querySelector('.rp-hero-photo img'); return image?.complete && image.naturalWidth > 0; }, undefined, { timeout: 20000, polling: 100 });
      assert.equal(await page.locator('#rp-menu').count(), 0);
      if(width < 760) await page.getByRole('button', {name:'Open page navigation'}).click();
      await page.locator('.rp-nav').getByRole('link',{name:'Menu',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      const close = page.getByRole('button',{name:'Close restaurant menu'});
      await close.focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')),true,'Menu must trap keyboard focus');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog').count(),0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${template} ${width} overflow`);
      await page.locator('#rp-gallery').scrollIntoViewIfNeeded();
      const dots = page.locator('.rp-carousel-dot'); await dots.nth(1).click();
      await page.waitForFunction(()=>document.querySelectorAll('.rp-carousel-dot')[1]?.getAttribute('aria-pressed')==='true',undefined,{timeout:5000});
      assert.equal(await dots.nth(1).getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(__dirname, `${mobileOnly?'mobile-refinement':'website'}-${template.toLowerCase()}-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []); results.push({ screen: 'template-fixture', template, width, overflow: false }); await page.close();
    }
    for (const width of mobileOnly?[390]:[1440, 390]) {
      console.log('Checking editor', width);
      const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${fixtureUrl}?screen=admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByRole('heading', { name: 'Business page studio' }).waitFor();
      if(recommendations){
        await page.locator('#qpb-contact').evaluate(node=>node.open=true);
        await page.getByLabel('Show opening status from structured hours').check();
        await page.getByLabel('Restaurant timezone',{exact:true}).fill('Asia/Kolkata');
        await page.getByLabel('Open on Monday',{exact:true}).check();
        await page.getByLabel('Monday opens 1',{exact:true}).fill('10:00');
        await page.getByLabel('Monday closes 1',{exact:true}).fill('22:00');
        await page.getByRole('button',{name:'Copy Monday hours to all days'}).click();
        await page.getByLabel('Special opening date').fill('2026-12-25');
        await page.getByRole('button',{name:'Add date',exact:true}).click();
        await page.locator('.qpb-more').evaluate(node=>node.open=true);
        await page.locator('#qpb-sharing').evaluate(node=>node.open=true);
        await page.getByLabel('Search title',{exact:true}).fill('River House — Ahmedabad');
        await page.getByLabel('Search description',{exact:true}).fill('Fresh meals on the riverside.');
        await page.locator('#qpb-story').evaluate(node=>node.open=true);
        await page.getByRole('button',{name:'Choose 3 varied dishes for me'}).click();
      }
      if(width < 1000) await page.getByRole('button', {name:'Mobile preview',exact:true}).click();
      await page.locator('.qpb-device .rp-nav-toggle').click();
      await page.locator('.qpb-device .rp-nav').getByRole('link',{name:'Menu',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      const menuOrder=page.locator('dialog a.rp-order');
      const priorUrl=page.url();await menuOrder.click();assert.equal(page.url(),priorUrl,'Preview order must stay private');
      await page.keyboard.press('Escape');
      if(width < 1000) await page.getByRole('button', {name:'Edit page',exact:true}).click();
      await page.locator('#qpb-first-impression').evaluate(node => node.open = true);
      await page.getByLabel('Page heading', { exact: true }).fill('A fresh welcome from River House');
      await page.locator('#qpb-story').evaluate(node => node.open = true);
      await page.locator('.qpb-featured-picker input').first().check();
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Draft saved. Customers still see the published version.').waitFor();
      assert.equal(await page.evaluate(() => window.__pageFixture.saves), 1);
      assert.equal(await page.evaluate(() => window.__pageFixture.publishes), 0);
      await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
      // Select the actual publication action independently of its label wording.
      const action = page.locator('#qpb-review button').last();
      assert.equal(await action.isDisabled(), true);
      await page.getByLabel('I reviewed the design, contact links and affected scope.').check();
      await action.click();
      await page.getByText('Business page published. New visitors receive this version.').waitFor();
      assert.equal(await page.evaluate(() => window.__pageFixture.publishes), 1);
      if(recommendations){
        const content=await page.evaluate(()=>window.__pageFixture.data.published);
        assert.equal(content.seo.title,'River House — Ahmedabad');
        assert.equal(content.businessHours.timezone,'Asia/Kolkata');
        assert.equal(content.businessHours.exceptions[0].date,'2026-12-25');
        assert.equal(content.businessHours.weekly.filter(row=>row.intervals.length===1).length,7);
        assert.deepEqual(content.featuredItemIds,['dish-0','dish-10','dish-20']);
      }
      assert.equal(await page.evaluate(() => window.__pageFixture.data.published.title), 'A fresh welcome from River House');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
        await page.screenshot({ path: path.join(__dirname, `admin-overflow-${width}.png`) });
        console.log('Overflow elements', await page.locator('body *').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter(node => node.right > innerWidth + 1).slice(0, 25)));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(__dirname, `${mobileOnly?'mobile-refinement':'website'}-admin-${width}.png`) });
      assert.deepEqual(errors, []); results.push({ screen: 'real-editor-with-isolated-transport', width, draftSave: true, publishAcknowledgement: true, overflow: false }); await page.close();
    }
  } catch(error) { console.error('Browser check failed:', error); throw error; }
  finally { fs.writeFileSync(path.join(__dirname, twoCodes?'two-qr-types-results.json':recommendations?'recommendations-results.json':mobileOnly?'mobile-results.json':'browser-results.json'), JSON.stringify(results, null, 2)); for (const context of browser.contexts()) await context.unrouteAll({ behavior: 'ignoreErrors' }); await browser.close(); await server.close(); }
  console.log(JSON.stringify({ passedScenarios: results.length, results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
