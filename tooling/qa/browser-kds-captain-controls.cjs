// Compiled Captain, two KDS devices, POS and Kiosk against an isolated API/database.
process.env.JAMANVAAR_QA_REPORT_DIR=process.env.JAMANVAAR_QA_REPORT_DIR||'docs/reports/kds-captain-controls-2026-10-07';
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
 const log=q.fs.createWriteStream(q.path.join(q.root,'logs/kds-captain-browser-api.log'));
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
 const stamp=Date.now(),rest=await call('POST','/api/v1/restaurants',{name:`QA Kiosk KDS ${stamp}`,ownerName:'QA Owner',ownerEmail:`qa-qr-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);restaurantId=rest.restaurant.id;
 const plan=await call('POST','/api/v1/plans',{name:`QA Kiosk KDS ${stamp}`,tier:'QR',priceMonthly:900000,maxBranches:2,maxDevices:10,maxUsers:10,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true,captainApp:true}},platform);planId=plan.id;
 await call('POST','/api/v1/subscriptions',{restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS','POS_ADMIN','KDS','QR_ORDERING','KIOSK','KIOSK_ADMIN','CAPTAIN']},platform);
 branchId=await prisma.runAsTenant(restaurantId,async tx=>(await tx.branch.findFirstOrThrow({where:{restaurantId}})).id);
 const activate=async type=>{const key=await call('POST','/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return call('POST','/api/v1/activation/redeem',{code:key.code,deviceType:type});};
 admin=(await activate('POS_ADMIN')).deviceToken;const kd=await activate('KDS');kdsToken=kd.deviceToken;const pd=await activate('POS');posToken=pd.deviceToken;const kioskDevice=await activate('KIOSK');const captainKey=await call('POST','/api/v1/activation-keys',{restaurantId,branchId,allowedDeviceType:'CAPTAIN',expiresAt:new Date(Date.now()+86400000).toISOString()},platform),secondKdsDevice=await activate('KDS');
 await push('MENU_CATEGORY','mains',{name:'Mains',isActive:true,sortOrder:1});
 await push('MODIFIER_GROUP','size',{name:'Size',isRequired:true,minSelections:1,maxSelections:1,options:[{id:'small',name:'Small',priceDelta:0,isAvailable:true},{id:'large',name:'Large',priceDelta:50,isAvailable:true}]});
 await push('MENU_ITEM','pizza',{name:'Paneer Pizza',imageUrl:'/assets/menu/pizza/margherita.jpg',categoryId:'mains',price:249,isAvailable:true,dietaryType:'VEG',modifierGroupIds:['size'],translations:{hi:{name:'\u092a\u0928\u0940\u0930 \u092a\u093f\u091c\u094d\u091c\u093e'},gu:{name:'\u0aaa\u0aa8\u0ac0\u0ab0 \u0aaa\u0abf\u0a9d\u0a9d\u0abe'}}});
 await push('MENU_ITEM','coffee',{name:'Cold Coffee',imageUrl:'/assets/menu/beverages/cold-coffee.jpg',categoryId:'mains',price:120,isAvailable:true,dietaryType:'VEG',modifierGroupIds:[]});
 await push('MENU_ITEM','chicken',{name:'Chicken Pizza',imageUrl:'/assets/menu/pizza/farmhouse.svg',categoryId:'mains',price:299,isAvailable:true,dietaryType:'NON_VEG',modifierGroupIds:[]});
 await push('DINING_TABLE','table-2',{tableNumber:'TN2',capacity:4,isActive:true,branchId});await push('DINING_TABLE','table-3',{tableNumber:'TN3',capacity:4,isActive:true,branchId});await call('POST','/api/v1/menu/publish',{},admin);
 const code=await call('POST','/api/v1/restaurant/qr/tables/table-2/generate',{branchId},admin);qr=code.url.split('/q/')[1];qrId=code.id;
 await prisma.runAsTenant(restaurantId,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId,status:'ACTIVE'}}));expect((await call('GET','/api/v1/restaurant/qr/settings',undefined,admin)).allowOnlinePayment).toBe(true);expect((await call('GET','/api/v1/restaurant/qr/settings/payment-readiness',undefined,admin)).guestAvailable).toBe(true);await call('PUT','/api/v1/restaurant/qr/settings',{autoAccept:true},admin);
 await push('MENU_ITEM','jain-salad',{name:'Jain Salad',imageUrl:'/assets/menu/beverages/cold-coffee.jpg',categoryId:'mains',price:90,isAvailable:true,dietaryType:'JAIN',modifierGroupIds:[]});await call('POST','/api/v1/menu/publish',{},admin);
 const captainSalt=crypto.randomBytes(16),captainPin='3579',captainHash=crypto.pbkdf2Sync(`${restaurantId}:${captainPin}`,captainSalt,100000,32,'sha256').toString('hex');await push('STAFF_USER','qa-captain',{restaurantId,pinScope:restaurantId,fullName:'QA Captain',roleId:'role-captain',isActive:true,pinHash:`pinv2:${captainSalt.toString('hex')}:${captainHash}`,branchId});
 const salt=crypto.randomBytes(16),pin='1357',hash=crypto.pbkdf2Sync(`${restaurantId}:${pin}`,salt,100000,32,'sha256').toString('hex');
 await push('STAFF_USER','qr-chef',{restaurantId,pinScope:restaurantId,fullName:'QA QR Chef',roleId:'role-chef',isActive:true,pinHash:`pinv2:${salt.toString('hex')}:${hash}`,branchId});
 const cashierSalt=crypto.randomBytes(16),cashierPin='2468',cashierHash=crypto.pbkdf2Sync(`${restaurantId}:${cashierPin}`,cashierSalt,100000,32,'sha256').toString('hex');await push('STAFF_USER','qr-cashier',{restaurantId,pinScope:restaurantId,fullName:'QA QR Cashier',roleId:'role-cashier',isActive:true,pinHash:`pinv2:${cashierSalt.toString('hex')}:${cashierHash}`,branchId});
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const routes=route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(u.hostname==='rzp.io')return route.fulfill({contentType:'text/html',body:'<h1>QA simulated Razorpay checkout</h1><p>Provider UI and physical UPI app switch are not tested.</p>'});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();};await context.route('**/*',routes);
 context.setDefaultTimeout(20000);const page=await context.newPage(),kds=await context.newPage();
 for(const p of [page,kds]){p.on('pageerror',e=>errors.push(e.message));p.on('requestfinished',async req=>{const res=await req.response();if(new URL(req.url()).pathname.includes('/public/qr/'))timings.push({method:req.method(),status:res?.status(),ms:+(req.timing().responseEnd-req.timing().startTime+req.timing().startTime).toFixed(2)});});}
 await context.addInitScript(()=>{for(const prefix of ['jamanvaar_db_','jamanvaar_kds_db_']){localStorage.setItem('jamanvaar_app_kds:'+prefix+'tables','[]');localStorage.setItem('jamanvaar_app_kds:'+prefix+'floor_plan_started_empty','true');}});
 await kds.addInitScript(({restaurantId,device})=>{localStorage.setItem('jamanvaar_kds_restaurant_id',restaurantId);localStorage.setItem('jamanvaar_kds_device_id',device.device.id);localStorage.setItem('jamanvaar_kds_device_token',device.deviceToken);},{restaurantId,device:kd});
 console.log('Fixture ready; opening actual KDS');await kds.goto(base+'/kds/');
 await expect(kds.getByRole('button',{name:'1',exact:true})).toBeVisible({timeout:60000});for(const n of pin)await kds.getByRole('button',{name:n,exact:true}).click();await expect(kds.getByRole('tab',{name:/^Active/i})).toBeVisible({timeout:60000});
 const posContext=await browser.newContext({viewport:{width:1440,height:960}});posContext.setDefaultTimeout(20000);await posContext.route('**/*',routes);await posContext.addInitScript(()=>{for(const prefix of ['jamanvaar_db_','jamanvaar_pos_db_']){localStorage.setItem('jamanvaar_app_pos:'+prefix+'tables','[]');localStorage.setItem('jamanvaar_app_pos:'+prefix+'floor_plan_started_empty','true');}});const pos=await posContext.newPage();await pos.addInitScript(({restaurantId,device})=>{for(const [k,v]of Object.entries({restaurant_id:restaurantId,device_id:device.device.id,device_token:device.deviceToken}))localStorage.setItem('jamanvaar_pos_'+k,v);},{restaurantId,device:pd});console.log('Opening POS');await pos.goto(base+'/pos/',{waitUntil:'domcontentloaded'});console.log('POS HTML loaded');await pos.getByRole('button',{name:/QA QR Cashier/}).click({timeout:60000});console.log('Cashier selected');for(const n of cashierPin)await pos.getByRole('button',{name:n,exact:true}).click();console.log('PIN entered');if(!await pos.getByRole('button',{name:/Live Orders/}).first().isVisible())await pos.getByTitle('Back to the main menu',{exact:true}).click();await pos.getByRole('button',{name:/Live Orders/}).first().click({timeout:60000});console.log('POS orders loaded');

 const kioskContext=await browser.newContext({viewport:{width:1366,height:900}});kioskContext.setDefaultTimeout(20000);await kioskContext.route('**/*',routes);
 await kioskContext.addInitScript(()=>{for(const prefix of ['jamanvaar_db_','jamanvaar_kiosk_user_db_']){localStorage.setItem('jamanvaar_app_kiosk-user:'+prefix+'tables','[]');localStorage.setItem('jamanvaar_app_kiosk-user:'+prefix+'floor_plan_started_empty','true');}});
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
 let cash=await placeCash();await kiosk.getByRole('button',{name:/new order/i}).click();
 const secondContext=await browser.newContext({viewport:{width:1366,height:900}});await secondContext.route('**/*',routes);await secondContext.addInitScript(()=>{for(const prefix of ['jamanvaar_db_','jamanvaar_kds_db_']){localStorage.setItem('jamanvaar_app_kds:'+prefix+'tables','[]');localStorage.setItem('jamanvaar_app_kds:'+prefix+'floor_plan_started_empty','true');}});const secondKds=await secondContext.newPage();
 await secondKds.addInitScript(({restaurantId,device})=>{for(const[k,v]of Object.entries({restaurant_id:restaurantId,device_id:device.device.id,device_token:device.deviceToken}))localStorage.setItem('jamanvaar_kds_'+k,v);},{restaurantId,device:secondKdsDevice});
 await secondKds.goto(base+'/kds/');for(const n of pin)await secondKds.getByRole('button',{name:n,exact:true}).click({timeout:60000});await expect(secondKds.getByRole('tab',{name:/^Active/i})).toBeVisible();
 const captainContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});captainContext.setDefaultTimeout(20000);await captainContext.route('**/*',routes);const captain=await captainContext.newPage();captain.on('pageerror',e=>errors.push(e.message));
 const capturePrint=async p=>p.evaluate(()=>{const original=document.createElement.bind(document);document.createElement=function(tag,...args){const el=original(tag,...args);if(tag.toLowerCase()==='iframe')queueMicrotask(()=>{if(el.contentWindow)el.contentWindow.print=()=>{window.__lastKotPrint=el.contentDocument.documentElement.outerHTML;};});return el;};});
 await capturePrint(kds);
 await captain.goto(base+'/captain/');await captain.getByLabel('Activation Key *',{exact:true}).fill(captainKey.code);await captain.getByRole('button',{name:'Activate Tablet',exact:true}).click();await captain.getByRole('button',{name:'Continue',exact:true}).click({timeout:60000});for(const n of captainPin)await captain.getByRole('button',{name:n,exact:true}).click({timeout:60000});await captain.getByRole('button',{name:'Unlock Captain Terminal',exact:true}).click();await expect(captain.locator('nav').getByRole('button',{name:/My Tables/})).toBeVisible({timeout:60000});await capturePrint(captain);
 const goKots=async()=>{await captain.getByRole('button',{name:'More',exact:true}).click();await captain.getByRole('button',{name:/Live KOT Tickets/}).click();};
 const captainTicket=o=>captain.getByTestId('captain-kot').filter({has:captain.getByText('Token #'+o.tokenNumber,{exact:true})});
 let captainOrder;
 await test('Captain mobile menu Jain filter excludes other dishes and sends the current table order to KDS',async()=>{
   await captain.getByRole('group',{name:'Dining table TN2',exact:true}).getByRole('button',{name:'OPEN TABLE',exact:true}).click({timeout:15000});await captain.getByRole('button',{name:'Seat & Take Order',exact:true}).click();
   await expect(captain.getByRole('button',{name:'Add Cold Coffee',exact:true})).toBeVisible();
   await captain.getByRole('button',{name:'Jain',exact:true}).click();await expect(captain.getByRole('button',{name:'Add Jain Salad',exact:true})).toBeVisible();await expect(captain.getByRole('button',{name:'Add Cold Coffee',exact:true})).toHaveCount(0);
   await captain.getByRole('button',{name:'All',exact:true}).click();await captain.getByRole('button',{name:'Add Cold Coffee',exact:true}).click();await captain.getByRole('button',{name:/SEND KOT \(1\)/i}).click();
   captainOrder=await captain.evaluate(()=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.source_type==='CAPTAIN'));
   expect(captainOrder).toBeTruthy();await expect(ticketFor(captainOrder)).toHaveCount(1,{timeout:15000});expect((await cloudOrder(captainOrder.id)).paymentStatus).toBe('PENDING');
   await expect(captain.getByRole('button',{name:'Transfer or merge this table',exact:true})).toBeVisible();
   const overflow=await captain.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
   await captain.getByRole('button',{name:'Close',exact:true}).click();return {table:'TN2',orderAmount:captainOrder.totalAmount,payment:'PENDING',jainFilter:true,transferAccess:true};
 });

 await test('Captain table transfer updates the current order and existing KDS/POS destinations',async()=>{
   await captain.getByRole('group',{name:'Dining table TN2',exact:true}).getByRole('button',{name:'VIEW ORDER',exact:true}).click();
   for(const destination of ['TN3','TN2']){
     await captain.getByRole('button',{name:'Transfer or merge this table',exact:true}).click();await expect(captain.getByRole('button',{name:'Confirm Transfer',exact:true})).toBeDisabled();
     await captain.getByRole('button',{name:'T-'+destination+' AVAILABLE',exact:true}).click();await captain.getByRole('button',{name:'Confirm Transfer',exact:true}).click();
     await expect(async()=>expect((await cloudOrder(captainOrder.id)).tableLabel).toBe(destination)).toPass({timeout:15000});
     await expect(ticketFor(captainOrder)).toContainText('Table '+destination,{timeout:15000});
     await expect(async()=>expect(await pos.evaluate(id=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.id===id)?.tableNumber,captainOrder.id)).toBe(destination)).toPass({timeout:15000});
   }
   await captain.getByRole('button',{name:'Close',exact:true}).click();return {roundTrip:'TN2 -> TN3 -> TN2',sameOrder:true,sameKitchenTicket:true};
 });

 await test('Captain Live KOT search finds tokens and cooking tickets cannot be marked served',async()=>{
   await expect(kds.getByRole('complementary',{name:'System Notifications'})).toHaveCount(0);
 await goKots();await captain.getByRole('textbox',{name:'Search Captain KOT tickets'}).fill('#'+captainOrder.tokenNumber);
   await expect(captainTicket(captainOrder)).toHaveCount(1);await expect(captainTicket(captainOrder).getByRole('button',{name:'Mark Served',exact:true})).toHaveCount(0);
   await captain.getByRole('button',{name:'Ready to serve',exact:true}).click();await expect(captain.getByTestId('captain-kot')).toHaveCount(0);await captain.getByRole('button',{name:'All KOTs',exact:true}).click();return {searchByToken:true,readyFilter:true,blockedPrematureServe:true};
 });
 await test('KDS search works by token, table and dish and clearing restores the board',async()=>{
   const input=kds.getByRole('textbox',{name:'Search kitchen tickets'});await input.fill('#'+captainOrder.tokenNumber);await expect(kds.getByTestId('kds-ticket')).toHaveCount(1);
   await input.fill('TN2');await expect(ticketFor(captainOrder)).toHaveCount(1);await input.fill('Cold Coffee');await expect(ticketFor(captainOrder)).toHaveCount(1);
   await input.fill('not-a-real-order');await expect(kds.getByTestId('kds-ticket')).toHaveCount(0);await kds.getByRole('button',{name:'Clear ticket search'}).click();await expect(ticketFor(captainOrder)).toHaveCount(1);return {optionalSearch:true,clearRestores:true};
 });
 await test('Urgent priority persists and changes the ordering on a second KDS device and Captain',async()=>{
   const start=performance.now();await ticketFor(captainOrder).getByRole('combobox',{name:'Priority for token '+captainOrder.tokenNumber}).selectOption('URGENT');
   await expect(async()=>{const saved=await cloudOrder(captainOrder.id);expect(saved.meta.kitchenPriority).toBe('URGENT');expect(saved.totalAmount).toBe(Math.round(captainOrder.totalAmount*100));expect(saved.paymentStatus).toBe('PENDING');}).toPass({timeout:15000});
   await expect(secondKds.getByRole('combobox',{name:'Priority for token '+captainOrder.tokenNumber})).toHaveValue('URGENT',{timeout:15000});
   await expect(secondKds.getByTestId('kds-ticket').filter({has:secondKds.getByText('#'+captainOrder.tokenNumber,{exact:true})})).toHaveCount(1);await expect(secondKds.getByTestId('kds-ticket').first()).toContainText('#'+captainOrder.tokenNumber);
   await expect(captainTicket(captainOrder)).toContainText('Urgent kitchen priority',{timeout:15000});return {crossDeviceMs:+(performance.now()-start).toFixed(2),sharedPriority:true,amountUnchanged:true};
 });
 await test('KDS FIFO restores age ordering without clearing the shared urgency flag',async()=>{
   await secondKds.getByRole('combobox',{name:'Kitchen ticket ordering'}).selectOption('FIFO');await expect(secondKds.getByTestId('kds-ticket').first()).not.toContainText('#'+captainOrder.tokenNumber);
   await secondKds.getByRole('combobox',{name:'Kitchen ticket ordering'}).selectOption('PRIORITY');await expect(secondKds.getByTestId('kds-ticket').first()).toContainText('#'+captainOrder.tokenNumber);return {fifoOptional:true,priorityRetained:true};
 });
 await test('Kiosk cannot overwrite KDS priority using forged order metadata',async()=>{
   const existing=await cloudOrder(captainOrder.id),old=existing.meta;
   const result=await call('POST','/api/v1/orders/sync',{events:[{idempotencyKey:'priority-forge-'+Date.now(),externalOrderId:captainOrder.id,status:existing.status,orderType:existing.orderType,paymentMethod:existing.paymentMethod,paymentStatus:existing.paymentStatus,items:existing.items,subtotal:existing.subtotal,totalAmount:existing.totalAmount,taxAmount:existing.taxAmount,discountAmount:existing.discountAmount,meta:{kitchenPriority:'NORMAL',kitchenPriorityRev:old.kitchenPriorityRev+99,kitchenPriorityChangeId:crypto.randomUUID()},updatedAt:new Date().toISOString()}]},kioskDevice.deviceToken);
   const after=await cloudOrder(captainOrder.id);expect(after.meta.kitchenPriority).toBe('URGENT');expect(after.meta.kitchenPriorityRev).toBe(old.kitchenPriorityRev);return {forgedCustomerPriorityRejected:true};
 });
 await test('KDS offline priority change reaches the second screen when connectivity returns',async()=>{
   await context.setOffline(true);await ticketFor(captainOrder).getByRole('combobox',{name:'Priority for token '+captainOrder.tokenNumber}).selectOption('NORMAL');await expect(ticketFor(captainOrder).getByRole('combobox',{name:'Priority for token '+captainOrder.tokenNumber})).toHaveValue('NORMAL');expect((await cloudOrder(captainOrder.id)).meta.kitchenPriority).toBe('URGENT');
   await context.setOffline(false);await expect(secondKds.getByRole('combobox',{name:'Priority for token '+captainOrder.tokenNumber})).toHaveValue('NORMAL',{timeout:15000});expect((await cloudOrder(captainOrder.id)).meta.kitchenPriority).toBe('NORMAL');return {offlineRetained:true,reconnectConverged:true};
 });
 await test('KDS and Captain reprints open labelled copies without another order or status/payment change',async()=>{
   const before=await cloudOrder(captainOrder.id),count=await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.count({where:{restaurantId}}));
   for(const [p,t]of [[kds,ticketFor(captainOrder)],[captain,captainTicket(captainOrder)]]){
     await p.evaluate(()=>{window.__lastKotPrint=null;});await t.getByRole('button',{name:/^Reprint KOT/}).click();await expect(async()=>expect(await p.evaluate(()=>window.__lastKotPrint)).toContain('EXISTING KOT COPY')).toPass({timeout:5000});
     const html=await p.evaluate(()=>window.__lastKotPrint);expect(html).toContain('Cold Coffee');expect(html).toContain('TN2');q.fs.writeFileSync(q.path.join(q.reportDir,'evidence',p===kds?'kds-reprint.html':'captain-reprint.html'),html);
   }
   const after=await cloudOrder(captainOrder.id);expect({status:after.status,payment:after.paymentStatus,total:after.totalAmount,items:after.items}).toEqual({status:before.status,payment:before.paymentStatus,total:before.totalAmount,items:before.items});expect(await prisma.runAsTenant(restaurantId,tx=>tx.syncedOrder.count({where:{restaurantId}}))).toBe(count);return {copies:2,noDuplicateOrder:true,financialStateUnchanged:true};
 });
 await test('Kitchen Ready reaches Captain Food Ready; filtered delivery reaches KDS/POS and keeps cash unpaid',async()=>{
   await ticketFor(captainOrder).getByRole('button',{name:/all dishes ready/i}).click();await expect(captainTicket(captainOrder).getByRole('button',{name:'Mark Served',exact:true})).toBeVisible({timeout:15000});
   await captain.locator('nav').getByRole('button',{name:/Food Ready/}).click();await captain.getByRole('textbox',{name:'Search ready food'}).fill(captainOrder.tokenNumber);await expect(captain.getByText('Cold Coffee',{exact:true}).first()).toBeVisible();
   await captain.screenshot({path:q.path.join(q.reportDir,'evidence','captain-food-ready-mobile.png')});
   await captain.getByRole('button',{name:/DELIVER SHOWN READY ITEMS/i}).click();
   await expect(async()=>{const o=await cloudOrder(captainOrder.id);expect(o.items.every(i=>i.kitchenStatus==='SERVED')).toBe(true);expect(o.paymentStatus).toBe('PENDING');}).toPass({timeout:15000});
   await expect(async()=>{const o=await pos.evaluate(id=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.id===id),captainOrder.id);expect(o.items.every(i=>i.kitchenStatus==='SERVED')).toBe(true);}).toPass({timeout:15000});return {kitchenToCaptainToPos:true,payment:'PENDING'};
 });
 await test('Captain requests the bill on the current order and POS receives it',async()=>{
   await captain.locator('nav').getByRole('button',{name:/My Tables/}).click();await captain.getByRole('button',{name:'REQUEST BILL',exact:true}).click();
   await expect(async()=>{const o=await cloudOrder(captainOrder.id);expect(o.meta.billRequestedAt).toBeTruthy();expect(o.paymentStatus).toBe('PENDING');}).toPass({timeout:15000});
   await expect(async()=>{const o=await pos.evaluate(id=>JSON.parse(window.__jamanvaarStorage.getItem('jamanvaar_db_orders')||'[]').find(o=>o.id===id),captainOrder.id);expect(o.billRequestedAt).toBeTruthy();}).toPass({timeout:15000});
   await captain.locator('nav').getByRole('button',{name:/Orders/}).click();await captain.getByRole('textbox',{name:'Search active dining orders'}).fill(captainOrder.tokenNumber);await expect(captain.getByText('TN2',{exact:false}).first()).toBeVisible();return {billHandoff:true,settlementRemainsAtPos:true};
 });
 await expect(kds.getByRole('complementary',{name:'System Notifications'})).toHaveCount(0);
 await goKots();await captain.getByRole('textbox',{name:'Search Captain KOT tickets'}).fill(captainOrder.tokenNumber);await expect(captainTicket(captainOrder).getByRole('button',{name:'Mark Served',exact:true})).toHaveCount(0);
 await captain.screenshot({path:q.path.join(q.reportDir,'evidence','captain-live-kot-mobile.png')});
 await kds.setViewportSize({width:1366,height:900});

 // A real backend order with many long lines checks scrolling and responsive sizing.
 await call('POST','/api/v1/orders/sync',{events:[{idempotencyKey:'qa-layout-'+Date.now(),externalOrderId:'qa-layout-'+stamp,status:'CONFIRMED',orderType:'TAKEAWAY',paymentMethod:'CASH_AT_COUNTER',paymentStatus:'PENDING',
   items:Array.from({length:18},(_,i)=>({externalItemId:'layout-line-'+i,menuItemId:'coffee',name:'Cold Coffee with extra chocolate and vanilla cream special '+(i+1),quantity:1,unitPrice:12000,lineTotal:12000,kitchenStatus:'PREPARING',kitchenStation:'Main Kitchen',specialInstructions:i===0?'ALLERGY: no nuts. Keep separate utensils.':''})),subtotal:216000,totalAmount:216000,taxAmount:0,discountAmount:0,meta:{tokenNumber:'K-LONG',orderNumber:'QA-LONG',sourceType:'KIOSK'},updatedAt:new Date().toISOString()}]},kioskDevice.deviceToken);
 await expect(kds.getByTestId('kds-ticket').filter({has:kds.getByText('#K-LONG',{exact:true})})).toHaveCount(1,{timeout:15000});
 for(const [width,height]of [[360,740],[768,1024],[910,1020],[1024,768],[1366,768],[1920,1080],[2560,1440]])await test(`KDS tablet/TV layout ${width}x${height} keeps cards, dishes and actions usable`,async()=>{
   await kds.setViewportSize({width,height});await expect(kds.getByTestId('kds-board')).toBeVisible();
   const layout=await kds.evaluate(()=>({documentOverflow:document.documentElement.scrollWidth>innerWidth,board:document.querySelector('[data-testid="kds-board"]').getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll('[data-testid="kds-ticket"]')].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,overflow:c.scrollWidth>c.clientWidth,text:parseFloat(getComputedStyle(c.querySelector('.kds-dish-name')).fontSize),dishViewportHeight:c.querySelector('.kds-dishes').clientHeight}))}));
   q.fs.writeFileSync(q.path.join(q.reportDir,'evidence',`layout-${width}x${height}.json`),JSON.stringify(layout,null,2));
   expect(layout.documentOverflow).toBe(false);expect(layout.board.height).toBeGreaterThan(height*0.45);expect(layout.cards.every(c=>!c.overflow&&c.text>=16&&c.text<=20&&c.height<=layout.board.height)).toBe(true);
   const long=kds.getByTestId('kds-ticket').filter({has:kds.getByText('#K-LONG',{exact:true})});await long.scrollIntoViewIfNeeded();await expect(long.getByRole('button',{name:/all dishes ready/i})).toBeInViewport();expect(await long.getByRole('button',{name:/all dishes ready/i}).evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
   const list=long.getByRole('list');expect(await list.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await list.evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect(long.getByText(/special 18$/)).toBeInViewport();await list.evaluate(e=>{e.scrollTop=0;});
   await kds.screenshot({path:q.path.join(q.reportDir,'evidence',`kds-${width}x${height}.png`)});return layout;
 });
 expect(errors).toEqual([]);console.log(`Kiosk/KDS checks: ${results.length} passed.`);
}
main().catch(async e=>{console.error(e.message);if(browser)for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){await p.screenshot({path:q.path.join(q.reportDir,'evidence',`failure-${i}.png`)}).catch(()=>{});console.log('Failure page '+i+': '+(await p.locator('body').innerText().catch(()=>'' )).slice(0,1400));}process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({at:new Date().toISOString(),provider:'SIMULATED',physicalDevices:false,environment:'isolated local API/database; compiled apps',results,errors,timings},null,2));await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());if(api){api.kill();await new Promise(resolve=>{api.once('exit',resolve);setTimeout(resolve,1500);});}if(prisma){if(restaurantId)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:restaurantId}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}});
