// Read-only compiled public entry check: no authentication, restaurant or payment traffic.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium, expect } = require('playwright/test');
const root = path.resolve(__dirname, '../../apps/restaurant-system/pos-admin/dist');
const report = path.resolve(__dirname, '../../docs/reports/qr-product-2026-10-10');
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, pathname.replace(/^\/qr\//, '') || 'qr.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'})[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage(), errors = [], apiRequests = [], widths = [320,390,768,1440,1920];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) {apiRequests.push(u.pathname); return route.abort();}
    return u.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/qr/`);
  for (const width of widths) {
    await page.setViewportSize({width,height:960});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await expect(page.getByRole('heading',{name:/Every table/})).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    await page.mouse.wheel(0,600);
    await expect.poll(()=>page.evaluate(()=>scrollY > 0)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:960}); await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:path.join(report,'evidence/qr-product-hero.png')});
  await page.setViewportSize({width:390,height:844}); await page.getByRole('button',{name:'Menu',exact:true}).click();
  await expect(page.locator('#qr-site-nav')).toBeVisible();
  await page.screenshot({path:path.join(report,'evidence/qr-product-mobile.png'),fullPage:true});
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
  fs.writeFileSync(path.join(report,'PUBLIC_LAYOUT_RESULTS.json'), JSON.stringify({status:'PASS',widths,normalScrolling:true,horizontalOverflow:false,apiRequests,pageErrors:errors},null,2));
  console.log('Public QR entry fits five widths, scrolls normally, and makes no API requests.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await browser?.close(); if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
