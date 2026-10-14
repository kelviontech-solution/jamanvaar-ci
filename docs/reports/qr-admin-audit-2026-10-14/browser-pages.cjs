const q=require('./qa.cjs');
const fs=require('node:fs');
const tabs=['OVERVIEW','ORDERS','SERVICE','MENU','TABLES','DESIGN','BRAND','PAYMENTS','RULES','PICKUP','SETTINGS','ADVANCED','ANALYTICS','PERFORMANCE'];
const features=['Translations','Promotions','Feedback','Alerts','Collections','License'];
async function admin(){
 const p=await q.open('admin','owner-admin');
 const again=p.getByRole('button',{name:'Sign in again',exact:true});if(await again.isVisible().catch(()=>false))await again.click();
 const pass=p.getByPlaceholder('Enter owner password');if(await pass.isVisible().catch(()=>false)){await p.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode);await pass.fill(q.state.ownerPassword);await p.getByRole('button',{name:'Sign In',exact:true}).click();}
 await p.getByLabel('Branch workspace',{exact:true}).first().waitFor();
 await p.goto('http://localhost:5316/qr/admin/',{waitUntil:'domcontentloaded'});
 await p.getByLabel('QR Admin branch',{exact:true}).waitFor();
 await p.getByLabel('QR Admin branch',{exact:true}).selectOption(q.state.branchA.id);
 await p.getByTestId('qr-console').waitFor();
 return p;
}
async function go(p,tab,feature){await p.goto('http://localhost:5316/qr/admin/?tab='+tab+(feature?'&feature='+feature:''),{waitUntil:'domcontentloaded'});await p.getByTestId('qr-console').waitFor();await p.waitForFunction(()=>!document.body.innerText.includes('Loading licensed QR capabilities')&&!document.body.innerText.includes('Checking your current access'));await p.waitForTimeout(650);}
async function capture(p,key){
 const d=await q.snap(p,key);
 d.buttons=await p.evaluate(()=>[...document.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent?.trim(),aria:e.getAttribute('aria-label'),title:e.title,disabled:e.matches(':disabled'),width:Math.round(r.width),height:Math.round(r.height),visible:e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth};}));
 d.unlabelledButtons=d.buttons.filter(b=>b.visible&&!b.text&&!b.aria&&!b.title).length;
 d.formControls=await p.evaluate(()=>[...document.querySelectorAll('main input,main select,main textarea')].map((e,i)=>({index:i,tag:e.tagName,type:e.type,label:e.getAttribute('aria-label') || (e.labels?[...e.labels].map(l=>l.textContent).join(' '):''),placeholder:e.placeholder,disabled:e.disabled,value:e.type==='password'?'[REDACTED]':e.value,options:e.options?[...e.options].map(o=>({value:o.value,text:o.text})):undefined})));
 d.smallTargets=d.buttons.filter(b=>b.visible&&!b.disabled&&(b.height<40||b.width<30));
 d.branch=await p.getByLabel('QR Admin branch',{exact:true}).count() ? await p.getByLabel('QR Admin branch',{exact:true}).inputValue() : null;
 fs.writeFileSync(q.path.join(q.reportDir,'evidence',key+'.json'),q.scrub(JSON.stringify(d,null,2)));return d;
}
async function main(){const p=await admin();const rows=[];
 for(const [tab,feature] of [...tabs.map(t=>[t]),...features.map(f=>['ADVANCED',f])]){
 const key=(process.argv.includes('enabled')?'licensed-':'')+(feature||tab);console.log('PAGE',key);await go(p,tab,feature);
  for(const [suffix,w,h] of [['desktop',1440,960],['tablet',768,1024],['phone',390,844]]){await p.setViewportSize({width:w,height:h});await p.waitForTimeout(130);const d=await capture(p,key+'-'+suffix);rows.push({page:key,viewport:suffix,overflow:d.overflow,unnamedButtons:d.unlabelledButtons,duplicateIds:d.duplicateIds,smallTargets:d.smallTargets.length,headings:d.headings,alertText:await p.getByRole('alert').allTextContents()});}
  await p.setViewportSize({width:1440,height:960});
 }
 fs.writeFileSync(q.path.join(q.reportDir,'evidence',process.argv.includes('enabled')?'licensed-page-matrix.json':'page-matrix.json'),JSON.stringify(rows,null,2));
 console.log('CAPTURED',rows.length,'page/viewport states');await q.close();
}
if(require.main===module)main().catch(async e=>{console.error(q.scrub(e.message));await q.close();process.exitCode=1});
module.exports={admin,go,capture};
