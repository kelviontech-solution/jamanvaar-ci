/** Public localhost pages and isolated real components. Never seeds or bypasses admin auth. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),phase=process.argv.includes('--before')?'before':'after';
const output=path.join(root,'docs/reports/admin-consistency-2026-10-15');
const extra=process.argv.includes('--extra');
const sizes=[[390,844],[424,755],[768,1024],[1366,768],[1440,900]];
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jamanvaar-admin-audit-'));
let chrome,socket,sessionId,seq=0;const servers=[],pending=new Map(),checks=[],results=[],errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},session=sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression){for(let i=0;i<120;i++){if(await run(expression))return;await sleep(250);}throw Error('Not ready: '+expression+' '+errors.join('\n'));}
function check(pass,name,evidence){checks.push({name,pass,evidence});}
function contrast(a,b){const l=s=>{const c=s.match(/[\d.]+/g).slice(0,3).map(x=>{const v=Number(x)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function navigate(url,ready){await send('Page.navigate',{url});await until(ready);await sleep(350);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,`${phase}-${name}.png`),Buffer.from(r.data,'base64'));}
async function extraChecks(){
 for(const[width,height]of sizes){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const mode of ['order','restore']){
   await navigate(`http://127.0.0.1:5381/__audit__?mode=${mode}`,'Boolean(document.querySelector("[role=dialog] button"))');
   const r=await run(`(()=>{const d=document.querySelector('[role=dialog]'),buttons=[...d.querySelectorAll('button')];buttons.at(-1).scrollIntoView({block:'nearest'});const dr=d.getBoundingClientRect();return{overflow:d.scrollWidth>d.clientWidth,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return{text:b.textContent.trim(),disabled:b.disabled,right:r.right,width:r.width,withinDialog:r.left>=dr.left&&r.right<=dr.right};})};})()`);results.push({mode,width,height,...r});check(!r.overflow&&r.buttons.every(b=>b.withinDialog),`${mode} ${width}: every action remains inside dialog`,r);if(width===390)await shot(`extra-${mode}-390`);
  }
 }
 await navigate('http://127.0.0.1:5380/__audit__?mode=onboarding&theme=dark','Boolean(document.querySelector(".onboard-card"))');const theme=await run(`({card:getComputedStyle(document.querySelector('.onboard-card')).backgroundColor,title:getComputedStyle(document.querySelector('.form-section-title')).color,plan:getComputedStyle(document.querySelector('.plan-card-title')).color})`);check(theme.card==='rgb(20, 32, 46)','Onboarding card uses dark surface token',theme);check(theme.title==='rgb(232, 238, 246)'&&theme.plan==='rgb(232, 238, 246)','Onboarding text uses dark foreground tokens',theme);
 await navigate('http://127.0.0.1:5380/__audit__?mode=feature','Boolean(document.querySelector("input[type=checkbox]"))');
 check(await run(`document.querySelector('[role=dialog]').contains(document.activeElement)`),'Feature modal receives focus');
 await run(`document.querySelector('input[type=checkbox]').click()`);check(await run(`document.querySelector('input[type=checkbox]').checked`),'Dependency checkbox remains interactive');
 const focused=await run(`(()=>{const c=document.querySelector('.modal-close');c.focus();const s=getComputedStyle(c);return{focused:document.activeElement===c,outline:s.outlineStyle,width:s.outlineWidth};})()`);check(focused.focused&&focused.outline!=='none'&&parseFloat(focused.width)>0,'Keyboard focus remains visible',focused);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});check(await run(`document.querySelector('[role=dialog]').contains(document.activeElement)`),'Tab remains inside feature dialog');
 check(errors.length===0,'Extra components: no uncaught exceptions',errors);
}
async function main(){
 const {createServer}=await import('vite');
 for(const [name,relative,port]of[['super','cloud/super-admin-web',5380],['restaurant','apps/restaurant-system/pos-admin',5381]]){
  const app=path.join(root,relative),theme=(await import(pathToFileURL(path.join(app,'tailwind.config.js')).href)).default;
  process.chdir(app);
  const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),clearScreen:false,logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true},css:{postcss:{plugins:[require('tailwindcss')({...theme,content:[path.join(app,'src/**/*.{ts,tsx}'),path.join(root,'packages/ui/src/**/*.{ts,tsx}'),path.join(__dirname,'admin-consistency-fixtures/*.tsx')]}),require('autoprefixer')()]}},plugins:[{
   name:'admin-component-probes',enforce:'pre',
   configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__audit__?'))return next();try{const html=await server.transformIndexHtml('/__audit__','<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__audit_entry.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);}catch(e){next(e);}});},
   resolveId(id){if(id==='/__audit_entry.tsx')return path.join(app,'__audit_entry.tsx');},
   load(id){if(id===path.join(app,'__audit_entry.tsx').replaceAll('\\','/')||id===path.join(app,'__audit_entry.tsx'))return fs.readFileSync(path.join(__dirname,'admin-consistency-fixtures',name+'.tsx'),'utf8');}
  }]});await server.listen();servers.push(server);
 }
 chrome=spawn(path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1243/chrome-win64/chrome.exe'),['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<150&&!fs.existsSync(portFile);i++)await sleep(100);
 const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Fetch.requestPaused'){
  const u=new URL(m.params.request.url),allowed=['localhost','127.0.0.1'].includes(u.hostname)&&['5176','5180','5380','5381'].includes(u.port)&&!u.pathname.startsWith('/api/');
  void send(allowed?'Fetch.continueRequest':'Fetch.fulfillRequest',allowed?{requestId:m.params.requestId}:{requestId:m.params.requestId,responseCode:401,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:u.origin}],body:Buffer.from('{"message":"Signed out audit browser"}').toString('base64')},m.sessionId).catch(e=>errors.push(e.message));
 }});
 const target=await send('Target.createTarget',{url:'about:blank'});({sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}));await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 if(extra){await extraChecks();return;}
 for(const[width,height]of sizes){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const[name,url]of[['super','http://localhost:5180/login'],['restaurant','http://localhost:5176/']]){
   await navigate(url,'Boolean(document.querySelector("input[type=password],input[type=email]"))');
   const r=await run('({overflow:document.documentElement.scrollWidth>innerWidth,inputs:document.querySelectorAll("input").length,buttons:document.querySelectorAll("button").length,dialogs:document.querySelectorAll("[role=dialog]").length,url:location.pathname})');results.push({kind:'public',name,width,height,...r});check(!r.overflow,`${name} public ${width}: no horizontal overflow`,r);await shot(`${name}-public-${width}x${height}`);
  }
  for(const theme of ['light','dark']){
   await navigate(`http://127.0.0.1:5380/__audit__?theme=${theme}`,'Boolean(document.querySelector(".onboard-step-pill"))');
   const r=await run(`(()=>{const s=e=>getComputedStyle(document.querySelector(e)),probe=document.createElement('span');probe.style.backgroundColor='var(--jv-error-soft)';document.body.append(probe);const expectedErrorBg=getComputedStyle(probe).backgroundColor;probe.remove();return{overflow:document.documentElement.scrollWidth>innerWidth,gridWidth:document.querySelector('.settings-grid').getBoundingClientRect().width,cardWidth:document.querySelector('.settings-card').getBoundingClientRect().width,pillColor:s('.onboard-step-pill').color,pillBg:s('.onboard-step-pill').backgroundColor,errorBg:s('.empty-state').backgroundColor,expectedErrorBg,errorText:s('.empty-state p').color,font:s('[data-font-probe]').fontFamily};})()`);results.push({kind:'style-probe',name:'super',theme,width,height,...r});check(!r.overflow&&r.cardWidth<=r.gridWidth+1,`Settings grid ${theme} ${width} fits`,r);check(contrast(r.pillColor,r.pillBg)>=4.5,`Active onboarding step ${theme} ${width} contrast >=4.5`,r);check(r.errorBg===r.expectedErrorBg,`Error state ${theme} ${width} uses theme token`,r);check(r.font.includes('Plus Jakarta Sans'),`Super font ${width}`,r.font);if(width===390)await shot(`super-style-${theme}-${width}`);
  }
  await navigate('http://127.0.0.1:5380/__audit__?mode=feature','Boolean(document.querySelector("input[type=checkbox]"))');
  const feature=await run(`(()=>{const c=document.querySelector('input[type=checkbox]'),f=document.querySelector('.modal-actions'),r=f.getBoundingClientRect();return{checkboxHeight:c.getBoundingClientRect().height,footerBottom:r.bottom,footerPadding:getComputedStyle(f).paddingRight,closeWidth:document.querySelector('.modal-close').getBoundingClientRect().width};})()`);results.push({kind:'component',name:'feature-modal',width,height,...feature});check(feature.checkboxHeight<=20,`Feature checkbox ${width}: native size`,feature);check(parseFloat(feature.footerPadding)>=16,`Modal footer ${width}: padded`,feature);check(feature.closeWidth>=44,`Modal close ${width}: target >=44`,feature);if(width===390)await shot('super-feature-390');
  for(const mode of ['confirm','category']){
   await navigate(`http://127.0.0.1:5381/__audit__?mode=${mode}`,'Boolean(document.querySelector("[role=dialog] button"))');
   const r=await run(`(()=>{const d=document.querySelector('[role=dialog]'),bs=[...d.querySelectorAll('button')],cancel=bs.find(b=>b.textContent.trim()==='Cancel'),primary=bs.at(-1);return{cancelHeight:cancel.getBoundingClientRect().height,primaryHeight:primary.getBoundingClientRect().height,cancelFont:getComputedStyle(cancel).fontSize,primaryFont:getComputedStyle(primary).fontSize,overflow:d.scrollWidth>d.clientWidth,warningBg:document.querySelector('.bg-rose-50,.bg-amber-50')?getComputedStyle(document.querySelector('.bg-rose-50,.bg-amber-50')).backgroundColor:null};})()`);results.push({kind:'component',name:'restaurant-'+mode,width,height,...r});check(r.primaryHeight>=44&&Math.abs(r.primaryHeight-r.cancelHeight)<=1,`Restaurant ${mode} ${width}: aligned 44px actions`,r);check(r.primaryFont===r.cancelFont,`Restaurant ${mode} ${width}: matching action typography`,r);if(mode==='confirm')check(r.warningBg==='rgb(255, 251, 235)',`Non-destructive confirmation ${width}: warning palette`,r);check(!r.overflow,`Restaurant ${mode} ${width}: fits dialog`,r);if(width===390)await shot(`restaurant-${mode}-390`);
  }
 }
 await navigate('http://127.0.0.1:5381/__audit__?mode=motion','Boolean(document.querySelector("[data-motion-probe]"))');const motion=await run(`({animation:getComputedStyle(document.querySelector('[data-motion-probe]')).animationName,font:getComputedStyle(document.querySelector('[data-font-probe]')).fontFamily})`);results.push({kind:'style-probe',name:'restaurant-motion',...motion});check(motion.animation==='none','Restaurant pulse respects reduced motion',motion);check(motion.font.includes('Plus Jakarta Sans'),'Restaurant font matches root token',motion);
 await navigate('http://127.0.0.1:5380/__audit__?mode=modal','Boolean(document.querySelector(".modal-body"))');
 const tall=await run(`(()=>{const b=document.querySelector('.modal-body'),f=document.querySelector('.modal-actions'),before=f.getBoundingClientRect().bottom;b.scrollTop=b.scrollHeight;return{bodyScrolls:b.scrollHeight>b.clientHeight&&b.scrollTop>0,footerStable:Math.abs(before-f.getBoundingClientRect().bottom)<1,footerVisible:f.getBoundingClientRect().bottom<=innerHeight};})()`);results.push({kind:'component',name:'tall-modal',...tall});check(tall.bodyScrolls&&tall.footerStable&&tall.footerVisible,'Tall modal: body scrolls while actions remain visible',tall);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});check(await run("document.body.dataset.closed==='true'"),'Escape handler preserved');check(errors.length===0,'No uncaught browser exceptions',errors);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(output,`${phase}-${extra?'extra-':''}browser-results.json`),JSON.stringify({phase,checks,results,errors},null,2));console.log(JSON.stringify({phase,checks:checks.length,failed:checks.filter(c=>!c.pass).map(c=>c.name),errors}));try{if(socket?.readyState===1)await send('Browser.close',{},null);}catch{}socket?.close();chrome?.kill();for(const s of servers)await s.close();if(phase==='after'&&checks.some(c=>!c.pass))process.exitCode=1;});
