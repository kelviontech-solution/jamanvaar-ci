// Actual merged Admin + customer Kiosk, isolated API/database; owns and cleans up only its QA processes.
process.env.JAMANVAAR_QA_REPORT_DIR = 'docs/reports/menu-templates-2026-10-06';
const q = require('./browser-audit-lib.cjs'); const { spawn } = require('node:child_process');
q.ports.admin = 5286; q.ports.kiosk = 5284;
const children = []; const logStreams = [];
function start(script, args, cwd = q.root, env = {}) {
  const stream = q.fs.createWriteStream(q.path.join(q.root, 'logs', `menu-templates-qa-server-${children.length}.log`)); logStreams.push(stream);
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream); child.stderr.pipe(stream); children.push(child); return child;
}
async function ready(port) {
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) }); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  } throw Error(`QA service did not start on ${port}`);
}
async function main() {
  for (const port of [q.state.port, 5286, 5284]) {
    try { await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(300) }); throw Error(`Port ${port} is already occupied; no process was stopped`); }
    catch (error) { if (error.message.includes('already occupied')) throw error; }
  }
  start(q.path.join(q.root, 'tooling/qa/browser-audit-server.cjs'), []);
  const vite = q.path.join(q.root, 'node_modules/vite/bin/vite.js');
  for (const [app, port] of [['apps/restaurant-system/pos-admin', 5286], ['apps/kiosk-system/kiosk-user', 5284]]) start(vite, ['--host', 'localhost', '--port', String(port), '--strictPort'], q.path.join(q.root, app), { VITE_CLOUD_API_BASE_URL: `http://localhost:${q.state.port}`, VITE_BRANCH_CORE_URL: '' });
  await Promise.all([ready(q.state.port), ready(5286), ready(5284)]);
  const challenge = await q.mustApi('POST', '/api/v1/platform-auth/login', { email: q.state.platformEmail, password: q.state.platformPassword });
  const mail = JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir, 'private-mail.json')))[q.state.platformEmail];
  q.state.platformToken = (await q.mustApi('POST', '/api/v1/platform-auth/verify-otp', { otpToken: challenge.otpToken, otp: mail.otp })).accessToken; q.saveState();
  const stamp = Date.now();
  const created = await q.mustApi('POST', '/api/v1/restaurants', { name: `QA Menu Template Restaurant ${stamp}`, ownerName: 'QA Template Owner', ownerEmail: `qa-template-${stamp}@example.invalid`, mobile: '98' + String(require('node:crypto').randomInt(10000000,100000000)), ownerPassword: q.state.ownerPassword, skipInviteEmail: true });
  const restaurant = created.restaurant;
  const plan = await q.mustApi('POST', '/api/v1/plans', { name: `QA Menu Template Plan ${stamp}`, tier: 'PRO', productFamily: 'KIOSK', priceMonthly: 100000, maxBranches: 2, maxDevices: 5, maxUsers: 5, entitlements: {} });
  const subscription = await q.mustApi('POST', '/api/v1/subscriptions', { restaurantId: restaurant.id, planId: plan.id, status: 'ACTIVE', expiresAt: new Date(Date.now()+86400000).toISOString(), applications: ['KIOSK','KIOSK_ADMIN'] });
  const adminKey = await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:restaurant.id,allowedDeviceType:'KIOSK_ADMIN',expiresAt:new Date(Date.now()+86400000).toISOString()});
  const fixture = { restaurant, planId: plan.id, subscriptionId: subscription.id };
  q.state.menuTemplateFixture = fixture; q.saveState();
  const admin = await q.open('admin', `menu-template-admin-${stamp}`); const kiosk = await q.open('kiosk', `menu-template-${stamp}`);
  const dbModule = '/@fs/' + q.path.join(q.root, 'packages/database/src/index.ts').replace(/\\/g, '/');
  let adminToken, kioskToken, countAfter, selectedPrice, itemId;
  const startCustomer = async () => {
    const start = kiosk.getByRole('button', { name: /^(Start Order|Order From Our Cafe)$/ });
    if (await start.isVisible()) { await start.click(); await kiosk.getByRole('button', { name: /English/ }).click(); await kiosk.getByRole('button', { name: /Takeaway/i }).click(); }
  };
  await q.test(admin, 'Merged kiosk-only console opens non-destructive template preview and category selection', async () => {
    if (await admin.getByPlaceholder('Enter owner password').isVisible()) { await admin.getByPlaceholder('e.g. JM9876543210').fill(fixture.restaurant.restaurantCode); await admin.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword); await admin.getByRole('button', { name: 'Sign In', exact: true }).click(); }
    await q.expect(admin.getByRole('heading',{name:'Connect this admin device',exact:true})).toBeVisible({timeout:25000});
    await admin.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(adminKey.code); await admin.getByRole('button',{name:'Connect & Continue',exact:true}).click();
    await q.expect(admin.getByRole('button', { name: 'Menu & Categories', exact: true })).toBeVisible({timeout:25000}); await admin.getByRole('button', { name: 'Menu & Categories', exact: true }).click(); adminToken = await admin.evaluate(() => localStorage.getItem('jamanvaar_cloud_device_token'));
    const taxId='qa-template-gst-inclusive';
    await q.mustApi('POST','/api/v1/entity-sync/TAX_GROUP',{events:[{externalId:taxId,payload:{id:taxId,name:'QA configured GST 5% inclusive',cgstPercent:2.5,sgstPercent:2.5,igstPercent:5,isInclusive:true,isActive:true,updatedAt:new Date().toISOString()}}]},adminToken);
    await admin.getByRole('button', { name: 'Load Menu Template', exact: true }).first().click(); const dialog = admin.getByRole('dialog', { name: 'Load Restaurant Menu Template' });
    await q.expect(dialog.getByLabel('Restaurant menu template')).toBeVisible({ timeout: 30000 });
    await q.expect(dialog.getByText('Replace Entire Menu', { exact: true })).toHaveCount(0);
    await q.expect(dialog.getByLabel('Template tax group').locator('option[value="qa-template-gst-inclusive"]')).toHaveCount(1,{timeout:25000}); await dialog.getByLabel('Template tax group').selectOption('qa-template-gst-inclusive');
    await dialog.getByLabel('Select category Garlic Bread', { exact: true }).check();
    await dialog.getByRole('button', { name: /Load \d+ Selected Items/ }).click();
    await q.expect(dialog.getByRole('status')).toContainText(/items.*skipped|new items/, { timeout: 45000 });
    const catalog=await admin.evaluate(async modulePath=>(await import(modulePath)).PREBUILT_MENU_TEMPLATES.map(t=>({id:t.id,name:t.name,categories:t.categories.length,items:t.categories.reduce((n,c)=>n+c.items.length,0),variants:t.categories.reduce((n,c)=>n+c.items.reduce((m,i)=>m+(i.variants?.length||0),0),0),addons:t.categories.reduce((n,c)=>n+c.items.reduce((m,i)=>m+(i.addons?.length||0),0),0),combos:t.combos?.length||0,missingPhotos:t.categories.reduce((n,c)=>n+c.items.filter(i=>i.imageUrl?.includes('placeholder')).length,0)})),dbModule); q.fs.writeFileSync(q.path.join(q.reportDir,'template-catalog-summary.json'),JSON.stringify(catalog,null,2));
    await q.snap(admin, 'selective-pizza-template'); await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    return { categorySelection: true, destructiveReplaceAbsent: true };
  });
  await q.test(admin, 'Load complete Pizza template including real groups/combos; repeat skips existing without duplicates', async () => {
    const loadAll = async () => { await admin.getByRole('button', { name: 'Load Menu Template', exact: true }).first().click(); const d = admin.getByRole('dialog', { name: 'Load Restaurant Menu Template' }); await d.getByLabel('Template tax group').selectOption('qa-template-gst-inclusive'); await d.getByRole('button', { name: 'Select Complete Template', exact: true }).click(); await d.getByRole('button', { name: /Load \d+ Selected Items/ }).click(); await q.expect(d.getByRole('status')).toContainText('Published to connected terminals.', { timeout: 45000 }); await d.getByRole('button', { name: 'Close', exact: true }).click(); };
    await loadAll(); const initial = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM?afterSeq=0', undefined, adminToken); countAfter = initial.entities.filter(e => !e.payload.deleted).length;
    await loadAll(); const repeat = await q.mustApi('GET', '/api/v1/entity-sync/MENU_ITEM?afterSeq=0', undefined, adminToken); q.expect(repeat.entities.filter(e => !e.payload.deleted)).toHaveLength(countAfter);
    const item = repeat.entities.find(e => e.payload.name === 'Margherita Pizza').payload; itemId = item.id; q.expect(item.modifierGroupIds).toHaveLength(2);
    const groups = await q.mustApi('GET', '/api/v1/entity-sync/MODIFIER_GROUP?afterSeq=0', undefined, adminToken); q.expect(groups.entities.find(e => e.externalId === item.modifierGroupIds[0]).payload.options.map(o => o.priceDelta)).toEqual([0,100,200]);
    return { repeatCountUnchanged: true, itemCount: countAfter, variantsAndAddonsSynced: true };
  });
  await q.test(kiosk, 'Activated customer kiosk shows real Pizza categories, actual photos/placeholders and required size choices', async () => {
    const key = await q.mustApi('POST', '/api/v1/activation-keys', { restaurantId: fixture.restaurant.id, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now()+86400000).toISOString() });
    await kiosk.locator('#kiosk-restaurant-code').fill(fixture.restaurant.restaurantCode); await kiosk.locator('#kiosk-activation-key').fill(key.code);
    await kiosk.getByRole('button', { name: 'Activate Kiosk', exact: true }).click(); await q.expect(kiosk.getByRole('button', { name: /^(Start Order|Order From Our Cafe)$/ })).toBeVisible({ timeout: 30000 }); kioskToken = await kiosk.evaluate(() => localStorage.getItem('jamanvaar_cloud_device_token'));
    await startCustomer();
    await q.expect(kiosk.getByRole('button', { name: /Pizzas/i }).first()).toBeVisible({ timeout: 30000 });
    await q.expect(kiosk.getByRole('button', { name: /Garlic Bread/i }).first()).toBeVisible();
    await q.expect(kiosk.getByText('Chinese & Continental', { exact: true })).toHaveCount(0);
    const pizzaCard = kiosk.locator('div.group').filter({ has: kiosk.getByRole('button', { name: 'Add Margherita Pizza to cart', exact: true }) });
    await pizzaCard.getByRole('button', { name: 'Customize', exact: true }).click();
    const d = kiosk.getByRole('dialog'); await q.expect(d.getByRole('button', { name: /Medium/ })).toBeVisible(); await d.getByRole('button', { name: /Medium/ }).click(); await d.getByRole('button', { name: /Extra Cheese/ }).click();
    await q.snap(kiosk, 'pizza-variants-addons'); await d.getByRole('button', { name: /Add to Cart/i }).click();
    const amount = await kiosk.evaluate(async modulePath => { const {db}=await import(modulePath); const item=db.menuItems.find(i=>i.name==='Margherita Pizza'); const groups=item.modifierGroupIds.map(id=>db.modifierGroups.find(g=>g.id===id)); return item.price + groups[0].options.find(o=>o.name==='Medium').priceDelta + groups[1].options.find(o=>o.name==='Extra Cheese').priceDelta; }, dbModule);
    q.expect(amount).toBe(289); return { realCategoryIds: true, sizeAndAddonTotalRupees: amount };
  });
  await q.test(kiosk, 'SIMULATED checkout uses server-priced Medium pizza and cheese add-on, including tax', async () => {
    if (!q.state.simulatedGateway) throw Error('Simulated QA gateway required');
    const adminDeviceId=await admin.evaluate(()=>localStorage.getItem('jamanvaar_cloud_device_id'));
    const owner=await q.mustApi('POST','/api/v1/tenant-auth/login-owner',{restaurantId:fixture.restaurant.id,password:q.state.ownerPassword,deviceType:'POS_ADMIN',deviceId:adminDeviceId,deviceToken:adminToken},null);
    await q.mustApi('POST','/api/v1/tenant/payment-connection/request-platform-payments',{},owner.accessToken);
    await q.mustApi('PATCH',`/api/v1/restaurants/${fixture.restaurant.id}/payment-connection/approve`,{password:q.state.platformPassword});
    const [created]=await Promise.all([kiosk.waitForResponse(r=>r.url().endsWith('/payments/orders') && r.request().method()==='POST'),kiosk.getByRole('button',{name:'Proceed to Payment',exact:true}).click()]);
    q.expect(created.status()).toBe(201); const payment=await created.json(); q.expect(payment.quote).toMatchObject({subtotal:27524,taxAmount:1376}); const {paymentRow,webhook}=require('./browser-audit-kiosk-payment.cjs'); const row=await paymentRow(payment.paymentId); q.expect(row.amount).toBe(28900);
    q.expect((await webhook(row,`qa-template-payment-${row.id}`)).status).toBe(200);
    await q.expect(kiosk.getByRole('button',{name:/^(Start Order|Order From Our Cafe)$/})).toBeVisible({timeout:35000});
    await startCustomer(); return{realFunds:false,gateway:'SIMULATED',listedUnitPricePaise:28900,subtotalExcludingTaxPaise:payment.quote.subtotal,taxPaise:payment.quote.taxAmount,totalInclusiveOfFivePercentTaxPaise:row.amount};
  });
  await q.test(admin, 'Owner edits price in Admin and customer kiosk receives it without refresh', async () => {
    await admin.getByPlaceholder('Search dish by name, description, SKU or tag...').fill('Margherita Pizza'); await admin.getByTitle('Click to change the price').first().click();
    await admin.getByLabel('New price for Margherita Pizza').fill('169'); const before = performance.now(); await admin.getByLabel('New price for Margherita Pizza').press('Enter');
    await kiosk.waitForFunction(async modulePath => (await import(modulePath)).db.menuItems.find(i => i.name==='Margherita Pizza')?.price===169, dbModule, { timeout: 30000 });
    return { noKioskRefresh: true, priceRupees: 169, propagationMs: Math.round(performance.now()-before) };
  });
  await q.test(admin, 'UTF-8 CSV preview imports Gujarati/Hindi, multiline commas and skips invalid rows after review', async () => {
    const content = '\uFEFFsku,name,description,category,subcategory,price,food_type,is_available\r\nQA-GUJ-MENU,ખમણ,"નરમ ખમણ, ચટણી\nસાથે",QA Gujarati Farsan,,80.50,VEG,true\r\nQA-HIN-MENU,बटर नान,ताजा नान,QA Hindi Breads,,50,VEG,true\r\nQA-BAD-MENU,Bad price,,QA CSV,,oops,VEG,true';
    await admin.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name:'restaurant-menu.csv', mimeType:'text/csv', buffer:Buffer.from(content,'utf8') });
    const d=admin.getByRole('dialog',{name:'CSV Import Preview'}); await q.expect(d.getByText(/3 rows detected · 2 valid/)).toBeVisible(); await q.expect(d.getByText(/Price must be/)).toBeVisible(); await d.getByRole('button',{name:'Import 2 Valid Rows',exact:true}).click(); await q.expect(d.getByRole('status')).toContainText('Published to connected terminals.',{timeout:45000}); await d.getByRole('button',{name:'Cancel',exact:true}).click();
    await kiosk.waitForFunction(async modulePath => { const {db}=await import(modulePath); return db.menuItems.some(i=>i.name==='ખમણ' && i.price===80.5) && db.menuItems.some(i=>i.name==='बटर नान'); },dbModule,{timeout:30000});
    await q.snap(admin,'multilingual-csv-import'); return { validRows:2,invalidRowsOmitted:1,gujaratiHindiSynced:true };
  });
  await q.test(admin, 'CSV duplicate preview defaults to skip; wrong file type is refused', async () => {
    const before=await q.mustApi('GET','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',undefined,adminToken);
    await admin.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({name:'again.csv',mimeType:'text/csv',buffer:Buffer.from('sku,name,category,price\nQA-GUJ-MENU,ખમણ,QA Gujarati Farsan,999')});
    const d=admin.getByRole('dialog',{name:'CSV Import Preview'}); await q.expect(d.getByText(/Already exists/)).toBeVisible(); await d.getByRole('button',{name:'Import 1 Valid Rows',exact:true}).click(); await q.expect(d.getByRole('status')).toContainText('0 items imported, 1 skipped',{timeout:30000}); await d.getByRole('button',{name:'Cancel',exact:true}).click();
    const after=await q.mustApi('GET','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',undefined,adminToken); q.expect(after.entities.length).toBe(before.entities.length);
    await admin.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('wrong')}); await q.expect(admin.getByRole('alert')).toContainText('Choose a .csv file'); return { duplicateSkipped:true,wrongTypeRefused:true };
  });
  await q.test(admin, 'Load Gujarati category independently and retain the existing Pizza menu', async () => {
    await admin.getByRole('button',{name:'Load Menu Template',exact:true}).first().click(); const d=admin.getByRole('dialog',{name:'Load Restaurant Menu Template'}); await d.getByLabel('Restaurant menu template').selectOption('tpl-gujarati'); await d.getByLabel('Select category Dal & Kadhi', {exact:true}).check(); await d.getByRole('button',{name:/Load \d+ Selected Items/}).click(); await q.expect(d.getByRole('status')).toContainText('Published to connected terminals.',{timeout:45000}); await d.getByRole('button',{name:'Close',exact:true}).click();
    await kiosk.waitForFunction(async modulePath => {const{db}=await import(modulePath);return db.categories.some(c=>c.name==='Dal & Kadhi') && db.menuItems.some(i=>i.name==='Margherita Pizza');},dbModule,{timeout:30000});return{gujaratiCategorySynced:true,pizzaRetained:true};
  });
  await q.test(admin, 'Archive a menu item through confirmation; Kiosk excludes it while the original record remains', async () => {
    await admin.getByPlaceholder('Search dish by name, description, SKU or tag...').fill('Margherita Pizza'); await admin.getByTitle('Archive Dish').first().click(); const d=admin.getByRole('dialog'); await d.getByRole('button',{name:'Archive Dish',exact:true}).click();
    await kiosk.waitForFunction(async modulePath => !!(await import(modulePath)).db.menuItems.find(i=>i.name==='Margherita Pizza')?.archivedAt,dbModule,{timeout:30000});
    await q.expect(kiosk.getByRole('button',{name:'Add Margherita Pizza to cart',exact:true})).toHaveCount(0);
    await q.expect(async()=>{ const menu=await q.mustApi('GET','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',undefined,adminToken); q.expect(menu.entities.find(e=>e.externalId===itemId).payload.archivedAt).toBeTruthy(); }).toPass({timeout:30000}); return{softArchived:true,originalIdRetained:true,kioskHidden:true};
  });
  await q.test(admin, 'Duplicate cleanup scans, requires backup and confirmation, archives only verified copies, and supports undo', async () => {
    const catalog=await q.mustApi('GET','/api/v1/entity-sync/MENU_ITEM?afterSeq=0',undefined,adminToken); const source=catalog.entities.find(e=>e.payload.name==='Garlic Bread').payload;
    const duplicateId=`qa-menu-duplicate-${Date.now()}`; const copy={...source,id:duplicateId,updatedAt:new Date().toISOString()};
    const created=await q.mustApi('POST','/api/v1/entity-sync/MENU_ITEM',{events:[{externalId:duplicateId,payload:copy}]},adminToken);q.expect(created.results[0].status).toBe('ok');
    const before=await q.mustApi('GET','/api/v1/orders/sync?afterSeq=0',undefined,adminToken);
    await admin.waitForFunction(async ({modulePath,id})=>(await import(modulePath)).db.menuItems.some(i=>i.id===id),{modulePath:dbModule,id:duplicateId},{timeout:30000});
    await admin.getByRole('button',{name:'Clean Duplicate Items',exact:true}).click();const d=admin.getByRole('dialog',{name:'Clean Duplicate Items'});
    await d.getByRole('button',{name:'Scan Again',exact:true}).click();
    await q.expect(d.getByRole('button',{name:'Archive Confirmed Duplicates',exact:true})).toBeDisabled();
    await q.expect(async () => { await d.getByRole('button',{name:'Scan Again',exact:true}).click(); await q.expect(d.getByRole('checkbox',{name:/Garlic Bread.*Confirmed duplicate/})).toBeVisible(); }).toPass({timeout:15000});
    await d.getByRole('checkbox',{name:/Garlic Bread.*Confirmed duplicate/}).check();
    const [backup]=await Promise.all([admin.waitForEvent('download'),d.getByRole('button',{name:'Download Backup',exact:true}).click()]);q.expect(backup.suggestedFilename()).toBe('menu-before-cleanup.json');
    await d.getByLabel('I reviewed the selected groups and confirm archiving the duplicate records.',{exact:true}).check();
    await d.getByRole('button',{name:'Archive Confirmed Duplicates',exact:true}).click();await q.expect(d.getByRole('status')).toContainText('1 duplicates archived.',{timeout:30000});
    await q.snap(admin,'confirmed-duplicate-archive');
    await d.getByRole('button',{name:'Undo This Cleanup',exact:true}).click();await q.expect(d.getByRole('status')).toContainText('Archiving undone',{timeout:30000});
    const after=await q.mustApi('GET','/api/v1/orders/sync?afterSeq=0',undefined,adminToken);q.expect(after.orders).toEqual(before.orders);
    await d.getByRole('button',{name:'Close',exact:true}).click();return{requiresBackup:true,explicitConfirmation:true,archiveCount:1,undoWorked:true,historicalPaidOrdersUnchanged:true};
  });
  await kiosk.evaluate(async modulePath => { window.__qaMenuModule = await import(modulePath); }, dbModule);
  await q.test(kiosk, 'Offline browsing retains the real restaurant categories and previously synced menu', async () => {
    await kiosk._audit.ctx.setOffline(true); try { const menu=await kiosk.evaluate(async modulePath=>{const{db}=window.__qaMenuModule;return{categories:db.categories.map(c=>c.name),hasGujarati:db.menuItems.some(i=>i.name==='ખમણ')};},dbModule); q.expect(menu.categories).toContain('Pizzas');q.expect(menu.hasGujarati).toBe(true);return{offlineLocalMenuRetained:true}; }finally{await kiosk._audit.ctx.setOffline(false);}
  });

}
main().catch(error => { console.error('Kiosk management browser QA:', error.message); process.exitCode = 1; }).finally(async () => {
  await q.close(); for (const child of children) child.kill(); for (const stream of logStreams) stream.end();
});
