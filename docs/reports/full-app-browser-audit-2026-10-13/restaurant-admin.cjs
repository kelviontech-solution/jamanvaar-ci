const q=require('./qa.cjs');
async function main(){const p=await q.open('admin','owner-admin');await q.snap(p,'admin-login');
 await q.test(p,'Owner login and branch-bound Restaurant Admin activation',async()=>{
  await p.getByPlaceholder('e.g. JM9876543210').fill(q.state.restaurantA.restaurantCode);
  await p.getByPlaceholder('Enter owner password').fill(q.state.ownerPassword);
  const summary=p.getByText('Connecting a new device? Add your admin key',{exact:false});if(await summary.isVisible().catch(()=>false))await summary.click();
  const key=p.getByLabel('Admin activation key (optional)');if(await key.isVisible().catch(()=>false))await key.fill(q.state.keysA.POS_ADMIN.code);
  const response=p.waitForResponse(r=>/tenant-auth\/(login-owner|activate-device)$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');await p.getByRole('button',{name:'Sign In',exact:true}).click();const res=await response;if(res.status()!==200)throw Error('Owner login HTTP '+res.status());const body=await res.json();q.state.adminActivation=body;q.saveState();await p.waitForTimeout(2500);if(await p.getByRole('button',{name:'Connect & Continue',exact:true}).isVisible().catch(()=>false)){await p.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(q.state.keysA.POS_ADMIN.code);const connect=p.waitForResponse(r=>r.url().endsWith('/tenant-auth/activate-device'));await p.getByRole('button',{name:'Connect & Continue',exact:true}).click();const activated=await connect;if(activated.status()!==200)throw Error('Activation '+activated.status());q.state.adminActivation=await activated.json();q.saveState();}await p.waitForTimeout(3500);return {httpStatus:res.status(),branchBound:Boolean(q.state.adminActivation.branchId)};
 });
 const data=await q.snap(p,'admin-after-login');console.log(JSON.stringify({headings:data.headings,buttons:data.buttons.filter(x=>x.visible).map(x=>x.text),fields:data.fields}));await q.close();}
main().catch(async e=>{console.error(q.scrub(e.message));await q.close();process.exitCode=1;});
