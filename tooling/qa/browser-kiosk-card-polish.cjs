/** Render the real kiosk App with an isolated seeded browser and offline transport.
 * No live device, restaurant, order, or activation record is read or changed.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'apps/kiosk-system/kiosk-user');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const sidebarOnly = process.argv.includes('--sidebar');
const actionsOnly = process.argv.includes('--actions');
const output = path.join(root, actionsOnly ? 'docs/reports/kiosk-action-polish-2026-10-16' : sidebarOnly ? 'docs/reports/kiosk-sidebar-polish-2026-10-15' : 'docs/reports/kiosk-card-polish-2026-10-15');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jamanvaar-card-polish-'));
const origin = 'http://127.0.0.1:5374';
const viewports = [[424,755],[480,854],[768,1024],[1080,1920],[1366,768],[1920,1080]];
const errors = [], results = [], checks = [], pending = new Map();
let server, chrome, socket, sequence = 0, sessionId;
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(method, params = {}, session = sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label) {
  for (let n = 0; n < 160; n++) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw Error('Timed out: ' + label + '; errors: ' + errors.join('\n'));
}
async function tap(expression) {
  await until(`(() => { const e=${expression}; if(!e)return false; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.width>0 && r.height>0 && (top===e || e.contains(top)); })()`, 'unobstructed touch target');
  const box = await evaluate(`(() => { const e = ${expression}; if (!e) throw Error('Tap target missing'); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [box] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(180);
}
const button = text => `[...document.querySelectorAll('button')].find(e=>e.getClientRects().length && (e.textContent.trim()===${JSON.stringify(text)} || e.getAttribute('aria-label')===${JSON.stringify(text)}))`;
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, `${phase}-${name}.png`), Buffer.from(shot.data, 'base64'));
}
function check(condition, name, evidence) {
  checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence === undefined ? {} : { evidence }) });
  if (!condition) throw Error('Failed: ' + name);
}
async function cartState() {
  return evaluate(`(() => {const draft=JSON.parse(sessionStorage.getItem('jamanvaar-kiosk-draft:isolated-card-polish'));return {lines:draft?.items.length||0,quantity:draft?.items.reduce((n,i)=>n+i.quantity,0)||0,total:draft?.items.reduce((n,i)=>n+i.itemTotal,0)||0};})()`);
}
async function inspect() {
  return evaluate(`(() => {
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const grid=document.querySelector('[data-testid="kiosk-menu-grid"]');
    const cards=[...document.querySelectorAll('[data-testid="kiosk-menu-card"]')];
    let scroller=grid;while(scroller && getComputedStyle(scroller).overflowY!=='auto')scroller=scroller.parentElement;
    const dock=document.querySelector('[data-testid="kiosk-cart-dock"] button') || [...document.querySelectorAll('button')].find(e=>e.textContent.includes('item in cart') || e.textContent.includes('items in cart'));
    const assistant=document.querySelector('[aria-label="Open JAMAN AI Food Assistant"]');
    return {viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth,grid:rect(grid),columns:grid?getComputedStyle(grid).gridTemplateColumns:null,scroller:rect(scroller),scrollHeight:scroller?.scrollHeight,scrollTop:scroller?.scrollTop,dock:rect(dock),dockText:dock?.textContent,assistant:rect(assistant),cards:cards.map(e=>({name:e.querySelector('h3,h4')?.textContent,rect:rect(e),title:rect(e.querySelector('h3,h4')),description:rect(e.querySelector('p')),price:rect(e.querySelector('[data-kiosk-price]')),buttons:[...e.querySelectorAll('button')].map(b=>({name:b.getAttribute('aria-label')||b.textContent.trim()||b.title,rect:rect(b)}))}))};
  })()`);
}
async function inspectSidebar() {
  return evaluate(`(() => {
    const shell=document.querySelector('[data-testid="kiosk-menu-shell"]');
    const rail=document.querySelector('[data-testid="kiosk-category-rail"]')||shell.firstElementChild;
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const items=[...rail.children].filter(e=>e.tagName==='BUTTON').map(e=>{
      const media=e.firstElementChild,label=e.lastElementChild,image=media.querySelector('img'),box=rect(e),m=rect(media),l=rect(label);
      return {name:e.getAttribute('aria-label')||label.textContent,rect:box,media:m,label:l,labelScrollHeight:label.scrollHeight,labelClientHeight:label.clientHeight,shrink:getComputedStyle(e).flexShrink,mediaShrink:getComputedStyle(media).flexShrink,image:image?{rect:rect(image),fit:getComputedStyle(image).objectFit,src:image.getAttribute('src')}:null,selected:e.getAttribute('aria-pressed'),border:getComputedStyle(e).borderColor,contentFits:m.y>=box.y&&l.bottom<=box.bottom+1,visible:box.y>=rail.getBoundingClientRect().y&&box.bottom<=rail.getBoundingClientRect().bottom};
    });
    const scroll=document.querySelector('[data-testid="kiosk-menu-scroll"]');
    return {viewport:{width:innerWidth,height:innerHeight},rail:rect(rail),railScrollTop:rail.scrollTop,railScrollHeight:rail.scrollHeight,railClientHeight:rail.clientHeight,railScrollWidth:rail.scrollWidth,menuScrollTop:scroll.scrollTop,pageScrollTop:document.scrollingElement.scrollTop,grid:rect(document.querySelector('[data-testid="kiosk-menu-grid"]')),items};
  })()`);
}
async function sidebarChecks() {
  const railSelector=`(document.querySelector('[data-testid="kiosk-category-rail"]')||document.querySelector('[data-testid="kiosk-menu-shell"]').firstElementChild)`;
  for (const [width,height] of [[424,755],[480,854],[768,1024],[1080,1920],[1366,768]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate(`${railSelector}.scrollTop=0`);await sleep(250);
    const info=await inspectSidebar();results.push({name:'sidebar '+width+'x'+height,...info});
    await screenshot('sidebar-'+width+'x'+height);
    if(phase==='after'){
      const heights=info.items.map(item=>item.rect.height);
      check(Math.max(...heights)-Math.min(...heights)<1,`${width}: uniform category heights`);
      check(info.items.every(item=>Math.abs(item.media.width-item.media.height)<1),`${width}: square thumbnails`);
      check(info.items.every(item=>item.shrink==='0'&&item.contentFits),`${width}: no compressed or overflowing tile content`);
      check(info.items.every(item=>!item.image||item.image.fit==='cover'),`${width}: original images use cover`);
      check(info.items.every(item=>item.rect.x>=info.rail.x&&item.rect.right<=info.rail.right),`${width}: tiles stay inside rail`);
      check(info.railScrollWidth<=info.rail.width+1,`${width}: no horizontal rail overflow`);
      check(info.items.filter(item=>item.visible).length>=4,`${width}: at least four full categories visible`);
      check(info.grid.x>=info.rail.right,`${width}: rail does not overlap product grid`);
      check(info.items.every(item=>item.media.width>=48),`${width}: readable thumbnail size`);
      check(info.items.every(item=>item.labelScrollHeight<=item.labelClientHeight+1),`${width}: category labels fit without clipping`);
    }
  }
  if(phase==='after'){
    await send('Emulation.setDeviceMetricsOverride',{width:424,height:755,deviceScaleFactor:1,mobile:false});await sleep(200);
    await evaluate(`${railSelector}.scrollTop=0`);
    const initial=await inspectSidebar();
    await tap(`${railSelector}.children[2]`);
    const selected=await inspectSidebar();
    check(selected.items[2].selected==='true'&&selected.items.filter(item=>item.selected==='true').length===1,'Category touch changes active selection');
    check(selected.items.every((item,index)=>Math.abs(item.rect.height-initial.items[index].rect.height)<1&&Math.abs(item.rect.width-initial.items[index].rect.width)<1),'Active selection preserves every tile dimension');
    check(await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"] h2').textContent.includes(${JSON.stringify(selected.items[2].name)})`),'Selecting a category filters the existing menu');
    await screenshot('selected-424x755');
    const menuTop=selected.menuScrollTop,pageTop=selected.pageScrollTop;
    const touchX=initial.rail.x+initial.rail.width/2,touchY=initial.rail.y+initial.rail.height*0.7;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});
    for(let step=1;step<=12;step++){
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX,y:touchY-step*25}]});
      await sleep(20);
    }
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await sleep(400);
    check((await inspectSidebar()).railScrollTop>0,'A touchscreen swipe scrolls the category rail');
    await evaluate(`${railSelector}.scrollTop=${railSelector}.scrollHeight`);await sleep(200);
    const bottom=await inspectSidebar();results.push({name:'sidebar bottom 424x755',...bottom});
    check(bottom.railScrollTop>0&&bottom.items.at(-1).visible,'Last category is accessible through independent rail scrolling');
    check(bottom.menuScrollTop===menuTop&&bottom.pageScrollTop===pageTop,'Scrolling the category rail leaves menu and page scroll positions unchanged');
    check(await evaluate(`(() => {const label=${railSelector}.lastElementChild.lastElementChild;const r=label.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===label||label.contains(top);})()`),'Final category label is clear of the existing Display control');
    await screenshot('bottom-424x755');
    await tap(`${railSelector}.lastElementChild`);
    check((await inspectSidebar()).items.at(-1).selected==='true','Last category can be selected by touch');
    await tap(`${railSelector}.firstElementChild`);
    check((await inspectSidebar()).items[0].selected==='true','All Menu restores existing selection');
    await evaluate(`document.documentElement.dataset.jvDisplay='large'`);await sleep(250);
    const large=await inspectSidebar();results.push({name:'large text 424x755',...large});
    check(large.items.every(item=>Math.abs(item.media.width-item.media.height)<1&&item.contentFits),'Large-text thumbnails and labels fit without compression');
    check(large.items.every(item=>item.rect.right<=large.rail.right),'Large-text content stays inside unchanged rail width');
    check(large.items.every(item=>item.labelScrollHeight<=item.labelClientHeight+1),'Large-text category labels fit without clipping');
    await screenshot('large-text-424x755');
    check(errors.length===0,'No uncaught browser exceptions',errors);
    const baseline=JSON.parse(fs.readFileSync(path.join(output,'before-results.json'),'utf8'));
    check(baseline.results.some(r=>r.items.some(item=>!item.contentFits||Math.abs(item.media.width-item.media.height)>2)),'Baseline reproduces distorted thumbnail proportions or clipped content');
  }
  console.log(JSON.stringify({phase,output,checks:checks.length,failed:checks.filter(c=>c.status==='FAIL'),viewports:results.map(r=>({name:r.name,railWidth:r.rail.width,itemHeights:r.items.map(i=>i.rect.height),media:r.items[0].media,visible:r.items.filter(i=>i.visible).length})),errors},null,2));
}
async function main() {
  const { createServer } = await import('vite');
  process.chdir(app);
  const { pathToFileURL } = require('node:url');
  const theme = (await import(pathToFileURL(path.join(app, 'tailwind.config.js')).href)).default;
  server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), css: { postcss: { plugins: [require('tailwindcss')({ ...theme, content: [path.join(app, 'src/**/*.{ts,tsx,js,jsx}'), path.join(root, 'packages/ui/src/**/*.{ts,tsx,js,jsx}')] }), require('autoprefixer')()] } }, server: { host: '127.0.0.1', port: 5374, strictPort: true }, clearScreen: false, logLevel: 'error', plugins: [{
    name: 'isolated-kiosk-ui-fixtures', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] !== path.join(app, 'src/main.tsx').replaceAll('\\', '/')) return;
      // Keep the real entry point, App, styles, and handlers; initialize only test data.
      return source.replace('.then(() => {', '.then(async () => {').replace('DeviceGate.reload();', `
        const {db,KioskDisplaySettingsRepository}=await import('@jamanvaar/database');
        db.resetToDefaultSeed();
        KioskDisplaySettingsRepository.updateSettings({idleWarningAfterSeconds:3600});
        DeviceGate.reload();
      `);
    }
  }] });
  await server.listen();
  const executable = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--disable-background-networking', '--disable-extensions', ...(actionsOnly ? ['--no-sandbox', '--disable-gpu'] : []), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 150 && !fs.existsSync(portFile); n++) await sleep(100);
  if (!fs.existsSync(portFile)) throw Error('Local Chromium did not start');
  const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); }
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Fetch.requestPaused') {
      const request = message.params, url = new URL(request.request.url);
      const localAsset = url.origin === origin && !url.pathname.startsWith('/api/');
      void send(localAsset ? 'Fetch.continueRequest' : 'Fetch.fulfillRequest', localAsset ? { requestId: request.requestId } : { requestId: request.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }], body: Buffer.from('{"message":"Isolated UI test; network disabled"}').toString('base64') }, message.sessionId).catch(error => errors.push(error.message));
    }
  });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('jamanvaar_kiosk_user_device_token','isolated-ui-fixture');localStorage.setItem('jamanvaar_kiosk_user_device_id','isolated-card-polish');` });
  await send('Page.navigate', { url: origin });
  await until(`Boolean(${button('Start Order')})`, 'welcome screen');
  await tap(button('Start Order'));
  await until(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent.includes('English')))`, 'language screen');
  await tap(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('English'))`);
  await until(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent.includes('Takeaway')))`, 'order type');
  await tap(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Takeaway'))`);
  await until(`document.querySelectorAll('[data-testid="kiosk-menu-card"]').length>4`, 'real menu cards');
  await sleep(1200);
  if(sidebarOnly){await sidebarChecks();return;}
  if(actionsOnly){
    await require('./kiosk-action-checks.cjs')({phase,output,root,send,evaluate,until,tap,button,screenshot,check,checks,cartState,inspect,results,errors,sleep});
    return;
  }
  for (const [width, height] of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    await screenshot(`menu-${width}x${height}`);
    results.push({ name: `menu ${width}x${height}`, ...await inspect() });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  const firstAdd = `document.querySelector('[data-testid="kiosk-menu-card"] button[title="Add to Cart"]')`;
  await tap(firstAdd); await tap(firstAdd);
  await until(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent.includes('items in cart')))`, 'cart summary');
  for (const [width, height] of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    await screenshot(`cart-${width}x${height}`);
    results.push({ name: `cart ${width}x${height}`, ...await inspect() });
    await evaluate(`(() => { let scroll=document.querySelector('[data-testid="kiosk-menu-grid"]');while(scroll && getComputedStyle(scroll).overflowY!=='auto')scroll=scroll.parentElement; scroll.scrollTop=scroll.scrollHeight; })()`);
    await sleep(200);
    await screenshot(`last-row-${width}x${height}`);
    results.push({ name: `last row ${width}x${height}`, ...await inspect() });
    if (phase === 'after') check(await evaluate(`(() => {const last=[...document.querySelectorAll('[data-testid="kiosk-menu-card"]')].at(-1);return [...last.querySelectorAll('button[title="Add to Cart"],button[title="Customize"]')].every(e=>{const r=e.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===top||e.contains(top);});})()`),`Final row ${width}x${height}: touch actions are unobstructed`);
    await evaluate(`(() => { let scroll=document.querySelector('[data-testid="kiosk-menu-grid"]');while(scroll && getComputedStyle(scroll).overflowY!=='auto')scroll=scroll.parentElement; scroll.scrollTop=0; })()`);
  }
  if (phase === 'after') {
    for (const result of results) {
      check(!result.overflow, result.name + ': no horizontal overflow');
      check(result.grid.right <= result.viewport.width + 1, result.name + ': grid fits menu');
      const actions=result.cards.flatMap(card=>card.buttons.filter(b=>b.name==='Customize'||b.name.startsWith('Add ')));
      check(actions.every(b=>b.rect.width>=47.5&&b.rect.height>=47.5),result.name+': 48px action targets');
      check(result.cards.every(card=>card.buttons.every(b=>b.rect.x>=card.rect.x-1&&b.rect.right<=card.rect.right+1)),result.name+': controls stay in their cards');
      const heights=result.cards.map(card=>card.rect.height);
      check(Math.max(...heights)-Math.min(...heights)<1,result.name+': consistent card heights');
      const priceOffsets=result.cards.map(card=>card.price.y-card.rect.y);
      check(Math.max(...priceOffsets)-Math.min(...priceOffsets)<1,result.name+': prices align');
      if (result.dock) {
        check(result.viewport.height-result.dock.bottom>=23,result.name+': visible bottom gap');
        check(!result.assistant||result.assistant.bottom<=result.dock.y-8||result.assistant.x>=result.dock.right,result.name+': assistant clears cart');
      }
      if (result.name.startsWith('last row'))check(result.cards.at(-1).rect.bottom<=result.dock.y-12,result.name+': final row clears cart');
    }
    const baseline=JSON.parse(fs.readFileSync(path.join(output,'before-results.json'),'utf8'));
    const smallBefore=baseline.results.flatMap(r=>r.cards.flatMap(c=>c.buttons.filter(b=>b.name==='Customize'&&b.rect.height<47.5)));
    check(smallBefore.length>0,'Baseline reproduces undersized Customize controls',{failingBeforeTargets:smallBefore.length});
    check((await cartState()).lines===1&&(await cartState()).quantity===2,'Repeated quick-add merges into one line with quantity 2');
    const previousTotal=(await cartState()).total;
    await send('Emulation.setDeviceMetricsOverride',{width:424,height:755,deviceScaleFactor:1,mobile:false});
    await tap(`document.querySelector('[data-testid="kiosk-cart-dock"] button')`);
    check(await evaluate(`document.querySelector('.kiosk-cart-drawer').parentElement.getAttribute('aria-hidden')==='false'`),'Touching the floating cart opens the existing summary');
    await tap(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('Increase quantity of'))`);
    check((await cartState()).quantity===3&&(await cartState()).total>previousTotal,'Existing quantity increment updates price');
    await tap(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('Decrease quantity of'))`);
    check((await cartState()).quantity===2&&(await cartState()).total===previousTotal,'Existing quantity decrement restores price');
    await screenshot('quantity-424x755');
    await tap(button('Close order summary'));
    await send('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:false});
    await tap(`document.querySelector('[data-testid="kiosk-menu-card"] button[title="Customize"]')`);
    check(await evaluate(`Boolean([...document.querySelectorAll('[role="dialog"]')].find(e=>e.textContent.includes('Add to Cart')))`),'Customize opens existing modifier flow');
    await screenshot('customize-768x1024');
    await tap(`[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.trim().startsWith('Add to Cart'))`);
    check((await cartState()).lines===1&&(await cartState()).quantity===3,'Confirming the same default customization merges without duplicate entries');
    await send('Emulation.setDeviceMetricsOverride',{width:424,height:755,deviceScaleFactor:1,mobile:false});
    await tap(button('Need Help?'));
    check(await evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="JAMAN AI Food Assistant"], [role="dialog"][aria-label="JAMAN AI access"]'))`),'Header help stays accessible while the duplicate floating launcher is hidden');
    await tap(button('Close JAMAN AI'));
    for(const [width,height] of [[424,755],[768,1024]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.documentElement.dataset.jvDisplay='large'`);await sleep(250);
      const info=await inspect();
      check(!info.overflow,'Large-text layout '+width+' has no page overflow');
      check(await evaluate(`(() => { const e=document.querySelector('[data-testid="kiosk-cart-dock"] button');return e.scrollWidth<=e.clientWidth; })()`),'Large-text cart '+width+' fits its controls');
      await screenshot('large-text-'+width+'x'+height);
      await evaluate(`(() => {const scroll=document.querySelector('[data-testid="kiosk-menu-scroll"]');scroll.scrollTop=scroll.scrollHeight;})()`);await sleep(200);
      const last=await inspect();
      check(last.cards.at(-1).rect.bottom<=last.dock.y-12,'Large-text final row '+width+' clears actual cart height');
      await screenshot('large-text-last-row-'+width+'x'+height);
      await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"]').scrollTop=0`);
      await evaluate(`document.documentElement.dataset.jvDisplay='standard'`);
    }
    // Stress actual product cards through the same isolated repository subscription.
    await evaluate(`(async()=>{const {db}=await import('/@fs/${path.join(root,'packages/database/src/index.ts').replaceAll('\\','/')}');const items=db.menuItems.filter(i=>i.isAvailable);items[0].name='A very long freshly prepared seasonal special with accompaniments';items[0].subcategory='Seasonal special';items[1].description='A long description with seasonal vegetables and fragrant spices, freshly prepared and served with a selection of accompaniments for the whole table.';items[2].description='';db.notify();})()`);
    await sleep(250);
    const stress=await inspect();results.push({name:'mixed content stress',...stress});
    const offsets=stress.cards.map(card=>card.price.y-card.rect.y);
    check(Math.max(...offsets)-Math.min(...offsets)<1,'Long names, long descriptions, missing description, and optional metadata keep prices aligned');
    await screenshot('mixed-content-768x1024');
    check(errors.length===0,'No uncaught browser exceptions',errors);
  }
  console.log(JSON.stringify({ phase, screenshots: output, viewports:results.filter(r=>r.name.startsWith('menu')).map(r=>({viewport:r.viewport,columns:r.columns})),checks:checks.length,failed:checks.filter(c=>c.status==='FAIL'),errors },null,2));
}
main().catch(async error => { console.error(error); process.exitCode=1; if(sessionId){await screenshot('failure').catch(()=>{});console.error(await evaluate('document.body.innerText.slice(0,1800)').catch(()=>''));} }).finally(async () => {
  fs.writeFileSync(path.join(output, `${phase}-results.json`), JSON.stringify({phase,environment:'Real kiosk App; isolated seeded menu and device fixture; all API/external traffic blocked',results,checks,errors}, null, 2));
  if(socket){await send('Browser.close', {}, undefined).catch(()=>{});socket.close();}
  chrome?.kill(); await server?.close();
});
