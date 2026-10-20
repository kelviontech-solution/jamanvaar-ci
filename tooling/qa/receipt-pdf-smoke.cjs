// Run against the compiled API and production dependencies, including inside the final image.
const path = require('node:path');
const {buildBackupPdfBuffer} = require(path.resolve(__dirname, '../../cloud/api/dist/src/modules/backups/backup-pdf.util.js'));
const { buildReceiptPdfBuffer } = require(path.resolve(__dirname, '../../cloud/api/dist/src/modules/notifications/receipt-pdf.util.js'));
const {QrReceiptService,DEFAULT_QR_RECEIPT}=require(path.resolve(__dirname,'../../cloud/api/dist/src/modules/qr/qr-receipt.service.js'));
(async () => {
  for (const paid of [false, true]) {
    const pdf = await buildReceiptPdfBuffer({ restaurantName: 'Packaging smoke test', legalName: null, gstin: null, fssaiNumber: null, address: null, externalOrderId: 'smoke', paidAt: paid ? new Date() : null, method: 'CASH', subtotal: 10000, taxAmount: 500, totalAmount: 10500, collectedAmount: paid ? 10500 : 0, outstandingAmount: paid ? 0 : 10500, lines: [{name:'Test dish',quantity:1,unitPrice:10000,lineTotal:10000}] });
    if (pdf.subarray(0,5).toString() !== '%PDF-' || pdf.length < 1000) throw Error('Receipt PDF packaging check failed');
  }
  const backup = await buildBackupPdfBuffer({restaurant:{name:'Packaging smoke test'},branches:[],devices:[],orders:[]}, {backupId:'smoke',restaurantName:'Packaging smoke test',createdAt:new Date(),sizeBytes:0,method:'SMOKE'});
  if (backup.subarray(0,5).toString() !== '%PDF-') throw Error('Backup PDF packaging check failed');
  // Exercise bundled multilingual fonts in the compiled image, without connecting to a database.
  const qr=new QrReceiptService({runAsTenant:async(_id,action)=>action({restaurant:{findUniqueOrThrow:async()=>({name:'Packaging smoke test',currency:'INR',timezone:'Asia/Kolkata'})},orderPaymentEntry:{findMany:async()=>[]}})},null,null);
  qr.settings=async()=>({design:DEFAULT_QR_RECEIPT});
  const multilingual=await qr.pdf({restaurantId:'smoke',branchId:null,externalOrderId:'QR-1',publicOrderId:'smoke',meta:{customerName:'Guest'},status:'READY',paymentStatus:'PENDING',paymentMethod:'CASH_AT_COUNTER',totalAmount:10500,subtotal:10000,taxAmount:500,discountAmount:0,createdAt:new Date(),items:[{name:'ખમણ / थाली',quantity:1,unitPrice:10000,lineTotal:10000}]});
  if(multilingual.pdf.subarray(0,5).toString()!=='%PDF-'||multilingual.pdf.length<5000)throw Error('QR PDF font packaging check failed');
  console.log('Paid receipt, pending receipt, multilingual QR bill and backup PDFs generated with production dependencies.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
