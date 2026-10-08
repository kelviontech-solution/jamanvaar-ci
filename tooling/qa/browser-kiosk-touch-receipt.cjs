// Real kiosk checkout and API email/PDF generation; all external delivery is
// blocked/captured by the isolated QA server. WhatsApp provider replies are
// simulated at the browser transport boundary, never sent to a real number.
process.env.JAMANVAAR_QA_REPORT_DIR='docs/reports/kiosk-touch-receipt-2026-10-08';
const q=require('./browser-audit-lib.cjs'),http=require('node:http'),{spawn}=require('node:child_process');
const {chromium,expect}=require('playwright/test');
const port=5284,origin=`http://localhost:${port}`,results=[],errors=[];
let api,server,browser,prisma,rid,planId,page,emailCalls=0,whatsappCalls=0;
let whatsappMode='failure',emailDelay=0;const network=[];
async function check(name,run){try{const evidence=await run();results.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${q.state.port}/api/v1/health`,{signal:AbortSignal.timeout(800)})).status<500)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('QA API did not start');}
async function main(){
  if(!/test/i.test(new URL(q.state.databaseUrl).pathname))throw Error('Dedicated QA database required');
  for(const p of [port,q.state.port]){try{await fetch(`http://localhost:${p}`,{signal:AbortSignal.timeout(300)});throw Error(`Port ${p} occupied; existing server preserved`);}catch(e){if(e.message.includes('occupied'))throw e;}}
  const log=q.fs.createWriteStream(q.path.join(q.root,'logs/kiosk-touch-receipt-api.log'));
  api=spawn(process.execPath,[q.path.join(q.root,'tooling/qa/browser-audit-server.cjs')],{cwd:q.root,env:{...process.env,JAMANVAAR_QA_RECEIPTS:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});api.stdout.pipe(log);api.stderr.pipe(log);await ready();
  require('@prisma/client');process.env.DATABASE_URL=q.state.databaseUrl;
  const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));prisma=new PrismaService();await prisma.$connect();
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){const headers={...req.headers,host:`localhost:${q.state.port}`};delete headers.origin;const proxy=http.request({hostname:'localhost',port:q.state.port,path:req.url,method:req.method,headers},up=>{res.writeHead(up.statusCode,{...up.headers,'access-control-allow-origin':origin});up.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;}
    const root=q.path.join(q.root,'apps/kiosk-system/kiosk-user/dist');let file=q.path.resolve(root,url.pathname.replace(/^\/kiosk\//,'')||'index.html');
    if(!file.startsWith(root+q.path.sep)){res.writeHead(403);res.end();return;}
    if(!q.fs.existsSync(file)||q.fs.statSync(file).isDirectory())file=q.path.join(root,'index.html');
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.wasm':'application/wasm'})[q.path.extname(file)]||'application/octet-stream'});q.fs.createReadStream(file).pipe(res);
  });await new Promise(r=>server.listen(port,'localhost',r));
  const challenge=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});
  const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')))[q.state.platformEmail];
  const platform=(await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:challenge.otpToken,otp:mail.otp})).accessToken;
  const stamp=Date.now(),rest=await q.mustApi('POST','/api/v1/restaurants',{name:'QA Touch Receipt',ownerName:'QA Owner',ownerEmail:`receipt-${stamp}@example.invalid`,ownerPassword:q.state.ownerPassword,skipInviteEmail:true},platform);rid=rest.restaurant.id;
  const plan=await q.mustApi('POST','/api/v1/plans',{name:`QA Touch ${stamp}`,productFamily:'KIOSK',tier:'PRO',priceMonthly:100000,maxBranches:1,maxDevices:5,maxUsers:5,entitlements:{}},platform);planId=plan.id;
  await q.mustApi('POST','/api/v1/subscriptions',{restaurantId:rid,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications:['KIOSK','KIOSK_ADMIN']},platform);
  const branch=await prisma.runAsTenant(rid,tx=>tx.branch.findFirstOrThrow({where:{restaurantId:rid}}));
  async function activate(type){const k=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:rid,branchId:branch.id,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()},platform);return q.mustApi('POST','/api/v1/activation/redeem',{code:k.code,deviceType:type},'');}
  // Activate the merged owner console through its real owner/key flow; the
  // legacy direct redeem route intentionally requires matching device types.
  const adminKey=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:rid,branchId:branch.id,allowedDeviceType:'KIOSK_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()},platform);
  const login=await q.mustApi('POST','/api/v1/tenant-auth/login-owner',{restaurantId:rid,password:q.state.ownerPassword,deviceType:'POS_ADMIN'},'');
  const admin=await q.mustApi('POST','/api/v1/tenant-auth/activate-device',{activationSessionToken:login.activationSessionToken,activationKey:adminKey.code,deviceType:'POS_ADMIN'},'');
  const kiosk=await activate('KIOSK');
  for(const[type,id,payload]of [['MENU_CATEGORY','tea-category',{name:'Beverages',isActive:true,sortOrder:1}],['MENU_ITEM','receipt-tea',{name:'Receipt Tea',categoryId:'tea-category',price:120,isAvailable:true,dietaryType:'VEG',modifierGroupIds:[],imageUrl:'/assets/menu/beverages/cold-coffee.jpg'}]]){
    const r=await q.mustApi('POST',`/api/v1/entity-sync/${type}`,{events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]},admin.deviceToken);expect(r.results[0].status).toBe('ok');
  }
  await q.mustApi('POST','/api/v1/menu/publish',{},admin.deviceToken);
  for(const type of ['MENU_CATEGORY','MENU_ITEM']){const catalog=await q.mustApi('GET',`/api/v1/entity-sync/${type}`,undefined,kiosk.deviceToken);console.log(type+' cloud catalog '+JSON.stringify(catalog.entities?.map(e=>e.payload)));}
  browser=await chromium.launch({headless:true,args:['--disable-gpu']});const ctx=await browser.newContext({viewport:{width:1366,height:900},hasTouch:true});
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/v1/receipts/whatsapp'){
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type,authorization'}});
      whatsappCalls++;const body=route.request().postDataJSON();expect(body.phone).toBe('9876543210');
      return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(whatsappMode==='success'?{success:true}:{success:false,errorMessage:'QA provider unavailable'})});
    }
    if(u.pathname==='/api/v1/receipts/email'){
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type,authorization'}});
      emailCalls++;const response=await route.fetch({url:origin+u.pathname});if(emailDelay)await new Promise(r=>setTimeout(r,emailDelay));return route.fulfill({response});
    }
    if(u.pathname.startsWith('/api/v1/'))return route.continue({url:origin+u.pathname+u.search});
    if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();return route.continue();
  });
  await ctx.addInitScript(({rid,kiosk})=>{localStorage.setItem('jamanvaar_kiosk_user_restaurant_id',rid);localStorage.setItem('jamanvaar_kiosk_user_device_id',kiosk.device.id);localStorage.setItem('jamanvaar_kiosk_user_device_token',kiosk.deviceToken);},{rid,kiosk});
  page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))network.push({path:u.pathname,status:r.status()});});page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('Browser '+m.type()+': '+m.text().replace(/Bearer\s+\S+/g,'Bearer [redacted]'));});await page.goto(origin+'/kiosk/');
  const tap=async(name)=>{const button=page.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();await button.tap();};
  const type=async(text)=>{for(const c of text)await tap('Type '+c);};
  await check('A customer completes actual kiosk cash checkout using touch',async()=>{
    await expect(page.getByRole('button',{name:'Start Order',exact:true})).toBeVisible({timeout:60000});await tap('Start Order');await page.getByRole('button',{name:/English/}).tap();await page.getByRole('button',{name:/Takeaway/i}).tap();await tap('Add Receipt Tea to cart');await tap('Proceed to Payment');await page.getByRole('button',{name:/Cash at Counter/i}).tap();await tap('Confirm & Get Token');await expect(page.getByRole('button',{name:'Email Bill',exact:true})).toBeVisible();await tap('Email Bill');
  });
  await check('Email address is entered only through the themed touch keyboard; modal survives the old return deadline',async()=>{
    const field=page.getByLabel('Email Address');await expect(field).toHaveAttribute('inputmode','none');await type('qa.receipt+7@example.invalid');await expect(field).toHaveValue('qa.receipt+7@example.invalid');await tap('Backspace');await tap('Type d');await expect(field).toHaveValue('qa.receipt+7@example.invalid');
    await page.waitForTimeout(17000);await expect(page.getByRole('dialog',{name:'Email Your Bill'})).toBeVisible();await page.screenshot({path:q.path.join(q.reportDir,'evidence/email-touch-keyboard.png')});return {physicalKeyboardUsed:false,heldBeyond15Seconds:true};
  });
  await check('A real PDF email request stays open while sending and shows persistent success before customer acknowledgement',async()=>{
    emailDelay=6000;await tap('Email My Bill');await expect(page.getByRole('button',{name:'Sending your bill…',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible({timeout:30000});expect(emailCalls).toBe(1);
    const captured=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json'))),attachment=captured['qa.receipt+7@example.invalid']?.attachments?.[0];expect(attachment?.pdfHeader).toBe('%PDF-');expect(attachment.bytes).toBeGreaterThan(500);await page.waitForTimeout(17000);await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();await page.screenshot({path:q.path.join(q.reportDir,'evidence/email-success.png')});await tap('Back to receipt');return {realApi:true,pdfEmailCaptured:true,pdfBytes:attachment.bytes,externalEmailSent:false,persistentSuccess:true};
  });
  await check('WhatsApp uses a numeric touch keypad; failure stays editable and explicit retry succeeds',async()=>{
    await tap('WhatsApp Bill');await expect(page.getByLabel('WhatsApp Number')).toHaveValue('');await type('9876543210');await expect(page.getByLabel('WhatsApp Number')).toHaveValue('9876543210');await page.screenshot({path:q.path.join(q.reportDir,'evidence/whatsapp-keypad.png')});await tap('Send WhatsApp Bill');await expect(page.getByRole('alert')).toContainText('QA provider unavailable');await expect(page.getByLabel('WhatsApp Number')).toHaveValue('9876543210');whatsappMode='success';await tap('Send WhatsApp Bill');await expect(page.getByRole('heading',{name:'WhatsApp bill sent'})).toBeVisible();expect(whatsappCalls).toBe(2);await tap('Back to receipt');return {providerSimulated:true,phonePreservedOnFailure:true,explicitRetry:true};
  });
  await check('Closing and reopening clears the previous recipient, and the keyboard fits portrait, tablet and landscape screens',async()=>{
    await tap('Email Bill');await expect(page.getByLabel('Email Address')).toHaveValue('');
    for(const [width,height]of [[390,844],[768,1024],[1080,1920],[1366,768]]){
      await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Email My Bill',exact:true})).toBeInViewport();await type('a');await expect(page.getByLabel('Email Address')).toBeInViewport();await page.screenshot({path:q.path.join(q.reportDir,'evidence',`email-${width}x${height}.png`)});
    }
    await tap('Cancel');await tap('WhatsApp Bill');await expect(page.getByLabel('WhatsApp Number')).toHaveValue('');await tap('Cancel');return {recipientCleared:true,viewports:4};
  });
  await check('The kiosk still returns automatically for the next customer after an untouched confirmation window',async()=>{
    await expect(page.getByRole('button',{name:'Start Order',exact:true})).toBeVisible({timeout:30000});expect(errors).toEqual([]);return {autoReturnRetained:true,pageErrors:0};
  });
}
main().catch(async e=>{console.error(e.message);console.error(JSON.stringify(network));if(page){await page.screenshot({path:q.path.join(q.reportDir,'evidence/failure.png')}).catch(()=>undefined);console.error((await page.locator('body').innerText().catch(()=>'' )).slice(-1800));}process.exitCode=1;}).finally(async()=>{
  q.fs.writeFileSync(q.path.join(q.reportDir,'BROWSER_RESULTS.json'),JSON.stringify({environment:'isolated local QA; compiled kiosk; touch input',emailProvider:'captured, no external delivery',whatsappProvider:'simulated',results,pageErrors:errors,emailCalls,whatsappCalls},null,2));
  await browser?.close();if(server)await new Promise(r=>server.close(r));api?.kill();
  if(prisma){if(rid)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:rid}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.$disconnect();}
});
