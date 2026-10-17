const q=require('../qr-admin-audit-2026-10-14/qa.cjs'),{PrismaClient}=require('@prisma/client'),bcrypt=require('bcryptjs'),{chromium}=require('playwright/test');
const dir=q.path.join(__dirname,'evidence');const base=process.env.JAMANVAAR_QA_API_BASE||'http://localhost:4015';
const results=[];let browser,prisma,userId,token,page;
async function api(method,path,body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function visit(path){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(1000);}
async function main(){
  if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Isolated database required');
  prisma=new PrismaClient({datasources:{db:{url:q.state.databaseUrl}}});
  const email='feature-audit-readonly-'+Date.now()+'@example.invalid';
  const user=await prisma.platformUser.create({data:{email,fullName:'QA Read Only Feature Audit',role:'READ_ONLY',status:'ACTIVE',passwordHash:await bcrypt.hash(q.state.ownerPassword,4)}});userId=user.id;
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);
  await page.goto('http://localhost:5380/login');await page.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(email);await page.getByPlaceholder('Enter your password').fill(q.state.ownerPassword);await page.locator('button[type=submit]').click();await page.getByPlaceholder('123456').waitFor();const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));const response=page.waitForResponse(r=>r.url().endsWith('/platform-auth/verify-otp')&&r.ok());await page.getByPlaceholder('123456').fill(mail[email].otp);await page.locator('button[type=submit]').click();token=(await (await response).json()).accessToken;await page.waitForURL('http://localhost:5380/');await page.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
  const restaurants=(await api('GET','/api/v1/restaurants')).body;const details=(await api('GET','/api/v1/restaurants/'+restaurants[0].id)).body;
  const paths=['/applications','/backups','/payouts','/billing','/status-history','/sandboxes','/ai-assistant','/feature-catalog','/plans'];if(details.devices[0])paths.push('/devices/'+details.devices[0].id);
  for(const path of paths){await visit(path);const controls=await page.evaluate(()=>[...document.querySelectorAll('main button')].filter(b=>/Publish|Release|Trigger|Snapshot|Run EOD|Issue Invoice|Open Incident|Clone|Destroy|Add |Create|Remote Wipe|Dispatch Command|Save/.test(b.textContent)).map(b=>({label:b.textContent.trim().slice(0,90),enabled:!b.disabled})));results.push({role:'READ_ONLY',path,controls});console.log('ROLE_VIEW',path,JSON.stringify(controls));}
  results.push({role:'READ_ONLY',path:'/api/v1/applications/releases',attempt:'POST empty body, no release created',status:(await api('POST','/api/v1/applications/releases',{})).status});
  results.push({role:'READ_ONLY',path:'/api/v1/platform/backups/'+restaurants[0].id+'/trigger',attempt:'POST, expect authorization rejection',status:(await api('POST','/api/v1/platform/backups/'+restaurants[0].id+'/trigger',{})).status});
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/profile','/sync-monitor','/backups','/reports']){await visit(path);await page.screenshot({path:q.path.join(dir,'mobile-detail-'+path.slice(1)+'.png'),mask:[page.locator('.mono,code')]});}
}
main().catch(e=>{console.log('ROLE_AUDIT_ERROR',q.scrub(e.message).slice(0,600));process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(dir,'role-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));await browser?.close();if(userId)await prisma.platformUser.deleteMany({where:{id:userId,email:{startsWith:'feature-audit-readonly-'}}});await prisma?.$disconnect();});
