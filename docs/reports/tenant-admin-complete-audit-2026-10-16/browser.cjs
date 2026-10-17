// Read-only page audit after creating disposable, isolated QA tenants. No production access.
const q = require('../qr-admin-audit-2026-10-14/qa.cjs');
const { chromium } = require('playwright/test');
const dir=q.path.join(__dirname,'evidence'); q.fs.mkdirSync(dir,{recursive:true});
const base=process.env.JAMANVAAR_QA_API_BASE||'http://localhost:4016';
let token,browser; const ids=[],matrix=[],failures=[],errors=[],http=[];
const probes=[];
async function api(method,path,data,t=token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});const b=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+q.scrub(JSON.stringify(b)).slice(0,350));return b;}
async function fixture(kind,index){
 const stamp=Date.now()+index;const f=await api('POST','/api/v1/restaurants',{name:kind==='kiosk'?'Kiosk-only Flow QA':'Garden House Flow QA',mobile:'9'+String(stamp).slice(-9),ownerName:'QA Owner',ownerEmail:'tenant-admin-audit-'+stamp+'@example.invalid',ownerPassword:q.state.ownerPassword,skipInviteEmail:true});ids.push(f.restaurant.id);
 const keys=['offlineBilling','dineInTakeawayDeliveryToken','menuManagement','foodCustomization','discountsAndGst','multiPaymentTenders','tableManagement','customerManagement','kotKdsRouting','receiptPrinting','shiftAndCashDrawer','salesAndGstReports','inventoryManagement','posAssistant','qrTableOrdering'];
 const catalog=await api('GET','/api/v1/features');
 const entitlements=Object.fromEntries(keys.map(k=>[k,true]));for(const feature of catalog)if(feature.code.startsWith('QR_')&&feature.legacyEntitlementKey)entitlements[feature.legacyEntitlementKey]=true;
 Object.assign(entitlements,{posTerminal:kind==='restaurant',restaurantAdmin:kind==='restaurant',selfOrderKiosk:kind!=='qr',captainApp:kind==='restaurant'});
 const plan=await api('POST','/api/v1/plans',{name:'QA Admin Flow Tenant Audit '+kind+' '+stamp,productFamily:kind==='kiosk'?'KIOSK':'RESTAURANT',tier:'PRO',priceMonthly:1000,maxBranches:3,maxDevices:10,maxUsers:10,entitlements});
 const applications=kind==='restaurant'?['POS','POS_ADMIN','KIOSK','KIOSK_ADMIN','QR_ORDERING','CAPTAIN','KDS']:kind==='kiosk'?['KIOSK','KIOSK_ADMIN','QR_ORDERING']:['QR_ORDERING'];
 await api('POST','/api/v1/subscriptions',{restaurantId:f.restaurant.id,planId:plan.id,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString(),applications});
 const activation=await api('POST','/api/v1/activation-keys',{restaurantId:f.restaurant.id,branchId:f.branch.id,allowedDeviceType:kind==='kiosk'?'KIOSK_ADMIN':'POS_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
 return {...f,code:activation.code};
}
async function login(kind,f){const context=await browser.newContext({viewport:{width:1440,height:1000}});const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push({app:kind,message:q.scrub(e.message)}));p.on('response',r=>{if(r.status()>=400)http.push({app:kind,path:new URL(r.url()).pathname,status:r.status()});});
 await p.goto('http://localhost:5316/pos-admin/');await p.getByPlaceholder('e.g. JM9876543210').fill(f.restaurant.restaurantCode);await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);await p.locator('summary').filter({hasText:'Connecting a new device?'}).click();await p.getByLabel('Admin activation key (optional)').fill(f.code);await p.getByRole('button',{name:'Sign In',exact:true}).click();await p.waitForURL(/(restaurant-admin|kiosk-admin|qr\/admin)/);await p.waitForTimeout(2500);
 const select=p.getByLabel(kind==='qr'?'QR Admin branch':'Branch workspace',{exact:true});await select.waitFor();if(await select.inputValue()!==f.branch.id){await select.selectOption(f.branch.id);await p.waitForTimeout(1800);}return {p,context};
}
async function capture(p,app,page,size){
 const key=[app,page,size].join('-');const data=await p.evaluate(()=>({url:location.pathname+location.search,text:document.body.innerText.slice(0,24000),headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent),overflow:document.documentElement.scrollWidth>innerWidth+2,viewport:{width:innerWidth,height:innerHeight},brokenImages:[...document.images].filter(e=>e.getBoundingClientRect().width&&e.complete&&!e.naturalWidth).map(e=>({alt:e.alt,src:e.getAttribute('src')})),buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim(),aria:e.getAttribute('aria-label'),title:e.title,disabled:e.disabled,width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)})),fields:[...document.querySelectorAll('main input,main select,main textarea')].map(e=>({tag:e.tagName,type:e.type,label:e.getAttribute('aria-label')||[...(e.labels||[])].map(l=>l.textContent.trim()).join(' '),placeholder:e.placeholder})),overflowElements:[...document.querySelectorAll('main *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+8).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80)}))}));
 data.unnamedButtons=data.buttons.filter(b=>!b.text&&!b.aria&&!b.title).length;data.smallTargets=data.buttons.filter(b=>!b.disabled&&(b.height<40||b.width<30)).length;
 q.fs.writeFileSync(q.path.join(dir,key+'.json'),q.scrub(JSON.stringify(data,null,2)));
 if(size==='desktop'||data.overflow||data.brokenImages.length)await p.screenshot({path:q.path.join(dir,key+'.png'),fullPage:false});
 matrix.push({app,page,size,headings:data.headings,overflow:data.overflow,brokenImages:data.brokenImages.length,unnamedButtons:data.unnamedButtons,smallTargets:data.smallTargets});return data;
}
async function go(p,path){await p.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await p.waitForTimeout(450);}
async function scan(p,app,routes){for(const [page,path] of routes){console.log('PAGE',app,page);try{await go(p,path);for(const [size,width,height] of [['desktop',1440,1000],['phone',390,844]]){await p.setViewportSize({width,height});await p.waitForTimeout(100);await capture(p,app,page,size);}await p.setViewportSize({width:1440,height:1000});}catch(e){failures.push({app,page,error:q.scrub(e.message)});}}}
async function probe(p,app,name,path,pattern){await p.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA controlled outage'})}));await go(p,path);await p.waitForTimeout(700);await capture(p,app,'failure-'+name,'desktop');await p.unroute(pattern);}
async function restoreProbe(p,app){
 await p.getByRole('button',{name:'Upload & Restore',exact:true}).click();
 const picker=p.locator('input[type=file]').last();
 await picker.setInputFiles({name:'not-a-backup.json',mimeType:'application/json',buffer:Buffer.from('{"unrelated":"This is not a JAMANVAAR backup"}')});
 const apply=p.getByRole('button',{name:'Apply & Restore Snapshot',exact:true});
 await p.waitForTimeout(150);
 probes.push({app,test:'Unrelated JSON object accepted as validated backup',applyEnabled:await apply.isEnabled(),validatedLabel:await p.getByText('Snapshot Contents Validated:',{exact:true}).isVisible()});
 await p.screenshot({path:q.path.join(dir,app+'-restore-unrelated-json.png')});
 await picker.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await p.waitForTimeout(150);
 probes.push({app,test:'Invalid replacement file leaves previous parsed backup actionable',applyEnabled:await apply.isEnabled(),errorShown:await p.getByText(/Failed to parse JSON file/).isVisible()});
 await p.getByRole('button',{name:'Cancel',exact:true}).last().click();
 await p.getByRole('button',{name:'Upload & Restore',exact:true}).click();
 probes.push({app,test:'Closing and reopening restore retains previous selection',applyEnabled:await apply.isEnabled()});
 await p.getByRole('button',{name:'Cancel',exact:true}).last().click();
}
async function main(){if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Isolated QA database required');const l=await api('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword},null),mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));token=(await api('POST','/api/v1/platform-auth/verify-otp',{otpToken:l.otpToken,otp:mail[q.state.platformEmail].otp},null)).accessToken;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const source=q.fs.readFileSync(q.path.join(q.root,'apps/restaurant-system/pos-admin/src/adminProducts.ts'),'utf8');
 for(const [index,kind] of ['restaurant','kiosk','qr'].entries()){
  const f=await fixture(kind,index),{p,context}=await login(kind,f);
  if(kind!=='qr'){
   const block=source.split('export const PRODUCT_PAGES')[1].split(kind==='restaurant'?'POS_ADMIN: {':'KIOSK_ADMIN: {')[1]?.split('}')[0];if(!block)throw Error('Cannot parse product route map');const slugs=[...block.matchAll(/\w+:\s*'([^']+)'/g)].map(m=>m[1]);
   await scan(p,kind,slugs.map(s=>[s,'/'+(kind==='restaurant'?'restaurant-admin':'kiosk-admin')+'/'+s]));
   await go(p,'/'+(kind==='restaurant'?'restaurant-admin':'kiosk-admin')+'/dashboard');
   await probe(p,kind,'backup','/'+(kind==='restaurant'?'restaurant-admin':'kiosk-admin')+'/backup','**/api/v1/tenant/me/backups');
   await restoreProbe(p,kind);
  }
  if(kind==='qr'){
   const nav=q.fs.readFileSync(q.path.join(q.root,'apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation.ts'),'utf8');const tabs=[...nav.matchAll(/id:\s*["']([A-Z_]+)["']/g)].map(m=>m[1]);
   await scan(p,kind,tabs.map(t=>[t,'/qr/admin/?tab='+t]));
   await scan(p,kind,['Settings','Translations','Promotions','Feedback','Alerts','Collections','License'].map(t=>['advanced-'+t,'/qr/admin/?tab=ADVANCED&feature='+t]));
   await probe(p,kind,'crm','/qr/admin/?tab=CRM','**/api/v1/restaurant/qr/crm?*');
   await probe(p,kind,'analytics','/qr/admin/?tab=ANALYTICS','**/api/v1/restaurant/qr/analytics*');
  }
  await context.close();
 }
}
async function bootstrap(){if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Isolated QA database required');const l=await api('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword},null),mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));token=(await api('POST','/api/v1/platform-auth/verify-otp',{otpToken:l.otpToken,otp:mail[q.state.platformEmail].otp},null)).accessToken;browser=await chromium.launch({channel:'chrome',headless:true});}
async function cleanup(){await browser?.close();if(ids.length)await require('../admin-flow-implementation-2026-10-16/cleanup.cjs')(ids);}
if(require.main===module)main().catch(e=>{failures.push({fatal:q.scrub(e.message)});console.error('AUDIT_ERROR',q.scrub(e.message));process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(dir,'SUMMARY.json'),q.scrub(JSON.stringify({at:new Date().toISOString(),matrix,probes,failures,pageErrors:errors,http},null,2)));await cleanup();console.log('AUDIT_COMPLETE',matrix.length,'states',failures.length,'failures');});
module.exports={bootstrap,cleanup,api,fixture,login,go,capture,q,dir};
