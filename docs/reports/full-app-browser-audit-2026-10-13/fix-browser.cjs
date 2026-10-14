const q = require('./qa.cjs');
const {admin} = require('./admin-stable.cjs');
const {login} = require('./terminal-login.cjs');
const {activate} = require('./walk-terminal.cjs');
async function check(p, name, run) { if (!await q.test(p, 'Fix regression: '+name, run)) process.exitCode = 1; }
async function fresh(p) { await p.evaluate(async()=>{for(const worker of await navigator.serviceWorker.getRegistrations())await worker.unregister();}); }
async function page(p,path) {
  await p.goto(path,{waitUntil:'domcontentloaded'});
  await p.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
  await p.getByLabel('Branch workspace',{exact:true}).first().waitFor();
  await p.waitForFunction(()=>[...document.querySelectorAll('select[aria-label="Branch workspace"]')].some(s=>s.options.length>1)&&!document.body.innerText.includes('Verifying your workspace')&&!document.body.innerText.includes('Loading your applications'));
}
async function main() {
  const p=await admin(); await fresh(p);
  await check(p,'real branch, measured kitchen and named controls',async()=>{
    await page(p,'http://localhost:5316/restaurant-admin/kitchen');
    await q.expect(p.locator('header').first()).not.toContainText('Ahmedabad Flagship Store');
    await q.expect(p.locator('main')).not.toContainText('14 Min');
    await q.expect(p.locator('main')).not.toContainText('Optimal kitchen pacing');
    const d=await q.snap(p,'fix-admin-kitchen'); q.expect(d.duplicateIds).toEqual([]);q.expect(d.unlabelledButtons).toBe(0);
    return {branchIdentity:true, noDemoTime:true, labelledControls:true};
  });
  await check(p,'compact mobile header',async()=>{
    await p.setViewportSize({width:390,height:844});
    const d=await q.snap(p,'fix-admin-phone');q.expect(d.overflow).toBe(false);
    const controls=await p.getByLabel('Switch application').boundingBox();q.expect(controls.x).toBeGreaterThanOrEqual(0);q.expect(controls.x+controls.width).toBeLessThanOrEqual(390);
    await p.setViewportSize({width:1440,height:960});return {fits390:true};
  });
  await check(p,'empty purchasing links to inventory and return',async()=>{
    await page(p,'http://localhost:5316/restaurant-admin/purchasing');
    await p.getByRole('link',{name:'Add stock items'}).click();
    await q.expect(p.getByRole('link',{name:'Return to receiving goods'})).toBeVisible({timeout:30000});
    await q.snap(p,'fix-purchasing-return');return {directAction:true};
  });
  await check(p,'screen-based kiosk wording editor',async()=>{
    await page(p,'http://localhost:5316/kiosk-admin/appearance');
    await p.getByLabel('Customer screen',{exact:true}).selectOption('Receipt');
    await q.expect(p.getByLabel('Show technical keys')).not.toBeChecked();
    await q.snap(p,'fix-kiosk-content');return {screenGrouping:true};
  });
  await q.close();
  const pos=await q.open('pos');await fresh(pos);await pos.reload();await login(pos,'pos','Cashier');
  await check(pos,'print queue keyboard accessibility',async()=>{
    await pos.getByRole('button',{name:/Print Queue/i}).first().click();
    await q.expect(pos.getByRole('dialog',{name:'Hardware print queue'})).toBeVisible({timeout:30000});
    await q.expect(pos.getByRole('button',{name:'Close print queue',exact:true})).toBeVisible({timeout:30000});
    await pos.keyboard.press('Escape');
    await q.expect(pos.getByRole('dialog',{name:'Hardware print queue'})).toHaveCount(0);
    return {escapeCloses:true};
  });
  await check(pos,'CRM explains empty customer directory',async()=>{
    const allPages = pos.getByRole('button',{name:'All pages',exact:true}); if(await allPages.isVisible().catch(()=>false))await allPages.click();
    await pos.getByRole('button',{name:/Customers CRM/}).first().click();
    await q.expect(pos.getByRole('button',{name:'Continue as guest'})).toBeVisible({timeout:30000});
    await q.snap(pos,'fix-pos-crm');return {guestAction:true};
  });
  await q.close();
  const kiosk=await q.open('kiosk');await fresh(kiosk);await kiosk.reload();await activate(kiosk,'kiosk');
  await check(kiosk,'All Menu resets category, diet and search',async()=>{
    await kiosk.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
    await kiosk.getByRole('button',{name:'Start Order',exact:true}).click();
    await kiosk.getByRole('button',{name:/English/}).first().click();
    await kiosk.getByRole('button',{name:/Takeaway/i}).first().click();
    await q.expect(kiosk.getByText('UI Audit Dish 001',{exact:true}).first()).toBeVisible({timeout:30000});
    await kiosk.getByRole('button',{name:/Pure Jain/}).click();await kiosk.getByRole('button',{name:'Combos & Deals',exact:true}).click();
    await kiosk.getByRole('button',{name:'All Menu',exact:true}).first().click();
    await q.expect(kiosk.getByText('UI Audit Dish 001',{exact:true}).first()).toBeVisible({timeout:30000});
    await q.snap(kiosk,'fix-kiosk-filter-reset');return {dishesRestored:true};
  });
  await q.close();
}
main().catch(async error=>{console.error(q.scrub(error.message));await q.close();process.exitCode=1;});
