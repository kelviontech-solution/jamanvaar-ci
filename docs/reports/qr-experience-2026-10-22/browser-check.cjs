const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..'),report='/docs/reports/qr-experience-2026-10-22';
(async()=>{
 const{createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
 const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts'));
 const tw=(await import(pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
 tw.content=[path.join(root,'apps/restaurant-system/pos-admin/src/**/*.{ts,tsx}'),path.join(root,'packages/ui/src/**/*.{ts,tsx}'),path.join(root,'cloud/super-admin-web/src/**/*.{ts,tsx}')];
 const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
 const server=await createServer({root,configFile:false,optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react-router-dom','qrcode','lucide-react']},cacheDir:path.join(root,'.jamanvaar/qr-experience-vite'),publicDir:path.join(root,'apps/restaurant-system/pos-admin/public'),resolve:config.config.resolve,plugins:[react(),{name:'isolated-qr-experience',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/pos-admin/src/cloud/cloudClient.ts'))return fs.readFileSync(path.join(__dirname,'mock-cloud.js'),'utf8');}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},server:{host:'127.0.0.1',port:5556,strictPort:true,watch:null,fs:{allow:[root]}}});
 await server.listen();console.log('Fixture server ready');
 const{chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 const url='http://127.0.0.1:5556'+report+'/fixture.html';
 try{
  for(const width of (process.argv.includes('--guests-only')||process.argv.includes('--scope-only')?[]:[390,1440])){
   const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
   const overflow=async()=>{const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>e.className)}));assert.equal(data.overflow,false,JSON.stringify(data));};
   const nav=async name=>{if(width<640)await page.getByRole('button',{name:'Browse workspace',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();};
   console.log('Publication',width);await page.goto(url+'?tab=RESTAURANT_PAGE&setupBranch=branch-a');
   const bar=page.getByRole('region',{name:'Website publishing'});await bar.getByRole('button',{name:'Publish website',exact:true}).waitFor();
   assert.equal(await page.getByLabel('Editing scope',{exact:true}).inputValue(),'branch-a');
   await bar.getByRole('button',{name:'Publish website',exact:true}).click();
   let dialog=page.getByRole('dialog',{name:'Publish restaurant website',exact:true});await dialog.waitFor();
   assert.equal(await dialog.getByRole('button',{name:'Publish website now',exact:true}).isDisabled(),true);
   await dialog.getByLabel('I reviewed the design, contact links and affected scope.').check();
   await page.evaluate(()=>window.__experience.failPublish=true);await dialog.getByRole('button',{name:'Publish website now',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();
   assert.equal(await page.evaluate(()=>window.__experience.publishes),0);await page.evaluate(()=>window.__experience.failPublish=false);
   await dialog.getByRole('button',{name:'Publish website now',exact:true}).click();await bar.getByText('Your website is live',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__experience.publishes),1);assert.equal(await page.evaluate(()=>window.__experience.page.published.enabled),true);
   await overflow();await page.screenshot({path:path.join(__dirname,'website-editor-'+width+'.png'),fullPage:false});
   await nav('Restaurant Page QR');await page.getByRole('img',{name:'Restaurant Page QR poster preview'}).waitFor();await overflow();await page.screenshot({path:path.join(__dirname,'website-qr-'+width+'.png'),fullPage:false});
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download SVG',exact:true}).click();assert.match((await download).suggestedFilename(),/\.svg$/);
   results.push({screen:'website-publication',width,branchScope:true,offDraftEnabledByReviewedPublish:true,failedPublishNotSuccess:true,generatedQrDownloaded:true});
   // Every top-level QR page plus each guest engagement subpage uses the real workspace.
   const pages=['OVERVIEW','ORDERS','SERVICE','MENU','TABLES','DESIGN','BRAND','PAYMENTS','RULES','PICKUP','SETTINGS','CRM','ACCEPTANCE','RECONCILIATION','CALENDAR','RESERVATIONS','PRINTPACK','ANALYTICS','PERFORMANCE','RECEIPTS','ONBOARDING','OPERATIONS','SUPPORT'];
   for(const tab of pages){
    console.log('QR page',tab,width);await page.goto(url+'?tab='+tab);await page.locator('.qr-page-heading').waitFor();await page.waitForTimeout(500);
    const unexpected=await page.evaluate(()=>window.__experience.unexpected);if(unexpected.length)console.log('Unexpected',JSON.stringify(unexpected));
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await overflow();
    const alerts=await page.locator('[role="alert"]').allTextContents();assert.equal(alerts.some(s=>s.includes('Unexpected fixture')),false,alerts.join('\n'));
    if(['MENU','CRM','OVERVIEW','PAYMENTS'].includes(tab))await page.screenshot({path:path.join(__dirname,tab.toLowerCase()+'-'+width+'.png'),fullPage:false});
    results.push({screen:'qr-admin-'+tab,width,noRuntimeError:true,noUnexpectedRequests:true,horizontalOverflow:false});
   }
   for(const feature of ['Settings','Translations','Promotions','Feedback','Alerts','Collections','License']){
    console.log('Engagement',feature,width);await page.goto(url+'?tab=ADVANCED&feature='+feature);await page.getByRole('heading',{name:'Guest engagement',exact:true}).waitFor();await page.waitForTimeout(400);assert.deepEqual(await page.evaluate(()=>window.__experience.unexpected),[]);assert.deepEqual(errors,[]);await overflow();results.push({screen:'qr-engagement-'+feature,width,noRuntimeError:true,horizontalOverflow:false});
   }
   await page.goto(url+'?mode=plan');await page.getByRole('button',{name:'QR Engage · website & returning guests',exact:false}).click();
   const flags=await page.evaluate(()=>window.__experience.planFlags);assert.equal(flags.feature0,true);assert.equal(flags.feature1,true);assert.equal(flags.feature8,false);await overflow();await page.screenshot({path:path.join(__dirname,'super-admin-package-'+width+'.png'),fullPage:true});results.push({screen:'super-admin-plan',width,engagePresetSetsWebsiteLoyalty:true,noUnrelatedReservationGrant:true});
   await context.close();
  }
  if(results.length)fs.writeFileSync(path.join(__dirname,'browser-admin-results.json'),JSON.stringify(results,null,2));
  // Public guest app calls its real HTTP client; Playwright isolates responses.
  for(const width of (process.argv.includes('--scope-only')?[]:[360,390,1440]))for(const template of ['HERITAGE','CAFE','MODERN','INDIAN']){
   console.log('Guest',template,width);const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],unexpected=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/v1/public/qr/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname,body=request.postDataJSON(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const data=await page.evaluate(({p,body})=>{
     const f=window.__experience;
     if(p.endsWith('/session'))return{session:'browser-fixture-signed-proof'};
     if(p.endsWith('/sites/riverhouse-fixture'))return{content:{...f.page.draft,enabled:true},restaurantName:f.page.restaurantName,branchName:f.page.branchName,currency:'INR',menuReady:true,items:f.items,categories:f.categories,loyaltyEnabled:true,orderOnlineUrl:location.origin+'/q/fixture-table-token',reservationsEnabled:false};
     if(p.includes('/loyalty')){
      if(p.endsWith('/send-code')){f.sent=true;return{sent:true};}
      if(p.endsWith('/verify')){if(body.code!=='123456')return{error:'invalid'};f.verified=true;}
      if(p.endsWith('/profile'))f.profile=body;
      if(p.endsWith('/sign-out')){f.verified=false;f.profile=null;return{signedOut:true};}
      return{verified:f.verified,verificationAvailable:true,phoneMasked:'******9999',points:f.points,profile:f.verified?f.profile:null,program:{enabled:true,earnPoints:10,perRupeesSpent:100},rewards:[{id:'reward-1',name:'A little thank-you',description:'Use your earned points on your next meal.',pointsCost:150,discountAmount:50,eligible:f.verified}],message:''};
     }
     if(p.endsWith('/fixture-table-token/menu'))return{menuVersion:1,etag:'fixture',categories:f.categories,items:f.items,modifierGroups:[]};
     if(p.endsWith('/fixture-table-token'))return{restaurant:{name:f.page.restaurantName},branch:{name:'Main Dining'},table:{displayNumber:'1'},mode:'TABLE_ORDER',currency:'INR',restaurantPage:{content:{...f.page.draft,enabled:true},publishedAt:new Date().toISOString()},advanced:{loyaltyEnabled:true,promotionsEnabled:false,feedbackEnabled:false,historyEnabled:false,groupEnabled:false,languages:['en'],defaultLanguage:'en',recommendationIds:[],workload:{estimateMinutes:20,atCapacity:false}},ordering:{enabled:true,menuReady:true,menuVersion:1,settings:{allowCash:true,allowOnlinePayment:false,allowModifiers:true,allowCustomerNotes:true,showOrderStatus:true,requireCustomerName:false,requireCustomerPhone:false}}};
     if(p.endsWith('/operations'))return{serviceEnabled:false,requestTypes:[],pickupEnabled:false,asapEnabled:true,pickupInstructions:''};
     if(p.endsWith('/events')||p.endsWith('/engagement'))return{ok:true};
     return null;
    },{p,body});
    if(data===null)unexpected.push(p);await route.fulfill({status:data===null?404:200,headers,contentType:'application/json',body:JSON.stringify(data||{message:'Unexpected fixture route'})});
   });
   await page.goto(url+'?mode=guest&template='+template);await page.locator('.rp-nav-order').waitFor();
   assert.equal(await page.locator('.rp-nav-links a[href="#rp-menu"]').count(),0);assert.match(await page.locator('.rp-nav-order').getAttribute('href'),/fixture-table-token#menu$/);
   assert.equal(await page.locator('.rp-quick-links a[href="https://g.page/r/riverhouse/review"]').count(),1);assert.equal(await page.locator('.rp-quick-links a[href="https://instagram.com/riverhouse"]').count(),1);
   if(template==='HERITAGE'){
    await page.getByRole('button',{name:'Customer login',exact:false}).first().click();let dialog=page.getByRole('dialog',{name:'Customer login',exact:true});await dialog.getByLabel('Mobile number',{exact:true}).fill('9999999999');await dialog.getByRole('button',{name:'Send login code'}).click();await dialog.getByLabel('Verification code',{exact:true}).fill('123456');await dialog.getByRole('button',{name:'Verify & sign in'}).click();dialog=page.getByRole('dialog',{name:'Your points & rewards',exact:true});await dialog.getByLabel('Your name',{exact:true}).fill('Browser Guest');await dialog.getByLabel('Email (optional)',{exact:true}).fill('guest@example.test');await dialog.getByLabel('Email me restaurant offers',{exact:true}).check();await dialog.getByRole('button',{name:'Save details',exact:true}).click();await dialog.getByText('Your details and preferences are saved with the restaurant.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__experience.profile.email),'guest@example.test');
    await dialog.getByRole('button',{name:'Reveal earned reward',exact:true}).click();await dialog.getByText('₹50 off',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__experience.points),200);await page.screenshot({path:path.join(__dirname,'customer-rewards-'+width+'.png'),fullPage:false});await dialog.getByRole('button',{name:'Sign out of customer account',exact:true}).click();await page.getByRole('dialog',{name:'Customer login',exact:true}).waitFor();await page.getByRole('button',{name:'Close customer account',exact:true}).click();
   }
   await page.locator('.rp-page img').evaluateAll(async nodes=>{await Promise.all(nodes.map(async n=>{n.loading='eager';try{await n.decode();}catch{}}));});
   assert.equal(await page.locator('.rp-page img').evaluateAll(nodes=>nodes.every(n=>n.complete&&n.naturalWidth>0)),true,'Website photos must load');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await page.screenshot({path:path.join(__dirname,'guest-'+template.toLowerCase()+'-'+width+'.png'),fullPage:true});results.push({screen:'guest-'+template,width,noMenuNav:true,orderOnlineUsesActualMenu:true,socialLinks:true,noRuntimeError:true,photosLoaded:true,horizontalOverflow:false,customerJourney:template==='HERITAGE'});
   if(template==='HERITAGE'){
    await page.goto(url+'?mode=order');await page.getByRole('button',{name:'My rewards',exact:true}).waitFor();await page.getByRole('button',{name:'About & contact',exact:true}).waitFor();await page.locator('.iname').filter({hasText:'Margherita Pizza'}).waitFor();const rects=await page.locator('.guest-header-links button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));assert.equal(rects[0].right<=rects[1].x||rects[0].bottom<=rects[1].y,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(unexpected,[]);await page.screenshot({path:path.join(__dirname,'ordering-menu-'+width+'.png'),fullPage:false});results.push({screen:'table-ordering-header',width,noOverlappingActions:true,actualMenuDisplayed:true});
   }
   await context.close();
  }
  if(process.argv.includes('--scope-only')){
   const page=await browser.newPage({viewport:{width:390,height:1000}});
   for(const [query,expected] of [['branchScope=all','restaurant'],['branchScope=all&setupBranch=branch-a','branch-a'],['setupBranch=restaurant','restaurant']]){
    await page.goto(url+'?tab=RESTAURANT_PAGE&'+query);await page.getByRole('region',{name:'Website publishing'}).waitFor();assert.equal(await page.getByLabel('Editing scope',{exact:true}).inputValue(),expected);results.push({screen:'website-initial-scope',query,scope:expected});
   }
   await page.close();
  }
  fs.writeFileSync(path.join(__dirname,process.argv.includes('--scope-only')?'browser-scope-results.json':'browser-results.json'),JSON.stringify(results,null,2));console.log('Passed browser scenarios:',results.length);
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
