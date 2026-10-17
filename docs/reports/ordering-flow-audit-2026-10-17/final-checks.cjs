const a=require('./audit.cjs');
const rows=[];let p;
async function check(name,fn){try{const result=await fn();rows.push({name,result});console.log('CHECK',name,JSON.stringify(result));}catch(e){rows.push({name,harnessError:a.q.scrub(e.message)});console.log('CHECK_ERROR',name,a.q.scrub(e.message).slice(0,240));await a.snap('final-check-failure-'+rows.length).catch(()=>{});}}
async function main(){
 await a.open('qr',{width:390,height:844});p=a.page;
 await p.route('**/api/v1/public/qr/*',async r=>{if(r.request().method()!=='GET'||new URL(r.request().url()).pathname.split('/').filter(Boolean).length!==5)return r.continue();const response=await r.fetch();const d=await response.json();if(d.advanced)d.advanced.recommendationIds=[a.state.dishes[0].id];await r.fulfill({response,json:d});});
 await p.reload();await p.getByRole('button',{name:'Add Paneer Bowl',exact:true}).waitFor();
 await check('Dietary filter leaves an incompatible recommendation actionable',async()=>{await p.getByRole('button',{name:'JAIN',exact:true}).click();await a.snap('qr-jain-recommendation');return {jainDishVisible:await p.getByRole('button',{name:'Add Jain Dal',exact:true}).count(),paneerHiddenFromMainList:await p.getByRole('button',{name:'Add Paneer Bowl',exact:true}).count()===0,paneerRecommendationVisible:await p.getByRole('button',{name:'Add recommended Paneer Bowl',exact:true}).isVisible()};});
 await a.close();
 await a.pos();p=a.page;await p.getByRole('button',{name:'Billing',exact:true}).first().click();
 const restore=p.getByRole('button',{name:'Restore Order',exact:true});if(await restore.isVisible().catch(()=>false))await restore.click();
 const take=p.getByRole('button',{name:'Takeaway',exact:true}).first();if(await take.isVisible().catch(()=>false))await take.click();
 const clear=p.getByTitle('Clear Cart',{exact:true});if(await clear.isEnabled().catch(()=>false)){await clear.click();await p.getByRole('button',{name:'Yes',exact:true}).click();}
 const before=await a.device('GET','/api/v1/orders/sync?afterSeq=0');const ids=new Set(before.orders.map(o=>o.externalOrderId));
 await check('POS bills offline and synchronizes one canonical order after reconnection',async()=>{await p.context().setOffline(true);await p.getByText('Seasonal Special 18',{exact:true}).first().click();await p.getByRole('button',{name:/^PAY /}).first().click();await p.getByRole('button',{name:'Confirm and settle payment',exact:true}).click();await p.waitForTimeout(500);const screenshot=await a.snap('pos-offline-receipt');await p.context().setOffline(false);let found=[];for(let i=0;i<15;i++){const all=await a.device('GET','/api/v1/orders/sync?afterSeq=0');found=all.orders.filter(o=>!ids.has(o.externalOrderId));if(found.length)break;await p.waitForTimeout(700);}return {receiptVisible:screenshot.text.includes('BILL / RECEIPT'),newCanonicalOrderCount:found.length,orders:found.map(o=>({source:o.meta?.sourceType,paymentStatus:o.paymentStatus,totalPaise:o.totalAmount}))};});
}
main().catch(e=>rows.push({fatal:a.q.scrub(e.message)})).finally(async()=>{a.q.fs.writeFileSync(a.q.path.join(a.dir,'FINAL_CHECKS.json'),a.q.scrub(JSON.stringify({rows},null,2)));await a.close();});

