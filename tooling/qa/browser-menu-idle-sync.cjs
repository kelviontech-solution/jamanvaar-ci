// Production-like shared origin: two owner tabs and customer Kiosk, actual built apps/API.
const completeness = process.env.JAMANVAAR_QA_MENU_COMPLETENESS === '1';
process.env.JAMANVAAR_QA_REPORT_DIR = completeness ? 'docs/reports/menu-completeness-2026-10-06' : 'docs/reports/menu-idle-sync-2026-10-06';
const q = require('./browser-audit-lib.cjs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright/test');
const port = 5288, base = `http://localhost:${port}`;
const scrub = value => String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT REDACTED]').replace(/JMV-[A-Z0-9-]+/g,'[ACTIVATION KEY REDACTED]').split(q.state.platformPassword).join('[PASSWORD REDACTED]').split(q.state.ownerPassword).join('[PASSWORD REDACTED]');
let api, browser, server, log;
const pages = [];
const results = [], writes = [];
const report = async (title, run) => {
  try { const evidence = await run(); results.push({ title, passed: true, evidence }); console.log(`PASS ${title}`); }
  catch (error) { results.push({ title, passed: false, error: scrub(error.message) }); console.log(`FAIL ${title}: ${scrub(error.message)}`); throw error; }
};
async function ready(url) { for (let i=0;i<100;i++) { try { if ((await fetch(url,{signal:AbortSignal.timeout(500)})).status<500) return; } catch {} await new Promise(r=>setTimeout(r,300)); } throw Error('QA service did not start'); }
async function main() {
  if (!/test/i.test(new URL(q.state.databaseUrl).pathname)) throw Error('Dedicated test database required');
  if(completeness)for(const app of ['apps/restaurant-system/pos-admin','apps/kiosk-system/kiosk-user']){
    const assets=q.path.join(q.root,app,'dist/assets');
    if(!q.fs.readdirSync(assets).filter(f=>/^index.*\.js$/.test(f)).some(f=>q.fs.readFileSync(q.path.join(assets,f),'utf8').includes(':catalog_checkpoint')))
      throw Error(`${app} build does not yet include the menu completeness fix`);
  }
  for (const p of [port,q.state.port]) {
    try { await fetch(`http://localhost:${p}`,{signal:AbortSignal.timeout(300)}); throw Error(`Port ${p} occupied; no user process stopped`); }
    catch(error) { if(error.message.includes('occupied')) throw error; }
  }
  log=q.fs.createWriteStream(q.path.join(q.root,'logs/menu-idle-sync-api.log'));
  api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,windowsHide:true,stdio:['ignore','pipe','pipe']}); api.stdout.pipe(log);api.stderr.pipe(log);
  await ready(`http://localhost:${q.state.port}/health`);
  console.log('QA API ready');
  server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,base).pathname;
    if(pathname.startsWith('/api/')) {
      if(req.method==='POST' && /entity-sync\/(MENU_ITEM|MENU_CATEGORY)$/.test(pathname)) writes.push({path:pathname,at:Date.now()});
      const headers={...req.headers,host:`localhost:${q.state.port}`}; delete headers.origin;
      const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},upstream=>{
        res.writeHead(upstream.statusCode,{...upstream.headers,'access-control-allow-origin':base,'access-control-allow-credentials':'true'});upstream.pipe(res);
      });proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;
    }
    const kiosk=pathname.startsWith('/kiosk/');
    const root=q.path.join(q.root,kiosk?'apps/kiosk-system/kiosk-user/dist':'apps/restaurant-system/pos-admin/dist');
    const stripped=pathname.replace(/^\/(?:kiosk|restaurant-admin|kiosk-admin|pos-admin)(?:\/|$)/,'').replace(/^\/+/, '');
    let file=q.path.resolve(root,stripped||'index.html');
    if(!file.startsWith(root+q.path.sep) && file!==root) {res.writeHead(403);res.end();return;}
    if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.wasm':'application/wasm'};
    res.writeHead(200,{'Content-Type':mime[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
  }); await new Promise(r=>server.listen(port,'localhost',r));
  const challenge=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});
  const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];
  q.state.platformToken=(await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;q.saveState();
  const stamp=Date.now();
  console.log('QA platform session ready');
  const {restaurant}=await q.mustApi('POST','/api/v1/restaurants',{name:`QA idle sync ${stamp}`,ownerName:'QA Owner',ownerEmail:`qa-idle-${stamp}@example.invalid`,mobile:'98'+require('node:crypto').randomInt(10000000,100000000),ownerPassword:q.state.ownerPassword,skipInviteEmail:true});
  const plan=await q.mustApi('POST','/api/v1/plans',{name:`QA idle sync ${stamp}`,tier:'PRO',productFamily:'RESTAURANT',priceMonthly:100000,maxBranches:2,maxDevices:8,maxUsers:8,entitlements:{}});
  await q.mustApi('POST','/api/v1/subscriptions',{restaurantId:restaurant.id,planId:plan.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS','POS_ADMIN','KIOSK','KIOSK_ADMIN','KDS','CAPTAIN']});
  const key=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:restaurant.id,allowedDeviceType:'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960}});
  console.log('Isolated fixture and shared-origin browser ready');
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();});
  const admin=await context.newPage(),other=await context.newPage(),kiosk=await context.newPage();
  pages.push(admin,other,kiosk);
  for (const [i,page] of pages.entries()) {
    page.on('console',msg=>{if(msg.type()==='error')console.log(`Browser ${i}: ${scrub(msg.text()).slice(0,300)}`);});
    page.on('response',res=>{if(res.status()>=400 && res.url().includes('/api/'))console.log(`API ${i}: ${res.status()} ${new URL(res.url()).pathname}`);});
  }
  const pageErrors=[];for(const page of [admin,other,kiosk])page.on('pageerror',e=>pageErrors.push(scrub(e.message)));
  await admin.goto(base+'/restaurant-admin/menu');
  console.log('Admin login loaded');
  await admin.getByPlaceholder('e.g. JM9876543210').fill(restaurant.restaurantCode);await admin.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
  await admin.locator('summary').filter({hasText:'Connecting a new device?'}).click();await admin.getByLabel('Admin activation key (optional)').fill(key.code);await admin.getByRole('button',{name:'Sign In',exact:true}).click();
  await q.expect(admin.getByRole('button',{name:'Menu & Categories',exact:true})).toBeVisible({timeout:60000});
  console.log('Admin signed in');
  const token=await admin.evaluate(()=>localStorage.getItem('jamanvaar_cloud_device_token'));
  const now=new Date().toISOString();
  const categories=[['thali','Gujarati Thali Special'],['breads','Rotli, Bhakri & Thepla'],['sweets','Sweets & Mithai'],['drinks','Chaas & Beverages']].map(([id,name],i)=>({id,name,slug:id,sortOrder:i,isActive:true,updatedAt:now}));
  const items=[['thali','Royal Gujarati Grand Thali',299],['breads','Methi Thepla (4 Pcs)',70],['sweets','Rich Basundi Bowl',110],['drinks','Kathiyawadi Masala Chaas',40]].map(([categoryId,name,price],i)=>({id:`qa-dish-${i}`,categoryId,name,sku:`QA-${i}`,price,description:'QA restaurant dish',dietaryType:'VEG',spiceLevel:'NONE',isAvailable:true,isPopular:false,isNew:false,isFeatured:false,prepTimeMinutes:5,allergens:[],modifierGroupIds:[],sortOrder:i,updatedAt:now}));
  if (completeness) for(let i=4;i<20;i++)items.push({...items[i%4],id:`qa-dish-${i}`,name:`Gujarati Dish ${i+1}`,sku:`QA-${i}`,sortOrder:i,price:100+i});
  await q.mustApi('POST','/api/v1/entity-sync/MENU_CATEGORY',{events:categories.map(payload=>({externalId:payload.id,payload}))},token);
  await q.mustApi('POST','/api/v1/entity-sync/MENU_ITEM',{events:items.map(payload=>({externalId:payload.id,payload}))},token);
  await q.expect(admin.getByText(items[1].name,{exact:true}).first()).toBeVisible({timeout:60000});
  await other.goto(base+'/kiosk-admin/menu');await q.expect(other.getByText(items[1].name,{exact:true}).first()).toBeVisible({timeout:60000});
  console.log('Two admin tabs have the shared menu');
  await kiosk.goto(base+'/kiosk/');const customerKey=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:restaurant.id,allowedDeviceType:'KIOSK',expiresAt:new Date(Date.now()+86400000).toISOString()});
  await kiosk.locator('#kiosk-restaurant-code').fill(restaurant.restaurantCode);await kiosk.locator('#kiosk-activation-key').fill(customerKey.code);await kiosk.getByRole('button',{name:'Activate Kiosk',exact:true}).click();
  await kiosk.getByRole('button',{name:'Start Order',exact:true}).click({timeout:60000});await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();
  await q.expect(kiosk.getByRole('button',{name:`Add ${items[1].name} to cart`,exact:true})).toBeVisible({timeout:60000});
  console.log('Customer kiosk menu ready');
  if (completeness) {
    await report('Admin publishes 20 dishes and customer kiosk displays all 20',async()=>{
      await q.expect(kiosk.locator('button[aria-label^="Add "]')).toHaveCount(20,{timeout:45000});
      await q.expect(admin.getByText('20 ITEMS',{exact:true})).toBeVisible();
      const stored=await kiosk.evaluate(()=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_menu_items')).length);
      q.expect(stored).toBe(20);return {adminItems:20,customerItems:20};
    });
    await report('An already caught-up kiosk with only four persisted dishes recovers all 20 after reopening',async()=>{
      const originalDevice=await kiosk.evaluate(()=>localStorage.getItem('jamanvaar_cloud_device_id'));
      const damage=await kiosk.evaluate(async()=>{
        const store=window.__jamanvaarStorage,items=JSON.parse(store.getItem('jamanvaar_db_menu_items'));
        const cursors=store.keys().filter(k=>k.includes('entity_sync_cursor_MENU_ITEM')&&!k.includes(':'));
        store.setItem('jamanvaar_db_menu_items',JSON.stringify(items.slice(0,4)));await store.flush();
        return {cachedItems:JSON.parse(store.getItem('jamanvaar_db_menu_items')).length,cursors:store.keys().filter(k=>k.includes('entity_sync_cursor_MENU_ITEM')&&k.includes('catalog_checkpoint')).length};
      });q.expect(damage.cachedItems).toBe(4);q.expect(damage.cursors).toBeGreaterThan(0);
      const requestCursors=[];kiosk.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/entity-sync/MENU_ITEM')requestCursors.push(new URL(r.url()).searchParams.get('afterSeq'));});
      await kiosk.reload();await kiosk.getByRole('button',{name:'Start Order',exact:true}).click({timeout:45000});await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();
      await q.expect(kiosk.locator('button[aria-label^="Add "]')).toHaveCount(20,{timeout:45000});
      q.expect(requestCursors).toContain('0');q.expect(await kiosk.evaluate(()=>localStorage.getItem('jamanvaar_cloud_device_id'))).toBe(originalDevice);
      return {damagedCache:4,recoveredItems:20,fullCatchUpRequested:true,activationPreserved:true};
    });
  }
  await report('Idle tabs on one production-like origin do not change the menu or upload it',async()=>{
    await admin.waitForTimeout(2000);const before=writes.length;const samples=[];
    for(let i=0;i<18;i++) { samples.push(await kiosk.locator('button[aria-label^="Add "]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')).sort())); await admin.waitForTimeout(1000); }
    for(const sample of samples)q.expect(sample).toEqual(items.map(i=>`Add ${i.name} to cart`).sort());q.expect(writes.length-before).toBe(0);
    return {idleSeconds:18,unsolicitedMenuPosts:0,sameOrigin:true,ownerTabs:2,customerKiosks:1};
  });
  await report('A real category edit reaches both admin workspaces and customer kiosk without bouncing back',async()=>{
    await q.mustApi('POST','/api/v1/entity-sync/MENU_ITEM',{events:[{externalId:items[1].id,payload:{...items[1],name:'Kathiyawadi Bajra Rotla',categoryId:'drinks',updatedAt:new Date().toISOString()}}]},token);
    for(const p of [admin,other,kiosk])await q.expect(p.getByText('Kathiyawadi Bajra Rotla',{exact:true}).first()).toBeVisible({timeout:60000});
    await admin.waitForTimeout(2000);const before=writes.length;
    for(let i=0;i<10;i++){for(const p of [admin,other,kiosk])await q.expect(p.getByText('Methi Thepla (4 Pcs)',{exact:true})).toHaveCount(0);await admin.waitForTimeout(1000);}
    q.expect(writes.length-before).toBe(0);return {propagated:true,unsolicitedMenuPosts:0,stableSeconds:10};
  });
  await report('Background updates do not replace an open unsaved dish form',async()=>{
    await admin.locator('button[title="Edit Dish"]').first().click();const dialog=admin.getByRole('dialog');await dialog.getByPlaceholder('e.g. Paneer Butter Masala').fill('Owner unsaved draft');
    await q.mustApi('POST','/api/v1/entity-sync/MENU_CATEGORY',{events:[{externalId:'drinks',payload:{...categories[3],description:'Updated on another terminal',updatedAt:new Date().toISOString()}}]},token);
    await admin.waitForTimeout(5000);q.expect(await dialog.getByPlaceholder('e.g. Paneer Butter Masala').inputValue()).toBe('Owner unsaved draft');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();return {draftRetained:true};
  });
  q.expect(pageErrors).toEqual([]);await kiosk.screenshot({path:q.path.join(q.reportDir,'evidence/stable-customer-menu.png'),fullPage:true});
}
main().catch(e=>{console.error(scrub(e.stack||e.message));process.exitCode=1;}).finally(async()=>{
  q.fs.writeFileSync(q.path.join(q.reportDir,'browser-results.json'),JSON.stringify(results,null,2));
  if(process.exitCode)for(const [i,page] of pages.entries()) {
    try { await page.screenshot({path:q.path.join(q.reportDir,`evidence/failure-${i}.png`),fullPage:true});q.fs.writeFileSync(q.path.join(q.reportDir,`evidence/failure-${i}.txt`),scrub(await page.locator('body').innerText())); }catch{}
  }
  await browser?.close();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));api?.kill();log?.end();
});
