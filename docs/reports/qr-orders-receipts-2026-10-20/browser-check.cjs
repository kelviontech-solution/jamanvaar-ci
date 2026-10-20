const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..'),report='/docs/reports/qr-orders-receipts-2026-10-20',proof='qs1.fixture-browser-proof',orderId='JQ-FIXTURE1234567890123456';
(async()=>{
  const{createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts'));
  const tw=(await import(pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'apps/restaurant-system/pos-admin/src/**/*.{js,ts,jsx,tsx}'),path.join(root,'packages/ui/src/**/*.{js,ts,jsx,tsx}')];
  const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
  const mockClient=`export async function qrApi(path,init={}){const fixture=window.__receiptFixture;fixture.requests.push({path,method:init.method||'GET'});if(init.method==='PUT'){const input=JSON.parse(init.body);fixture.settings={...fixture.settings,design:input.design,version:fixture.settings.version+1};}return structuredClone(fixture.settings);}
  export async function qrReceiptPdf(id){window.__receiptFixture.requests.push({download:id});return new Blob(['%PDF-fixture'],{type:'application/pdf'});}`;
  const server=await createServer({root,configFile:false,cacheDir:path.join(root,'.jamanvaar/qr-receipt-browser-vite'),publicDir:path.join(root,'apps/restaurant-system/pos/public'),resolve:config.config.resolve,plugins:[react(),{name:'isolated-receipt-fixture',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/pos-admin/src/cloud/cloudClient.ts'))return mockClient;},configureServer(server){server.middlewares.use((req,res,next)=>{if(/^\/q\/fixture-table-qr/.test(req.url))req.url=report+'/guest.html';else if(req.url.startsWith('/q/assets/'))req.url=req.url.slice(2);next();});}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},server:{host:'127.0.0.1',port:5548,strictPort:true,watch:null,fs:{allow:[root]}}});
  await server.listen();const{chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  const origin='http://127.0.0.1:5548',guestUrl=origin+'/q/fixture-table-qr';
  const design={heading:'Order bill',thankYou:'Thank you for visiting!',footer:'We look forward to seeing you again.',contact:'Call the restaurant for help',accent:'#235b46',showTaxBreakup:true,showCustomer:true,showNotes:true};
  const menu={menuVersion:1,etag:'fixture',categories:[{id:'main',name:'Meals',sortOrder:0}],items:[{id:'meal',name:'Gujarati Thali',price:250,categoryId:'main',modifierGroupIds:[],allowInstructions:true}],modifierGroups:[]};
  let currentStatus='RECEIVED',placedBody;
  const order=()=>({publicOrderId:orderId,orderNumber:'QR-24',restaurantName:'River House',branchName:'Main Dining',currency:'INR',status:currentStatus,table:'1',placedAt:'2026-10-20T12:00:00Z',total:262.5,subtotal:250,tax:12.5,cgst:6.25,sgst:6.25,discount:0,paymentMethod:'CASH_AT_COUNTER',paymentStatus:currentStatus==='COMPLETED'?'SUCCESS':'PENDING',balance:{totalPaise:26250,collectedPaise:currentStatus==='COMPLETED'?26250:0,outstandingPaise:currentStatus==='COMPLETED'?0:26250,refundedPaise:0,settlement:currentStatus==='COMPLETED'?'SETTLED':'UNPAID'},items:[{name:'Gujarati Thali',quantity:1,unitPrice:250,lineTotal:250,options:[],note:'Less spicy'}],customer:{name:placedBody?.customerName,phone:placedBody?.customerPhone},notes:placedBody?.orderNotes,receiptDesign:design,preparationMinutes:15});
  async function guestContext(width,issuedProof=proof){const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});await ctx.route('**/api/v1/public/qr/**',async route=>{
    const request=route.request(),url=new URL(request.url()),suffix=url.pathname.split('/api/v1/public/qr')[1];let data={},status=200;
    if(suffix==='/session')data={session:issuedProof};
    else if(suffix.includes('/orders/')&&request.headers()['x-qr-session']!==proof){status=404;data={message:'Order not found.'};}
    else if(suffix.endsWith('/receipt.pdf')){return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from('%PDF-fixture')});}
    else if(suffix.includes('/orders/'))data=order();
    else if(suffix.endsWith('/menu'))data=menu;
    else if(suffix.endsWith('/quote'))data={menuVersion:1,subtotal:250,tax:12.5,total:262.5,lines:[{itemId:'meal',name:'Gujarati Thali',quantity:1,unitPrice:250,lineTotal:250,options:[]}]};
    else if(suffix.endsWith('/orders')){placedBody=request.postDataJSON();assert.equal(request.headers()['x-qr-session'],proof);data=order();status=201;}
    else if(suffix.endsWith('/operations'))data={serviceEnabled:false,pickupEnabled:false,asapEnabled:true,requestTypes:[]};
    else if(suffix.endsWith('/events'))data={ok:true};
    else data={restaurant:{name:'River House'},branch:{name:'Main Dining'},mode:'TABLE_ORDER',table:{displayNumber:'1'},ordering:{enabled:true,menuReady:true,menuVersion:1,settings:{allowCustomerNotes:true,allowModifiers:true,allowCash:true,allowOnlinePayment:false,showOrderStatus:true,requireCustomerName:false,requireCustomerPhone:false}}};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });return ctx;}
  try{
    const ctx=await guestContext(390),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(guestUrl);await page.getByRole('button',{name:'Add Gujarati Thali',exact:true}).click();
    const add=page.getByRole('button',{name:/^Add 1/});if(await add.count())await add.click();
    await page.getByRole('button',{name:/View Cart/}).click();await page.getByRole('button',{name:/Checkout|Continue to checkout/i}).click();
    await page.getByPlaceholder('How should we call you?').fill('Asha Shah');await page.getByPlaceholder('Your mobile number').fill('9876543210');await page.getByPlaceholder('Any special requests?').fill('Call when ready; peanut allergy');
    await page.getByRole('button',{name:/Place order/}).click();await page.getByRole('heading',{name:'Order confirmed',exact:true}).waitFor();
    assert.equal(placedBody.customerName,'Asha Shah');assert.equal(placedBody.customerPhone,'9876543210');assert.equal(placedBody.orderNotes,'Call when ready; peanut allergy');
    assert.equal(await page.evaluate(()=>localStorage.getItem('jv_qr_session2')),proof);
    const savedUrl=page.url();await page.close();currentStatus='READY';
    const reopened=await ctx.newPage();reopened.on('pageerror',e=>errors.push(e.message));await reopened.goto(savedUrl);await reopened.getByRole('heading',{name:'Your order is ready',exact:true}).waitFor();
    await reopened.getByText('View itemised bill',{exact:true}).click();await reopened.getByText('Call when ready; peanut allergy',{exact:false}).waitFor();
    assert.ok(await reopened.getByText('CGST',{exact:true}).count());assert.ok(await reopened.getByText('Balance due',{exact:true}).count());
    const download=reopened.waitForEvent('download');await reopened.getByRole('button',{name:'Download bill PDF',exact:true}).click();assert.equal((await download).suggestedFilename(),'bill-QR-24.pdf');
    assert.equal(await reopened.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await reopened.screenshot({path:path.join(__dirname,'guest-ready-390.png'),fullPage:true});
    await reopened.getByRole('button',{name:'Order more',exact:true}).click();await reopened.getByRole('heading',{name:'Explore our menu',exact:true}).waitFor();assert.equal(new URL(reopened.url()).pathname,'/q/fixture-table-qr');assert.equal(new URL(reopened.url()).searchParams.has('order'),false);
    currentStatus='COMPLETED';await reopened.goto(savedUrl);await reopened.getByRole('heading',{name:'Order completed',exact:true}).waitFor();
    assert.deepEqual(errors,[]);results.push({guestCheckout:true,submittedContactAndNotes:true,closeReopenReady:true,persistedProof:true,downloadName:'bill-QR-24.pdf',completedReopen:true,orderMoreSameTable:true,width:390,overflow:false});await ctx.close();
    const outsider=await guestContext(390,'qs1.different-browser'),outsiderPage=await outsider.newPage();await outsiderPage.goto(savedUrl);await outsiderPage.getByRole('heading',{name:'Could not restore your order'}).waitFor();await outsiderPage.getByRole('button',{name:'Order more for this table'}).click();await outsiderPage.getByRole('heading',{name:'Explore our menu'}).waitFor();await outsider.close();results.push({differentBrowserCannotReadOrder:true,recoveryCanOrderSameTable:true});
    for(const width of [390,1440]){
      const admin=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),ap=await admin.newPage(),adminErrors=[];ap.on('pageerror',e=>adminErrors.push(e.message));await ap.goto(origin+report+'/admin.html');await ap.getByLabel('Bill heading',{exact:true}).fill('Your restaurant bill');await ap.getByLabel('Contact details',{exact:true}).fill('Call our restaurant');await ap.getByLabel('Footer message',{exact:true}).fill('See you again!');
      await ap.getByLabel('Show CGST and SGST separately',{exact:true}).uncheck();assert.equal(await ap.getByLabel('Live receipt preview').getByText('CGST',{exact:true}).count(),0);await ap.getByRole('button',{name:'Save receipt design',exact:true}).click();await ap.getByRole('status').waitFor();assert.equal(await ap.evaluate(()=>window.__receiptFixture.settings.design.heading),'Your restaurant bill');
      assert.equal(await ap.getByRole('link',{name:'Call guest',exact:true}).getAttribute('href'),'tel:+919876543210');assert.equal(await ap.getByRole('link',{name:'WhatsApp',exact:true}).getAttribute('href'),'https://wa.me/919876543210');await ap.getByText('Shared table requests').click();await ap.getByText('No chilli',{exact:false}).waitFor();
      const download=ap.waitForEvent('download');await ap.getByRole('button',{name:'Download bill PDF',exact:true}).click();assert.equal((await download).suggestedFilename(),'bill-QR-24.pdf');assert.deepEqual(adminErrors,[]);assert.equal(await ap.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await ap.screenshot({path:path.join(__dirname,`admin-receipts-${width}.png`),fullPage:true});results.push({adminWidth:width,livePreview:true,savedDesign:true,guestContactLinks:true,kitchenAndSharedNotes:true,pdfDownload:true,overflow:false});await admin.close();
    }
    const missingRef=await guestContext(390),missingPage=await missingRef.newPage();await missingPage.goto(guestUrl+'#status');await missingPage.getByRole('heading',{name:'Could not restore your order'}).waitFor();await missingPage.getByRole('button',{name:'Order more for this table'}).click();await missingPage.getByRole('heading',{name:'Explore our menu'}).waitFor();await missingRef.close();results.push({missingReferenceHasActionableRecovery:true});
    fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
