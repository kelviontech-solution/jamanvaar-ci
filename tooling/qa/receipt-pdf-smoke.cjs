// Run against the compiled API and production dependencies, including inside the final image.
const path = require('node:path');
const {buildBackupPdfBuffer} = require(path.resolve(__dirname, '../../cloud/api/dist/src/modules/backups/backup-pdf.util.js'));
const { buildReceiptPdfBuffer } = require(path.resolve(__dirname, '../../cloud/api/dist/src/modules/notifications/receipt-pdf.util.js'));
(async () => {
  for (const paid of [false, true]) {
    const pdf = await buildReceiptPdfBuffer({ restaurantName: 'Packaging smoke test', legalName: null, gstin: null, fssaiNumber: null, address: null, externalOrderId: 'smoke', paidAt: paid ? new Date() : null, method: 'CASH', subtotal: 10000, taxAmount: 500, totalAmount: 10500, collectedAmount: paid ? 10500 : 0, outstandingAmount: paid ? 0 : 10500, lines: [{name:'Test dish',quantity:1,unitPrice:10000,lineTotal:10000}] });
    if (pdf.subarray(0,5).toString() !== '%PDF-' || pdf.length < 1000) throw Error('Receipt PDF packaging check failed');
  }
  const backup = await buildBackupPdfBuffer({restaurant:{name:'Packaging smoke test'},branches:[],devices:[],orders:[]}, {backupId:'smoke',restaurantName:'Packaging smoke test',createdAt:new Date(),sizeBytes:0,method:'SMOKE'});
  if (backup.subarray(0,5).toString() !== '%PDF-') throw Error('Backup PDF packaging check failed');
  console.log('Paid receipt, pending receipt and backup PDFs generated with production dependencies.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
