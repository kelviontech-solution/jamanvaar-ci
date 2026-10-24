const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../..');
(async()=>{
  const {createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts'));
  const tw=(await import(pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'apps/**/*.{tsx,ts}'),path.join(root,'packages/ui/src/**/*.{tsx,ts}'),path.join(__dirname,'*.tsx')];
  const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
  const server=await createServer({root,configFile:false,optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','qrcode','lucide-react','react-router-dom']},cacheDir:path.join(project,'.tools/vite-cache'),publicDir:path.join(root,'apps/kiosk-system/kiosk-user/public'),resolve:config.config.resolve,define:{__APP_VERSION__:'"marketing-local-preview"'},plugins:[react(),{name:'isolated-marketing-cloud',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/pos-admin/src/cloud/cloudClient.ts'))return fs.readFileSync(path.join(root,'docs/reports/qr-owner-flow-2026-10-22/mock-cloud.js'),'utf8');}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},server:{host:'127.0.0.1',port:5470,strictPort:true,watch:null,fs:{allow:[root]}}});
  await server.listen();
  const {chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  const out=path.join(project,'assets/product-recordings'),url='http://127.0.0.1:5470/marketing/jamanvaar-ad/scripts/product-fixture.html';
  async function guestRoutes(page){await page.route('**/api/v1/public/qr/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    const data=await page.evaluate(p=>{const f=window.__experience;
      if(p.endsWith('/session'))return{session:'local-demo-proof'};
      if(p.endsWith('/fixture-table-token/menu'))return{menuVersion:1,etag:'local-demo',categories:f.categories,items:f.items,modifierGroups:[]};
      if(p.endsWith('/fixture-table-token'))return{restaurant:{name:'River House Kitchen'},branch:{name:'Main Dining'},table:{displayNumber:'4'},mode:'TABLE_ORDER',currency:'INR',advanced:{loyaltyEnabled:false,feedbackEnabled:false,promotionsEnabled:false,languages:['en'],defaultLanguage:'en',recommendationIds:[],workload:{estimateMinutes:20,atCapacity:false}},ordering:{enabled:true,menuReady:true,menuVersion:1,settings:{allowCash:true,allowOnlinePayment:false,allowModifiers:true,allowCustomerNotes:true,showOrderStatus:true}}};
      if(p.endsWith('/operations'))return{serviceEnabled:false,requestTypes:[],pickupEnabled:false,asapEnabled:true};
      if(p.endsWith('/events')||p.endsWith('/engagement'))return{ok:true};
      return{};
    },p);await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });}
  try{for(const product of ['pos','qr','kiosk','kds','admin']){
    if(process.env.AD_CAPTURE_PRODUCTS && !process.env.AD_CAPTURE_PRODUCTS.split(',').includes(product))continue;console.log('Capturing',product);
    const size=product==='qr'?{width:480,height:960}:product==='kiosk'?{width:720,height:1280}:{width:1440,height:960};
    const context=await browser.newContext({viewport:size,recordVideo:{dir:path.join(out,'raw'),size}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('Runtime:',e.message);});
    // No external services are called. The isolated guest transport is installed only for the guest app.
    await page.route(/\/(?:q|qr)\/assets\/branding\//,route=>route.fulfill({path:path.join(root,'cloud/super-admin-web/public/assets/branding/jamanvaar-logo.png')}));if(product==='qr')await guestRoutes(page);
    await page.goto(url+'?product='+product);await page.waitForTimeout(2500);
    if(product==='pos'){
      await page.getByText('Paneer Tikka',{exact:true}).first().waitFor();
      await page.evaluate(()=>window.__demoAdd(0));await page.waitForTimeout(500);
      await page.evaluate(()=>window.__demoAdd(3));await page.waitForTimeout(1000);
      await page.screenshot({path:path.join(out,'pos.png')});await page.locator('.pos-order-pane').screenshot({path:path.join(out,'pos-cart.png')});
    }else if(product==='qr'){
      await page.waitForTimeout(500);await page.locator('.iname').filter({hasText:'Margherita Pizza'}).waitFor();
      await page.screenshot({path:path.join(out,'qr-menu.png')});
    }else if(product==='kiosk'){
      await page.getByTestId('kiosk-welcome-screen').waitFor();await page.screenshot({path:path.join(out,'kiosk-welcome.png')});
      await page.getByRole('button',{name:/Start your order/i}).click();await page.getByTestId('kiosk-menu-card').first().waitFor();await page.waitForTimeout(600);
      await page.screenshot({path:path.join(out,'kiosk-menu.png')});
    }else if(product==='kds'){
      await page.getByRole('heading',{name:'Kitchen Display',exact:true}).waitFor();await page.screenshot({path:path.join(out,'kds.png')});await page.locator('.kds-ticket').first().screenshot({path:path.join(out,'kds-ticket.png')});
    }else{
      await page.getByRole('heading',{name:'Today',exact:true}).waitFor();await page.screenshot({path:path.join(out,'admin.png')});
    }
    assert.deepEqual(errors,[],product+' runtime errors');
    const images=await page.locator('img').evaluateAll(nodes=>nodes.map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0})));
    results.push({product,viewport:size,source:'Actual repository components with fictional isolated data',runtimeErrors:errors,images,backendOperationsVerified:false});
    assert.equal(images.every(i=>i.loaded),true,product+' images must load');const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,product+'-capture.webm'));
  }}finally{await browser.close();await server.close();fs.writeFileSync(path.join(project,'output/capture-results.json'),JSON.stringify(results,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
