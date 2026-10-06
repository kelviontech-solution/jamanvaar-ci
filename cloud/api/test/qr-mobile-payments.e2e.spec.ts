import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

// Only provider network calls are simulated; actual auth, prices, RLS, database and HMAC run.
let app:any, prisma:PrismaService, gateway:RazorpayGatewayService;
let restaurantId:string,planId:string,branchId:string,admin:string,device:string,qr:string,platform:string;
const stamp=Date.now(),email=`qr-mobile-${stamp}@test.example.com`,secret='qr-mobile-isolated-webhook-secret';
const http=()=>request(app.getHttpServer());
const auth=(method:'post'|'put'|'get',url:string,token=admin)=>http()[method](url).set('Authorization',`Bearer ${token}`);
const push=(type:string,id:string,payload:any)=>auth('post',`/api/v1/entity-sync/${type}`).send({events:[{externalId:id,payload:{id,...payload,updatedAt:new Date().toISOString()}}]});
const body=(key:string)=>({items:[{itemId:'pizza',quantity:1,optionIds:[]}],paymentMethod:'ONLINE',idempotencyKey:key});
const place=async(key:string)=>{const r=await http().post(`/api/v1/public/qr/${qr}/orders`).send(body(key));expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body;};
const stored=async(ref:string)=>prisma.runAsPlatform(tx=>tx.syncedOrder.findUniqueOrThrow({where:{publicOrderId:ref}}));
const payment=async(ref:string)=>{const o=await stored(ref);return prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.findFirstOrThrow({where:{order:{externalOrderId:o.externalOrderId}}}));};
const webhook=(pay:any,extra:any={},signature?:string)=>{
 const payload={event:'payment_link.paid',payload:{payment_link:{entity:{id:`plink_${pay.providerOrderId}`,reference_id:pay.providerOrderId,amount:pay.amount,currency:'INR',status:'paid'}},payment:{entity:{id:`pay_${pay.id}`,amount:pay.amount,currency:'INR',status:'captured',...extra}}}};
 const raw=JSON.stringify(payload);return http().post('/api/v1/payments/razorpay/webhook').set('content-type','application/json').set('x-razorpay-signature',signature??createHmac('sha256',secret).update(raw).digest('hex')).send(raw);
};
beforeAll(async()=>{
 Object.assign(process.env,{RAZORPAY_KEY_ID:'qa_key',RAZORPAY_KEY_SECRET:'qa_secret',RAZORPAY_WEBHOOK_SECRET:secret,QR_ORDER_BASE_URL:'http://localhost:5290'});
 app=await createTestApp();prisma=app.get(PrismaService);gateway=app.get(RazorpayGatewayService);
 vi.spyOn(gateway,'createPaymentLink').mockImplementation(async i=>({linkId:`plink_${i.referenceId}`,shortUrl:'https://rzp.io/i/qa-only',status:'created'}));
 vi.spyOn(gateway,'fetchPaymentLink').mockRejectedValue(Error('No external provider traffic in QA'));
 app.get(QrRateLimiter).configure({ipRequestsPerMinute:100000,ipFailedLookupsPerMinute:100000,tokenRequestsPerMinute:100000,tokenOrdersPerMinute:100000,sessionOrdersPerMinute:100000,orderStatusPerMinute:100000});
 await createTestPlatformUser(prisma,{email,password:'correct-horse-battery-staple'});platform=(await platformLogin(app,email,'correct-horse-battery-staple')).body.accessToken;
 planId=(await auth('post','/api/v1/plans',platform).send({tier:'QR',name:`TEST QR Mobile ${stamp}`,priceMonthly:900000,maxBranches:3,maxDevices:10,maxUsers:10,entitlements:{posTerminal:true,restaurantAdmin:true,kotKdsRouting:true,qrTableOrdering:true}})).body.id;
 restaurantId=(await auth('post','/api/v1/restaurants',platform).send({name:`TEST Mobile ${stamp}`,ownerName:'Owner',ownerEmail:email})).body.restaurant.id;
 expect((await auth('post','/api/v1/subscriptions',platform).send({restaurantId,planId,status:'ACTIVE',expiresAt:new Date(Date.now()+86400000).toISOString()})).status).toBe(201);
 branchId=await prisma.runAsTenant(restaurantId,async tx=>(await tx.branch.findFirstOrThrow({where:{restaurantId}})).id);
 for(const type of ['POS_ADMIN','POS']){const k=await auth('post','/api/v1/activation-keys',platform).send({restaurantId,branchId,allowedDeviceType:type,expiresAt:new Date(Date.now()+86400000).toISOString()});const r=await http().post('/api/v1/activation/redeem').send({code:k.body.code,deviceType:type});expect(r.status,JSON.stringify(r.body)).toBe(201);if(type==='POS_ADMIN')admin=r.body.deviceToken;else device=r.body.deviceToken;}
 await push('MENU_CATEGORY','mains',{name:'Mains',isActive:true});await push('MENU_ITEM','pizza',{name:'Paneer Pizza',categoryId:'mains',price:249,isAvailable:true,modifierGroupIds:[]});
 await push('DINING_TABLE','table-2',{tableNumber:'TN2',capacity:4,isActive:true,branchId});
 expect((await auth('post','/api/v1/menu/publish').send({})).status).toBe(201);
 const code=await auth('post','/api/v1/restaurant/qr/tables/table-2/generate').send({branchId});expect(code.status,JSON.stringify(code.body)).toBe(201);qr=code.body.url.split('/q/')[1];
 await prisma.runAsTenant(restaurantId,tx=>tx.restaurantPaymentConnection.create({data:{restaurantId,status:'ACTIVE'}}));
 expect((await auth('put','/api/v1/restaurant/qr/settings').send({allowOnlinePayment:true})).status).toBe(200);
},120000);
afterAll(async()=>{vi.restoreAllMocks();if(restaurantId)await prisma.runAsPlatform(tx=>tx.restaurant.deleteMany({where:{id:restaurantId}}));if(planId)await prisma.runAsPlatform(tx=>tx.plan.deleteMany({where:{id:planId}}));await prisma.platformUser.deleteMany({where:{email}});await app?.close();for(const k of ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET'])delete process.env[k];});
it('guest QR resolves without login, with gated online payment',async()=>{const r=await http().get(`/api/v1/public/qr/${qr}`);expect(r.status).toBe(200);expect(r.body.ordering.settings.allowOnlinePayment).toBe(true);});
it('online checkout freezes server price, has zero kiosk fee, and stays DRAFT until verified',async()=>{const p=await place('online-draft-123');expect(p).toMatchObject({status:'PENDING_PAYMENT',total:249,payment:{status:'PENDING',url:'https://rzp.io/i/qa-only'}});expect(await stored(p.publicOrderId)).toMatchObject({status:'DRAFT',paymentStatus:'PENDING',source:'QR',tableLabel:'TN2',branchId});expect(await payment(p.publicOrderId)).toMatchObject({amount:24900,commissionBps:0,platformAmount:0,restaurantAmount:24900});expect(gateway.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({amountPaise:24900,callbackUrl:expect.stringContaining('?order=')}));});
it('parallel duplicate submits produce one order and payment attempt',async()=>{const [a,b]=await Promise.all([place('same-online-key-123'),place('same-online-key-123')]);expect(a.publicOrderId).toBe(b.publicOrderId);const o=await stored(a.publicOrderId);expect(await prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.count({where:{order:{externalOrderId:o.externalOrderId}}}))).toBe(1);});
it('invalid signature and wrong signed amounts cannot admit a kitchen order',async()=>{const p=await place('invalid-payment-123'),pay=await payment(p.publicOrderId);await webhook(pay,{},'bad-signature');expect((await payment(p.publicOrderId)).status).toBe('PENDING');await webhook(pay,{amount:pay.amount+1});expect(await stored(p.publicOrderId)).toMatchObject({status:'DRAFT',paymentStatus:'PENDING'});});
it('a device cannot change draft items or forge payment completion',async()=>{const p=await place('device-forge-123'),o=await stored(p.publicOrderId);const r=await auth('post','/api/v1/orders/sync',device).send({events:[{externalOrderId:o.externalOrderId,orderType:o.orderType,status:'NEW',items:o.items,subtotal:o.subtotal,taxAmount:o.taxAmount,totalAmount:o.totalAmount,paymentStatus:'SUCCESS',paymentMethod:'UPI',updatedAt:new Date().toISOString()}]});expect(JSON.stringify(r.body)).toContain('PAYMENT_VERIFICATION_REQUIRED');expect((await stored(p.publicOrderId)).status).toBe('DRAFT');});
it('signed paid webhook admits the existing order once; replay/retry never creates another',async()=>{const p=await place('verified-payment-123'),pay=await payment(p.publicOrderId);await webhook(pay);const o=await stored(p.publicOrderId);expect(o).toMatchObject({status:'NEW',paymentStatus:'SUCCESS',paymentMethod:'RAZORPAY'});await webhook(pay);expect((await stored(p.publicOrderId)).syncVersion).toBe(o.syncVersion);expect((await http().post(`/api/v1/public/qr/orders/${p.publicOrderId}/payment`)).status).toBe(200);expect((await http().get(`/api/v1/public/qr/orders/${p.publicOrderId}`)).body).toMatchObject({status:'RECEIVED',payment:{status:'SUCCESS',url:null},items:[{name:'Paneer Pizza',quantity:1,lineTotal:249}]});});
it('missed webhook recovers from independently fetched captured provider payment',async()=>{const p=await place('recover-payment-123'),pay=await payment(p.publicOrderId);await prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.update({where:{id:pay.id},data:{createdAt:new Date(Date.now()-60000)}}));vi.mocked(gateway.fetchPaymentLink).mockResolvedValueOnce({id:`plink_${pay.providerOrderId}`,reference_id:pay.providerOrderId,amount:pay.amount,amount_paid:pay.amount,currency:'INR',status:'paid',payments:[{payment_id:`pay_recover_${pay.id}`,amount:pay.amount,status:'captured'}]});const r=await http().get(`/api/v1/public/qr/orders/${p.publicOrderId}`);expect(r.status).toBe(200);expect(r.body.paymentStatus).toBe('SUCCESS');expect((await stored(p.publicOrderId)).status).toBe('NEW');});
it('unavailable or deleted dishes are refused at checkout even inside availability cache TTL',async()=>{await push('MENU_ITEM','pizza',{name:'Paneer Pizza',categoryId:'mains',price:249,isAvailable:false,modifierGroupIds:[]});const r=await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('sold-out-123'));expect(r.status).toBe(400);await push('MENU_ITEM','pizza',{name:'Paneer Pizza',categoryId:'mains',price:249,isAvailable:true,modifierGroupIds:[]});});
it('an ambiguous link-creation failure recovers its original reference and does not create a second payment',async()=>{
 let original:any;vi.mocked(gateway.createPaymentLink).mockImplementationOnce(async input=>{original=input;throw Error('Simulated timeout after provider created the link');});
 const placed=await place('ambiguous-provider-123'),pay=await payment(placed.publicOrderId);expect(pay.status).toBe('FAILED');
 vi.spyOn(gateway,'findPaymentLink').mockResolvedValueOnce({id:`plink_${pay.providerOrderId}`,reference_id:pay.providerOrderId,amount:pay.amount,currency:'INR',short_url:'https://rzp.io/i/recovered-qa',status:'created'});
 const before=vi.mocked(gateway.createPaymentLink).mock.calls.length;
 const retry=await http().post(`/api/v1/public/qr/orders/${placed.publicOrderId}/payment`);expect(retry.status,JSON.stringify(retry.body)).toBe(200);
 expect(retry.body.payment.url).toBe('https://rzp.io/i/recovered-qa');expect(gateway.createPaymentLink).toHaveBeenCalledTimes(before);expect((await payment(placed.publicOrderId)).id).toBe(pay.id);expect(original.referenceId).toBe(pay.providerOrderId);
});
it('a webhook arriving before payment-link creation returns cannot be downgraded to pending',async()=>{
 vi.mocked(gateway.createPaymentLink).mockImplementationOnce(async input=>{const pay=await prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.findFirstOrThrow({where:{providerOrderId:input.referenceId}}));await webhook(pay);return {linkId:`plink_${input.referenceId}`,shortUrl:'https://rzp.io/i/early-paid',status:'paid'};});
 const p=await place('early-webhook-123');expect(p.payment.status).toBe('SUCCESS');expect((await payment(p.publicOrderId)).status).toBe('SUCCESS');expect((await stored(p.publicOrderId)).status).toBe('NEW');
});
it('paid QR totals and quantities remain immutable while kitchen state can advance',async()=>{
 const p=await place('paid-freeze-123'),pay=await payment(p.publicOrderId);await webhook(pay);const o=await stored(p.publicOrderId);
 const event={externalOrderId:o.externalOrderId,orderType:o.orderType,status:'PREPARING',items:o.items,subtotal:o.subtotal,taxAmount:o.taxAmount,totalAmount:o.totalAmount,paymentStatus:'SUCCESS',paymentMethod:'RAZORPAY',updatedAt:new Date().toISOString()};
 const forged=await auth('post','/api/v1/orders/sync',device).send({events:[{...event,totalAmount:1}]});expect(JSON.stringify(forged.body)).toContain('PAID_QR_ORDER_FROZEN');expect((await stored(p.publicOrderId)).totalAmount).toBe(24900);
 const valid=await auth('post','/api/v1/orders/sync',device).send({events:[event]});expect(valid.body.results[0].status).toBe('ok');
});
it('verified payment wins when the link-create response fails after its signed webhook',async()=>{
 vi.mocked(gateway.createPaymentLink).mockImplementationOnce(async input=>{const pay=await prisma.runAsTenant(restaurantId,tx=>tx.paymentTransaction.findFirstOrThrow({where:{providerOrderId:input.referenceId}}));await webhook(pay);throw Error('Provider response lost after verified payment');});
 const p=await place('webhook-before-error-123');expect(p).toMatchObject({status:'RECEIVED',paymentStatus:'SUCCESS',payment:{status:'SUCCESS',url:null}});expect((await payment(p.publicOrderId)).fulfilledAt).not.toBeNull();
});
it('online payment is unavailable without a webhook verification secret',async()=>{
 const previous=process.env.RAZORPAY_WEBHOOK_SECRET;process.env.RAZORPAY_WEBHOOK_SECRET='';
 try{const info=await http().get(`/api/v1/public/qr/${qr}`);expect(info.body.ordering.settings.allowOnlinePayment).toBe(false);const r=await http().post(`/api/v1/public/qr/${qr}/orders`).send(body('no-webhook-secret-123'));expect(r.status).toBe(400);expect(r.body.message).toContain('payment method is not available');}finally{process.env.RAZORPAY_WEBHOOK_SECRET=previous;}
});
