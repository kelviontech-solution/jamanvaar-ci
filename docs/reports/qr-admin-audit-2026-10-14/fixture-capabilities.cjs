// Isolated test database only. Save originals so the audit can restore the baseline fixture.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'.jamanvaar/full-app-audit-2026-10-13');
const state=JSON.parse(fs.readFileSync(path.join(dir,'private-state.json')));
if(!new URL(state.databaseUrl).pathname.includes('test'))throw Error('Refusing non-test database');
require('@prisma/client');process.env.DATABASE_URL=state.databaseUrl;
const {PrismaService}=require(path.join(root,'cloud/api/dist/src/prisma/prisma.service'));
const prisma=new PrismaService();
const file=path.join(dir,'private-qr-audit-baseline.json');
async function main(){await prisma.$connect();
 if(process.argv.includes('restore')){const originals=JSON.parse(fs.readFileSync(file));await prisma.runAsTenant(state.restaurantA.id,async tx=>{for(const row of originals)await tx.applicationEntitlement.update({where:{id:row.id},data:{config:row.config}});});console.log('Restored isolated QR entitlement configuration');}
 else{const rows=await prisma.runAsTenant(state.restaurantA.id,tx=>tx.applicationEntitlement.findMany({where:{restaurantId:state.restaurantA.id,appCode:'QR_ORDERING'},select:{id:true,config:true}}));if(!rows.length)throw Error('No isolated QR entitlement');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(rows));const flags=Object.fromEntries(['ServiceRequests','ScheduledPickup','MenuAnalytics','Branding','GroupOrdering','KitchenCapacity','Loyalty','Multilingual','Promotions','MultiBranch','Feedback','SplitPayment','Notifications','OrderHistory','UsageLimits','InventorySync','Accessibility'].map(n=>['qr'+n,true]));await prisma.runAsTenant(state.restaurantA.id,async tx=>{for(const row of rows)await tx.applicationEntitlement.update({where:{id:row.id},data:{config:{...row.config,...flags}}});});console.log('Enabled optional capabilities in isolated QR fixture only');}
 await prisma.$disconnect();
}
main().catch(async e=>{console.error(e.message);await prisma.$disconnect();process.exitCode=1});
