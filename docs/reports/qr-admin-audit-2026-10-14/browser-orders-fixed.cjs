// Old bills must stay reachable outside the legacy latest-50 endpoint. Only isolated QA data is written.
const q = require('./qa.cjs');
const { admin, go, capture } = require('./browser-pages.cjs');
const { api } = require('./browser-features.cjs');
require('@prisma/client');
process.env.DATABASE_URL = q.state.databaseUrl;
if (!new URL(process.env.DATABASE_URL).pathname.includes('test')) throw Error('Test database required');
const { PrismaService } = require(q.path.join(q.root, 'cloud/api/dist/src/prisma/prisma.service'));
const prisma = new PrismaService(), prefix = 'qr-list-fixed-' + Date.now();
async function main() {
  await prisma.$connect();
  const p = await admin();
  try {
    await prisma.runAsTenant(q.state.restaurantA.id, tx => tx.syncedOrder.createMany({data: Array.from({length:61}, (_,i) => ({
      restaurantId:q.state.restaurantA.id, branchId:q.state.branchA.id, externalOrderId:prefix+'-'+i,
      orderType:'DINE_IN', source:'QR', status:i===60?'READY':'COMPLETED', paymentStatus:i===60?'PENDING':'SUCCESS',
      paymentMethod:'CASH_AT_COUNTER', createdAt:new Date(i===60?'2024-01-01T00:00:00Z':'2025-01-01T00:00:00Z'),
      subtotal:10000, taxAmount:0, totalAmount:10000,
      items:[{name:'Audit old counter bill',quantity:1,unitPrice:10000,lineTotal:10000}],
      meta:{tokenNumber:'OLD-BILL-'+i,customerName:'Old bill verification'}
    }))}));
    await go(p,'ORDERS');
    await p.getByLabel('Order status',{exact:true}).selectOption('READY');
    await p.getByLabel('Order / table / guest',{exact:true}).fill(prefix+'-60');
    await q.expect(p.getByRole('heading',{name:'OLD-BILL-60',exact:true})).toBeVisible();
    await capture(p,'fixed-older-unpaid-bill');
    const first=await api('/api/v1/restaurant/qr/order-list?view=ALL&search='+prefix);
    q.expect(first.status).toBe(200);q.expect(first.body.total).toBe(61);q.expect(first.body.rows.length).toBe(50);
    const second=await api('/api/v1/restaurant/qr/order-list?view=ALL&search='+prefix+'&cursor='+encodeURIComponent(first.body.nextCursor));
    q.expect(second.body.rows.length).toBe(11);
    const result={olderBillVisible:true,pages:[50,11],matchingTotal:61};
    q.fs.writeFileSync(q.path.join(q.reportDir,'evidence','older-bill-verification.json'),JSON.stringify(result,null,2));
    console.log('PASS older unpaid bill is visible; history paginates 50 + 11');
  } finally {
    await prisma.runAsTenant(q.state.restaurantA.id,tx=>tx.syncedOrder.deleteMany({where:{restaurantId:q.state.restaurantA.id,externalOrderId:{startsWith:prefix}}}));
    await prisma.$disconnect();await q.close();
  }
}
main().catch(async e=>{console.error(q.scrub(e.message));await prisma.$disconnect();await q.close();process.exitCode=1;});
