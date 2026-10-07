// Compiled Captain, two KDS devices, POS and Kiosk against an isolated API/database.
process.env.JAMANVAAR_QA_REPORT_DIR=process.env.JAMANVAAR_QA_REPORT_DIR||(process.env.JAMANVAAR_TEMPLATE_PHOTOS_QA ? 'docs/reports/template-images-2026-10-07' : 'docs/reports/menu-photos-2026-10-07');
const q=require('./browser-audit-lib.cjs'),http=require('node:http'),{spawn}=require('node:child_process'),crypto=require('node:crypto');
const {chromium,expect}=require('playwright/test');
const port=5290,base=`http://localhost:${port}`;let api,browser,server,prisma,restaurantId,planId,admin,kdsToken,posToken,qr,qrId,branchId;
const results=[],timings=[],errors=[];
const test=async(title,run)=>{const t=performance.now();try{const evidence=await run();results.push({title,passed:true,ms:+(performance.now()-t).toFixed(2),evidence});console.log('PASS '+title);}catch(e){results.push({title,passed:false,error:e.message});throw e;}};
const call=async(method,path,body,token)=>{const r=await q.api(method,path,body,token??'');if(r.status>=400)throw Error(`${method} ${path.replace(/\/q\/[^/]+/g,'/q/[token]')}: ${r.status}: ${r.body?.message}`);return r.body;};
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(500)})).status<500)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('QA API did not start');}
const push=(type,id,payload)=>call('POST',`/api/v1/entity-sync/${type}`,{events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]},admin);
const saved=ref=>prisma.runAsPlatform(tx=>tx.syncedOrder.findUniqueOrThrow({where:{publicOrderId:ref}}));
async function paid(ref){const order=await saved(ref),pay=await prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.findFirstOrThrow({where:{order:{externalOrderId:order.externalOrderId}}}));const payload={event:'payment_link.paid',payload:{payment_link:{entity:{id:`plink_${pay.providerOrderId}`,reference_id:pay.providerOrderId,amount:pay.amount,currency:pay.currency,status:'paid'}},payment:{entity:{id:`pay_${pay.id}`,amount:pay.amount,currency:pay.currency,status:'captured'}}}};const raw=JSON.stringify(payload);const res=await fetch(`http://localhost:${q.state.port}/api/v1/payments/razorpay/webhook`,{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':crypto.createHmac('sha256',q.state.jwtSecret).update(raw).digest('hex')},body:raw});expect(res.status).toBe(200);}
async function main(){
 if(!/test/i.test(new URL(q.state.databaseUrl).pathname))throw Error('Dedicated test DB required');
 for(const p of [port,q.state.port]){try{await fetch(`http://localhost:${p}`,{signal:AbortSignal.timeout(300)});throw Error(`Port ${p} occupied; existing servers preserved`);}catch(e){if(e.message.includes('occupied'))throw e;}}
 const log=q.fs.createWriteStream(q.path.join(q.root,'logs/menu-photos-browser-api.log'));
 api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,env:{...process.env,JAMANVAAR_QA_QR_PAYMENTS:'1',JAMANVAAR_QA_QR_ORIGIN:base},windowsHide:true,stdio:['ignore','pipe','pipe']});api.stdout.pipe(log);api.stderr.pipe(log);await ready(`http://localhost:${q.state.port}/health`);
 const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));process.env.DATABASE_URL=q.state.databaseUrl;prisma=new PrismaService();await prisma.$connect();
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,base).pathname;
  if(pathname.startsWith('/api/')){const headers={...req.headers,host:`localhost:${q.state.port}`};delete headers.origin;const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},up=>{res.writeHead(up.statusCode,{...up.headers,'access-control-allow-origin':base,'access-control-allow-credentials':'true'});up.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;}
  const roots={'kds':'apps/restaurant-system/kds/dist','pos':'apps/restaurant-system/pos/dist','restaurant-admin':'apps/restaurant-system/pos-admin/dist','captain':'apps/restaurant-system/captain/dist','kiosk':'apps/kiosk-system/kiosk-user/dist','q':'apps/qr-guest/dist'};
  const app=pathname.split('/')[1],root=q.path.join(q.root,roots[app]||'cloud/super-admin-web/dist');
  const relative=roots[app]?pathname.slice(app.length+2):pathname.slice(1);let file=q.path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+q.path.sep)){res.writeHead(403);res.end();return;}
  if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'})[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(port,'localhost',r));
 const challenge=await call('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];const platform=(await call('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;
 const stamp=Date.now(),rest=await call('POST','/api/v1/restaurants',{name:`QA Kiosk KDS ${stamp}`,mobile:'9'+String(stamp).slice(-9),ownerName:'QA Owner',ownerEmail:`qa-qr-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);restaurantId=rest.restaurant.id;
 const plan=await call('POST','/api/v1/plans',{name:`QA Kiosk KDS ${stamp}`,tier:'QR',priceMonthly:900000,maxBranches:2,maxDevices:10,maxUsers:10,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true,captainApp:true,posAssistant:true}},platform);planId=plan.id;
 await call('POST','/api/v1/subscriptions',{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS','POS_ADMIN','KDS','QR_ORDERING','KIOSK','KIOSK_ADMIN','CAPTAIN']},platform);
 branchId=await prisma.runAsTenant(restaurantId,async tx=>(await tx.branch.findFirstOrThrow({where:{restaurantId}})).id);
 const activate=async type=>{const key=await call('POST','/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return call('POST','/api/v1/activation/redeem',{code:key.code,deviceType:type});};
 const ad=await activate('POS_ADMIN'); admin=ad.deviceToken;const kd=await activate('KDS');kdsToken=kd.deviceToken;const pd=await activate('POS');posToken=pd.deviceToken;const kioskDevice=await activate('KIOSK');const captainKey=await call('POST','/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:'CAPTAIN',expiresAt:new Date(Date.now()+86400000).toISOString()},platform),secondKdsDevice=await activate('KDS');
 const manifest=JSON.parse(q.fs.readFileSync(q.path.join(q.root,'packages/assets/menu/description-matched-v1/manifest.json'),'utf8'));
 const dishes=manifest.photos.filter(photo=>!['paneer-rice-meal.webp','masala-chaas.webp'].includes(photo.file));expect(dishes).toHaveLength(20);
 await push('MENU_CATEGORY','mains',{name:'Gujarati Specialities',isActive:true,sortOrder:1,imageUrl:'/assets/menu/common/menu-placeholder-v2.svg'});
 await push('MENU_CATEGORY','cat-combos',{name:'Combos',isActive:true,sortOrder:2});
 for(const [index,photo]of dishes.entries())await push('MENU_ITEM','photo-'+photo.file.replace('.webp',''),{name:photo.name,description:photo.description,sku:'PHOTO-'+index,categoryId:'mains',price:90+index,isAvailable:true,isKioskEnabled:true,dietaryType:'VEG',modifierGroupIds:[],sortOrder:index+1,imageUrl:photo.legacyImage||'/assets/menu/common/menu-placeholder-v2.svg'});
 const comboName='Indian Multi-Cuisine Diner Meal Deal';
 await push('COMBO','meal',{name:comboName,description:'Paneer Lababdar Special with Steamed Rice.',basePrice:351,originalPrice:390,savingsAmount:39,mainItemIds:['photo-steamed-rice'],sideItemIds:[],drinkItemIds:[],dessertItemIds:[],isAvailable:true,imageUrl:'/assets/menu/common/menu-placeholder-v2.svg'});
 await push('MENU_ITEM','combo-meal',{name:comboName,description:'Paneer Lababdar Special with Steamed Rice.',sku:'COMBO-MEAL',categoryId:'cat-combos',price:351,isAvailable:true,isKioskEnabled:true,dietaryType:'VEG',modifierGroupIds:[],sortOrder:50,imageUrl:'/assets/menu/common/menu-placeholder-v2.svg'});
 await push('DINING_TABLE','table-2',{tableNumber:'TN2',capacity:4,isActive:true,branchId});await call('POST','/api/v1/menu/publish',{},admin);
 const code=await call('POST','/api/v1/restaurant/qr/tables/table-2/generate',{branchId},admin);qr=code.url.split('/q/')[1];
 const captainPin='3579',cashierPin='2468';
 for(const [id,name,roleId,pin]of [['photo-captain','Photo Captain','role-captain',captainPin],['photo-cashier','Photo Cashier','role-cashier',cashierPin]]){const salt=crypto.randomBytes(16),hash=crypto.pbkdf2Sync(`${restaurantId}:${pin}`,salt,100000,32,'sha256').toString('hex');await push('STAFF_USER',id,{restaurantId,pinScope:restaurantId,fullName:name,roleId,isActive:true,pinHash:`pinv2:${salt.toString('hex')}:${hash}`,branchId});}
 browser=await chromium.launch({headless:true});
 const routes=route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();};
 const devicePage=async(app,device,prefix)=>{const context=await browser.newContext({viewport:{width:1366,height:950}});await context.route('**/*',routes);await context.addInitScript(({restaurantId,device,prefix,app})=>{if(device.device)for(const[k,v]of Object.entries({restaurant_id:restaurantId,device_id:device.device.id,device_token:device.deviceToken}))localStorage.setItem(prefix+k,v);localStorage.setItem(`jamanvaar_app_${app}:jamanvaar_db_tables`,'[]');localStorage.setItem(`jamanvaar_app_${app}:jamanvaar_db_floor_plan_started_empty`,'true');},{restaurantId,device,prefix,app});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;};
 const kiosk=await devicePage('kiosk-user',kioskDevice,'jamanvaar_kiosk_user_');await kiosk.goto(base+'/kiosk/');await kiosk.getByRole('button',{name:'Start Order',exact:true}).click({timeout:60000});await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();
 const grid=kiosk.getByTestId('kiosk-menu-grid');
 // Menu items and promotions hydrate independently. A backing dish alone is not a loaded combo.
 const comboReadyAt=performance.now();
 await expect(kiosk.getByRole('button',{name:`Add ${comboName} combo to cart`,exact:true})).toBeVisible({timeout:60000});
 timings.push({phase:'isolated fixture combo hydration',ms:+(performance.now()-comboReadyAt).toFixed(2)});
 const decoded=async(images)=>{for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await expect(img).toHaveJSProperty('complete',true,{timeout:10000});await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);expect(await img.getAttribute('src')).not.toMatch(/placeholder|fallback-dish/);}return images.count();};
 await test('All Menu shows twenty dishes plus one combo in one continuous grid with loaded photos',async()=>{await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(21,{timeout:60000});const count=await decoded(grid.locator('img'));expect(count).toBe(21);await kiosk.getByRole('heading',{name:'All Dishes & Specialities'}).scrollIntoViewIfNeeded();const positions=await grid.getByTestId('kiosk-menu-card').evaluateAll(cards=>cards.slice(0,3).map(card=>({top:card.getBoundingClientRect().top,left:card.getBoundingClientRect().left})));expect(Math.abs(positions[0].top-positions[1].top)).toBeLessThan(2);expect(positions[1].left).toBeGreaterThan(positions[0].left);await kiosk.screenshot({path:q.path.join(q.reportDir,'evidence/kiosk-all-menu-1366.png')});return{cards:21,photos:count,comboAndDishesShareRow:true};});
 await test('Search filters combos and dishes together and no-match has a useful empty state',async()=>{const input=kiosk.getByPlaceholder('Search dish (e.g. Paneer, Biryani, Cold Coffee...)');await input.fill('Khandvi');await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(1);await expect(grid).toContainText('Khandvi');await input.fill('not-a-dish');await expect(kiosk.getByText('No dishes found',{exact:true})).toBeVisible();await expect(kiosk.getByTestId('kiosk-menu-grid')).toHaveCount(0);await kiosk.getByRole('button',{name:'View All Dishes',exact:true}).click();await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(21);return{search:true,noMatch:true};});
 await test('Combos-only view contains one card without a duplicate backing dish',async()=>{await kiosk.getByText('Combos & Deals',{exact:true}).first().click();await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(1);await expect(grid).toContainText(comboName);await kiosk.getByText('All Menu',{exact:true}).first().click();await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(21);return{comboCount:1};});
 await test('Kiosk menu cards fit tablet, laptop, TV and portrait widths',async()=>{const measurements=[];for(const width of [768,1024,1366,1920,2560]){await kiosk.setViewportSize({width,height:width===768?1024:950});await kiosk.getByRole('heading',{name:'All Dishes & Specialities'}).scrollIntoViewIfNeeded();const m=await grid.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length}));expect(m.scrollWidth).toBeLessThanOrEqual(m.width+1);const pos=await grid.getByTestId('kiosk-menu-card').evaluateAll(cards=>cards.slice(0,2).map(card=>card.getBoundingClientRect().top));if(m.columns>1)expect(Math.abs(pos[0]-pos[1])).toBeLessThan(2);await kiosk.screenshot({path:q.path.join(q.reportDir,`evidence/kiosk-${width}.png`)});measurements.push({viewport:width,...m});}await kiosk.setViewportSize({width:1366,height:950});return measurements;});
 await test('Adding a dish opens the cart while the menu remains usable',async()=>{await kiosk.getByRole('button',{name:'Add Surti Nylon Khaman (250g) to cart',exact:true}).click();await expect(kiosk.getByRole('button',{name:'Proceed to Payment',exact:true})).toBeVisible();await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(21);expect(await grid.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);return{correctDish:true,cartFits:true};});
 const owner=await devicePage('pos-admin',ad,'jamanvaar_cloud_');await owner.goto(base+'/restaurant-admin/menu');await owner.getByPlaceholder('e.g. JM9876543210').fill(rest.restaurant.restaurantCode);await owner.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);await owner.getByRole('button',{name:'Sign In',exact:true}).click();
 await test('Restaurant Admin displays the same repaired Khaman and Basundi photos',async()=>{for(const name of ['Surti Nylon Khaman (250g)','Rich Basundi Bowl']){const img=owner.getByRole('img',{name,exact:true}).first();await expect(img).toBeVisible({timeout:60000});await decoded(img);expect(await img.getAttribute('src')).toContain('/restaurant-admin/assets/menu/template-photos-v1/');}await owner.screenshot({path:q.path.join(q.reportDir,'evidence/admin-menu.png')});return{sameLibrary:true};});
 const pos=await devicePage('pos',pd,'jamanvaar_pos_');await pos.goto(base+'/pos/');await pos.getByRole('button',{name:/Photo Cashier/}).click({timeout:60000});for(const n of cashierPin)await pos.getByRole('button',{name:n,exact:true}).click();
 await test('POS menu shows description-matched food photos',async()=>{const img=pos.getByRole('img',{name:'Surti Nylon Khaman (250g)',exact:true}).first();await expect(img).toBeVisible({timeout:60000});await decoded(img);expect(await img.getAttribute('src')).toContain('/pos/assets/menu/template-photos-v1/');return{posImageLoaded:true};});
 const captain=await devicePage('captain',{},'unused_');await captain.goto(base+'/captain/');await captain.getByLabel('Activation Key *',{exact:true}).fill(captainKey.code);await captain.getByRole('button',{name:'Activate Tablet',exact:true}).click();await captain.getByRole('button',{name:'Continue',exact:true}).click({timeout:60000});for(const n of captainPin)await captain.getByRole('button',{name:n,exact:true}).click();await captain.getByRole('button',{name:'Unlock Captain Terminal',exact:true}).click();await captain.getByRole('group',{name:'Dining table TN2',exact:true}).getByRole('button',{name:'OPEN TABLE',exact:true}).click({timeout:60000});await captain.getByRole('button',{name:'Seat & Take Order',exact:true}).click();
 await test('Captain table menu uses the same photos',async()=>{const img=captain.getByRole('img',{name:'Surti Nylon Khaman (250g)',exact:true}).first();await decoded(img);expect(await img.getAttribute('src')).toContain('/captain/assets/menu/template-photos-v1/');return{captainImageLoaded:true};});
 const guestContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await guestContext.route('**/*',routes);const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(base+'/q/'+qr);
 await test('Mobile QR ordering renders the published dishes with real images and no overflow',async()=>{const img=guest.getByRole('img',{name:'Surti Nylon Khaman (250g)',exact:true}).first();await expect(img).toBeVisible({timeout:60000});await decoded(img);expect(await img.getAttribute('src')).toContain('/q/assets/menu/template-photos-v1/');expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await guest.screenshot({path:q.path.join(q.reportDir,'evidence/qr-mobile-menu.png')});return{guestImageLoaded:true,mobileFits:true};});
 await test('Changing a restaurant photo overrides the starter image across Kiosk and Admin',async()=>{const custom='data:image/webp;base64,'+q.fs.readFileSync(q.path.join(q.root,'packages/assets/menu/description-matched-v1/khaman.webp')).toString('base64');await push('MENU_ITEM','photo-khaman',{name:'Surti Nylon Khaman (250g)',description:'Our restaurant photo',sku:'PHOTO-'+dishes.findIndex(photo=>photo.file==='khaman.webp'),categoryId:'mains',price:90+dishes.findIndex(photo=>photo.file==='khaman.webp'),isAvailable:true,isKioskEnabled:true,dietaryType:'VEG',modifierGroupIds:[],sortOrder:3,imageUrl:custom});for(const p of [kiosk,owner])await expect(p.getByRole('img',{name:'Surti Nylon Khaman (250g)',exact:true}).first()).toHaveAttribute('src',/^data:image\/webp;base64,/,{timeout:20000});return{ownerUploadWins:true};});
 await test('Downloaded Kiosk dish photos remain visible after going offline',async()=>{await expect.poll(()=>kiosk.evaluate(async()=>{const cache=await caches.open('jamanvaar-menu-images-v1');return(await cache.keys()).filter(key=>key.url.includes('template-photos-v1')).length;})).toBeGreaterThanOrEqual(20);const cdp=await kiosk.context().newCDPSession(kiosk);await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});const search=kiosk.getByPlaceholder('Search dish (e.g. Paneer, Biryani, Cold Coffee...)');await search.fill('Khaman');await kiosk.context().setOffline(true);await search.fill('Basundi');const img=grid.locator('img[alt="Rich Basundi Bowl"]');await decoded(img);expect(await img.getAttribute('src')).toMatch(/^blob:/);await kiosk.context().setOffline(false);await search.fill('');return{offlineImageFromCache:true};});
 if(process.env.JAMANVAAR_TEMPLATE_PHOTOS_QA){
  await test('Admin categories show cover photos and editable food icons',async()=>{
   const category=owner.locator('[data-cat-pill="mains"]');
   await expect(category.getByTestId('menu-category-icon')).toBeVisible();
   await decoded(category.locator('img'));
   await category.getByRole('button').click();
   await owner.getByRole('button',{name:'Edit this category',exact:true}).click();
   const selector=owner.getByLabel('Icon Style',{exact:true});
   expect(await selector.locator('option').count()).toBe(25);
   await selector.selectOption('Coffee');
   await expect(owner.getByRole('dialog').getByTestId('menu-category-icon')).toHaveAttribute('data-icon','Coffee');
   await owner.getByRole('button',{name:'Save Changes',exact:true}).click();
   await expect(category.getByTestId('menu-category-icon')).toHaveAttribute('data-icon','Coffee');
   await owner.reload();
   await expect(category.getByTestId('menu-category-icon')).toHaveAttribute('data-icon','Coffee',{timeout:60000});
   await category.getByRole('button').click();
   await owner.getByRole('button',{name:'Edit this category',exact:true}).click();
   await owner.getByLabel('Icon Style',{exact:true}).selectOption('auto');
   await owner.getByRole('button',{name:'Save Changes',exact:true}).click();
   await owner.locator('[data-cat-pill="ALL"]').click();
   return{categoryPhoto:true,editableIcons:25,iconSaveSurvivesReload:true};
  });
  if(process.env.JAMANVAAR_TEMPLATE_PHOTOS_QA !== 'preview') {
  await test('Every offered onboarding template has loaded dish and category photographs',async()=>{
   await owner.getByRole('button',{name:'Load Menu Template',exact:true}).first().click();
   const select=owner.getByLabel('Restaurant menu template',{exact:true});
   const options=await select.locator('option').evaluateAll(nodes=>nodes.map(node=>({id:node.value,name:node.textContent})));
   const counts=[];
   for(const option of options){
    await select.selectOption(option.id);
    const dialog=owner.getByRole('dialog');
    const photos=await decoded(dialog.locator('img'));
    expect(photos).toBeGreaterThan(25);
    expect(await dialog.getByTestId('menu-category-icon').count()).toBeGreaterThan(0);
    counts.push({...option,photos});
   }
   await select.selectOption('tpl-pizza');
   await owner.screenshot({path:q.path.join(q.reportDir,'evidence/pizza-template-preview.png')});
   await owner.getByRole('button',{name:'Close',exact:true}).click();
   return counts;
  });
  await test('Importing a Pizza category publishes its new photos to the open Kiosk without refresh',async()=>{
   // Reviewing all templates can exceed the guest idle window. Start the next guest's
   // order on the same open page; do not disable the kiosk's normal session reset.
   const start=kiosk.getByRole('button',{name:'Start Order',exact:true});
   const resumedAfterIdle=await start.isVisible();
   if(resumedAfterIdle){await start.click();await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();}
   await expect(grid.getByTestId('kiosk-menu-card')).toHaveCount(21,{timeout:60000});
   const previous=await grid.getByTestId('kiosk-menu-card').count();
   await owner.getByRole('button',{name:'Load Menu Template',exact:true}).first().click();
   await owner.getByLabel('Restaurant menu template',{exact:true}).selectOption('tpl-pizza');
   await owner.getByRole('checkbox',{name:'Select category Pizzas',exact:true}).check();
   await owner.getByRole('button',{name:/^Load \d+ Selected Items$/}).click();
   await expect(owner.getByRole('button',{name:'Close',exact:true})).toBeEnabled({timeout:60000});
   await owner.getByRole('button',{name:'Close',exact:true}).click();
   await expect.poll(()=>grid.getByTestId('kiosk-menu-card').count(),{timeout:60000}).toBeGreaterThan(previous);
   const pizza=kiosk.getByRole('img',{name:'Farmhouse Pizza',exact:true});
   await decoded(pizza);
   expect(await pizza.getAttribute('src')).toContain('/kiosk/assets/menu/template-photos-v1/');
   const adminPizza=owner.getByRole('img',{name:'Farmhouse Pizza',exact:true});
   await decoded(adminPizza);
   expect(await adminPizza.getAttribute('src')).toContain('/restaurant-admin/assets/menu/template-photos-v1/');
   await owner.screenshot({path:q.path.join(q.reportDir,'evidence/admin-pizza-import.png')});
   await kiosk.screenshot({path:q.path.join(q.reportDir,'evidence/kiosk-pizza-sync.png')});
   return{before:previous,after:await grid.getByTestId('kiosk-menu-card').count(),liveSync:true,resumedAfterIdle};
  });
  }
 }
 expect(errors).toEqual([]);
}
main().catch(async e=>{console.error(e.message);if(browser)for(const [i,p]of browser.contexts().flatMap(context=>context.pages()).entries()){await p.screenshot({path:q.path.join(q.reportDir,'evidence',`failure-${i}.png`)}).catch(()=>{});console.log('Failure page '+i+': '+(await p.locator('body').innerText().catch(()=>'' )).slice(0,1400));}process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({at:new Date().toISOString(),environment:'isolated local API/database; compiled apps; production subpaths',results,errors,timings},null,2));await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());if(api){api.kill();await new Promise(resolve=>{api.once('exit',resolve);setTimeout(resolve,1500);});}if(prisma){if(restaurantId)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:restaurantId}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}});
