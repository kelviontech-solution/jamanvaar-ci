// Temporary old orders on the isolated test tenant; removed even when an assertion fails.
const q=require('./qa.cjs');const {admin,go,capture}=require('./browser-pages.cjs');const {api}=require('./browser-features.cjs');
require('@prisma/client');process.env.DATABASE_URL=q.state.databaseUrl;
if(!new URL(process.env.DATABASE_URL).pathname.includes('test'))throw Error('Test database required');
const {PrismaService}=require(q.path.join(q.root,'cloud/api/dist/src/prisma/prisma.service'));const prisma=new PrismaService();
const prefix='qr-list-audit-'+Date.now();
async function main(){await prisma.$connect();const p=await admin();
 try {
  await prisma.runAsTenant(q.state.restaurantA.id,tx=>tx.syncedOrder.createMany({data:Array.from({length:61},(_,i)=>({restaurantId:q.state.restaurantA.id,branchId:q.state.branchA.id,externalOrderId:prefix+'-'+i,orderType:'DINE_IN',source:'QR',status:i===60?'READY':'COMPLETED',paymentStatus:i===60?'PENDING':'SUCCESS',paymentMethod:'CASH_AT_COUNTER',createdAt:new Date(i===60?'2024-01-01T00:00:00Z':'2025-01-01T00:00:00Z'),subtotal:10000,taxAmount:0,totalAmount:10000,items:[{name:'Audit list limit',quantity:1,unitPrice:10000,lineTotal:10000}],meta:{tokenNumber:'LIMIT-'+i,customerName:'List audit guest'}}))}));
  const normal=await api('/api/v1/restaurant/qr/orders'),larger=await api('/api/v1/restaurant/qr/orders?limit=200');
  await go(p,'ORDERS');await p.getByLabel('Order status',{exact:true}).selectOption('READY');await capture(p,'older-unpaid-order-hidden');
  const result={normalStatus:normal.status,defaultRows:normal.body.length,explicitLimitRows:larger.body.length,oldPendingInDefault:normal.body.some(o=>o.id===prefix+'-60'),oldPendingInLarger:larger.body.some(o=>o.id===prefix+'-60'),uiShowsOldPending:await p.getByRole('heading',{name:'LIMIT-60',exact:true}).count()>0};
  q.append('observations.jsonl',{name:'Latest-order cap hides an older pending counter bill',result});console.log(JSON.stringify(result));
 } finally {await prisma.runAsTenant(q.state.restaurantA.id,tx=>tx.syncedOrder.deleteMany({where:{restaurantId:q.state.restaurantA.id,externalOrderId:{startsWith:prefix}}}));await prisma.$disconnect();await q.close();}
}
main().catch(async e=>{console.error(q.scrub(e.message));await prisma.$disconnect();await q.close();process.exitCode=1});
