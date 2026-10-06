import PDFDocument from 'pdfkit';

export interface ReceiptPdfOrderLine {
  name: string;
  quantity: number;
  unitPrice: number; // paise
  lineTotal: number; // paise
}

export interface ReceiptPdfInput {
  restaurantName: string;
  legalName: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
  address: string | null;
  externalOrderId: string;
  paidAt: Date | null;
  method: string | null;
  lines: ReceiptPdfOrderLine[];
  subtotal: number; // paise
  taxAmount: number; // paise
  totalAmount: number; // paise
  thankYouMessage?: string;
  footerMessage?: string;
  logoDataUrl?: string;
  showTaxBreakup?: boolean;
}

const rupees = (paise: number): string => `Rs. ${(paise / 100).toFixed(2)}`;

/**
 * The same CGST/SGST even-split convention used by the printed thermal receipt
 * (packages/utils/src/currency.ts's splitTaxPaise) -- kept as a tiny local copy rather than an
 * import, since cloud/api deliberately doesn't depend on the frontend-oriented @jamanvaar/utils
 * package (see commission.util.ts's own splitCommission for the same reasoning on money splits).
 */
function splitTaxPaise(totalTaxPaise: number): { cgst: number; sgst: number } {
  const total = Math.round(totalTaxPaise);
  const cgst = Math.ceil(total / 2);
  return { cgst, sgst: total - cgst };
}

/**
 * A one-page tax invoice PDF for a single paid order, emailed to a customer who typed their own
 * address at the kiosk. Pulled entirely from the restaurant's and order's own DB rows (see
 * ReceiptEmailService) -- nothing here is client-supplied, so this can't be used to mint a
 * fake-looking official invoice for an amount nobody actually paid.
 */
export function buildReceiptPdfBuffer(input: ReceiptPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#0B253A';
    const saffron = '#D97706';
    const muted = '#5B6360';

    // Embed only bounded raster data uploaded by the restaurant. Never fetch arbitrary URLs on the server.
    if (input.logoDataUrl && /^data:image\/(png|jpeg);base64,/i.test(input.logoDataUrl) && input.logoDataUrl.length < 4_000_000) {
      try { doc.image(Buffer.from(input.logoDataUrl.split(',')[1], 'base64'), 247, doc.y, { fit: [100, 65], align: 'center' }); doc.moveDown(4); } catch { /* A malformed logo does not prevent issuing the customer's bill. */ }
    }

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text(input.restaurantName.toUpperCase(), { align: 'center' });
    if (input.legalName && input.legalName !== input.restaurantName) {
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(input.legalName, { align: 'center' });
    }
    if (input.address) {
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(input.address, { align: 'center' });
    }
    const idLine = [input.gstin ? `GSTIN: ${input.gstin}` : null, input.fssaiNumber ? `FSSAI: ${input.fssaiNumber}` : null].filter(Boolean).join('   |   ');
    if (idLine) doc.font('Helvetica').fontSize(9).fillColor(muted).text(idLine, { align: 'center' });

    doc.moveDown(0.8);
    doc.strokeColor(saffron).lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(14).fillColor(navy).text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.6);

    doc.font('Helvetica').fontSize(10).fillColor(navy);
    const orderNo = input.externalOrderId.slice(-10).toUpperCase();
    doc.text(`Order: ${orderNo}`, 50, doc.y, { continued: true });
    doc.text(`Date: ${(input.paidAt ?? new Date()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'right' });
    if (input.method) doc.text(`Payment method: ${input.method.replace(/_/g, ' ')}`);

    doc.moveDown(0.8);

    const colX = { item: 50, qty: 330, price: 390, total: 470 };
    const headerY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.rect(50, headerY - 4, 495, 20).fill(navy);
    doc.fillColor('#ffffff');
    doc.text('ITEM', colX.item + 4, headerY, { width: colX.qty - colX.item - 4 });
    doc.text('QTY', colX.qty, headerY, { width: colX.price - colX.qty, align: 'right' });
    doc.text('PRICE', colX.price, headerY, { width: colX.total - colX.price, align: 'right' });
    doc.text('AMOUNT', colX.total, headerY, { width: 545 - colX.total, align: 'right' });
    doc.moveDown(1.2);

    doc.font('Helvetica').fontSize(9.5).fillColor(navy);
    let rowIndex = 0;
    for (const line of input.lines) {
      const y = doc.y;
      if (rowIndex % 2 === 1) doc.rect(50, y - 3, 495, 18).fill('#F7F5F0').fillColor(navy);
      doc.text(line.name, colX.item + 4, y, { width: colX.qty - colX.item - 4 });
      doc.text(String(line.quantity), colX.qty, y, { width: colX.price - colX.qty, align: 'right' });
      doc.text(rupees(line.unitPrice), colX.price, y, { width: colX.total - colX.price, align: 'right' });
      doc.text(rupees(line.lineTotal), colX.total, y, { width: 545 - colX.total, align: 'right' });
      doc.moveDown(1.0);
      rowIndex += 1;
    }

    doc.moveDown(0.3);
    doc.strokeColor('#dcd7cb').lineWidth(0.75).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    const { cgst, sgst } = splitTaxPaise(input.taxAmount);
    const totalsRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(navy);
      doc.text(label, 330, doc.y, { width: 120, continued: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
      doc.text(value, 470, doc.y - (bold ? 14 : 12), { width: 75, align: 'right' });
      doc.moveDown(bold ? 0.3 : 0.5);
    };
    totalsRow('Subtotal', rupees(input.subtotal));
    if (input.showTaxBreakup !== false) { totalsRow('CGST', rupees(cgst)); totalsRow('SGST', rupees(sgst)); }
    else totalsRow('Tax', rupees(input.taxAmount));
    doc.moveDown(0.2);
    doc.strokeColor(saffron).lineWidth(1).moveTo(330, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    totalsRow('TOTAL PAID', rupees(input.totalAmount), true);

    doc.moveDown(1.5);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(muted).text(input.thankYouMessage ?? 'Thank you for dining with us!', 50, doc.y, { width: 495, align: 'center' });
    if (input.footerMessage) doc.font('Helvetica').fontSize(8).text(input.footerMessage, { width: 495, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor(muted).text('Generated by JAMANVAAR Kiosk Systems', { width: 495, align: 'center' });

    doc.end();
  });
}
