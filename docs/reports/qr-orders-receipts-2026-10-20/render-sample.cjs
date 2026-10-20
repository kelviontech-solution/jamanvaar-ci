// Synthetic receipt only: no database, customer records or production API access.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const{QrReceiptService,DEFAULT_QR_RECEIPT}=require('../../../cloud/api/dist/src/modules/qr/qr-receipt.service');
(async()=>{
 const qr=new QrReceiptService({runAsTenant:async(_id,action)=>action({restaurant:{findUniqueOrThrow:async()=>({name:'River House · SAMPLE',currency:'INR',timezone:'Asia/Kolkata',address:'Sample restaurant address',city:'Ahmedabad',state:'Gujarat'})},branch:{findFirst:async()=>({name:'Main Dining',timezone:'Asia/Kolkata'})},orderPaymentEntry:{findMany:async()=>[{kind:'COLLECTION',amount:92400}]}})},null,null);
 qr.settings=async()=>({design:{...DEFAULT_QR_RECEIPT,accent:'#235b46',contact:'Sample restaurant contact',footer:'Sample bill for layout verification only.'}});
 const result=await qr.pdf({id:'sample',restaurantId:'sample',branchId:'main',externalOrderId:'QR-24',publicOrderId:'JQ-SAMPLE-ONLY',meta:{customerName:'Sample Guest',tokenNumber:'QR-24'},tableLabel:'1',status:'READY',paymentStatus:'SUCCESS',paymentMethod:'CASH_AT_COUNTER',totalAmount:92400,subtotal:88000,taxAmount:4400,discountAmount:0,createdAt:new Date('2026-10-20T12:00:00Z'),items:[{name:'ખમણ / Khaman / खमण',quantity:11,unitPrice:8000,lineTotal:88000,specialInstructions:'Less spicy'}],notes:'Please call when ready.'});
 assert.equal(result.pdf.subarray(0,5).toString(),'%PDF-');fs.writeFileSync(path.join(__dirname,'sample-bill.pdf'),result.pdf);console.log('Wrote synthetic multilingual sample-bill.pdf');
})().catch(error=>{console.error(error);process.exitCode=1;});
