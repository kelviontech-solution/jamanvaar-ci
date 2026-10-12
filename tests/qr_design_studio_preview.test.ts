import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QrDesignStudio's "Print preview" panel only ever rendered once a real, already-generated table
 * QR code existed (QrAdminApi.printData(row.qr.id)) -- a brand-new restaurant with zero tables yet
 * (the exact state this was reported in) saw a permanently empty preview panel saying "Generate a
 * table QR in Tables & QR to preview it here" no matter which of the 9 design presets, colors, or
 * text they picked. A design tool that cannot show what a design choice looks like until an
 * unrelated setup step is done on a different page first is the real "not proper / hard to use"
 * complaint, not a cosmetic one.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrAdvanced.tsx');

describe('QrDesignStudio: the preview panel works before any real table QR exists', () => {
  const src = readFileSync(SRC, 'utf8');

  it('builds a sample preview (using the restaurant\'s real logo where set) instead of only ever showing the real printData response', () => {
    expect(src).toMatch(/samplePreview/);
    expect(src).toMatch(/branding\.data\?\.logoUrl/);
    expect(src).toMatch(/previewData\s*=\s*preview\s*\?\?\s*samplePreview/);
  });

  it('the old dead-end empty state ("Generate a table QR ... to preview it here") is gone -- the panel now always has something to show', () => {
    expect(src).not.toMatch(/Generate a table QR in Tables & QR to preview it here\./);
  });

  it('a sample preview is clearly labelled as a sample, and cannot be downloaded as if it were a real, working QR code', () => {
    expect(src).toMatch(/Sample preview/);
    expect(src).toMatch(/disabled=\{busy \|\| isSample\}/);
    expect(src).toMatch(/disabled=\{isSample\}/);
  });

  it('the bottom export buttons explain why they are disabled when there is nothing to export yet, not just a silently greyed-out button', () => {
    expect(src).toMatch(/No active table QR codes yet — generate one in Tables & QR first\./);
  });

  it('the 9 design presets are more than an identical box with a 24px dot -- each shows its own accent as a real swatch', () => {
    expect(src).not.toMatch(/block w-6 h-6 rounded-full mb-2/);
    expect(src).toMatch(/linear-gradient\(135deg, \$\{t\.color\}/);
  });
});
