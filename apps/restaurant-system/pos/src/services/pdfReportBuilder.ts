import { DailyReportSummary, TopItemStat } from '@jamanvaar/business';
import { db, ReceiptRepository } from '@jamanvaar/database';

export type ReportDesign = 'CLASSIC' | 'MODERN' | 'COMPACT' | 'STATEMENT' | 'BRANDED';

export interface ReportFullData {
  title: string;
  subtitle?: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  generatedBy: string;
  summary: DailyReportSummary;
  topItems: TopItemStat[];
  cashiers: Array<{ name: string; ordersCount: number; netSales: number; cash: number; upi: number; card: number }>;
}

export class PdfReportBuilder {
  /**
   * Generates a valid standard PDF 1.4 document as a Uint8Array
   */
  public static generatePdf(data: ReportFullData, design: ReportDesign = 'CLASSIC'): Uint8Array {
    const config = ReceiptRepository.getConfig();
    const restName = config.restaurantName || 'JAMANVAAR Traditional Dining';
    const gstin = config.gstin || '24AAACJ1234F1Z5';
    const phone = config.phone || '+91 98765 43210';
    const address = config.address || 'Ahmedabad Flagship Store, Gujarat';

    // A4 dimensions in points (72 points = 1 inch): 595.28 x 841.89
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const pages: string[] = [];
    let currentOps: string[] = [];
    let curY = pageHeight - margin;

    const newPage = () => {
      if (currentOps.length > 0) {
        pages.push(currentOps.join('\n'));
      }
      currentOps = [];
      curY = pageHeight - margin;
    };

    const sanitize = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/₹/g, 'Rs. ')
        .replace(/[^\x20-\x7E]/g, ' ');
    };

    // Helper: Draw Text
    const drawText = (
      text: string,
      x: number,
      y: number,
      size: number = 10,
      isBold: boolean = false,
      color: [number, number, number] = [0, 0, 0],
      align: 'left' | 'center' | 'right' = 'left'
    ) => {
      const font = isBold ? '/F2' : '/F1';
      const clean = sanitize(text);
      const approxWidth = clean.length * size * (isBold ? 0.55 : 0.5);
      let posX = x;
      if (align === 'center') posX = x - approxWidth / 2;
      else if (align === 'right') posX = x - approxWidth;

      currentOps.push(`q`);
      currentOps.push(`${color[0]} ${color[1]} ${color[2]} rg`);
      currentOps.push(`BT`);
      currentOps.push(`${font} ${size} Tf`);
      currentOps.push(`${posX.toFixed(2)} ${y.toFixed(2)} Td`);
      currentOps.push(`(${clean}) Tj`);
      currentOps.push(`ET`);
      currentOps.push(`Q`);
    };

    // Helper: Draw Rectangle / Fill
    const drawRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      fillColor?: [number, number, number],
      strokeColor?: [number, number, number],
      lineWidth: number = 1
    ) => {
      currentOps.push(`q`);
      if (lineWidth) currentOps.push(`${lineWidth} w`);
      if (strokeColor) currentOps.push(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG`);
      if (fillColor) {
        currentOps.push(`${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rg`);
        currentOps.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        if (strokeColor) currentOps.push(`B`);
        else currentOps.push(`f`);
      } else if (strokeColor) {
        currentOps.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        currentOps.push(`S`);
      }
      currentOps.push(`Q`);
    };

    // Helper: Draw Horizontal Line
    const drawLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: [number, number, number] = [0.8, 0.8, 0.8],
      lineWidth: number = 0.75
    ) => {
      currentOps.push(`q`);
      currentOps.push(`${color[0]} ${color[1]} ${color[2]} RG`);
      currentOps.push(`${lineWidth} w`);
      currentOps.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
      currentOps.push(`Q`);
    };

    // --- PAGE 1: HEADER ---
    newPage();

    // Primary Brand Bar (Varies slightly by Design)
    if (design === 'BRANDED') {
      drawRect(margin, curY - 65, contentWidth, 75, [0.04, 0.15, 0.23], undefined);
      drawText(restName.toUpperCase(), margin + 15, curY - 20, 16, true, [1, 1, 1]);
      drawText(`AUTHENTIC HERITAGE DINING • GSTIN: ${gstin}`, margin + 15, curY - 35, 9, false, [0.9, 0.9, 0.9]);
      drawText(`${address} • Tel: ${phone}`, margin + 15, curY - 48, 8, false, [0.8, 0.8, 0.8]);
      drawText('JAMANVAAR ERP', pageWidth - margin - 15, curY - 20, 10, true, [0.9, 0.4, 0.1], 'right');
      curY -= 85;
    } else if (design === 'MODERN') {
      drawRect(margin, curY - 45, contentWidth, 55, [0.95, 0.96, 0.98], [0.85, 0.88, 0.92]);
      drawText(restName, margin + 15, curY - 20, 14, true, [0.04, 0.15, 0.23]);
      drawText(`GSTIN: ${gstin} | ${address}`, margin + 15, curY - 34, 8, false, [0.4, 0.4, 0.5]);
      drawText('EXECUTIVE REPORT', pageWidth - margin - 15, curY - 20, 10, true, [0.9, 0.4, 0.1], 'right');
      curY -= 65;
    } else if (design === 'COMPACT') {
      drawText(`${restName.toUpperCase()} — ${data.title.toUpperCase()}`, margin, curY - 10, 12, true, [0, 0, 0]);
      drawText(`Period: ${data.periodLabel} | Generated: ${data.generatedAt}`, margin, curY - 22, 8, false, [0.4, 0.4, 0.4]);
      drawLine(margin, curY - 28, pageWidth - margin, curY - 28, [0, 0, 0], 1);
      curY -= 38;
    } else {
      // CLASSIC & STATEMENT
      drawText(restName.toUpperCase(), margin, curY - 12, 14, true, [0.04, 0.15, 0.23]);
      drawText('BY KELVIONTECH • RESTAURANT OPERATIONAL AUDIT', margin, curY - 24, 8, false, [0.5, 0.5, 0.5]);
      drawText(`${address} • GSTIN: ${gstin} • Tel: ${phone}`, margin, curY - 35, 8, false, [0.4, 0.4, 0.4]);
      drawLine(margin, curY - 42, pageWidth - margin, curY - 42, [0.8, 0.8, 0.8], 1);
      curY -= 55;
    }

    // Title & Meta Box
    if (design !== 'COMPACT') {
      drawText(data.title.toUpperCase(), margin, curY, 13, true, [0.04, 0.15, 0.23]);
      drawText(`Report Period: ${data.periodLabel}`, margin, curY - 14, 9, false, [0.3, 0.3, 0.3]);
      drawText(`Generated: ${data.generatedAt} | By: ${data.generatedBy}`, pageWidth - margin, curY - 14, 8, false, [0.5, 0.5, 0.5], 'right');
      curY -= 30;
    }

    // --- KPI SUMMARY BLOCKS ---
    const s = data.summary;
    const kpis = [
      { label: 'TOTAL NET SALES', value: `Rs. ${s.netSales.toLocaleString('en-IN')}`, sub: `${s.ordersCount} Orders` },
      { label: 'AVG ORDER VALUE', value: `Rs. ${s.avgOrderValue.toLocaleString('en-IN')}`, sub: 'Per Bill' },
      { label: 'CASH COLLECTED', value: `Rs. ${s.paymentBreakdown.cash.toLocaleString('en-IN')}`, sub: 'Drawer Cash' },
      { label: 'TOTAL GST (5%)', value: `Rs. ${s.totalTax.toLocaleString('en-IN')}`, sub: `CGST + SGST` }
    ];

    const kpiW = (contentWidth - 30) / 4;
    kpis.forEach((k, idx) => {
      const kX = margin + idx * (kpiW + 10);
      drawRect(kX, curY - 45, kpiW, 45, [0.98, 0.98, 0.98], [0.85, 0.85, 0.85], 0.75);
      drawText(k.label, kX + 8, curY - 14, 7, true, [0.5, 0.5, 0.5]);
      drawText(k.value, kX + 8, curY - 28, 11, true, [0.04, 0.15, 0.23]);
      drawText(k.sub, kX + 8, curY - 38, 7, false, [0.4, 0.6, 0.4]);
    });
    curY -= 60;

    // --- FINANCIAL SUMMARY & PAYMENT MIX (2 Columns) ---
    const colW = (contentWidth - 20) / 2;

    // Col 1: Financial Statement
    drawRect(margin, curY - 120, colW, 120, [1, 1, 1], [0.85, 0.85, 0.85], 0.75);
    drawRect(margin, curY - 20, colW, 20, [0.94, 0.95, 0.96], undefined);
    drawText('REVENUE & TAX STATEMENT', margin + 10, curY - 14, 8, true, [0.04, 0.15, 0.23]);

    const finRows = [
      ['Gross Food Sales', `Rs. ${s.grossSales.toLocaleString('en-IN')}`],
      ['Discounts Granted', `- Rs. ${s.discountAmount.toLocaleString('en-IN')}`],
      ['CGST (2.5%)', `Rs. ${s.cgstAmount.toLocaleString('en-IN')}`],
      ['SGST (2.5%)', `Rs. ${s.sgstAmount.toLocaleString('en-IN')}`],
      ['Net Collected Revenue', `Rs. ${s.netSales.toLocaleString('en-IN')}`]
    ];
    finRows.forEach((r, idx) => {
      const rowY = curY - 36 - idx * 17;
      const isTotal = idx === finRows.length - 1;
      if (isTotal) drawLine(margin + 8, rowY + 12, margin + colW - 8, rowY + 12, [0.7, 0.7, 0.7], 1);
      drawText(r[0], margin + 10, rowY, 8, isTotal, isTotal ? [0.04, 0.15, 0.23] : [0.3, 0.3, 0.3]);
      drawText(r[1], margin + colW - 10, rowY, 8, isTotal, isTotal ? [0.04, 0.15, 0.23] : [0.3, 0.3, 0.3], 'right');
    });

    // Col 2: Payment Mix Allocation
    const col2X = margin + colW + 20;
    drawRect(col2X, curY - 120, colW, 120, [1, 1, 1], [0.85, 0.85, 0.85], 0.75);
    drawRect(col2X, curY - 20, colW, 20, [0.94, 0.95, 0.96], undefined);
    drawText('PAYMENT TENDER ALLOCATION', col2X + 10, curY - 14, 8, true, [0.04, 0.15, 0.23]);

    const payRows = [
      ['Cash at Counter', `Rs. ${s.paymentBreakdown.cash.toLocaleString('en-IN')}`],
      ['UPI / Dynamic QR', `Rs. ${s.paymentBreakdown.upi.toLocaleString('en-IN')}`],
      ['Credit / Debit Cards', `Rs. ${s.paymentBreakdown.card.toLocaleString('en-IN')}`],
      ['Split Payments', `Rs. ${s.paymentBreakdown.split.toLocaleString('en-IN')}`],
      ['Total Payment Reconciled', `Rs. ${s.totalCollected.toLocaleString('en-IN')}`]
    ];
    payRows.forEach((r, idx) => {
      const rowY = curY - 36 - idx * 17;
      const isTotal = idx === payRows.length - 1;
      if (isTotal) drawLine(col2X + 8, rowY + 12, col2X + colW - 8, rowY + 12, [0.7, 0.7, 0.7], 1);
      drawText(r[0], col2X + 10, rowY, 8, isTotal, isTotal ? [0.04, 0.15, 0.23] : [0.3, 0.3, 0.3]);
      drawText(r[1], col2X + colW - 10, rowY, 8, isTotal, isTotal ? [0.04, 0.15, 0.23] : [0.3, 0.3, 0.3], 'right');
    });

    curY -= 135;

    // --- TOP DISH PERFORMANCE TABLE ---
    drawText('TOP SELLING DISHES & MENU VELOCITY', margin, curY, 10, true, [0.04, 0.15, 0.23]);
    curY -= 15;

    // Table Header
    const drawTableHeader = (y: number) => {
      drawRect(margin, y - 18, contentWidth, 18, [0.92, 0.94, 0.96], [0.8, 0.8, 0.8], 0.75);
      drawText('#', margin + 8, y - 12, 7.5, true, [0.2, 0.2, 0.2]);
      drawText('DISH NAME', margin + 30, y - 12, 7.5, true, [0.2, 0.2, 0.2]);
      drawText('CATEGORY', margin + 220, y - 12, 7.5, true, [0.2, 0.2, 0.2]);
      drawText('QTY SOLD', margin + 340, y - 12, 7.5, true, [0.2, 0.2, 0.2], 'right');
      drawText('AVG RATE', margin + 420, y - 12, 7.5, true, [0.2, 0.2, 0.2], 'right');
      drawText('GROSS REVENUE', margin + contentWidth - 10, y - 12, 7.5, true, [0.2, 0.2, 0.2], 'right');
    };

    drawTableHeader(curY);
    curY -= 18;

    const itemsToDisplay = data.topItems.slice(0, 12);
    itemsToDisplay.forEach((it, idx) => {
      if (curY < margin + 60) {
        // Multi-page split: create new page and repeat table header
        newPage();
        drawText(`${restName} — ${data.title} (Continued)`, margin, curY - 10, 10, true, [0.04, 0.15, 0.23]);
        curY -= 25;
        drawTableHeader(curY);
        curY -= 18;
      }

      const isEven = idx % 2 === 0;
      if (isEven) {
        drawRect(margin, curY - 16, contentWidth, 16, [0.98, 0.98, 0.98], undefined);
      }
      drawLine(margin, curY - 16, margin + contentWidth, curY - 16, [0.9, 0.9, 0.9], 0.5);

      drawText((idx + 1).toString(), margin + 8, curY - 11, 7.5, false, [0.4, 0.4, 0.4]);
      drawText(it.name, margin + 30, curY - 11, 7.5, true, [0.1, 0.1, 0.1]);
      drawText(it.categoryName || 'Main Course', margin + 220, curY - 11, 7, false, [0.5, 0.5, 0.5]);
      drawText(it.quantitySold.toString(), margin + 340, curY - 11, 7.5, true, [0.04, 0.15, 0.23], 'right');
      drawText(`Rs. ${it.avgPrice}`, margin + 420, curY - 11, 7.5, false, [0.4, 0.4, 0.4], 'right');
      drawText(`Rs. ${it.grossRevenue.toLocaleString('en-IN')}`, margin + contentWidth - 10, curY - 11, 7.5, true, [0.04, 0.15, 0.23], 'right');
      curY -= 16;
    });

    if (itemsToDisplay.length === 0) {
      drawText('No dish sales recorded during this business period.', margin + 15, curY - 15, 8, false, [0.5, 0.5, 0.5]);
      curY -= 25;
    }

    // --- CASHIER PERFORMANCE (If available) ---
    if (data.cashiers && data.cashiers.length > 0 && curY > margin + 90) {
      curY -= 15;
      drawText('CASHIER COUNTER PERFORMANCE SUMMARY', margin, curY, 9, true, [0.04, 0.15, 0.23]);
      curY -= 14;

      drawRect(margin, curY - 16, contentWidth, 16, [0.92, 0.94, 0.96], [0.8, 0.8, 0.8], 0.75);
      drawText('CASHIER NAME', margin + 10, curY - 11, 7.5, true, [0.2, 0.2, 0.2]);
      drawText('ORDERS', margin + 200, curY - 11, 7.5, true, [0.2, 0.2, 0.2], 'right');
      drawText('CASH TENDER', margin + 300, curY - 11, 7.5, true, [0.2, 0.2, 0.2], 'right');
      drawText('UPI / QR', margin + 400, curY - 11, 7.5, true, [0.2, 0.2, 0.2], 'right');
      drawText('TOTAL BILLED', margin + contentWidth - 10, curY - 11, 7.5, true, [0.2, 0.2, 0.2], 'right');
      curY -= 16;

      data.cashiers.forEach((c) => {
        drawLine(margin, curY - 16, margin + contentWidth, curY - 16, [0.9, 0.9, 0.9], 0.5);
        drawText(c.name, margin + 10, curY - 11, 7.5, true, [0.1, 0.1, 0.1]);
        drawText(c.ordersCount.toString(), margin + 200, curY - 11, 7.5, false, [0.3, 0.3, 0.3], 'right');
        drawText(`Rs. ${c.cash.toLocaleString('en-IN')}`, margin + 300, curY - 11, 7.5, false, [0.3, 0.3, 0.3], 'right');
        drawText(`Rs. ${c.upi.toLocaleString('en-IN')}`, margin + 400, curY - 11, 7.5, false, [0.3, 0.3, 0.3], 'right');
        drawText(`Rs. ${c.netSales.toLocaleString('en-IN')}`, margin + contentWidth - 10, curY - 11, 7.5, true, [0.04, 0.15, 0.23], 'right');
        curY -= 16;
      });
    }

    // Footer on all pages
    if (currentOps.length > 0) {
      pages.push(currentOps.join('\n'));
    }

    const totalPages = pages.length;
    const finalPageStreams: string[] = pages.map((pageStream, idx) => {
      const footerY = margin / 2 + 5;
      const footerOps = [
        `q`,
        `0.5 0.5 0.5 RG`,
        `0.5 w`,
        `${margin} ${(footerY + 12).toFixed(2)} m ${(pageWidth - margin).toFixed(2)} ${(footerY + 12).toFixed(2)} l S`,
        `BT`,
        `/F1 7 Tf`,
        `0.5 0.5 0.5 rg`,
        `${margin} ${footerY.toFixed(2)} Td`,
        `(${sanitize(`${restName} • JAMANVAAR POS Audit System • ${config.footerMessage || 'Thank you'}`)}) Tj`,
        `ET`,
        `BT`,
        `/F2 7 Tf`,
        `${(pageWidth - margin - 45).toFixed(2)} ${footerY.toFixed(2)} Td`,
        `(${sanitize(`Page ${idx + 1} of ${totalPages}`)}) Tj`,
        `ET`,
        `Q`
      ].join('\n');
      return `${pageStream}\n${footerOps}`;
    });

    // --- PDF OBJECT COMPILATION ---
    const objects: string[] = [];
    const offsets: number[] = [];
    let byteOffset = 0;

    const addObj = (content: string): number => {
      const objNum = objects.length + 1;
      offsets.push(byteOffset);
      const str = `${objNum} 0 obj\n${content}\nendobj\n`;
      objects.push(str);
      byteOffset += str.length;
      return objNum;
    };

    // Header
    const header = '%PDF-1.4\n';
    byteOffset += header.length;

    // Obj 1: Catalog
    addObj(`<< /Type /Catalog /Pages 2 0 R >>`);

    // We will reserve IDs for Pages, Fonts, etc.
    const font1Id = 3;
    const font2Id = 4;
    const pageObjIds: number[] = [];

    // Fonts
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

    // Build page objects & content streams
    finalPageStreams.forEach((streamContent) => {
      const streamLen = streamContent.length;
      const contentId = addObj(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`);
      const pageId = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> >>`);
      pageObjIds.push(pageId);
    });

    // Replace Obj 2 with Pages object
    const pagesObjContent = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;
    // Re-insert Pages object at slot index 1
    const secondObjStr = `2 0 obj\n${pagesObjContent}\nendobj\n`;
    objects.splice(1, 0, secondObjStr);

    // Recompute offsets accurately
    byteOffset = header.length;
    offsets.length = 0;
    objects.forEach((obj) => {
      offsets.push(byteOffset);
      byteOffset += obj.length;
    });

    // Cross-reference table (xref)
    const xrefOffset = byteOffset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((off) => {
      xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
    });

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const fullPdfString = header + objects.join('') + xref + trailer;
    const encoder = new TextEncoder();
    return encoder.encode(fullPdfString);
  }

  /**
   * Helper: Triggers direct application PDF download
   */
  public static downloadPdfFile(data: ReportFullData, filename?: string, design: ReportDesign = 'CLASSIC'): void {
    const bytes = this.generatePdf(data, design);
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `JAMANVAAR_POS_REPORT_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }
}
