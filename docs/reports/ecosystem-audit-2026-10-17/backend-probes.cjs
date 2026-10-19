const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
require('dotenv').config({path:path.join(root,'cloud/api/.env')});
const original=process.env.TEST_DATABASE_URL;if(!original||!/test/i.test(new URL(original).pathname))throw Error('Dedicated test database required');
const url=new URL(original);url.pathname='/jamanvaar_ecosystem_audit_test_20261017_c3f1';
process.env.DATABASE_URL=url.toString();process.env.NODE_ENV='test';
require('ts-node').register({project:path.join(root,'cloud/api/tsconfig.json'),transpileOnly:true});
require('reflect-metadata');
const {PrismaService}=require(path.join(root,'cloud/api/src/prisma/prisma.service.ts'));
const {ReportsService}=require(path.join(root,'cloud/api/src/modules/reports/reports.service.ts'));
const {EntitySyncService}=require(path.join(root,'cloud/api/src/modules/entity-sync/entity-sync.service.ts'));
const {BackupsService}=require(path.join(root,'cloud/api/src/modules/backups/backups.service.ts'));
const prisma=new PrismaService(),observations=[];
async function main(){
 await prisma.$connect();
 const role=await prisma.$queryRawUnsafe('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
 if(role[0].rolsuper||role[0].rolbypassrls)throw Error('RLS bypass role is not valid audit evidence');
 const tables=await prisma.$queryRawUnsafe("SELECT t.table_name,c.relrowsecurity,c.relforcerowsecurity FROM information_schema.columns t JOIN pg_class c ON c.relname=t.table_name JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' WHERE t.table_schema='public' AND t.column_name='restaurantId' ORDER BY t.table_name");
 observations.push({name:'Tenant-table RLS metadata',tenantTables:tables.length,withoutForcedRls:tables.filter(r=>!r.relrowsecurity||!r.relforcerowsecurity)});
 await prisma.runAsPlatform(async tx=>{
  const restaurant=await tx.restaurant.create({data:{name:'ECOSYSTEM AUDIT UNCOMMITTED PROBE',restaurantCode:'QA'+crypto.randomUUID()}});
  const rid=restaurant.id;
  // All probe rows stay in this transaction and are deleted before commit. The wrappers keep
  // application services in the same transaction; this is not an HTTP authorization test.
  const scoped={runAsPlatform:fn=>fn(tx),runAsTenant:(_rid,fn)=>fn(tx),platformDb:tx};
  const audit={log:async()=>{}},bus={publish(){},publishInvalidation(){}},config={get(){return undefined;}};
  try{
   const entities=new EntitySyncService(scoped,audit,bus,{});
   const category='audit-'+crypto.randomUUID();
   const future=await entities.pushEventsForRestaurant(rid,'MENU_CATEGORY',[{externalId:category,payload:{id:category,name:'Future-clock edit',isActive:true,sortOrder:0,updatedAt:'2050-01-01T00:00:00.000Z'}}]);
   const normal=await entities.pushEventsForRestaurant(rid,'MENU_CATEGORY',[{externalId:category,payload:{id:category,name:'Corrected now',isActive:true,sortOrder:0,updatedAt:new Date().toISOString()}}]);
   const cat=await tx.syncedEntity.findUniqueOrThrow({where:{restaurantId_entityType_externalId:{restaurantId:rid,entityType:'MENU_CATEGORY',externalId:category}}});
   observations.push({name:'Future-clock edit suppresses a later real-time correction',first:future.results[0],second:normal.results[0],persistedName:cat.payload.name});
   const order=await tx.syncedOrder.create({data:{restaurantId:rid,externalOrderId:crypto.randomUUID(),publicOrderId:'qa-public-'+crypto.randomUUID(),source:'QR',orderType:'DINE_IN',status:'COMPLETED',paymentStatus:'PARTIALLY_REFUNDED',paymentMethod:'CASH',subtotal:10000,taxAmount:0,totalAmount:10000,discountAmount:0,items:[{externalItemId:'line',name:'Audit meal',quantity:1,unitPrice:10000,lineTotal:10000}],createdAt:new Date('2026-10-01T12:00:00Z'),meta:{currency:'INR',refundAmountPaise:2000}}});
   await tx.orderPaymentEntry.createMany({data:[{restaurantId:rid,orderId:order.id,kind:'COLLECTION',amount:10000,method:'CASH',reference:'audit-collect-'+order.id},{restaurantId:rid,orderId:order.id,kind:'REFUND',amount:2000,method:'CASH',reference:'audit-refund-'+order.id}]});
   const report=await new ReportsService(scoped).getRestaurantSales(rid,{from:'2026-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z'});
   observations.push({name:'Partial-refund sales classification',originalPaise:10000,refundPaise:2000,netCollectedPaise:8000,reported:report.totals});
   const date=new Date('2026-10-01T20:00:00.000Z');
   await tx.syncedOrder.create({data:{restaurantId:rid,externalOrderId:crypto.randomUUID(),source:'POS',orderType:'TAKEAWAY',status:'COMPLETED',paymentStatus:'SUCCESS',paymentMethod:'CASH',subtotal:5000,taxAmount:0,totalAmount:5000,discountAmount:0,items:[],createdAt:date}});
   await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
   const dayReport=await new ReportsService(scoped).getRestaurantSales(rid,{from:'2026-10-01T00:00:00Z',to:'2026-10-03T00:00:00Z'});
   observations.push({name:'Sales day uses database date rather than restaurant local date',restaurantTimezone:restaurant.timezone,independentLocalDate:new Intl.DateTimeFormat('en-CA',{timeZone:restaurant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date),reportedDays:dayReport.byDay.map(d=>d.date)});
   const backups=new BackupsService(scoped,{},audit,config,bus);
   const snapshot=await backups.buildRestaurantSnapshot(rid,'audit');
   observations.push({name:'Restaurant snapshot financial scope',includesSyncedOrders:snapshot.syncedOrders.length,includesOrderPaymentEntries:Object.hasOwn(snapshot,'orderPaymentEntries'),includesGatewayPayments:Object.hasOwn(snapshot,'paymentTransactions'),includesInventoryMovements:Object.hasOwn(snapshot,'inventoryMovements')});
   await tx.syncedOrder.delete({where:{id:order.id}});
   const before=await tx.syncedEntity.update({where:{id:cat.id},data:{payload:{...cat.payload,name:'Current menu'}}});
   const backup=await tx.backup.create({data:{restaurantId:rid,sizeBytes:1,storageKey:'audit-no-external-object',checksumSha256:'audit-only'}});
   const job=await tx.backupRestoreJob.create({data:{restaurantId:rid,backupId:backup.id,targetType:'STAGING_PREVIEW',status:'PREVIEW_READY',initiatedById:'audit-actor'}});
   backups.inspectStoredBackup=async()=>({ok:true,parsed:snapshot});
   backups.triggerForRestaurant=async()=>({id:'audit-safety-fixture'});
   // Storage verification and safety backup are stubbed; the actual executeRestore DB loop is exercised.
   await backups.executeRestore(job.id,true,{id:'audit-actor'});
   const restored=await tx.syncedOrder.findUniqueOrThrow({where:{restaurantId_externalOrderId:{restaurantId:rid,externalOrderId:order.externalOrderId}}});
   const after=await tx.syncedEntity.findUniqueOrThrow({where:{id:cat.id}});
   observations.push({name:'Restore of a missing QR operational order',originalSource:order.source,restoredSource:restored.source,publicOrderIdPreserved:restored.publicOrderId===order.publicOrderId,createdAtPreserved:restored.createdAt.getTime()===order.createdAt.getTime(),restoredPaymentEntries:await tx.orderPaymentEntry.count({where:{restaurantId:rid,orderId:restored.id}})});
   observations.push({name:'Entity restore cursor hypothesis rejected',before:before.seq,after:after.seq,cursorAdvancedByDatabaseTrigger:after.seq>before.seq});
  }finally{await tx.restaurant.delete({where:{id:rid}});}
 });
}
main().catch(e=>{observations.push({harnessError:e.message});process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();const data={at:new Date().toISOString(),scope:'Actual service/database-loop probes in one uncommitted disposable transaction. Not HTTP authorization or physical disaster-recovery acceptance.',observations};fs.writeFileSync(path.join(__dirname,'BACKEND_PROBES.json'),JSON.stringify(data,null,2));console.log(JSON.stringify(data,null,2));});
