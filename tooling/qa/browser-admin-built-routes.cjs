// Serve the actual build with the same prefix stripping as the console nginx aliases.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,expect}=require('playwright/test');
const root=path.resolve(__dirname,'../..'),dist=path.join(root,'apps/restaurant-system/pos-admin/dist');
const report=path.join(root,'docs/reports/admin-product-context-2026-10-06');
const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.html':'text/html'};
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/(?:pos-admin|restaurant-admin|kiosk-admin)\//,'/');
  let file=path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html');
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
let browser;
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5287,'localhost',resolve);});
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  // Asset/routing test only. Prevent calls to any real backend from the built default API URL.
  await context.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"message":"Asset-only QA"}'}));
  const page=await context.newPage(),errors=[],assets=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/assets\/.*\.(js|css)(\?|$)/.test(r.url()))assets.push({url:new URL(r.url()).pathname,status:r.status(),contentType:r.headers()['content-type']});});
  for(const route of ['/kiosk-admin/appearance','/restaurant-admin/menu','/pos-admin/staff']){
    await page.goto(`http://localhost:5287${route}`,{waitUntil:'domcontentloaded',timeout:45000});await expect(page.getByPlaceholder('Enter owner password')).toBeVisible({timeout:45000});
  }
  expect(errors).toEqual([]);expect(assets.length).toBeGreaterThan(0);expect(assets.every(a=>a.status===200&&/javascript|css/.test(a.contentType))).toBe(true);
  fs.writeFileSync(path.join(report,'built-route-assets.json'),JSON.stringify({routes:3,errors,assets},null,2));console.log('PASS: three built deep links render; JS/CSS MIME types correct.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
