import { describe, it, expect, beforeEach } from 'vitest';
import { db, RestaurantIdentityRepository } from '@jamanvaar/database';
import { ReportGeneratorService } from '@jamanvaar/business';
import { PdfReportBuilder, ReportFullData } from '../apps/restaurant-system/pos/src/services/pdfReportBuilder';

/**
 * BUG-036 / BUG-028: the PDF report header fell back to a made-up GSTIN (24AAACJ1234F1Z5), phone
 * (+91 98765 43210) and "Ahmedabad Flagship Store" address, printed "BY KELVIONTECH" and an
 * "AUTHENTIC HERITAGE DINING" tagline. A real restaurant's tax document must show only its own details.
 */
const pdfText = (bytes: Uint8Array) =>
  [...new TextDecoder('latin1').decode(bytes).matchAll(/\((.*)\) Tj/g)].map((m) => m[1]).join(' | ');

function report(): ReportFullData {
  const { summary } = ReportGeneratorService.getReportForPeriod('TODAY');
  return {
    title: 'Sales Report', periodLabel: 'Today', startDate: new Date().toISOString(), endDate: new Date().toISOString(),
    generatedAt: 'now', generatedBy: 'Cashier', summary, topItems: [], cashiers: []
  };
}

const designs = ['CLASSIC', 'MODERN', 'COMPACT', 'STATEMENT', 'BRANDED'] as const;

describe('PDF report headers use only the real restaurant identity (BUG-036)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.orders = [];
    RestaurantIdentityRepository.adopt('rest-pdf-1', { name: 'Royal Pan', address: '12 Main Road, Surat' });
  });

  it.each(designs)('%s: shows the real name and address and none of the demo identity', (design) => {
    const text = pdfText(PdfReportBuilder.generatePdf(report(), design));
    expect(text.toLowerCase()).toContain('royal pan');
    if (design !== 'COMPACT') expect(text).toContain('12 Main Road, Surat');

    for (const fake of ['KELVIONTECH', '24AAACJ1234F1Z5', '24ABCDE1234F1Z5', '98765 43210', 'Ahmedabad Flagship', 'AUTHENTIC HERITAGE', 'Traditional Dining', 'Sindhu Bhavan']) {
      expect(text, `found "${fake}"`).not.toContain(fake);
    }
  });

  it.each(['CLASSIC', 'MODERN', 'BRANDED', 'STATEMENT'] as const)('%s: a restaurant with no GSTIN says so instead of inventing one', (design) => {
    expect(pdfText(PdfReportBuilder.generatePdf(report(), design))).toMatch(/GSTIN: Not registered/);
  });

  it('prints the real GSTIN and phone when the restaurant has them', () => {
    RestaurantIdentityRepository.adopt('rest-pdf-2', { name: 'Royal Pan', gstin: '27AAAPL1234C1ZV', address: '12 Main Road, Surat' });
    const text = pdfText(PdfReportBuilder.generatePdf(report(), 'CLASSIC'));
    expect(text).toContain('GSTIN: 27AAAPL1234C1ZV');
    expect(text).not.toContain('Not registered');
  });
});
