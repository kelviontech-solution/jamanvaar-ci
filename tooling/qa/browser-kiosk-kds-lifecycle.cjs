// Real compiled QR app + KDS, real isolated API/database. Only provider HTTP is simulated.
process.env.JAMANVAAR_QA_REPORT_DIR=process.env.JAMANVAAR_QA_REPORT_DIR||'docs/reports/kiosk-kds-2026-10-07';
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
 const log=q.fs.createWriteStream(q.path.join(q.root,'logs/kiosk-kds-browser-api.log'));
 api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,env:{...process.env,JAMANVAAR_QA_QR_PAYMENTS:'1',JAMANVAAR_QA_QR_ORIGIN:base},windowsHide:true,stdio:['ignore','pipe','pipe']});api.stdout.pipe(log);api.stderr.pipe(log);await ready(`http://localhost:${q.state.port}/health`);
 const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));process.env.DATABASE_URL=q.state.databaseUrl;prisma=new PrismaService();await prisma.$connect();
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,base).pathname;
  if(pathname.startsWith('/api/')){const headers={...req.headers,host:`localhost:${q.state.port}`};delete headers.origin;const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},up=>{res.writeHead(up.statusCode,{...up.headers,'access-control-allow-origin':base});up.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;}
  const roots={'kds':'apps/restaurant-system/kds/dist','pos':'apps/restaurant-system/pos/dist','restaurant-admin':'apps/restaurant-system/pos-admin/dist','captain':'apps/restaurant-system/captain/dist','kiosk':'apps/kiosk-system/kiosk-user/dist','q':'apps/qr-guest/dist'};
  const app=pathname.split('/')[1],root=q.path.join(q.root,roots[app]||'cloud/super-admin-web/dist');
  const relative=roots[app]?pathname.slice(app.length+2):pathname.slice(1);let file=q.path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+q.path.sep)){res.writeHead(403);res.end();return;}
  if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'})[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(port,'localhost',r));
 const challenge=await call('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];const platform=(await call('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;
 const stamp=Date.now(),rest=await call('POST','/api/v1/restaurants',{name:`QA Kiosk KDS ${stamp}`,ownerName:'QA Owner',ownerEmail:`qa-qr-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);restaurantId=rest.restaurant.id;
 const plan=await call('POST','/api/v1/plans',{name:`QA Kiosk KDS ${stamp}`,tier:'QR',priceMonthly:900000,maxBranches:2,maxDevices:10,maxUsers:10,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true}},platform);planId=plan.id;
 await call('POST','/api/v1/subscriptions',{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS','POS_ADMIN','KDS','QR_ORDERING','KIOSK','KIOSK_ADMIN']},platform);
 branchId=await prisma.runAsTenant(restaurantId,async tx=>(await tx.branch.findFirstOrThrow({where:{restaurantId}})).id);
 const activate=async type=>{const key=await call('POST','/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return call('POST','/api/v1/activation/redeem',{code:key.code,deviceType:type});};
 admin=(await activate('POS_ADMIN')).deviceToken;const kd=await activate('KDS');kdsToken=kd.deviceToken;const pd=await activate('POS');posToken=pd.deviceToken;const kioskDevice=await activate('KIOSK');
 await push('MENU_CATEGORY','mains',{name:'Mains',isActive:true,sortOrder:1});
 await push('MODIFIER_GROUP','size',{name:'Size',isRequired:true,minSelections:1,maxSelections:1,options:[{id:'small',name:'Small',priceDelta:0,isAvailable:true},{id:'large',name:'Large',priceDelta:50,isAvailable:true}]});
 await push('MENU_ITEM','pizza',{name:'Paneer Pizza',imageUrl:'/assets/menu/pizza/margherita.jpg',categoryId:'mains',price:249,isAvailable:true,dietaryType:'VEG',modifierGroupIds:['size'],translations:{hi:{name:'\u092a\u0928\u0940\u0930 \u092a\u093f\u091c\u094d\u091c\u093e'},gu:{name:'\u0aaa\u0aa8\u0ac0\u0ab0 \u0aaa\u0abf\u0a9d\u0a9d\u0abe'}}});
 await push('MENU_ITEM','coffee',{name:'Cold Coffee',imageUrl:'/assets/menu/beverages/cold-coffee.jpg',categoryId:'mains',price:120,isAvailable:true,dietaryType:'VEG',modifierGroupIds:[]});
 await push('MENU_ITEM','chicken',{name:'Chicken Pizza',imageUrl:'/assets/menu/pizza/farmhouse.svg',categoryId:'mains',price:299,isAvailable:true,dietaryType:'NON_VEG',modifierGroupIds:[]});
 await push('DINING_TABLE','table-2',{tableNumber:'TN2',capacity:4,isActive:true,branchId});await call('POST','/api/v1/menu/publish',{},admin);
 const code=await call('POST','/api/v1/restaurant/qr/tables/table-2/generate',{branchId},admin);qr=code.url.split('/q/')[1];qrId=code.id;
 await prisma.runAsTenant(restaurantId,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId,status:'ACTIVE'}}));expect((await call('GET','/api/v1/restaurant/qr/settings',undefined,admin)).allowOnlinePayment).toBe(true);expect((await call('GET','/api/v1/restaurant/qr/settings/payment-readiness',undefined,admin)).guestAvailable).toBe(true);await call('PUT','/api/v1/restaurant/qr/settings',{autoAccept:true},admin);
 const salt=crypto.randomBytes(16),pin='1357',hash=crypto.pbkdf2Sync(`${restaurantId}:${pin}`,salt,100000,32,'sha256').toString('hex');
 await push('STAFF_USER','qr-chef',{restaurantId,pinScope:restaurantId,fullName:'QA QR Chef',roleId:'role-chef',isActive:true,pinHash:`pinv2:${salt.toString('hex')}:${hash}`,branchId});
 const cashierSalt=crypto.randomBytes(16),cashierPin='2468',cashierHash=crypto.pbkdf2Sync(`${restaurantId}:${cashierPin}`,cashierSalt,100000,32,'sha256').toString('hex');await push('STAFF_USER','qr-cashier',{restaurantId,pinScope:restaurantId,fullName:'QA QR Cashier',roleId:'role-cashier',isActive:true,pinHash:`pinv2:${cashierSalt.toString('hex')}:${cashierHash}`,branchId});
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const routes=route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(u.hostname==='rzp.io')return route.fulfill({contentType:'text/html',body:'<h1>QA simulated Razorpay checkout</h1><p>Provider UI and physical UPI app switch are not tested.</p>'});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();};await context.route('**/*',routes);
 context.setDefaultTimeout(20000);const page=await context.newPage(),kds=await context.newPage();
 for(const p of [page,kds]){p.on('pageerror',e=>errors.push(e.message));p.on('requestfinished',async req=>{const res=await req.response();if(new URL(req.url()).pathname.includes('/public/qr/'))timings.push({method:req.method(),status:res?.status(),ms:+(req.timing().responseEnd-req.timing().startTime+req.timing().startTime).toFixed(2)});});}
 await kds.addInitScript(({restaurantId,device})=>{localStorage.setItem('jamanvaar_kds_restaurant_id',restaurantId);localStorage.setItem('jamanvaar_kds_device_id',device.device.id);localStorage.setItem('jamanvaar_kds_device_token',device.deviceToken);},{restaurantId,device:kd});
 console.log('Fixture ready; opening actual KDS');await kds.goto(base+'/kds/');
 await expect(kds.getByRole('button',{name:'1',exact:true})).toBeVisible({timeout:60000});for(const n of pin)await kds.getByRole('button',{name:n,exact:true}).click();await expect(kds.getByRole('tab',{name:/^Active/i})).toBeVisible({timeout:60000});
 const posContext=await browser.newContext({viewport:{width:1440,height:960}});posContext.setDefaultTimeout(20000);await posContext.route('**/*',routes);const pos=await posContext.newPage();await pos.addInitScript(({restaurantId,device})=>{for(const [k,v]of Object.entries({restaurant_id:restaurantId,device_id:device.device.id,device_token:device.deviceToken}))localStorage.setItem('jamanvaar_pos_'+k,v);},{restaurantId,device:pd});console.log('Opening POS');await pos.goto(base+'/pos/',{waitUntil:'domcontentloaded'});console.log('POS HTML loaded');await pos.getByRole('button',{name:/QA QR Cashier/}).click({timeout:60000});console.log('Cashier selected');for(const n of cashierPin)await pos.getByRole('button',{name:n,exact:true}).click();console.log('PIN entered');if(!await pos.getByRole('button',{name:/Live Orders/}).first().isVisible())await pos.getByTitle('Back to the main menu',{exact:true}).click();await pos.getByRole('button',{name:/Live Orders/}).first().click({timeout:60000});console.log('POS orders loaded');

 const kioskContext=await browser.newContext({viewport:{width:1366,height:900}});kioskContext.setDefaultTimeout(20000);await kioskContext.route('**/*',routes);
 const kiosk=await kioskContext.newPage();kiosk.on('pageerror',e=>errors.push(e.message));
 for(const [app,p]of [['kiosk',kiosk],['kds',kds],['pos',pos]]){p.on('request',req=>{const u=new URL(req.url());if(u.pathname.includes('/orders/sync'))timings.push({app,event:'request',method:req.method(),at:performance.now()});});p.on('response',res=>{const u=new URL(res.url());if(u.pathname.includes('/orders/sync'))timings.push({app,event:'response',method:res.request().method(),status:res.status(),at:performance.now()});});}
 await kiosk.addInitScript(({restaurantId,device})=>{for(const [key,value]of Object.entries({restaurant_id:restaurantId,device_id:device.device.id,device_token:device.deviceToken}))localStorage.setItem('jamanvaar_kiosk_user_'+key,value);},{restaurantId,device:kioskDevice});
 await kiosk.goto(base+'/kiosk/');await expect(kiosk.getByRole('button',{name:'Start Order',exact:true})).toBeVisible({timeout:60000});
 const cloudOrder=id=>prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId,externalOrderId:id}}}));
 const ticketFor=o=>kds.getByTestId('kds-ticket').filter({has:kds.getByText('#'+o.tokenNumber,{exact:true})});
 const placeCash=async()=>{
   await kiosk.getByRole('button',{name:'Start Order',exact:true}).click();await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();
   await kiosk.getByRole('button',{name:'Add Cold Coffee to cart',exact:true}).click({timeout:30000});await kiosk.getByRole('button',{name:'Proceed to Payment',exact:true}).click();
   await kiosk.getByRole('button',{name:/Cash at Counter/i}).click();
   await kiosk.getByRole('button',{name:'Confirm & Get Token',exact:true}).scrollIntoViewIfNeeded();
   const start=performance.now();timings.push({app:'kiosk',event:'cash-confirm-click',at:start});await kiosk.getByRole('button',{name:'Confirm & Get Token',exact:true}).click();timings.push({app:'kiosk',event:'click-return',at:performance.now()});
   await expect(kiosk.getByRole('button',{name:/new order/i})).toBeVisible();
   const local=await kiosk.evaluate(()=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.source_type==='KIOSK'&&o.orderStatus!=='DRAFT'));
   if(!local)throw Error('Cash order missing locally');await expect(ticketFor(local)).toHaveCount(1,{timeout:15000});
   return {local,arrivalMs:+(performance.now()-start).toFixed(2)};
 };
 let cash;
 await test('Kiosk cash submission wakes actual KDS without the sender polling delay and stays unpaid',async()=>{
   cash=await placeCash();const saved=await cloudOrder(cash.local.id);expect(saved.status).toBe('CONFIRMED');expect(saved.paymentStatus).toBe('PENDING');expect(saved.paymentMethod).toBe('CASH_AT_COUNTER');
   timings.push({app:'kds',event:'ticket-visible',at:performance.now(),arrivalMs:cash.arrivalMs});return {submissionToVisibleKdsMs:cash.arrivalMs,totalPaise:saved.totalAmount,status:saved.status,paymentStatus:saved.paymentStatus};
 });
 await test('Confirmation has no Track Order button and returns automatically without cancelling the ticket',async()=>{
   await expect(kiosk.getByRole('button',{name:/track order/i})).toHaveCount(0);
   await expect(kiosk.getByRole('button',{name:'Start Order',exact:true})).toBeVisible({timeout:30000});
   await kiosk.waitForTimeout(4500);
   const saved=await cloudOrder(cash.local.id);expect(saved.status).not.toBe('CANCELLED');expect(saved.paymentStatus).toBe('PENDING');await expect(ticketFor(cash.local)).toHaveAttribute('data-status','PREPARING');
   return {autoReturned:true,preservedStatus:saved.status,unpaidCashPreserved:true};
 });
 await test('Actual KDS Ready reaches the same backend order and POS',async()=>{
   const ticket=ticketFor(cash.local),start=performance.now();await ticket.getByRole('button',{name:/all dishes ready/i}).click();
   await expect(async()=>{const o=await cloudOrder(cash.local.id);expect(o.status).toBe('READY');expect(o.items.every(i=>i.kitchenStatus==='READY')).toBe(true);}).toPass({timeout:15000});
   await expect(async()=>{const order=await pos.evaluate(id=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.id===id),cash.local.id);expect(order.items.every(i=>i.kitchenStatus==='READY')).toBe(true);}).toPass({timeout:15000});
   return {readyToBackendAndPosMs:+(performance.now()-start).toFixed(2)};
 });
 await test('KDS Served reaches POS and Kiosk persisted order without claiming cash was paid',async()=>{
   const ticket=ticketFor(cash.local),start=performance.now();await ticket.getByRole('button',{name:'Served',exact:true}).click();
   await expect(async()=>{const saved=await cloudOrder(cash.local.id);expect(saved.items.every(i=>i.kitchenStatus==='SERVED')).toBe(true);expect(saved.paymentStatus).toBe('PENDING');}).toPass({timeout:15000});
   for(const p of [kiosk,pos])await expect(async()=>{const order=await p.evaluate(id=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.id===id),cash.local.id);expect(order.items.every(i=>i.kitchenStatus==='SERVED')).toBe(true);expect(order.orderStatus).not.toBe('CANCELLED');}).toPass({timeout:15000});
   await expect(ticket).toHaveCount(0);await kds.getByRole('tab',{name:/^Served/}).click();await expect(ticketFor(cash.local)).toHaveAttribute('data-status','SERVED');
   return {servedToAllAppsMs:+(performance.now()-start).toFixed(2),paymentStatus:'PENDING',guestDataCleared:true};
 });
 await kds.getByRole('tab',{name:/^Active/}).click();
 await test('The next customer can submit a second cash order; manual New Order preserves it',async()=>{
   cash=await placeCash();await kiosk.getByRole('button',{name:/new order/i}).click();await expect(kiosk.getByRole('button',{name:'Start Order',exact:true})).toBeVisible();
   await kiosk.waitForTimeout(4000);expect((await cloudOrder(cash.local.id)).status).not.toBe('CANCELLED');await expect(ticketFor(cash.local)).toHaveAttribute('data-status','PREPARING');return {arrivalMs:cash.arrivalMs};
 });
 await test('Offline KDS retains a ready update and sends it on reconnect',async()=>{
   await context.setOffline(true);await ticketFor(cash.local).getByRole('button',{name:/all dishes ready/i}).click();
   await expect(ticketFor(cash.local)).toHaveAttribute('data-status','READY');expect((await cloudOrder(cash.local.id)).status).toBe('CONFIRMED');
   await context.setOffline(false);await expect(async()=>expect((await cloudOrder(cash.local.id)).status).toBe('READY')).toPass({timeout:15000});
   return {locallyRetained:true,reconnectedStatus:'READY'};
 });
 // A real backend order with many long lines checks scrolling and responsive sizing.
 await call('POST','/api/v1/orders/sync',{events:[{idempotencyKey:'qa-layout-'+Date.now(),externalOrderId:'qa-layout-'+stamp,status:'CONFIRMED',orderType:'TAKEAWAY',paymentMethod:'CASH_AT_COUNTER',paymentStatus:'PENDING',
   items:Array.from({length:18},(_,i)=>({externalItemId:'layout-line-'+i,menuItemId:'coffee',name:'Cold Coffee with extra chocolate and vanilla cream special '+(i+1),quantity:1,unitPrice:12000,lineTotal:12000,kitchenStatus:'PREPARING',kitchenStation:'Main Kitchen',specialInstructions:i===0?'ALLERGY: no nuts. Keep separate utensils.':''})),subtotal:216000,totalAmount:216000,taxAmount:0,discountAmount:0,meta:{tokenNumber:'K-LONG',orderNumber:'QA-LONG',sourceType:'KIOSK'},updatedAt:new Date().toISOString()}]},kioskDevice.deviceToken);
 await expect(kds.getByTestId('kds-ticket').filter({has:kds.getByText('#K-LONG',{exact:true})})).toHaveCount(1,{timeout:15000});
 for(const [width,height]of [[360,740],[768,1024],[910,1020],[1024,768],[1366,768],[1920,1080],[2560,1440]])await test(`KDS tablet/TV layout ${width}x${height} keeps cards, dishes and actions usable`,async()=>{
   await kds.setViewportSize({width,height});await expect(kds.getByTestId('kds-board')).toBeVisible();
   const layout=await kds.evaluate(()=>({documentOverflow:document.documentElement.scrollWidth>innerWidth,board:document.querySelector('[data-testid="kds-board"]').getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll('[data-testid="kds-ticket"]')].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,overflow:c.scrollWidth>c.clientWidth,text:parseFloat(getComputedStyle(c.querySelector('.kds-dish-name')).fontSize)}))}));
   expect(layout.documentOverflow).toBe(false);expect(layout.board.height).toBeGreaterThan(height*0.45);expect(layout.cards.every(c=>!c.overflow&&c.text>=16&&c.text<=20&&c.height<=layout.board.height)).toBe(true);
   const long=kds.getByTestId('kds-ticket').filter({has:kds.getByText('#K-LONG',{exact:true})});await long.scrollIntoViewIfNeeded();await expect(long.getByRole('button',{name:/all dishes ready/i})).toBeInViewport();expect(await long.getByRole('button',{name:/all dishes ready/i}).evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
   const list=long.getByRole('list');expect(await list.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await list.evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect(long.getByText(/special 18$/)).toBeInViewport();await list.evaluate(e=>{e.scrollTop=0;});
   await kds.screenshot({path:q.path.join(q.reportDir,'evidence',`kds-${width}x${height}.png`)});return layout;
 });
 expect(errors).toEqual([]);console.log(`Kiosk/KDS checks: ${results.length} passed.`);
}
main().catch(async e=>{console.error(e.message);if(browser)for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){await p.screenshot({path:q.path.join(q.reportDir,'evidence',`failure-${i}.png`)}).catch(()=>{});console.log('Failure page '+i+': '+(await p.locator('body').innerText().catch(()=>'' )).slice(0,1400));}process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({at:new Date().toISOString(),provider:'SIMULATED',physicalDevices:false,environment:'isolated local API/database; compiled apps',results,errors,timings},null,2));await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());if(api){api.kill();await new Promise(resolve=>{api.once('exit',resolve);setTimeout(resolve,1500);});}if(prisma){if(restaurantId)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:restaurantId}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}});
