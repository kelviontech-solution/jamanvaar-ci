import { describe, it, expect } from 'vitest';
import { db } from '@jamanvaar/database';
import { ReportGeneratorService } from '@jamanvaar/business';
import { PdfReportBuilder, ReportFullData } from '../apps/restaurant-system/pos/src/services/pdfReportBuilder';

/**
 * BUG-036: "Download PDF" produced a file viewers show as blank or broken. The old test only
 * checked for "%PDF-1.4", "%%EOF" and a few words, so it passed while the file had two objects
 * numbered 2, fonts pointing at the wrong objects and an xref table off by one. This one reads the
 * file the way a viewer does: xref offsets -> objects -> Root -> Pages -> Page -> Contents / Font.
 */
function parsePdf(bytes: Uint8Array) {
  const text = new TextDecoder('latin1').decode(bytes);
  const objects = new Map<number, { offset: number; body: string }>();
  const headerEnd = text.indexOf('\n') + 1;

  // Every "N 0 obj" in file order, so duplicates are visible rather than silently overwritten.
  const found: { num: number; offset: number }[] = [];
  for (const m of text.matchAll(/(?:^|\n)(\d+) 0 obj\n/g)) {
    const offset = m.index! + (m[0].startsWith('\n') ? 1 : 0);
    found.push({ num: Number(m[1]), offset });
  }
  for (const f of found) {
    const end = text.indexOf('\nendobj', f.offset);
    objects.set(f.num, { offset: f.offset, body: text.slice(f.offset, end) });
  }

  const startxref = Number(/startxref\n(\d+)\n%%EOF\s*$/.exec(text)?.[1]);
  const xrefBlock = text.slice(startxref);
  const header = /^xref\n0 (\d+)\n/.exec(xrefBlock);
  const size = Number(header?.[1]);
  const entries = xrefBlock
    .slice(header![0].length)
    .split('\n')
    .slice(0, size)
    .map((l) => l.trim().split(/\s+/));
  return { text, headerEnd, found, objects, startxref, size, entries };
}

const data = (rows: number): ReportFullData => {
  db.orders = [];
  const { summary } = ReportGeneratorService.getReportForPeriod('TODAY');
  return {
    title: 'Sales Report',
    periodLabel: 'Today',
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
    generatedAt: 'now',
    generatedBy: 'Cashier',
    summary,
    topItems: Array.from({ length: rows }, (_, i) => ({
      id: `it-${i}`, name: `Item number ${i + 1} with a longish name`, sku: `SKU-${i}`, categoryName: 'Main Course',
      quantitySold: i + 1, grossRevenue: (i + 1) * 100, avgPrice: 100
    })),
    cashiers: Array.from({ length: rows }, (_, i) => ({ name: `Cashier ${i + 1}`, ordersCount: 2, netSales: 903, cash: 588, upi: 315, card: 0 }))
  };
};

describe('PdfReportBuilder produces a structurally valid PDF (BUG-036)', () => {
  const designs = ['CLASSIC', 'MODERN', 'COMPACT', 'STATEMENT', 'BRANDED'] as const;

  it.each(designs)('%s: object numbers are unique and consecutive from 1', (design) => {
    const { found, size } = parsePdf(PdfReportBuilder.generatePdf(data(5), design));
    const nums = found.map((f) => f.num);
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
    expect(size).toBe(nums.length + 1);
  });

  it.each(designs)('%s: every xref entry points at the byte where that object really starts', (design) => {
    const { text, entries, found } = parsePdf(PdfReportBuilder.generatePdf(data(5), design));
    expect(entries[0]).toEqual(['0000000000', '65535', 'f']);
    found.forEach((f) => {
      const [offset, , kind] = entries[f.num];
      expect(kind).toBe('n');
      expect(text.slice(Number(offset)).startsWith(`${f.num} 0 obj`)).toBe(true);
    });
  });

  it.each(designs)('%s: Root -> Pages -> Page -> Contents and Fonts all resolve to the right kinds of object', (design) => {
    const { objects, text } = parsePdf(PdfReportBuilder.generatePdf(data(5), design));
    const root = /\/Root (\d+) 0 R/.exec(text)!;
    const catalog = objects.get(Number(root[1]))!.body;
    expect(catalog).toMatch(/\/Type \/Catalog/);

    const pagesId = Number(/\/Pages (\d+) 0 R/.exec(catalog)![1]);
    const pages = objects.get(pagesId)!.body;
    expect(pages).toMatch(/\/Type \/Pages/);

    const kids = [...pages.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
    expect(kids.length).toBe(Number(/\/Count (\d+)/.exec(pages)![1]));
    expect(kids.length).toBeGreaterThan(0);

    for (const kid of kids) {
      const page = objects.get(kid)!.body;
      expect(page).toMatch(/\/Type \/Page\b/);
      expect(Number(/\/Parent (\d+) 0 R/.exec(page)![1])).toBe(pagesId);

      const contents = objects.get(Number(/\/Contents (\d+) 0 R/.exec(page)![1]))!.body;
      expect(contents).toMatch(/stream\n[\s\S]*\nendstream/);

      const fontRefs = [...page.matchAll(/\/F\d (\d+) 0 R/g)].map((m) => Number(m[1]));
      expect(fontRefs.length).toBe(2);
      for (const ref of fontRefs) expect(objects.get(ref)!.body).toMatch(/\/Type \/Font/);
    }
  });

  it('a stream\'s /Length equals its real number of bytes', () => {
    const { objects } = parsePdf(PdfReportBuilder.generatePdf(data(5), 'CLASSIC'));
    for (const { body } of objects.values()) {
      const m = /\/Length (\d+) >>\nstream\n([\s\S]*)\nendstream/.exec(body);
      if (!m) continue;
      expect(m[2].length).toBe(Number(m[1]));
    }
  });

  it('a long report spills onto several pages, each with its own content stream', () => {
    const { objects, text } = parsePdf(PdfReportBuilder.generatePdf(data(120), 'CLASSIC'));
    const pages = objects.get(Number(/\/Pages (\d+) 0 R/.exec(objects.get(Number(/\/Root (\d+) 0 R/.exec(text)![1]))!.body)![1]))!.body;
    expect(Number(/\/Count (\d+)/.exec(pages)![1])).toBeGreaterThan(1);
  });
});
