const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const privateDir = path.join(root, '.jamanvaar', 'usability-audit-2026-10-12');
const evidenceDir = path.join(__dirname, 'evidence', 'browser');
fs.mkdirSync(privateDir, {recursive:true});fs.mkdirSync(evidenceDir, {recursive:true});
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const apps = [
 ['restaurant-admin','apps/restaurant-system/pos-admin','/',[1366,768],[390,844]],
 ['qr-site','apps/restaurant-system/pos-admin','/qr/',[1366,768],[390,844]],
 ['qr-admin-login','apps/restaurant-system/pos-admin','/qr/login/',[1366,768],[390,844]],
 ['pos','apps/restaurant-system/pos','/',[1366,768],[768,1024]],
 ['captain','apps/restaurant-system/captain','/',[1366,768],[390,844]],
 ['kds','apps/restaurant-system/kds','/',[1920,1080],[768,1024]],
 ['kiosk','apps/kiosk-system/kiosk-user','/',[1366,768],[1080,1920]],
 ['qr-guest','apps/qr-guest','/q/audit-invalid-token/',[1366,768],[390,844]],
 ['super-admin','cloud/super-admin-web','/login',[1366,768],[390,844]]
];
let chrome;let socket;let activeServer;let nextId=0;const pending=new Map();const pages=new Map();const results=[];
function send(method,params={},sessionId){const id=++nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function run(){
 const {createServer}=await import('vite');
 const chromeExe='C:/Program Files/Google/Chrome/Application/chrome.exe';
 const profile=path.join(privateDir,`chrome-${Date.now()}`);
 chrome=spawn(chromeExe,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','about:blank'],{stdio:'ignore',windowsHide:true});
 const portFile=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
 if(!fs.existsSync(portFile))throw Error('Headless Chrome did not expose CDP');
 const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
 socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{
  const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}return;}
  const page=pages.get(m.sessionId);if(!page)return;
  if(m.method==='Fetch.requestPaused'){
   const url=new URL(m.params.request.url);
   const allow=url.origin===page.origin&&!url.pathname.startsWith('/api/');
   const operation=allow?send('Fetch.continueRequest',{requestId:m.params.requestId},m.sessionId):send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"message":"Isolated usability audit: backend requests blocked"}').toString('base64')},m.sessionId);
   if(!allow)page.blockedRequests++;
   void operation.catch(error=>page.errors.push(`Network interception: ${error.message}`));
  }
  if(m.method==='Runtime.exceptionThrown')page.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
 });
 let serverApp='';let origin='';
 for(const [name,app,route,...sizes] of apps.filter(app => !process.argv[2] || app[0] === process.argv[2])){
  if(serverApp!==app){await activeServer?.close();process.chdir(path.join(root,app));activeServer=await createServer({root:path.join(root,app),configFile:path.join(root,app,'vite.config.ts'),cacheDir:path.join(privateDir,'vite-cache',name),server:{port:5360,strictPort:true,host:'127.0.0.1'},clearScreen:false,logLevel:'error'});await activeServer.listen();origin='http://127.0.0.1:5360';serverApp=app;}
  const target=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});const session=attached.sessionId;
  const page={origin,blockedRequests:0,errors:[]};pages.set(session,page);
  await send('Page.enable',{},session);await send('Runtime.enable',{},session);await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},session);
  for(const [width,height] of sizes){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},session);
   await send('Page.navigate',{url:origin+route},session);
   let snapshot;
   for(let attempt=0;attempt<60;attempt++){await sleep(500);const response=await send('Runtime.evaluate',{expression:'document.body.innerText.trim().length',returnByValue:true},session);if(response.result.value>20)break;}
   await sleep(600);
   const response=await send('Runtime.evaluate',{expression:`JSON.stringify({title:document.title,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent),text:document.body.innerText.slice(0,11000),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText,aria:e.getAttribute('aria-label'),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)})),images:[...document.images].map(e=>({alt:e.alt,loaded:e.complete&&e.naturalWidth>0})),viewport:document.querySelector('meta[name=viewport]')?.content})`,returnByValue:true},session);
   snapshot=JSON.parse(response.result.value);
   const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
   const file=`${name}-${width}x${height}`;fs.writeFileSync(path.join(evidenceDir,file+'.png'),Buffer.from(screenshot.data,'base64'));
   fs.writeFileSync(path.join(evidenceDir,file+'.json'),JSON.stringify({name,route,viewport:{width,height},...snapshot,blockedRequests:page.blockedRequests,errors:page.errors},null,2));
   results.push({name,route,width,height,horizontalOverflow:snapshot.horizontalOverflow,unloadedImages:snapshot.images.filter(x=>!x.loaded).length,errors:page.errors.length,screenshot:`evidence/browser/${file}.png`});
   console.log(`${name} ${width}x${height}: overflow=${snapshot.horizontalOverflow}, pageErrors=${page.errors.length}`);
  }
  await send('Target.closeTarget',{targetId:target.targetId});pages.delete(session);
 }
 fs.writeFileSync(path.join(__dirname,'evidence','BROWSER_COVERAGE.json'),JSON.stringify({checkedAt:new Date().toISOString(),method:'Current-source Vite servers, installed headless Chrome/CDP, isolated browser profile, all backend/external requests intercepted with 503. No app source edits, no predev hooks, no authentication bypass, no production requests. This covers public/activation/error pages only; protected workflows are source-reviewed, not end-to-end verified.',results},null,2));
}
run().catch(error=>{console.error(error.stack || error.message);process.exitCode=1;}).finally(async()=>{await activeServer?.close();if(socket?.readyState === WebSocket.OPEN){try{await send('Browser.close');}catch{}}socket?.close();chrome?.kill();});
