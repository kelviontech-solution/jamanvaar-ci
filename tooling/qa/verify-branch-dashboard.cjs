// Verify the compiled production aggregation with real RLS and disposable QA
// data. This measures service/database time, not HTTP/browser or AWS latency.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'docs/reports/multi-branch-2026-10-07');
const state=JSON.parse(fs.readFileSync(path.join(root,'.jamanvaar/browser-audit/private-state.json')));
if(!/test/i.test(new URL(state.databaseUrl).pathname))throw Error('Dedicated QA database required');
const {Prisma}=require('@prisma/client');
process.env.DATABASE_URL=state.databaseUrl;process.env.NODE_ENV='test';
require('reflect-metadata');
const {PrismaService}=require(path.join(root,'cloud/api/dist/src/prisma/prisma.service'));
const {TenantDashboardService}=require(path.join(root,'cloud/api/dist/src/modules/dashboard/tenant-dashboard.service'));
const prisma=new PrismaService(),service=new TenantDashboardService(prisma),rid=crypto.randomUUID(),results=[],durations=[];
let created=false;
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
async function main(){
  await prisma.$connect();
  await prisma.runAsPlatform(tx=>tx.restaurant.create({data:{id:rid,name:'TEST Compiled Branch Dashboard',timezone:'Asia/Kolkata'}}));created=true;
  const branches=await prisma.runAsTenant(rid,async tx=>{
    const list=[];for(let i=0;i<5;i++)list.push(await tx.branch.create({data:{restaurantId:rid,name:'QA Branch '+(i+1),code:'B'+(i+1)}}));return list;
  });
  const owner=await prisma.runAsTenant(rid,tx=>tx.user.create({data:{restaurantId:rid,email:rid+'@example.invalid',fullName:'QA Owner',role:'OWNER',status:'ACTIVE',passwordHash:'unused-test-only'}}));
  await prisma.runAsTenant(rid,async tx=>{
    const ids=Prisma.sql`ARRAY[${Prisma.join(branches.map(b=>b.id))}]::text[]`;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "SyncedOrder" (id,"restaurantId","branchId","externalOrderId","orderType",status,"paymentStatus","paymentMethod",source,items,subtotal,"taxAmount","totalAmount","createdAt","updatedAt")
      SELECT md5(${rid}||'-order-'||n::text)::uuid::text,${rid},(${ids})[1+n%5],'scale-'||n::text,'TAKEAWAY','COMPLETED','SUCCESS','CASH','POS',
      '[{"externalItemId":"tea","name":"Masala Tea","quantity":1,"lineTotal":100}]'::jsonb,100,0,100,timezone('UTC',now()),timezone('UTC',now()) FROM generate_series(0,9999) n`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "Device" (id,"restaurantId","branchId",type,status,name,"lastSeenAt","updatedAt")
      SELECT md5(${rid}||'-device-'||n::text)::uuid::text,${rid},(${ids})[1+n%5],'POS'::"DeviceType",'ACTIVE'::"DeviceStatus",'Scale terminal '||n::text,
      timezone('UTC',now()),timezone('UTC',now()) FROM generate_series(0,1000) n`);
    for(const [n,source] of ['POS','CAPTAIN','KIOSK','QR'].entries())await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[n].id,externalOrderId:'source-'+source,source,status:'COMPLETED',orderType:'TAKEAWAY',paymentStatus:'SUCCESS',items:[{name:'Meal',quantity:1,lineTotal:10000}],subtotal:10000,taxAmount:0,totalAmount:10000}});
    await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'partial',source:'POS',status:'REFUNDED',orderType:'TAKEAWAY',paymentStatus:'SUCCESS',items:[{name:'Meal',quantity:1,lineTotal:10055}],subtotal:10055,taxAmount:0,totalAmount:10055,meta:{refundAmountPaise:3025}}});
    await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'unpaid',source:'KIOSK',status:'PREPARING',orderType:'TAKEAWAY',items:[],subtotal:2500,taxAmount:0,totalAmount:2500}});
    await tx.syncedOrder.create({data:{restaurantId:rid,branchId:branches[0].id,externalOrderId:'cancelled',source:'KIOSK',status:'CANCELLED',orderType:'TAKEAWAY',paymentStatus:'SUCCESS',items:[],subtotal:90000,taxAmount:0,totalAmount:90000}});
    await tx.device.update({where:{id:crypto.createHash('md5').update(rid+'-device-1000').digest('hex').replace(/^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,'$1-$2-$3-$4-$5')},data:{name:'ZZ hidden locked terminal',isLocked:true}});
  });
  let last;
  await check('10,000 sales reconcile exactly across all branches and charts',async()=>{
    for(let i=0;i<3;i++){const at=performance.now();last=await service.get(owner,{period:'TODAY'});durations.push(Math.round(performance.now()-at));assert.equal(last.summary.sales,10470.3);assert.ok(Math.abs(last.byBranch.reduce((n,b)=>n+b.sales,0)-10470.3)<0.000001);assert.ok(Math.abs(last.bySource.reduce((n,b)=>n+b.sales,0)-10470.3)<0.000001);}
  });
  await check('partial refunds and null unpaid states retain exact cents',async()=>{assert.equal(last.summary.refunds,30.25);assert.equal(last.summary.pendingAmount,25);assert.equal(last.summary.pendingPayments,1);});
  await check('fleet totals and fault alerts include devices beyond the detail cap',async()=>{assert.equal(last.devices.length,1000);assert.equal(last.devicesTruncated,true);assert.equal(last.deviceCounts.reduce((n,d)=>n+d.total,0),1001);assert.ok(last.alerts.some(a=>a.title==='ZZ hidden locked terminal'));});
  await check('each branch returns its own sales and devices',async()=>{for(let i=0;i<5;i++){const data=await service.get(owner,{branchId:branches[i].id});assert.equal(data.byBranch.length,1);assert.equal(data.summary.sales,i===0?2170.3:i===4?2000:2100);assert.ok(data.devices.every(d=>d.branchId===branches[i].id));}});
  await check('all four order-source filters agree with consolidated totals',async()=>{for(const source of ['POS','CAPTAIN','KIOSK','QR']){const data=await service.get(owner,{source});assert.equal(data.summary.sales,source==='POS'?10170.3:100);assert.ok(data.bySource.every(s=>s.source===source));}});
  await check('manager scope cannot request consolidated or foreign branch data',async()=>{const manager={...owner,role:'MANAGER',branchId:branches[0].id};assert.equal((await service.get(manager,{})).scope.branchId,branches[0].id);await assert.rejects(service.get(manager,{branchId:'all'}));await assert.rejects(service.get(owner,{branchId:crypto.randomUUID()}));});
  await check('three measured aggregate reads each remain below five seconds',async()=>{assert.ok(Math.max(...durations)<5000,'Measured reads: '+durations.join(', ')+' ms');});
}
main().catch(e=>{results.push({name:'verification failure',status:'FAIL',error:e.message});console.error(e.message);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(report,'COMPILED_DASHBOARD_RESULTS.json'),JSON.stringify({environment:'dedicated local QA database',compiledProductionService:true,additionalOrders:10000,additionalDevices:1001,serviceRequestMs:durations,productionAwsMeasured:false,results},null,2));
  if(created)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:rid}}));await prisma.$disconnect();
});
