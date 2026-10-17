const q=require('../qr-admin-audit-2026-10-14/qa.cjs'),{chromium}=require('playwright/test');
const dir=q.path.join(__dirname,'evidence'),results=[];let browser,page;
async function go(path){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(800);}
async function main(){
  if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Isolated QA database required');
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);
  await page.goto('http://localhost:5380/login');await page.getByPlaceholder('e.g. superadmin@jamanvaar.app').fill(q.state.platformEmail);await page.getByPlaceholder('Enter your password').fill(q.state.platformPassword);await page.locator('button[type=submit]').click();await page.getByPlaceholder('123456').waitFor();const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));await page.getByPlaceholder('123456').fill(mail[q.state.platformEmail].otp);await page.locator('button[type=submit]').click();await page.waitForURL('http://localhost:5380/');await page.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
  await go('/settings/platform');const input=page.locator('.settings-form input').first();await input.waitFor();const original=await input.inputValue();await input.fill('QA UNSAVED PRESENTATION CHANGE');
  await page.getByRole('button',{name:'Billing & Legal',exact:true}).click();
  const warning=await page.getByRole('dialog').count();await page.getByRole('button',{name:'General',exact:true}).click();
  results.push({name:'Unsaved platform branding survives tab change or prompts first',promptCount:warning,draftPreserved:(await page.locator('.settings-form input').first().inputValue())==='QA UNSAVED PRESENTATION CHANGE',revertedToStoredValue:(await page.locator('.settings-form input').first().inputValue())===original});
  await go('/applications');await page.getByRole('button',{name:'Publish Version',exact:true}).first().click();
  const selects=page.locator('.modal-form select');
  let channel;for(let i=0;i<await selects.count();i++){if((await selects.nth(i).locator('option').allTextContents()).some(t=>t.includes('BETA'))){channel=selects.nth(i);break;}}
  if(!channel)throw Error('Cannot find release channel control');await channel.selectOption('BETA');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Publish Version',exact:true}).nth(1).click();
  results.push({name:'A new app release resets the previously selected channel',channel:await page.locator('.modal-form select').evaluateAll(nodes=>nodes.find(n=>[...n.options].some(o=>o.value==='BETA'))?.value)});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.route('**/api/v1/platform/settings',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA simulated settings load failure'})}));await go('/settings/platform');
  results.push({name:'Settings load failure prevents saving fallback values',errorVisible:await page.getByRole('alert').count(),enabledSaveButtons:await page.getByRole('button').evaluateAll(nodes=>nodes.filter(n=>/Save/.test(n.textContent)&&!n.disabled).map(n=>n.textContent.trim()))});await page.unroute('**/api/v1/platform/settings');
  await go('/reports');
  const reportQueries=[];const track=request=>{if(request.url().includes('/api/v1/platform/reports/'))reportQueries.push(new URL(request.url()).pathname+new URL(request.url()).search);};
  page.on('request',track);await page.locator('.date-range-select').selectOption('7d');await page.waitForTimeout(600);await page.locator('.date-range-select').selectOption('all');await page.waitForTimeout(600);page.off('request',track);
  results.push({name:'Report date range is sent to API when changed',requests:reportQueries,anyDateFilterSent:reportQueries.some(url=>url.includes('?'))});
  console.log(JSON.stringify(results,null,2));
}
main().catch(e=>{console.log('TARGETED_AUDIT_ERROR',q.scrub(e.message).slice(0,500));process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(dir,'targeted-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));await browser?.close();});
