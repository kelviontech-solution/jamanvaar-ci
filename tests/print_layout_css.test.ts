import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-001 / BUG-037: "Print" produced a page with only the browser header and footer.
 * The Super Admin shell is a fixed-height (100vh) flex layout whose content area is a
 * scroll container (overflow-y: auto). Browsers print only what fits that box, so the
 * print rules must release those containers, otherwise the page body is empty.
 */
const css = readFileSync(join(__dirname, '../cloud/super-admin-web/src/layout/layout.css'), 'utf8');

function printBlocks(source: string): string {
  const out: string[] = [];
  let i = source.indexOf('@media print');
  while (i !== -1) {
    let depth = 0;
    let j = source.indexOf('{', i);
    const start = j;
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++;
      if (source[j] === '}' && --depth === 0) break;
    }
    out.push(source.slice(start, j + 1));
    i = source.indexOf('@media print', j);
  }
  return out.join('\n');
}

const billingCss = readFileSync(join(__dirname, '../cloud/super-admin-web/src/pages/Billing/billing.css'), 'utf8');

describe('Global print rules must not blank unrelated pages', () => {
  // billing.css is bundled into the whole app, so a bare `body * { visibility: hidden }` in its
  // print block hides EVERY page's content when printed (Welcome Kit, reports, ...).
  it('billing.css only hides the page while a Billing document sheet (.print-surface) is on screen', () => {
    const print = printBlocks(billingCss);
    const selectors = [...print.matchAll(/([^{}]*)\{/g)].map((m) => m[1].trim()).filter((sel) => /body\s*\*/.test(sel));
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel, 'unscoped `body *` rule in a global print block').toMatch(/body:has\(\.print-surface\)\s*\*/);
    }
  });
});

describe('Super Admin print layout', () => {
  const print = printBlocks(css);

  it('has print rules in the shared layout stylesheet', () => {
    expect(print.length).toBeGreaterThan(0);
  });

  it.each(['.app-shell', '.app-main', '.app-content'])('releases the fixed-height scroll container %s', (selector) => {
    const rule = new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{([^}]*)\\}`).exec(print);
    expect(rule, `${selector} has no print rule`).toBeTruthy();
    const body = rule![1];
    expect(body).toMatch(/height:\s*auto\s*!important/);
    expect(body).toMatch(/overflow:\s*visible\s*!important/);
  });

  it('hides the chrome that should never print (sidebar, top bar, banners)', () => {
    expect(print).toMatch(/\.sidebar/);
    expect(print).toMatch(/\.app-header/);
    expect(print).toMatch(/display:\s*none\s*!important/);
  });
});
