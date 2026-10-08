// Compiled applications, real isolated API/RLS/database; Razorpay transport is simulated.
process.env.JAMANVAAR_QA_REPORT_DIR='docs/reports/crm-loyalty-2026-10-08';
const q=require('./browser-audit-lib.cjs'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {chromium,expect}=require('playwright/test');
const scrub=value=>String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT REDACTED]').split(q.state.platformPassword).join('[PASSWORD REDACTED]').split(q.state.ownerPassword).join('[PASSWORD REDACTED]');
const port=5288,base=`http://localhost:${port}`,results=[],errors=[];
let api,server,browser,prisma,rid,planId,admin,guest,kds,platform,qr,pos,branchId,releaseProvider;
const check=async(name,run)=>{try{const evidence=await run();results.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:scrub(e.message)});throw e;}};
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${q.state.port}/health`,{signal:AbortSignal.timeout(500)})).status<500)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('QA API did not start');}
async function main(){
 if(!/test/i.test(new URL(q.state.databaseUrl).pathname))throw Error('Dedicated test database required');
 for(const p of [port,q.state.port]){try{await fetch(`http://localhost:${p}`,{signal:AbortSignal.timeout(300)});throw Error(`Port ${p} occupied; existing servers preserved`);}catch(e){if(e.message.includes('occupied'))throw e;}}
 const log=q.fs.createWriteStream(q.path.join(q.root,'logs/crm-loyalty-browser-api.log'));
 api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,env:{...process.env,JAMANVAAR_QA_QR_PAYMENTS:'1',JAMANVAAR_QA_QR_ORIGIN:base},windowsHide:true,stdio:['ignore','pipe','pipe']});api.stdout.pipe(log);api.stderr.pipe(log);await ready();
 require('@prisma/client');process.env.DATABASE_URL=q.state.databaseUrl;const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));prisma=new PrismaService();await prisma.$connect();
 server=http.createServer((req,res)=>{
   const pathname=new URL(req.url,base).pathname;
   if(pathname.startsWith('/api/')){const headers={...req.headers,host:`localhost:${q.state.port}`};const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},up=>{res.writeHead(up.statusCode,{...up.headers,'access-control-allow-origin':base});up.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;}
   const app=pathname.split('/')[1],roots={'restaurant-admin':'apps/restaurant-system/pos-admin/dist',pos:'apps/restaurant-system/pos/dist',q:'apps/qr-guest/dist',kds:'apps/restaurant-system/kds/dist'},root=q.path.join(q.root,roots[app]||roots.q),relative=roots[app]?pathname.slice(app.length+2):pathname.slice(1);let file=q.path.resolve(root,relative||'index.html');
   if(!file.startsWith(root+q.path.sep)){res.writeHead(403);res.end();return;}if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
   res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm'})[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(port,'localhost',r));
 const challenge=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword}),mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];platform=(await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;
 const stamp=Date.now(),rest=await q.mustApi('POST','/api/v1/restaurants',{name:`QA CRM Loyalty ${stamp}`,mobile:'9'+String(stamp).slice(-9),ownerName:'QA Owner',ownerEmail:`menu-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);rid=rest.restaurant.id;
 const plan=await q.mustApi('POST','/api/v1/plans',{name:`QA CRM ${stamp}`,tier:'QR',priceMonthly:900000,maxBranches:2,maxDevices:8,maxUsers:10,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true}},platform);planId=plan.id;
 await q.mustApi('POST','/api/v1/subscriptions',{restaurantId:rid,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['POS','POS_ADMIN','KDS','QR_ORDERING','KIOSK','KIOSK_ADMIN']},platform);
 branchId=(await prisma.runAsTenant(rid,tx=>tx.branch.findFirstOrThrow({where:{restaurantId:rid}}))).id;
 const activate=async type=>{const key=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:rid,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return q.mustApi('POST','/api/v1/activation/redeem',{code:key.code,deviceType:type},'');};
 const ad=await activate('POS_ADMIN'),pd=await activate('POS');
 const push=(type,id,payload)=>q.mustApi('POST',`/api/v1/entity-sync/${type}`,{events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]},ad.deviceToken);
 await push('MENU_CATEGORY','qa-category',{name:'QA Meals',isActive:true});
 await push('MENU_ITEM','qa-dish',{name:'QA Loyalty Thali',description:'Loyalty test meal',sku:'QA-LOYALTY',price:500,categoryId:'qa-category',isAvailable:true,dietaryType:'VEG',isVeg:true,kitchenStation:'Main Kitchen'});
 await push('CUSTOMER','9888888888',{phone:'9888888888',name:'Daksh',loyaltyPoints:200,favoriteItemIds:[],recentOrderIds:[]});
 await push('LOYALTY_REWARD','reward-100off',{name:'\u20b9100 Off Bill',description:'Flat \u20b9100 off',pointsCost:150,discountKind:'FIXED',discountAmount:100,isActive:false});
 await push('LOYALTY_PROGRAM_SETTINGS','default',{earnPoints:1,perRupeesSpent:10,enabled:true});
 const pin='2468',salt=crypto.randomBytes(16),hash=crypto.pbkdf2Sync(`${rid}:${pin}`,salt,100000,32,'sha256').toString('hex');await push('STAFF_USER','qa-cashier',{fullName:'QA Loyalty Cashier',username:'qa-cashier',roleId:'role-cashier',isActive:true,branchId,pinScope:rid,pinHash:`pinv2:${salt.toString('hex')}:${hash}`});
 browser=await chromium.launch({headless:true,args:['--disable-gpu']});const ctx=await browser.newContext({viewport:{width:1440,height:960}});ctx.setDefaultTimeout(20000);
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/v1/'))return route.continue({url:base+u.pathname+u.search});if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();});
 admin=await ctx.newPage();pos=await ctx.newPage();for(const p of [admin,pos])p.on('pageerror',e=>errors.push(scrub(e.message)));
 await admin.addInitScript(({rid,ad})=>{for(const[k,v]of Object.entries({restaurant_id:rid,device_id:ad.device.id,device_token:ad.deviceToken}))localStorage.setItem('jamanvaar_cloud_'+k,v);},{rid,ad});
 await pos.addInitScript(({rid,pd})=>{for(const[k,v]of Object.entries({restaurant_id:rid,device_id:pd.device.id,device_token:pd.deviceToken}))localStorage.setItem('jamanvaar_pos_'+k,v);},{rid,pd});
 await admin.goto(base+'/restaurant-admin/customers');await admin.getByPlaceholder(/JM9876543210/).fill(rest.restaurant.restaurantCode);await admin.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);await admin.getByRole('button',{name:'Sign In',exact:true}).click();await expect(admin.getByText('Daksh',{exact:true}).first()).toBeVisible({timeout:60000});
 await check('Admin reward configuration syncs through the actual backend',async()=>{
   await admin.getByRole('button',{name:'Loyalty Program',exact:true}).click();const dialog=admin.getByRole('dialog');await expect(dialog.getByText('\u20b9100 Off Bill \u2014 150 pts',{exact:true})).toBeVisible();
   await dialog.getByRole('button',{name:'Paused',exact:true}).click();
   await dialog.getByLabel('Edit reward \u20b9100 Off Bill',{exact:true}).click();await dialog.getByLabel('Reward rupee value').fill('100');await dialog.getByRole('button',{name:'Save Reward',exact:true}).click();
   await expect(async()=>{const pull=await q.mustApi('GET','/api/v1/entity-sync/LOYALTY_REWARD',undefined,pd.deviceToken);expect(pull.entities.find(r=>r.externalId==='reward-100off').payload).toMatchObject({discountAmount:100,pointsCost:150,isActive:true});}).toPass({timeout:15000});
   await admin.keyboard.press('Escape');
 });
 await pos.goto(base+'/pos/',{waitUntil:'domcontentloaded'});await pos.getByRole('button',{name:/QA Loyalty Cashier/}).click({timeout:60000});for(const n of pin)await pos.getByRole('button',{name:n,exact:true}).click();
 await expect(pos.getByText('KELVIONTECH ENTERPRISE',{exact:true})).toHaveCount(0,{timeout:20000});
 if(!await pos.getByRole('button',{name:/Customers CRM/}).isVisible())await pos.getByTitle('Back to the main menu',{exact:true}).click();
 await pos.getByRole('button',{name:/Customers CRM/}).click();await expect(pos.getByText('Daksh',{exact:true})).toBeVisible({timeout:20000});await pos.getByRole('button',{name:'Attach to Current Order',exact:true}).click();
 await pos.getByRole('heading',{name:'QA Loyalty Thali',exact:true}).click();
 const rewards=()=>pos.getByTestId('loyalty-rewards').last();
 const account=async()=>{const pull=await q.mustApi('GET','/api/v1/entity-sync/CUSTOMER',undefined,ad.deviceToken);return pull.entities.find(r=>r.externalId==='9888888888').payload;};
 await check('Manual percentage input works during checkout with exactly one discount dialog',async()=>{
   await pos.getByRole('button',{name:/^PAY \u20b9/}).click();await pos.getByRole('button',{name:'+ Apply Discount',exact:true}).click();
   await expect(pos.getByLabel('Discount value')).toHaveCount(1);await pos.getByLabel('Discount value').pressSequentially('17.5');await expect(pos.getByLabel('Discount value')).toHaveValue('17.5');await pos.getByRole('button',{name:'Apply Discount',exact:true}).click();
   await expect(pos.getByText(/17.5%/).first()).toBeVisible();await expect(pos.getByLabel('Discount value')).toHaveCount(0);
   await pos.screenshot({path:q.path.join(q.reportDir,'evidence/manual-discount.png')});
   // Replace the ordinary promotion with an explicitly selected catalog reward.
 });
 await check('Cashier may select or decline \u20b9100 for 150 points; no points are spent before settlement',async()=>{
   await rewards().locator('summary').click();await rewards().getByRole('button').filter({hasText:'\u20b9100 Off Bill'}).click();await expect(rewards()).toContainText('Save \u20b9100');expect((await account()).loyaltyPoints).toBe(200);
   await rewards().getByRole('button',{name:'Keep my points'}).click();expect((await account()).loyaltyPoints).toBe(200);await rewards().getByRole('button').filter({hasText:'\u20b9100 Off Bill'}).click();await pos.screenshot({path:q.path.join(q.reportDir,'evidence/reward-at-payment.png')});
 });
 await check('Successful POS payment updates CRM balance, spend and visits across apps',async()=>{
   await pos.getByRole('button',{name:/CONFIRM & SETTLE/}).click();await expect(async()=>{const a=await account();expect(a.totalVisits).toBe(1);expect(a.loyaltyPoints).toBeGreaterThanOrEqual(90);expect(a.loyaltyPoints).toBeLessThan(100);}).toPass({timeout:20000});
   const a=await account();expect(Object.keys(a.loyaltyLedger).filter(k=>k.startsWith('redeem:'))).toHaveLength(1);expect(Object.keys(a.loyaltyLedger).filter(k=>k.startsWith('earn:'))).toHaveLength(1);
   await expect(admin.getByText(String(a.loyaltyPoints),{exact:true}).first()).toBeVisible({timeout:20000});await expect(admin.getByText('KELVIONTECH ENTERPRISE',{exact:true})).toHaveCount(0,{timeout:20000});await admin.screenshot({path:q.path.join(q.reportDir,'evidence/admin-earned-points.png')});return {balance:a.loyaltyPoints,totalSpend:a.totalSpend,totalVisits:a.totalVisits};
 });
 await check('A repeat visit earns again; insufficient points disable redemption without blocking payment',async()=>{
   await pos.getByRole('button',{name:'Done',exact:true}).click();await pos.getByRole('heading',{name:'QA Loyalty Thali',exact:true}).click();await pos.getByRole('button',{name:/^PAY \u20b9/}).click();
   await rewards().locator('summary').click();await expect(rewards().getByRole('button').filter({hasText:'\u20b9100 Off Bill'})).toBeDisabled();await expect(rewards()).toContainText('Need 60 more points');
   await pos.getByRole('button',{name:/CONFIRM & SETTLE/}).click();await expect(async()=>{const a=await account();expect(a.totalVisits).toBe(2);expect(a.totalSpend).toBe(900);expect(a.loyaltyPoints).toBe(140);}).toPass({timeout:20000});
   await expect(admin.getByText('140',{exact:true}).first()).toBeVisible({timeout:20000});return {balance:140,totalSpend:900,totalVisits:2};
 });
 expect(errors).toEqual([]);
}
main().catch(async e=>{console.error(scrub(e.stack||e));for(const[name,p]of [['admin',admin],['pos',pos]])if(p){await p.screenshot({path:q.path.join(q.reportDir,`failure-${name}.png`),timeout:5000}).catch(()=>undefined);console.error(name+': '+(await p.locator('body').innerText().catch(()=>'' )).slice(-2500));}process.exitCode=1;}).finally(async()=>{
 q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({environment:'compiled POS and Restaurant Admin, isolated API/database',results,pageErrors:errors},null,2));await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}api?.kill();if(prisma){if(rid)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:rid}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}
});
