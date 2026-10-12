import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QR Settings used to carry its own full branding editor (BrandingForm: heading, messages,
 * colour, logo) duplicating Customer Branding's QrBrandStudio -- same fields, same API, two
 * separate drafts, no live preview on the Settings copy and no link between the two pages.
 * Now QR Settings only points at Customer Branding, which is the one editor with a live preview.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx');

describe('QR Settings: one branding editor, not two', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the duplicate BrandingForm editor is gone', () => {
    expect(src).not.toMatch(/function BrandingForm/);
    expect(src).not.toMatch(/<BrandingForm/);
  });

  it('QR Settings instead links to Customer Branding (the one editor with a live preview)', () => {
    expect(src).toMatch(/navigate\("BRAND"\)/);
    expect(src).toMatch(/Open Customer Branding/);
  });
});
