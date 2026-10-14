const q=require('./qa.cjs');
async function main(){
 const login=await q.mustApi('POST','/api/v1/platform-auth/login',{email:q.state.platformEmail,password:q.state.platformPassword},null);
 const mail=JSON.parse(q.fs.readFileSync(q.path.join(q.privateDir,'private-mail.json'),'utf8'));
 const auth=await q.mustApi('POST','/api/v1/platform-auth/verify-otp',{otpToken:login.otpToken,otp:mail[q.state.platformEmail].otp},null);q.state.platformToken=auth.accessToken;
 q.state.ownerPassword='Qa9!'+q.state.ownerPassword;
 for(const suffix of ['A','B']){
  const created=await q.mustApi('POST','/api/v1/restaurants',{name:'UI Audit Restaurant '+suffix,mobile:suffix==='A'?'9891900001':'9891900002',ownerName:'UI Audit Owner '+suffix,ownerEmail:'ui-owner-'+suffix.toLowerCase()+'@example.invalid',ownerPassword:q.state.ownerPassword,skipInviteEmail:true,city:'Ahmedabad'});
  q.state['restaurant'+suffix]=created.restaurant;q.state['branch'+suffix]=created.branch;
  const branch2=await q.mustApi('POST','/api/v1/branches',{restaurantId:created.restaurant.id,name:'UI Audit Second Branch '+suffix,code:'UI'+suffix+'2'});q.state['branch'+suffix+'2']=branch2;
  const plans=await Promise.all(['seed-plan-pro','seed-plan-kiosk-pro','seed-plan-qr'].map(planId=>q.mustApi('POST','/api/v1/subscriptions',{restaurantId:created.restaurant.id,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+30*86400000).toISOString()})));
  q.state['keys'+suffix]={};for(const type of ['POS_ADMIN','KIOSK_ADMIN','POS','KIOSK','CAPTAIN','KDS']){const sub=plans[type.startsWith('KIOSK')?1:0];q.state['keys'+suffix][type]=await q.mustApi('POST','/api/v1/activation-keys',{restaurantId:created.restaurant.id,branchId:created.branch.id,subscriptionId:sub.id,allowedDeviceType:type,label:'UI Audit '+type,expiresAt:new Date(Date.now()+7*86400000).toISOString()});}
  q.saveState();
 }
 console.log('Two isolated restaurants, four branches, product subscriptions and app-specific keys prepared. No production data changed.');
}
main().catch(e=>{console.error(q.scrub(e.message));process.exitCode=1;});
