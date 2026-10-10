// Compiled applications, real isolated API/RLS/database; Razorpay transport is simulated.
process.env.JAMANVAAR_QA_REPORT_DIR=process.env.JAMANVAAR_QA_REPORT_DIR||'docs/reports/qr-module-2026-10-10';
const q=require('./browser-audit-lib.cjs'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {chromium,expect}=require('playwright/test');
const scrub=value=>String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT REDACTED]').split(q.state.platformPassword).join('[PASSWORD REDACTED]').split(q.state.ownerPassword).join('[PASSWORD REDACTED]');
const port=5288,base=`http://localhost:${port}`,results=[],errors=[];
let api,server,browser,prisma,rid,planId,admin,guest,kds,platform,qr,branchId,releaseProvider;
const check=async(name,run)=>{try{const evidence=await run();results.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:scrub(e.message)});throw e;}};
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${q.state.port}/health`,{signal:AbortSignal.timeout(500)})).status<500)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('QA API did not start');}
async function main(){
 if(!/test/i.test(new URL(q.state.databaseUrl).pathname))throw Error('Dedicated test database required');
 for(const p of [port,q.state.port]){try{await fetch(`http://localhost:${p}`,{signal:AbortSignal.timeout(300)});throw Error(`Port ${p} occupied; existing servers preserved`);}catch(e){if(e.message.includes('occupied'))throw e;}}
 const log=q.fs.createWriteStream(q.path.join(q.root,'logs/qr-module-browser-api.log'));
 api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,env:{...process.env,JAMANVAAR_QA_QR_PAYMENTS:'1',JAMANVAAR_QA_QR_STANDARD:'1',JAMANVAAR_QA_QR_ORIGIN:base},windowsHide:true,stdio:['ignore','pipe','pipe']});api.stdout.pipe(log);api.stderr.pipe(log);await ready();
 require('@prisma/client');process.env.DATABASE_URL=q.state.databaseUrl;const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));prisma=new PrismaService();await prisma.$connect();
 server=http.createServer((req,res)=>{
   const pathname=new URL(req.url,base).pathname;
   if(pathname==='/__qa/checkout'&&req.method==='POST'){
     const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
       try{const input=JSON.parse(Buffer.concat(chunks)),orders=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-qr-standard-orders.json'))),order=orders.find(o=>o.id===input.orderId);
       if(!order)throw Error('Unknown QA provider order');const id='pay_qa'+Date.now(),file=q.path.join(q.privateDir,'private-qr-standard-payments.json'),payments=q.fs.existsSync(file)?JSON.parse(q.fs.readFileSync(file)):[];
       payments.push({id,order_id:order.id,amount:order.amount,currency:order.currency,status:'captured'});q.fs.writeFileSync(file,JSON.stringify(payments));
       res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({razorpay_payment_id:id,razorpay_order_id:order.id,razorpay_signature:crypto.createHmac('sha256',q.state.jwtSecret).update(order.id+'|'+id).digest('hex')}));
       }catch{res.writeHead(400);res.end();}
     });return;
   }
   if(pathname.startsWith('/api/')){const headers={...req.headers,host:`localhost:${q.state.port}`};const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},up=>{res.writeHead(up.statusCode,{...up.headers,'access-control-allow-origin':base});up.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;}
   const app=pathname.split('/')[1],roots={'restaurant-admin':'apps/restaurant-system/pos-admin/dist',q:'apps/qr-guest/dist',kds:'apps/restaurant-system/kds/dist'},root=q.path.join(q.root,roots[app]||roots.q),relative=roots[app]?pathname.slice(app.length+2):pathname.slice(1);let file=q.path.resolve(root,relative||'index.html');
   if(!file.startsWith(root+q.path.sep)){res.writeHead(403);res.end();return;}if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
   res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm'})[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(port,'localhost',r));
 const challenge=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword}),mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];platform=(await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;
 const stamp=Date.now(),rest=await q.mustApi('POST','/api/v1/restaurants',{name:`QA Hundred Dishes ${stamp}`,mobile:'9'+String(stamp).slice(-9),ownerName:'QA Owner',ownerEmail:`menu-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);rid=rest.restaurant.id;
 const plan=await q.mustApi('POST','/api/v1/plans',{name:`QA Hundred ${stamp}`,tier:'QR',priceMonthly:900000,maxBranches:2,maxDevices:8,maxUsers:10,entitlements:{restaurantAdmin:true,qrTableOrdering:true}},platform);planId=plan.id;
 await q.mustApi('POST','/api/v1/subscriptions',{restaurantId:rid,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS_ADMIN','QR_ORDERING']},platform);
 branchId=(await prisma.runAsTenant(rid,tx=>tx.branch.findFirstOrThrow({where:{restaurantId:rid}}))).id;
 const activate=async type=>{const key=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:rid,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return q.mustApi('POST','/api/v1/activation/redeem',{code:key.code,deviceType:type},'');};
 const ad=await activate('POS_ADMIN');const push=(type,id,payload)=>q.mustApi('POST',`/api/v1/entity-sync/${type}`,{events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]},ad.deviceToken);
 await push('MENU_CATEGORY','mains',{name:'Our meals',isActive:true});
 await push('MODIFIER_GROUP','size',{name:'Size',isRequired:true,minSelections:1,maxSelections:1,options:[{id:'regular',groupId:'size',name:'Regular',priceDelta:0,isAvailable:true},{id:'large',groupId:'size',name:'Large',priceDelta:50,isAvailable:true}]});
 await push('MENU_ITEM','thali',{categoryId:'mains',name:'Gujarati Thali',description:'Fresh Gujarati dishes with roti, dal and rice.',price:250,isAvailable:true,modifierGroupIds:['size']});
 await push('DINING_TABLE','qa-table',{tableNumber:'TN1',capacity:4,isActive:true,branchId});
 await q.mustApi('POST','/api/v1/menu/publish',{},ad.deviceToken);
 const code=await q.mustApi('POST','/api/v1/restaurant/qr/tables/qa-table/generate',{branchId},ad.deviceToken);qr=code.url.split('/q/')[1];
 await prisma.runAsTenant(rid,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId:rid,status:'ACTIVE'}}));
 q.fs.writeFileSync(q.path.join(q.privateDir,'private-qr-standard-payments.json'),'[]');
 browser=await chromium.launch({headless:true,args:['--disable-gpu']});const ctx=await browser.newContext({viewport:{width:1440,height:960}});ctx.setDefaultTimeout(20000);
 const sdk=`window.Razorpay=class{constructor(o){this.o=o;}on(){}open(){const panel=document.createElement('div');panel.id='qa-payment-overlay';panel.style='position:fixed;inset:20%;z-index:99999;background:white;border:3px solid navy;padding:30px';panel.innerHTML='<h2>QA secure provider checkout</h2><p>Simulated gateway; no funds.</p><button id="qa-pay">QA Complete payment</button><button id="qa-cancel">QA Cancel payment</button>';document.body.appendChild(panel);panel.querySelector('#qa-cancel').onclick=()=>{panel.remove();this.o.modal.ondismiss();};panel.querySelector('#qa-pay').onclick=async()=>{const r=await fetch('/__qa/checkout',{method:'POST',body:JSON.stringify({orderId:this.o.order_id})});const data=await r.json();panel.remove();this.o.handler(data);};}};`;
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(u.hostname==='checkout.razorpay.com'&&u.pathname==='/v1/checkout.js')return route.fulfill({contentType:'application/javascript',body:sdk});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();});
 admin=await ctx.newPage();guest=await ctx.newPage();for(const page of [admin,guest])page.on('pageerror',e=>errors.push(scrub(e.message)));
 await admin.addInitScript(({rid,ad})=>{for(const[k,v]of Object.entries({restaurant_id:rid,device_id:ad.device.id,device_token:ad.deviceToken}))localStorage.setItem('jamanvaar_cloud_'+k,v);},{rid,ad});
 await admin.goto(base+'/restaurant-admin/qr-ordering');await admin.getByPlaceholder(/JM9876543210/).fill(rest.restaurant.restaurantCode);await admin.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);await admin.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(admin.getByTestId('qr-console')).toBeVisible({timeout:60000});await expect(admin.getByText('KELVIONTECH ENTERPRISE',{exact:true})).toHaveCount(0,{timeout:20000});
 if(process.env.JAMANVAAR_QA_QR_ADVANCED_ONLY!=='1'){
 await check('QR-only Restaurant Admin has all nine console sections and a working live design preview/export',async()=>{
  const console=admin.getByTestId('qr-console');for(const name of ['Overview','Menu & Availability','Tables & QR','QR Design Studio','QR Orders','Payment Settings','Ordering Rules','Analytics','QR Settings'])await expect(console.getByRole('button',{name,exact:true})).toBeVisible();
  await console.getByRole('button',{name:'QR Design Studio',exact:true}).click();await expect(console.getByText('Scan to Order',{exact:true})).toBeVisible();
  await console.getByRole('button',{name:'Fine dining',exact:true}).click();await console.getByLabel('QR instruction').fill('Scan for a fresh meal');await expect(console.locator('svg').filter({hasText:'Scan for a fresh meal'})).toBeVisible();
  await console.getByRole('button',{name:'Save design',exact:true}).click();await expect(admin.getByRole('status')).toContainText('QR design saved');
  const download=admin.waitForEvent('download');await console.getByRole('button',{name:/SVG/}).click();expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  const bounds=await console.getByTestId('qr-design-preview').evaluate(node=>({available:node.clientWidth,actual:node.querySelector('svg').getBoundingClientRect().width}));expect(bounds.actual).toBeLessThanOrEqual(bounds.available+1);await console.evaluate(node=>{node.closest('main').scrollTop=0;});await admin.screenshot({path:q.path.join(q.reportDir,'evidence/qr-design-studio.png')});return {sections:9,svgExport:true};
 });
 await check('Rules and payment controls save, reach the actual guest API and hide disabled cash',async()=>{
  const console=admin.getByTestId('qr-console');await console.getByRole('button',{name:'Ordering Rules',exact:true}).click();await console.getByLabel('Preparation estimate (minutes)').fill('25');await console.getByRole('button',{name:'Save ordering rules',exact:true}).click();await expect(admin.getByRole('status')).toContainText('saved');
  await console.getByRole('button',{name:'Payment Settings',exact:true}).click();await expect(console.getByText(/Razorpay|RAZORPAY/).first()).toBeVisible();const toggle=console.getByLabel('Cash at Counter', {exact:true});await expect(toggle).toBeEnabled();await expect(toggle).toBeChecked();await toggle.uncheck();
  await expect.poll(async()=>(await q.mustApi('GET',`/api/v1/public/qr/${qr}`,undefined,'')).ordering.settings.allowCash).toBe(false);
  await guest.setViewportSize({width:390,height:844});await guest.goto(base+'/q/'+qr);await expect(guest.getByRole('button',{name:'Add Gujarati Thali',exact:true})).toBeVisible();
  expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);return {cashHiddenByAdmin:true,preparationMinutes:25};
 });
 await check('Mobile guests can customize, edit choices, keep carts across refresh and retry the same payment after dismissal',async()=>{
  await guest.getByRole('button',{name:'Add Gujarati Thali',exact:true}).click();await guest.getByLabel('Regular',{exact:true}).check();await guest.getByRole('button',{name:/^Add 1/}).click();await guest.getByRole('button',{name:/View Cart/}).click();
  await guest.getByRole('button',{name:'Edit Gujarati Thali',exact:true}).click();await guest.getByLabel(/Large/).check();await guest.getByRole('button',{name:/Save changes/}).click();await expect(guest.getByText('Large',{exact:true})).toBeVisible();await guest.reload();await expect(guest.getByText('Large',{exact:true})).toBeVisible();
  await guest.getByRole('button',{name:'Checkout',exact:true}).click();await expect(guest.getByLabel(/Pay at counter/)).toHaveCount(0);const first=guest.waitForResponse(r=>r.url().endsWith('/orders')&&r.request().method()==='POST');await guest.getByRole('button',{name:/^Pay online/}).click();const placed=await(await first).json();
  await expect(guest.getByRole('heading',{name:'QA secure provider checkout'})).toBeVisible();await expect(guest.getByRole('heading',{name:'Order confirmed',exact:true})).toHaveCount(0);expect(new URL(guest.url()).hostname).toBe('localhost');
  await guest.getByRole('button',{name:'QA Cancel payment',exact:true}).click();await expect(guest.getByRole('heading',{name:'Complete your payment',exact:true})).toBeVisible();
  const retry=guest.waitForResponse(r=>r.url().endsWith('/payment')&&r.request().method()==='POST');await guest.getByRole('button',{name:'Continue payment',exact:true}).click();const again=await(await retry).json();expect(again.publicOrderId).toBe(placed.publicOrderId);expect(again.payment.checkout.orderId).toBe(placed.payment.checkout.orderId);
  await guest.getByRole('button',{name:'QA Complete payment',exact:true}).click();await expect(guest.getByRole('heading',{name:'Order confirmed',exact:true})).toBeVisible({timeout:30000});await expect(guest.getByText('Payment verified',{exact:true})).toBeVisible();
  await guest.screenshot({path:q.path.join(q.reportDir,'evidence/qr-mobile-verified.png')});return {sameOrder:true,sameProviderOrder:true,serverVerified:true,modifierEdited:true};
 });
 await check('A second phone scanning the same table has an independent empty cart',async()=>{
  const ctx2=await browser.newContext({viewport:{width:768,height:1024}});await ctx2.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();});
  const phone=await ctx2.newPage();await phone.goto(base+'/q/'+qr);await expect(phone.getByRole('button',{name:'Add Gujarati Thali',exact:true})).toBeVisible({timeout:15000}).catch(async e=>{console.error('Second phone: '+await phone.locator('body').innerText());throw e;});await expect(phone.getByRole('button',{name:/View Cart/})).toHaveCount(0);expect(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await phone.screenshot({path:q.path.join(q.reportDir,'evidence/qr-tablet-menu.png')});await ctx2.close();return {independentCart:true,tabletFits:true};
 });
 await check('QR Admin accepts, marks ready and completes the paid order without a POS; the mobile tracker follows',async()=>{
  const console=admin.getByTestId('qr-console');await console.getByRole('button',{name:'QR Orders',exact:true}).click();await console.getByRole('button',{name:'Accept / prepare',exact:true}).click();await console.getByRole('button',{name:'Mark ready',exact:true}).click();await expect(guest.getByRole('heading',{name:'Your order is ready',exact:true})).toBeVisible({timeout:20000});await console.getByRole('button',{name:'Complete',exact:true}).click();await expect(guest.getByRole('heading',{name:'Order completed',exact:true})).toBeVisible({timeout:20000});
  await console.getByRole('button',{name:'Analytics',exact:true}).click();await expect(console.getByText('Collected payments',{exact:true})).toBeVisible();await admin.screenshot({path:q.path.join(q.reportDir,'evidence/qr-analytics.png')});return {status:'COMPLETED',posRequired:false};
 });
 await check('Cash checkout stays unpaid until authorized collection, then completes in QR Admin',async()=>{
  const console=admin.getByTestId('qr-console');await console.getByRole('button',{name:'Payment Settings',exact:true}).click();const cash=console.getByLabel('Cash at Counter',{exact:true});await expect(cash).toBeEnabled();await expect(cash).not.toBeChecked();await cash.check();
  await expect.poll(async()=>(await q.mustApi('GET',`/api/v1/public/qr/${qr}`,undefined,'')).ordering.settings.allowCash).toBe(true);
  await guest.getByRole('button',{name:'Order more',exact:true}).click();await guest.getByRole('button',{name:'Add Gujarati Thali',exact:true}).click();await guest.getByLabel('Regular',{exact:true}).check();await guest.getByRole('button',{name:/^Add 1/}).click();await guest.getByRole('button',{name:/View Cart/}).click();await guest.getByRole('button',{name:'Checkout',exact:true}).click();await guest.getByLabel(/Pay at counter/).check();
  await guest.getByRole('button',{name:/^Place order/}).click();await expect(guest.getByRole('heading',{name:'Order confirmed',exact:true})).toBeVisible();await expect(guest.getByText(/Payment due at counter/).first()).toBeVisible();
  await console.getByRole('button',{name:'QR Orders',exact:true}).click();admin.once('dialog',dialog=>dialog.accept());await console.getByRole('button',{name:'Collect cash',exact:true}).click();await expect(guest.getByText('Payment verified',{exact:true})).toBeVisible({timeout:20000});
  await console.getByRole('button',{name:'Accept / prepare',exact:true}).click();await console.getByRole('button',{name:'Mark ready',exact:true}).click();await console.getByRole('button',{name:'Complete',exact:true}).click();await expect(guest.getByRole('heading',{name:'Order completed',exact:true})).toBeVisible({timeout:20000});return {cashCollected:true,status:'COMPLETED'};
 });
 await check('Bulk generation creates mapped codes, and QR Admin fits a narrow mobile screen',async()=>{
  const console=admin.getByTestId('qr-console');await console.getByRole('button',{name:'Tables & QR',exact:true}).click();await console.getByRole('button',{name:'Add table',exact:true}).click();await console.getByPlaceholder('e.g. 12 or Terrace 1').fill('TN2');await console.getByRole('button',{name:'Save table',exact:true}).click();await expect(console.getByText('Table TN2',{exact:false}).first()).toBeVisible();await console.getByLabel('Select table TN2',{exact:true}).check();await console.getByRole('button',{name:'Generate selected QR codes',exact:true}).click();await expect(admin.getByRole('status')).toContainText('1 table QR codes generated');
  const tables=await q.mustApi('GET','/api/v1/restaurant/qr/tables',undefined,ad.deviceToken);expect(tables.find(t=>t.displayNumber==='TN2').qr.status).toBe('ACTIVE');
  await admin.setViewportSize({width:390,height:844});await console.getByRole('button',{name:'Ordering Rules',exact:true}).click();await expect(console.getByLabel('Preparation estimate (minutes)')).toBeVisible();expect(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await admin.screenshot({path:q.path.join(q.reportDir,'evidence/qr-admin-mobile.png')});return {bulkMapped:true,mobileFits:true};
 });
 }
 if(process.env.JAMANVAAR_QA_QR_ADVANCED==='1')await require('./browser-qr-advanced-flows.cjs')({q,base,browser,admin,guest,prisma,rid,branchId,qr,ad,check,errors});
 expect(errors).toEqual([]);
}
main().catch(async e=>{console.error(scrub(e.message));for(const[name,p]of [['admin',admin],['guest',guest]])if(p){await p.screenshot({path:q.path.join(q.reportDir,'evidence',`failure-${name}.png`),timeout:5000}).catch(()=>undefined);console.error(name+': '+(await p.locator('body').innerText().catch(()=>'' )).slice(-1600));}process.exitCode=1;}).finally(async()=>{
 q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({environment:'compiled apps, isolated API/database',provider:'simulated SDK and provider; no real funds',results,pageErrors:errors},null,2));await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}api?.kill();if(prisma){if(rid)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:rid}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}
});
