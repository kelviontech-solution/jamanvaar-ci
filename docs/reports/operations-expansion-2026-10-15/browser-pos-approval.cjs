const q=require('../full-app-browser-audit-2026-10-13/qa.cjs'),{login}=require('../full-app-browser-audit-2026-10-13/terminal-login.cjs'),{dismiss}=require('../full-app-browser-audit-2026-10-13/walk-terminal.cjs');
const fs=require('fs'),path=require('path');let page;
async function main(){
 page=await q.open('pos');await login(page,'pos','Cashier');await dismiss(page);
 await page.getByRole('button',{name:/UI Cashier/}).filter({visible:true}).first().click();await page.getByRole('button',{name:'Logout Cashier Session',exact:true}).click();
 await page.getByRole('button',{name:/UI Cashier/}).first().click();const signed=page.waitForResponse(r=>r.url().endsWith('/api/v1/staff/sign-in')&&r.ok());for(const digit of q.state.staff.Cashier.pin)await page.getByRole('button',{name:digit,exact:true}).click();await signed;await dismiss(page);
 const back=page.getByTitle('Back to the main menu',{exact:true});if(await back.count())await back.click();
 const billing=page.getByRole('button',{name:/^Billing/}).first();if(await billing.isVisible().catch(()=>false))await billing.click();
 const take=page.getByRole('button',{name:'Takeaway',exact:true}).first();if(await take.isVisible().catch(()=>false))await take.click();
 await page.getByText('UI Audit Dish 001',{exact:true}).first().click();
 const add=page.getByRole('button',{name:/Add to Order/}).filter({visible:true}).last();if(await add.count())await add.click();
 const pay=page.getByRole('button',{name:/^PAY /}).filter({visible:true}).first();await pay.click();await page.getByRole('button',{name:'+ Apply Discount',exact:true}).click();await page.getByLabel('Discount value',{exact:true}).fill('30');await page.getByRole('button',{name:'Apply Discount',exact:true}).click();
 await page.getByRole('button',{name:'Request approval from manager device',exact:true}).click();await q.expect(page.getByRole('button',{name:'Waiting for remote manager…',exact:true})).toBeVisible();
 const a=q.state.adminActivation;const logged=await q.mustApi('POST','/api/v1/tenant-auth/login-owner',{restaurantId:q.state.restaurantA.id,password:q.state.ownerPassword,deviceType:'POS_ADMIN',deviceId:a.deviceId,deviceToken:a.deviceToken},null);const branch=q.state.posActivation.device.branchId;
 const root='/api/v1/tenant/operations/';const requests=await q.mustApi('GET',root+'approvals?branchId='+branch,undefined,logged.accessToken);const pending=requests.find(r=>r.status==='PENDING'&&r.action==='HIGH_DISCOUNT');q.expect(pending).toBeTruthy();
 await q.mustApi('POST',root+`approvals/${pending.id}/decision?branchId=${branch}`,{expectedVersion:pending.version,approved:true,reason:'QA remote approval through terminal UI'},logged.accessToken);
 await q.expect(page.getByRole('button',{name:'Waiting for remote manager…',exact:true})).toHaveCount(0,{timeout:15000});await q.expect(page.getByText(/Approved by/).filter({visible:true}).first()).toBeVisible();
 await page.screenshot({path:path.join(__dirname,'evidence','pos-remote-approved.png')});console.log('PASS POS touch discount request -> manager decision -> applied discount');
 fs.writeFileSync(path.join(__dirname,'evidence','pos-approval.json'),JSON.stringify({passed:true,scenario:'POS discount UI requests remote approval; owner authorizes exact waiting action; POS applies discount'},null,2));
}
main().catch(async e=>{console.error(q.scrub(e.stack));if(page){await page.screenshot({path:path.join(__dirname,'evidence','pos-approval-failure.png')});fs.writeFileSync(path.join(q.root,'.jamanvaar','pos-approval-screen.txt'),q.scrub(await page.locator('body').innerText()));}fs.writeFileSync(path.join(__dirname,'evidence','pos-approval.json'),JSON.stringify({passed:false,error:q.scrub(e.message)},null,2));process.exitCode=1;}).finally(()=>q.close());
