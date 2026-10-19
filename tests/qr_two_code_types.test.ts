import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { designSvg, DEFAULT_DESIGN } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/qrPrint';
import { websiteQrPrintDesignSchema } from '../cloud/api/src/modules/qr/qr-restaurant-page.schema';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('restaurant page QR and table ordering QR separation', () => {
  const data = {
    restaurantName: 'River Kitchen',
    branchName: 'West',
    tableLabel: 'VISIT OUR WEBSITE',
    tagline: 'Menu · Story · Contact',
    url: 'https://example.test/q/site/river-west-12345'
  };
  it.each(['website', 'website-minimal', 'website-cafe'] as const)(
    '%s prints a decodable QR for the restaurant page and custom instructions',
    async (template) => {
      const svg = designSvg(data, { ...DEFAULT_DESIGN, template, instruction: 'Explore our restaurant', footer: 'Visit us again' });
      const { data: bytes, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(jsQR(new Uint8ClampedArray(bytes), info.width, info.height)?.data).toBe(data.url);
      expect(svg).toContain('Explore our restaurant');
      expect(svg).not.toContain('Scan to Order');
    }
  );
  it('uses separate schema restrictions so saving a poster cannot turn table cards into website posters', () => {
    expect(websiteQrPrintDesignSchema.safeParse({ ...DEFAULT_DESIGN, template: 'website' }).success).toBe(true);
    expect(websiteQrPrintDesignSchema.safeParse(DEFAULT_DESIGN).success).toBe(false);
    expect(websiteQrPrintDesignSchema.safeParse({ ...DEFAULT_DESIGN, template: 'website', destination: 'https://attacker.test' }).success).toBe(false);
  });
  it('escapes custom messages and does not embed a remote or script logo', () => {
    const svg = designSvg(
      { ...data, logoUrl: 'javascript:alert(1)' },
      { ...DEFAULT_DESIGN, template: 'website-cafe', instruction: '<img src=x onerror=alert(1)>' }
    );
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('javascript:');
    expect(svg).toContain('&lt;img');
  });
  it('fresh table scans do not auto-enter the website even when old page-first content is stored', () => {
    const source = readFileSync(resolve('apps/qr-guest/src/App.tsx'), 'utf8');
    expect(source).not.toMatch(/entryMode==='PAGE'.*setScreen\('HOME'\)/);
    expect(source).toContain("?? 'MENU'");
  });
});
