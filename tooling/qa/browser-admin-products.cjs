// Actual owner login, server entitlements and separate product shells. Isolated QA DB only.
process.env.JAMANVAAR_QA_REPORT_DIR = 'docs/reports/admin-product-context-2026-10-06';
const q = require('./browser-audit-lib.cjs');
const { spawn } = require('node:child_process');
q.ports.admin = 5286; q.ports.kiosk = 5284;
const children = [], streams = [];
const results = [];
function start(script, args, cwd = q.root, env = {}) {
  const stream = q.fs.createWriteStream(q.path.join(q.root, 'logs', `admin-products-server-${children.length}.log`)); streams.push(stream);
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream); child.stderr.pipe(stream); children.push(child);
}
async function ready(port) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) })).status < 500) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  } throw Error(`QA service ${port} did not start`);
}
async function check(page, title, fn) { const passed = await q.test(page, title, fn); results.push({ title, passed }); return passed; }
async function fixture(kind) {
  const stamp = Date.now();
  const { restaurant } = await q.mustApi('POST', '/api/v1/restaurants', { name: `QA ${kind} product ${stamp}`, ownerName: 'QA Owner', ownerEmail: `qa-${kind}-${stamp}@example.invalid`, mobile: '98' + require('node:crypto').randomInt(10000000,100000000), ownerPassword: q.state.ownerPassword, skipInviteEmail: true });
  const applications = kind === 'kiosk' ? ['KIOSK','KIOSK_ADMIN'] : kind === 'restaurant' ? ['POS','POS_ADMIN'] : ['POS','POS_ADMIN','KIOSK','KIOSK_ADMIN','CAPTAIN','KDS'];
  const plan = await q.mustApi('POST','/api/v1/plans',{name:`QA ${kind} product plan ${stamp}`,tier:'PRO',productFamily:kind==='kiosk'?'KIOSK':'RESTAURANT',priceMonthly:100000,maxBranches:2,maxDevices:8,maxUsers:8,entitlements:{}});
  const sub = await q.mustApi('POST','/api/v1/subscriptions',{restaurantId:restaurant.id,planId:plan.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications});
  const key = await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:restaurant.id,allowedDeviceType:kind==='restaurant'?'POS_ADMIN':'KIOSK_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
  return {restaurant,sub,key};
}
async function signIn(page, f, key = null) {
  await page.getByPlaceholder('e.g. JM9876543210').fill(f.restaurant.restaurantCode);
  await page.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
  if (key) { await page.locator('summary').filter({hasText:'Connecting a new device?'}).click(); await page.getByLabel('Admin activation key (optional)').fill(key.code); }
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
}
async function main() {
  if (!/test/i.test(new URL(q.state.databaseUrl).pathname)) throw Error('Dedicated test database required');
  for (const port of [q.state.port,5286,5284]) {
    try { await fetch(`http://localhost:${port}`,{signal:AbortSignal.timeout(300)}); throw Error(`Port ${port} already occupied; no user process was stopped`); }
    catch(e) { if(e.message.includes('occupied'))throw e; }
  }
  start(q.path.join(q.root,'tooling/qa/browser-audit-server.cjs'),[]);
  const vite=q.path.join(q.root,'node_modules/vite/bin/vite.js');
  for(const [app,port] of [['apps/restaurant-system/pos-admin',5286],['apps/kiosk-system/kiosk-user',5284]])start(vite,['--host','localhost','--port',String(port),'--strictPort'],q.path.join(q.root,app),{VITE_CLOUD_API_BASE_URL:`http://localhost:${q.state.port}`,VITE_BRANCH_CORE_URL:''});
  await Promise.all([ready(q.state.port),ready(5286),ready(5284)]);
  const challenge=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});
  const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];
  q.state.platformToken=(await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;q.saveState();
  const kioskOnly=await fixture('kiosk'), both=await fixture('both'), restaurantOnly=await fixture('restaurant');
  let customer;
  const stamp=Date.now(); const k=await q.open('admin',`product-kiosk-${stamp}`), b=await q.open('admin',`product-both-${stamp}`), r=await q.open('admin',`product-restaurant-${stamp}`);
  const requireKiosk=async p=>{await q.expect(p.getByTestId('kiosk-dashboard')).toBeVisible({timeout:45000});await q.expect(p).toHaveURL(/\/kiosk-admin\/dashboard$/);};
  await check(k,'Kiosk-only owner signs in and activates on one form; complete Kiosk Admin opens automatically',async()=>{
    await signIn(k,kioskOnly,kioskOnly.key);await requireKiosk(k);
    await q.expect(k.getByRole('button',{name:'Inventory & Recipes',exact:true})).toHaveCount(0);
    await q.expect(k.getByLabel('Switch application')).toHaveCount(0);
    return {singleLogin:true,identity:'Kiosk Admin',posPagesHidden:true};
  });
  await check(k,'Every recovered Kiosk Admin navigation page mounts under its own route',async()=>{
    const paths=['terminals','menu','options','appearance','combos','coupons','orders','kitchen','tables','staff','payments','feedback','reports','printers','receipts','settings','sync','subscription','audit','backup','support'];
    for(const path of paths){await k.goto(`http://localhost:5286/kiosk-admin/${path}`);await q.expect(k.locator('main').first()).toBeVisible({timeout:45000});await q.expect(k.locator('aside [aria-current="page"]')).toHaveCount(1);q.expect(new URL(k.url()).pathname).toBe(`/kiosk-admin/${path}`);q.expect((await k.locator('main').first().innerText()).trim().length).toBeGreaterThan(12);}
    await k.goto('http://localhost:5286/kiosk-admin/templates');await q.expect(k.getByRole('dialog',{name:'Load Restaurant Menu Template'})).toBeVisible({timeout:45000});await k.getByRole('button',{name:'Close',exact:true}).click();q.expect(new URL(k.url()).pathname).toBe('/kiosk-admin/menu');
    return {pagesMounted:paths.length+1};
  });
  await check(k,'Refresh, deep links, browser back/forward and rotated cloud token preserve kiosk context',async()=>{
    await k.getByRole('button',{name:'Kiosk Appearance & Content',exact:true}).click();await q.expect(k.getByTestId('kiosk-content-panel')).toBeVisible();await k.reload();await q.expect(k.getByTestId('kiosk-content-panel')).toBeVisible({timeout:45000});
    await k.getByRole('button',{name:'Kiosk Terminals',exact:true}).click();await k.goBack();await q.expect(k.getByTestId('kiosk-content-panel')).toBeVisible();await k.goForward();await q.expect(k.getByRole('heading',{name:'Kiosk Terminal Control'})).toBeVisible();
    let intercepted=false, refreshed=false;k.on('response',response=>{if(response.url().endsWith('/tenant-auth/refresh')&&response.status()===200)refreshed=true;});
    await k.route('**/api/v1/tenant/me/applications',async route=>{if(!intercepted){intercepted=true;await route.fulfill({status:401,contentType:'application/json',body:'{"message":"QA expired access token"}'});}else await route.continue();});
    await k.reload();await q.expect(k.getByRole('heading',{name:'Kiosk Terminal Control'})).toBeVisible({timeout:45000});q.expect(refreshed).toBe(true);await k.unroute('**/api/v1/tenant/me/applications');
    return {refresh:true,history:true,tokenRefresh:true};
  });
  await check(b,'All-products owner with kiosk key opens full Kiosk Admin and switches to distinct Restaurant Admin',async()=>{
    await signIn(b,both,both.key);await requireKiosk(b);await q.expect(b.getByRole('button',{name:'Payments & Payouts',exact:true})).toBeVisible();
    await b.getByRole('button',{name:'Kiosk Appearance & Content',exact:true}).click();await b.getByLabel('Switch application').selectOption('POS_ADMIN');await q.expect(b.getByRole('button',{name:'Inventory & Recipes',exact:true})).toBeVisible();
    await q.expect(b.getByRole('button',{name:'Kiosk Terminals',exact:true})).toHaveCount(0);await b.getByRole('button',{name:'Staff & Roles (RBAC)',exact:true}).click();await b.getByLabel('Switch application').selectOption('KIOSK_ADMIN');await q.expect(b.getByTestId('kiosk-content-panel')).toBeVisible();
    await b.reload();await q.expect(b.getByTestId('kiosk-content-panel')).toBeVisible({timeout:45000});await b.getByLabel('Switch application').selectOption('POS_ADMIN');q.expect(new URL(b.url()).pathname).toBe('/restaurant-admin/staff');
    return {fullKioskOnCombinedPlan:true,independentPagesRestored:true};
  });
  await check(b,'Shared menu edits from Restaurant Admin reach full Kiosk Admin and a separate customer kiosk',async()=>{
    await b.getByLabel('Switch application').selectOption('KIOSK_ADMIN');await b.getByRole('button',{name:'Menu & Categories',exact:true}).click();
    await b.getByRole('button',{name:'Load Menu Template',exact:true}).first().click();const dialog=b.getByRole('dialog',{name:'Load Restaurant Menu Template'});
    await dialog.getByLabel('Select category Garlic Bread',{exact:true}).check();
    const taxOptions=dialog.getByLabel('Template tax group').locator('option');if(await taxOptions.count()>1)await dialog.getByLabel('Template tax group').selectOption(await taxOptions.nth(1).getAttribute('value'));
    await dialog.getByRole('button',{name:/Load \d+ Selected Items/}).click();await q.expect(dialog.getByRole('status')).toContainText('Published to connected terminals.',{timeout:45000});await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await b.getByPlaceholder('Search dish by name, description, SKU or tag...').fill('Garlic Bread');await q.expect(b.getByRole('heading',{name:'Garlic Bread',exact:true})).toBeVisible();
    await b.getByLabel('Switch application').selectOption('POS_ADMIN');await b.getByRole('button',{name:'Menu & Categories',exact:true}).click();
    await b.getByPlaceholder('Search dish by name, description, SKU or tag...').fill('Garlic Bread');await b.getByTitle('Click to change the price').first().click();await b.getByLabel('New price for Garlic Bread',{exact:true}).fill('155');await b.getByLabel('New price for Garlic Bread',{exact:true}).press('Enter');
    await b.getByLabel('Switch application').selectOption('KIOSK_ADMIN');await b.getByRole('button',{name:'Menu & Categories',exact:true}).click();await b.getByPlaceholder('Search dish by name, description, SKU or tag...').fill('Garlic Bread');await q.expect(b.getByTitle('Click to change the price').first()).toContainText('155');
    customer=await q.open('kiosk',`product-customer-${stamp}`);const key=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:both.restaurant.id,allowedDeviceType:'KIOSK',expiresAt:new Date(Date.now()+86400000).toISOString()});
    await customer.locator('#kiosk-restaurant-code').fill(both.restaurant.restaurantCode);await customer.locator('#kiosk-activation-key').fill(key.code);await customer.getByRole('button',{name:'Activate Kiosk',exact:true}).click();await q.expect(customer.getByRole('button',{name:/^(Start Order|Order From Our Cafe)$/})).toBeVisible({timeout:45000});
    await customer.getByRole('button',{name:/^(Start Order|Order From Our Cafe)$/}).click();await customer.getByRole('button',{name:/English/}).click();await customer.getByRole('button',{name:/Takeaway/i}).click();await q.expect(customer.getByRole('button',{name:'Add Garlic Bread to cart',exact:true})).toBeVisible({timeout:45000});await q.expect(customer.locator('div.group').filter({has:customer.getByRole('button',{name:'Add Garlic Bread to cart',exact:true})}).first()).toContainText('155');await q.snap(customer,'customer-kiosk-shared-price');
    return {sameMenuAcrossProducts:true,customerPrice:155};
  });
  await check(b,'Appearance and receipt edits in Kiosk Admin publish to the separate customer kiosk',async()=>{
    if(!customer)throw Error('Customer kiosk must be activated by the prior cross-app test');
    await b.getByRole('button',{name:'Kiosk Appearance & Content',exact:true}).click();const heading=`QA Welcome ${stamp}`;await b.getByLabel('Welcome heading',{exact:true}).fill(heading);await b.getByRole('button',{name:'Save & Publish Kiosk Settings',exact:true}).click();await q.expect(b.getByRole('status')).toContainText('Kiosk settings published.',{timeout:45000});
    const modulePath='/@fs/'+q.path.join(q.root,'packages/database/src/index.ts').replace(/\\/g,'/');
    await customer.waitForFunction(async ({modulePath,heading})=>(await import(modulePath)).db.welcomeScreenSettings.headingText===heading,{modulePath,heading},{timeout:30000});
    await b.getByRole('button',{name:'Receipt & E-Bill',exact:true}).click();const closing=`QA Thank You ${stamp}`;await b.locator('label').filter({hasText:'Thank You Closing Message'}).locator('..').locator('input').fill(closing);await b.getByRole('button',{name:'Save Receipt Settings',exact:true}).click();await q.expect(b.getByRole('status')).toContainText('Receipt settings published',{timeout:45000});
    await customer.waitForFunction(async ({modulePath,closing})=>(await import(modulePath)).db.receiptConfig.thankYouMessage===closing,{modulePath,closing},{timeout:30000});await q.snap(b,'kiosk-admin-receipt-workspace');return {appearanceSynced:true,receiptSynced:true,customerRefreshRequired:false};
  });
  await check(r,'Restaurant-only owner opens Restaurant Admin; typing kiosk route does not grant access',async()=>{
    await signIn(r,restaurantOnly,restaurantOnly.key);await q.expect(r.getByRole('button',{name:'Inventory & Recipes',exact:true})).toBeVisible({timeout:45000});q.expect(new URL(r.url()).pathname).toBe('/restaurant-admin/dashboard');
    await r.goto('http://localhost:5286/kiosk-admin/appearance');await q.expect(r.getByRole('alert')).toContainText('not enabled',{timeout:45000});await q.expect(r.getByTestId('kiosk-content-panel')).toHaveCount(0);
    await r.getByRole('button',{name:/Restaurant Admin.*Restaurant operations/s}).click();await q.expect(r.locator('main').first()).toBeVisible();
    return {unauthorizedDeepLinkBlocked:true};
  });
  await check(k,'Kiosk-only shared device cannot read/write POS-only resources; tenant fleet isolation holds',async()=>{
    const token=await k.evaluate(()=>localStorage.getItem('jamanvaar_cloud_device_token'));
    for(const entity of ['INVENTORY_ITEM','CUSTOMER','SHIFT','RESERVATION']){const response=await q.api('GET',`/api/v1/entity-sync/${entity}?afterSeq=0`,undefined,token);q.expect(response.status).toBe(403);q.expect(response.body.code).toBe('PRODUCT_ACCESS_DENIED');}
    const denied=await q.api('POST','/api/v1/entity-sync/INVENTORY_ITEM',{events:[{externalId:'qa-denied',payload:{id:'qa-denied',name:'Denied'}}]},token);q.expect(denied.status).toBe(403);
    const key=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:both.restaurant.id,allowedDeviceType:'KIOSK',expiresAt:new Date(Date.now()+86400000).toISOString()});
    const other=await q.mustApi('POST','/api/v1/activation/redeem',{code:key.code,deviceType:'KIOSK'});
    const fleet=await q.mustApi('GET','/api/v1/devices/me/fleet',undefined,token);q.expect(fleet.devices.some(d=>d.id===other.device.id)).toBe(false);
    q.expect((await q.api('POST',`/api/v1/devices/me/fleet/${other.device.id}/commands`,{commandType:'LOCK'},token)).status).toBe(404);
    return {resourceGates:true,crossTenantCommandsBlocked:true};
  });
  await check(k,'Logout/login and browser reopen restore kiosk workspace without consuming another activation key',async()=>{
    await k.goto('http://localhost:5286/kiosk-admin/appearance');await q.expect(k.getByTestId('kiosk-content-panel')).toBeVisible({timeout:45000});await k.getByRole('button',{name:'Logout',exact:true}).click();await q.expect(k.getByPlaceholder('Enter owner password')).toBeVisible();await signIn(k,kioskOnly);await q.expect(k.getByTestId('kiosk-content-panel')).toBeVisible({timeout:45000});await q.expect(k.getByRole('heading',{name:'Connect this admin device'})).toHaveCount(0);
    await k._audit.ctx.close();const reopened=await q.open('admin',`product-kiosk-${stamp}`);await q.expect(reopened.getByTestId('kiosk-content-panel')).toBeVisible({timeout:45000});return {ownerRelogin:true,realBrowserReopen:true};
  });
  await check(b,'Disabling kiosk entitlement removes kiosk context while Restaurant Admin remains usable',async()=>{
    await b.getByLabel('Switch application').selectOption('KIOSK_ADMIN');await b.getByRole('button',{name:'Kiosk Appearance & Content',exact:true}).click();await q.expect(b.getByTestId('kiosk-content-panel')).toBeVisible();await q.mustApi('PATCH',`/api/v1/subscriptions/${both.sub.id}/applications/KIOSK_ADMIN`,{enabled:false});await b.reload();await q.expect(b.getByRole('alert')).toContainText('not enabled',{timeout:45000});await q.expect(b.getByTestId('kiosk-content-panel')).toHaveCount(0);
    await b.getByRole('button',{name:/Restaurant Admin.*Restaurant operations/s}).click();await q.expect(b.getByRole('button',{name:'Inventory & Recipes',exact:true})).toBeVisible();return {revocationFailsClosed:true,otherProductContinues:true};
  });
  await q.snap(b,'restaurant-admin-shell');
  q.fs.writeFileSync(q.path.join(q.reportDir,'browser-results.json'),JSON.stringify(results,null,2));
}
main().catch(e=>{console.error('Admin product QA:',e.message);process.exitCode=1;}).finally(async()=>{await q.close();for(const c of children)c.kill();for(const s of streams)s.end();});
