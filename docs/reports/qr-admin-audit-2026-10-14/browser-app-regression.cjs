const q=require('./qa.cjs'),old=require('../full-app-browser-audit-2026-10-13/qa.cjs');
const {login}=require('../full-app-browser-audit-2026-10-13/terminal-login.cjs');
const {dismiss}=require('../full-app-browser-audit-2026-10-13/walk-terminal.cjs');
const results=[];
async function check(p,name,fn){const passed=await q.test(p,name,fn);results.push({app:p._audit.app,name,passed});}
async function layout(p,name){await p.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden',timeout:15000}).catch(()=>{});const d=await q.snap(p,'all-apps-'+p._audit.app+'-'+name);q.expect(d.overflow).toBe(false);q.expect(d.duplicateIds).toEqual([]);}
async function terminal(app,role){const p=await old.open(app);p._audit.app=app;await login(p,app,role);await dismiss(p);return p;}
async function visit(p,name,locator){await check(p,name,async()=>{await locator.click();await p.waitForTimeout(500);await layout(p,name);await p.setViewportSize({width:390,height:844});await layout(p,name+'-phone');await p.setViewportSize({width:1440,height:960});});}
async function main(){
 const pos=await terminal('pos','Cashier');await check(pos,'POS authenticates issued staff and opens menu',async()=>{await q.expect(pos.getByRole('button',{name:'UNLOCK TERMINAL',exact:true})).toHaveCount(0);await layout(pos,'entry');});
 const back=pos.getByTitle('Back to the main menu',{exact:true});if(await back.count())await back.click();const more=pos.getByRole('button',{name:'More tools',exact:true});if(await more.count())await more.click();
 for(const name of ['Floor & Tables','Live Orders','Bills & Invoices','Kitchen & KOT','Customers CRM','Shift & Cash','Day History','POS Reports','Inventory & Stock','Settings']){const b=pos.getByRole('button',{name:new RegExp('^'+name)}).first();await visit(pos,name,b);}
 const captain=await terminal('captain','Captain');for(let n=0;n<8;n++){const ack=captain.getByRole('button',{name:/Acknowledge.*On My Way|Accept.*On My Way/i});if(!await ack.isVisible().catch(()=>false))break;await ack.click();}
 await check(captain,'Captain opens branch tables',()=>layout(captain,'tables'));
 for(const name of ['Active Orders','Food Ready','Messages'])await visit(captain,name,captain.getByRole('button',{name:new RegExp(name,'i')}).filter({visible:true}).first());
 for(const name of ['Live KOT Tickets','Guest Service Requests','Shift & Performance']){const more=captain.getByRole('button',{name:/More/i}).filter({visible:true}).first();await more.click();await visit(captain,name,captain.getByRole('button',{name:new RegExp(name,'i')}).first());}
 const kds=await terminal('kds','Kitchen');await check(kds,'KDS opens the assigned kitchen scope',()=>layout(kds,'entry'));
 for(const name of ['Cooking','Ready','Served','Expo','Active'])await visit(kds,name,kds.getByRole('tab',{name:new RegExp('^'+name,'i')}).first());
 const kiosk=await old.open('kiosk');kiosk._audit.app='kiosk';await check(kiosk,'Kiosk welcome and touch ordering remain usable',async()=>{await layout(kiosk,'welcome');await kiosk.getByRole('button',{name:'Start Order',exact:true}).click();await kiosk.getByRole('button',{name:/English/}).click();await kiosk.getByRole('button',{name:/Takeaway/i}).click();await layout(kiosk,'menu');const add=kiosk.getByRole('button',{name:/^Add .* to cart$/}).first();await add.waitFor();await add.click();const customize=kiosk.getByRole('button',{name:/Add to cart/i}).filter({visible:true}).last();if(await customize.count())await customize.click();await kiosk.getByRole('button',{name:/Cart/}).first().click();await layout(kiosk,'cart');await kiosk.getByRole('button',{name:'Proceed to Payment',exact:true}).click();await layout(kiosk,'payment');});
 await old.close();q.fs.writeFileSync(q.path.join(q.reportDir,'evidence','all-app-browser-regression.json'),JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,tests:results},null,2));console.log('App regression',results.filter(r=>r.passed).length+'/'+results.length);if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(async e=>{console.error(q.scrub(e.stack));await old.close();q.fs.writeFileSync(q.path.join(q.reportDir,'evidence','all-app-browser-regression.json'),JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,tests:results},null,2));process.exitCode=1;});
