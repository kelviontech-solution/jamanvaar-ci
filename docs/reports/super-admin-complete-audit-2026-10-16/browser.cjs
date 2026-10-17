const q=require('../qr-admin-audit-2026-10-14/qa.cjs');
const {chromium}=require('playwright/test');
const dir=q.path.join(__dirname,'evidence');q.fs.mkdirSync(dir,{recursive:true});
const base=process.env.JAMANVAAR_QA_API_BASE||'http://localhost:4015';
const results=[],faults=[],errors=[];let browser,page,token;
async function api(path){const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Audit lookup failed '+r.status+' '+path);return r.json();}
async function go(path){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(1000);}
async function inspect(path,size){
  const requests=[];const response=r=>{if(r.url().includes('/api/v1/')&&r.status()>=400)requests.push({path:new URL(r.url()).pathname,status:r.status()});};
  page.on('response',response);
  try{await go(path);const ui=await page.evaluate(()=>({
    heading:[...document.querySelectorAll('h1')].map(n=>n.textContent).join(' | '),
    overflow:document.documentElement.scrollWidth>innerWidth+2,
    alerts:[...document.querySelectorAll('[role=alert],.page-error,.dashboard-error')].map(n=>n.textContent.slice(0,240)),
    unlabeledButtons:[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')&&!b.getAttribute('title')).length,
    buttonCount:document.querySelectorAll('button').length,
    crashed:/Something went wrong|Try reloading this page/i.test(document.body.innerText),
    outside:[...document.querySelectorAll('main button, main input, main select, main h1')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left < -2);}).slice(0,8).map(e=>({tag:e.tagName,label:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.textContent).slice(0,80)}))
  }));results.push({path,size,...ui,requests});console.log('VISIT',size,path,ui.heading||'(no h1)',ui.overflow?'OVERFLOW':'',requests.length?'API_ERRORS '+requests.length:'');
    if(ui.overflow||ui.crashed||requests.length){await page.screenshot({path:q.path.join(dir,size+'-'+path.split('?')[0].replace(/[^a-z0-9]/gi,'_')+'.png'),mask:[page.locator('.mono,.activation-code-display,code')]});}
  }catch(e){results.push({path,size,error:q.scrub(e.message).slice(0,600)});console.log('VISIT_FAILED',path,q.scrub(e.message).slice(0,150));}finally{page.off('response',response);}
}
async function fault(name,path,pattern,extract){
  await page.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA simulated service unavailable'})}));
  try{await go(path);const observation=await page.evaluate(extract);faults.push({name,path,observation});console.log('FAULT',name,JSON.stringify(observation));await page.screenshot({path:q.path.join(dir,'fault-'+name+'.png'),mask:[page.locator('.mono,.activation-code-display,code')]});}
  finally{await page.unroute(pattern);}
}
async function main(){
  if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Use isolated QA database only');
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(q.scrub(e.message).slice(0,400)));
  await page.goto('http://localhost:5380/login');await page.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(q.state.platformEmail);await page.getByPlaceholder('Enter your password').fill(q.state.platformPassword);await page.locator('button[type=submit]').click();await page.getByPlaceholder('123456').waitFor();const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));const loginResponse=page.waitForResponse(r=>r.url().endsWith('/platform-auth/verify-otp')&&r.ok());await page.getByPlaceholder('123456').fill(mail[q.state.platformEmail].otp);await page.locator('button[type=submit]').click();token=(await (await loginResponse).json()).accessToken;await page.waitForURL('http://localhost:5380/');await page.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
  const restaurants=await api('/api/v1/restaurants'),restaurant=restaurants.find(r=>r.status==='ACTIVE')||restaurants[0];
  const detail=restaurant?await api('/api/v1/restaurants/'+restaurant.id):null;
  const plans=await api('/api/v1/plans');
  const source=q.fs.readFileSync(q.path.join(q.root,'cloud/super-admin-web/src/app/App.tsx'),'utf8');
  const paths=[...source.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).filter(p=>!['/login','/activate','*','/dashboard'].includes(p)).map(p=>{
    if(!p.includes(':id'))return p;
    const id=p.startsWith('/restaurants')?restaurant?.id:p.startsWith('/owners')?detail?.users.find(u=>u.role==='OWNER')?.id:p.startsWith('/branches')?detail?.branches[0]?.id:p.startsWith('/plans')?plans[0]?.id:detail?.devices[0]?.id;
    return id?p.replace(':id',id):null;
  }).filter(Boolean);
  for(const size of ['desktop','mobile']){await page.setViewportSize(size==='desktop'?{width:1440,height:1000}:{width:390,height:844});for(const path of paths)await inspect(path,size);}
  await page.setViewportSize({width:1440,height:1000});
  await fault('incident-load','/status-history','**/api/v1/platform/telemetry/incidents',()=>({emptyState:document.body.innerText.includes('No incidents'),errorVisible:/QA simulated|Failed to load|unavailable/i.test(document.body.innerText)}));
  await fault('payment-attention','/platform-payments','**/api/v1/payments/attention',()=>({text:document.body.innerText.slice(-2200),errorVisible:/QA simulated|Failed to load.*attention|attention.*unavailable/i.test(document.body.innerText)}));
  await fault('payout-overview','/payouts','**/api/v1/payments/payouts/overview',()=>({errorVisible:/QA simulated|Failed to load.*overview|overview.*unavailable/i.test(document.body.innerText),text:document.body.innerText.slice(-1200)}));
  await fault('plan-picker','/plans','**/api/v1/plans',()=>({errorVisible:/QA simulated|Failed to load/i.test(document.body.innerText)}));
}
main().catch(e=>{console.log('AUDIT_ERROR',q.scrub(e.message).slice(0,700));process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(dir,'browser-results.json'),q.scrub(JSON.stringify({at:new Date().toISOString(),results,faults,pageErrors:errors},null,2)));await browser?.close();console.log('Audit visits',results.length,'fault paths',faults.length,'page errors',errors.length);});
