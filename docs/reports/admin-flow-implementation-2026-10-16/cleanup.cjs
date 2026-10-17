const fs=require('fs'),path=require('path'),{PrismaClient}=require('@prisma/client');
const root=path.resolve(__dirname,'../../..'),state=JSON.parse(fs.readFileSync(path.join(root,'.jamanvaar/full-app-audit-2026-10-13/private-state.json')));
module.exports=async function cleanup(ids){
  if(!new URL(state.databaseUrl).pathname.includes('test'))throw Error('Cleanup requires the isolated test database');
  const prisma=new PrismaClient({datasources:{db:{url:state.databaseUrl}}});
  try{await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET LOCAL app.is_platform_context = 'true'");
    const restaurants=await tx.restaurant.findMany({where:{id:{in:ids}}});
    if(restaurants.some(r=>!['Garden House Flow QA','Kiosk-only Flow QA'].includes(r.name)))throw Error('Refusing to remove a non-QA restaurant');
    const planIds=(await tx.subscription.findMany({where:{restaurantId:{in:restaurants.map(r=>r.id)}}})).map(s=>s.planId);
    await tx.branchProductLicense.deleteMany({where:{restaurantId:{in:restaurants.map(r=>r.id)}}});
    await tx.restaurant.deleteMany({where:{id:{in:restaurants.map(r=>r.id)}}});
    await tx.plan.deleteMany({where:{id:{in:planIds},name:{startsWith:'QA Admin Flow '},subscriptions:{none:{}}}});
    await tx.plan.deleteMany({where:{id:{in:planIds},name:{startsWith:'Kiosk-only QA '},subscriptions:{none:{}}}});
  });}finally{await prisma.$disconnect();}
};
