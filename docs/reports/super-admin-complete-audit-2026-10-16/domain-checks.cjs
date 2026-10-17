const q=require('../qr-admin-audit-2026-10-14/qa.cjs'),{PrismaClient}=require('@prisma/client');
const dir=q.path.join(__dirname,'evidence'),base=process.env.JAMANVAAR_QA_API_BASE||'http://localhost:4015';
const observations=[],planIds=[];let token,prisma,restaurantId;
async function api(method,path,data,allowFailure=false){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});const body=await response.json();if(!response.ok&&!allowFailure)throw Error(path+' '+response.status+' '+q.scrub(JSON.stringify(body)).slice(0,250));return {status:response.status,body};}
async function platform(fn){return prisma.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL app.is_platform_context = 'true'");return fn(tx);});}
async function main(){
  if(!new URL(q.state.databaseUrl).pathname.includes('test'))throw Error('Isolated test database required');
  prisma=new PrismaClient({datasources:{db:{url:q.state.databaseUrl}}});
  const login=await api('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword});const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json')));token=(await api('POST','/api/v1/platform-auth/verify-otp',{otpToken:login.body.otpToken,otp:mail[q.state.platformEmail].otp})).body.accessToken;
  const stamp=Date.now();const restaurant=(await api('POST','/api/v1/restaurants',{name:'Garden House Flow QA',mobile:'9'+String(stamp).slice(-9),ownerName:'QA Domain Audit',ownerEmail:'domain-audit-'+stamp+'@example.invalid',ownerPassword:q.state.ownerPassword,skipInviteEmail:true})).body;restaurantId=restaurant.restaurant.id;
  for(const family of ['RESTAURANT','KIOSK']){const plan=(await api('POST','/api/v1/plans',{name:'QA Admin Flow Domain '+family+' '+stamp,productFamily:family,tier:'CORE',priceMonthly:100,maxBranches:2,maxDevices:5,maxUsers:5,entitlements:{menuManagement:true,posTerminal:family==='RESTAURANT',restaurantAdmin:family==='RESTAURANT',selfOrderKiosk:family==='KIOSK'}})).body;planIds.push(plan.id);}
  const expiresAt=new Date(Date.now()+86400000).toISOString();
  const rest=(await api('POST','/api/v1/subscriptions',{restaurantId,planId:planIds[0],status:'ACTIVE',expiresAt,applications:['POS','POS_ADMIN']})).body;
  const kiosk=(await api('POST','/api/v1/subscriptions',{restaurantId,planId:planIds[1],status:'ACTIVE',expiresAt,applications:['KIOSK','KIOSK_ADMIN']})).body;
  const before=(await api('GET',`/api/v1/restaurants/${restaurantId}/applications`)).body;
  const toggle=await api('PATCH',`/api/v1/subscriptions/${kiosk.id}/applications/POS`,{enabled:false});
  const after=(await api('GET',`/api/v1/restaurants/${restaurantId}/applications`)).body;
  observations.push({name:'Merged product row edited through newest subscription can leave the effective grant unchanged',httpStatus:toggle.status,beforeEnabled:before.find(r=>r.appCode==='POS')?.enabled,afterEnabled:after.find(r=>r.appCode==='POS')?.enabled,editedFamily:'KIOSK',grantingFamily:'RESTAURANT'});
  const crossFamily=await api('PATCH',`/api/v1/subscriptions/${kiosk.id}/change-plan`,{planId:planIds[0]},true);
  const subscriptions=(await api('GET','/api/v1/subscriptions')).body.filter(s=>s.restaurantId===restaurantId&&s.status==='ACTIVE');
  observations.push({name:'Changing plan family can create two active subscriptions for the same restaurant/product family',httpStatus:crossFamily.status,activeFamilies:subscriptions.map(s=>s.plan.productFamily)});
  await api('PATCH',`/api/v1/subscriptions/${rest.id}/suspend`,{});
  const renewed=await api('PATCH',`/api/v1/subscriptions/${rest.id}/renew`,{expiresAt:new Date(Date.now()+172800000).toISOString()});
  observations.push({name:'Renewing a suspended subscription changes it to ACTIVE without the separate reactivate action',httpStatus:renewed.status,status:renewed.body.status});
  const entityId='audit-dish-'+stamp;
  const conflict=await platform(async tx=>{await tx.syncedEntity.create({data:{restaurantId,entityType:'MENU_ITEM',externalId:entityId,payload:{name:'Cloud value',price:100}}});return tx.syncConflict.create({data:{restaurantId,branchId:restaurant.branch.id,entityType:'MENU_ITEM',entityId,localVersion:{name:'Local value',price:120},cloudVersion:{name:'Cloud value',price:100},reason:'QA audit controlled conflict'}});});
  const resolved=await api('POST',`/api/v1/platform/telemetry/conflicts/${conflict.id}/resolve`,{strategy:'LOCAL_WINS'});
  const entity=await platform(tx=>tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId,entityType:'MENU_ITEM',externalId:entityId}}}));
  observations.push({name:'LOCAL_WINS resolves conflict metadata without applying local record',httpStatus:resolved.status,resolution:resolved.body.resolution,storedPrice:entity.payload.price,localPrice:120});
  const invalid=await api('POST',`/api/v1/platform/telemetry/conflicts/${conflict.id}/resolve`,{strategy:'QA_INVALID_STRATEGY'},true);
  observations.push({name:'Conflict resolution endpoint accepts an invalid strategy and re-resolves an already resolved conflict',httpStatus:invalid.status,resolution:invalid.body.resolution});
  console.log(JSON.stringify(observations,null,2));
}
main().catch(e=>{console.log('DOMAIN_AUDIT_ERROR',q.scrub(e.message).slice(0,600));process.exitCode=1;}).finally(async()=>{q.fs.writeFileSync(q.path.join(dir,'domain-results.json'),JSON.stringify({at:new Date().toISOString(),observations},null,2));if(restaurantId)await require('../admin-flow-implementation-2026-10-16/cleanup.cjs')([restaurantId]);if(prisma){await platform(tx=>tx.plan.deleteMany({where:{id:{in:planIds},name:{startsWith:'QA Admin Flow Domain'},subscriptions:{none:{}}}}));await prisma.$disconnect();}});
