const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..');
(async()=>{
  const{createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts'));
  const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
  const tw=(await import(pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'apps/restaurant-system/pos-admin/src/**/*.{js,ts,jsx,tsx}'),path.join(root,'packages/ui/src/**/*.{js,ts,jsx,tsx}')];
  const client=`export class CloudApiError extends Error{constructor(message,status){super(message);this.status=status;}}
  export async function cloudRequestPasswordResetOwner(id){const f=window.__recovery;f.calls.push({method:'request',id});if(location.search.includes('throttle'))throw new CloudApiError('ThrottlerException: Too Many Requests',429);f.sendCount++;f.code=f.sendCount===1?'123456':'654321';return{maskedEmail:'ow***er@example.test',activationRequired:false,retryAfterSeconds:60,expiresInSeconds:900};}
  export async function cloudVerifyPasswordResetOwner(id,otp){const f=window.__recovery;f.calls.push({method:'verify',id,otp});if(otp!==f.code)throw new Error('That code is not valid or has expired. Request a new code and use the latest email.');return{resetToken:'fixture-only-not-real-reset-credential',expiresInSeconds:300};}
  export async function cloudCompletePasswordResetOwner(id,resetToken,newPassword){window.__recovery.calls.push({method:'complete',id,resetToken,newPassword});}
  export async function cloudRecoverRestaurantId(){}
  export async function cloudQrAccount(){throw Error('Unexpected account request');} export const qrApi=cloudQrAccount,cloudLoginOwner=cloudQrAccount,cloudLogin=cloudQrAccount,cloudActivateDevice=cloudQrAccount,cloudLogout=cloudQrAccount;`;
  const server=await createServer({root,configFile:false,publicDir:path.join(root,'apps/restaurant-system/pos-admin/public'),resolve:config.config.resolve,plugins:[react(),{name:'isolated-recovery-api',enforce:'pre',load(id){id=id.replaceAll('\\','/');if(id.endsWith('/cloud/cloudClient.ts'))return client;if(id.endsWith('/qrconsole/QrConsole.tsx'))return 'export const QrConsole=()=>null;';if(id.endsWith('/cloud/qrAdminClient.ts'))return 'export class QrAdminApi{}';}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:5545,strictPort:true,watch:null,fs:{allow:[root]}}});
  await server.listen();const{chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  const url='http://127.0.0.1:5545/docs/reports/password-recovery-2026-10-20/fixture.html';
  try{
    for(const width of [1440,390]){
      for(const panel of [false,true]){
        console.log('Recovery',width,panel?'owner panel':'QR');
        const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
        await page.route('**/qr/assets/**',route=>route.continue({url:route.request().url().replace('/qr/assets/','/assets/')}));
        page.on('pageerror',error=>errors.push(error.message));await page.clock.install();
        await page.goto(url+(panel?'?panel=1':''));
        await page.getByRole('textbox',{name:'Restaurant ID',exact:true}).fill('JM1234567890');
        assert.equal(await page.getByLabel('6-digit recovery code').count(),0);assert.equal(await page.getByLabel('New password',{exact:true}).count(),0);
        await page.getByRole('button',{name:'Email me a code',exact:true}).click();
        await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
        assert.ok(await page.getByRole('button',{name:/Request a new code in/}).isDisabled());
        await page.screenshot({path:path.join(__dirname,`${panel?'owner':'qr'}-code-${width}.png`),fullPage:true});
        await page.clock.fastForward(61_000);await page.getByRole('button',{name:'Send a new code',exact:true}).click();
        await page.getByLabel('6-digit recovery code').fill('123456');await page.getByRole('button',{name:'Verify code',exact:true}).click();
        await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('New password',{exact:true}).count(),0);
        await page.getByLabel('6-digit recovery code').fill('654321');await page.getByRole('button',{name:'Verify code',exact:true}).click();
        await page.getByRole('heading',{name:'Choose a new password',exact:true}).waitFor();
        await page.getByLabel('New password',{exact:true}).fill('new-secure-password-123');await page.getByLabel('Confirm new password',{exact:true}).fill('does-not-match-123');
        await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByText('The two passwords do not match.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>window.__recovery.calls.filter(x=>x.method==='complete').length),0);
        await page.getByLabel('Confirm new password',{exact:true}).fill('new-secure-password-123');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await page.screenshot({path:path.join(__dirname,`${panel?'owner':'qr'}-password-${width}.png`),fullPage:true});
        await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByRole('heading',{name:'Password changed',exact:true}).waitFor();
        const calls=await page.evaluate(()=>window.__recovery.calls);assert.equal(calls.filter(x=>x.method==='request').length,2);assert.equal(calls.filter(x=>x.method==='complete').length,1);
        assert.deepEqual(errors,[]);results.push({width,experience:panel?'Restaurant/Kiosk Admin':'QR Admin',separateVerification:true,resendAfter60Seconds:true,oldCodeRejected:true,confirmationRequired:true,completed:true,overflow:false});await context.close();
      }
    }
    const page=await browser.newPage();await page.goto(url+'?throttle=1');await page.getByLabel('Restaurant ID',{exact:true}).fill('JM1234567890');await page.getByRole('button',{name:'Email me a code',exact:true}).click();
    await page.getByText('Too many attempts. Please wait a minute and try again.',{exact:true}).waitFor();assert.equal((await page.locator('body').innerText()).includes('ThrottlerException'),false);
    results.push({friendlyThrottle:true});await page.close();
    const expired=await browser.newPage();await expired.clock.install();await expired.goto(url);await expired.getByLabel('Restaurant ID',{exact:true}).fill('JM1234567890');await expired.getByRole('button',{name:'Email me a code',exact:true}).click();await expired.getByRole('heading',{name:'Check your email',exact:true}).waitFor();await expired.clock.fastForward(901_000);
    assert.ok(await expired.getByRole('button',{name:'Verify code',exact:true}).isDisabled());assert.ok(await expired.getByRole('button',{name:'Send a new code',exact:true}).isEnabled());results.push({expiredCodeCanBeReplaced:true});await expired.close();
    console.log(JSON.stringify(results,null,2));
  }finally{fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
