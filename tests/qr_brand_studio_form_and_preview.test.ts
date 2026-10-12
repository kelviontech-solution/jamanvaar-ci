import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QrBrandStudio ("Customer Branding" page): the user reported the form layout and the live
 * preview were both "not proper." Two concrete, evidence-based issues found by reading the
 * component:
 *
 * 1. Live preview bug: the "Welcome heading" field (draft.welcomeTitle) only ever appeared in a
 *    tiny caption next to the logo. The big, prominent headline a guest actually sees was a
 *    hardcoded "Good food. / Great company." with no binding to any field at all -- typing into
 *    "Welcome heading" had zero visible effect on the one piece of preview text a guest would
 *    actually read as the welcome message.
 * 2. Form layout: the "Optional advanced branding" fieldset (and its "not licensed" notice) had
 *    no visual boundary -- just more stacked fields under a plain bold <legend>, indistinguishable
 *    from the basic fields above it. And "Use default logo" / "Use menu cover" were bare text
 *    links sitting right next to "Discard changes" / "Reset defaults," which ARE real bordered
 *    buttons -- same kind of action, two different visual weights.
 */
const SRC = join(
  __dirname,
  '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx',
);

describe('QrBrandStudio: live preview actually reflects the welcome heading field', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the big preview headline is driven by draft.welcomeTitle, with the old copy only as a fallback', () => {
    expect(src).toMatch(/draft\.welcomeTitle\s*\?[\s\S]{0,120}Good food\./);
  });
});

describe('QrBrandStudio: the advanced-branding section and its reset buttons read as a group, not loose stacked fields', () => {
  const src = readFileSync(SRC, 'utf8');
  const fieldsetOpen = /<fieldset[\s\S]{0,120}?className="([^"]*)"[\s\S]{0,80}?Optional advanced branding/.exec(src)?.[1] ?? '';

  it('the "Optional advanced branding" fieldset has a visible boundary (border/background), not just space-y spacing', () => {
    expect(fieldsetOpen).toMatch(/border/);
  });

  it('the "not licensed" notice reads as a flagged callout box, not a plain paragraph', () => {
    expect(src).toMatch(/QR Branding is not included in this license\./);
    const noticeBlock = /<p className="([^"]*)">\s*QR Branding is not included in this license\./.exec(src)?.[1] ?? '';
    expect(noticeBlock).toMatch(/border/);
  });

  it('"Use default logo" and "Use menu cover" are styled as real buttons, matching Discard changes\' visual weight', () => {
    const matches = [...src.matchAll(/className="([^"]*)"\s*\n\s*onClick=\{\(\) => setImages\(\(p: any\) => \(\{ \.\.\.p, (logo|cover): null \}\)\)\}/g)];
    expect(matches.length, 'expected both "Use default logo" and "Use menu cover" buttons').toBe(2);
    for (const m of matches) {
      expect(m[1]).toMatch(/border/);
    }
  });
});
