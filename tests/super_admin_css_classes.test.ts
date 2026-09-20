import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-079 / BUG-070 / BUG-080: Super Admin used many CSS class names that no stylesheet defines
 * (floating-toast, modal-body, modal-card, login-shell, ...), so toasts rendered as plain text,
 * dialogs had no padding, and whole pages were unstyled. This scans the source: every class in
 * the checked list must be defined in some stylesheet, and the pages that were rebuilt must no
 * longer use the dead ones.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const css = walk(SRC, ['.css']).map((f) => readFileSync(f, 'utf8')).join('\n');
const definedClasses = new Set<string>();
for (const m of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) definedClasses.add(m[1]);

const tsx = walk(SRC, ['.tsx']);

/** Classes that matter visibly (from the bug's sweep). Each must be defined somewhere. */
const MUST_BE_DEFINED = [
  'floating-toast', 'banner', 'banner-error', 'error-banner', 'page-success',
  'modal-body', 'page-loading', 'loading-card', 'input-select', 'input-textarea',
  'label', 'btn-xs', 'page-container', 'page-header-actions', 'kpi-strip',
  'auth-shell', 'auth-card', 'auth-brand', 'auth-logo', 'auth-badge', 'auth-form', 'auth-error', 'auth-success'
];

describe('Super Admin stylesheet coverage (BUG-079/070/080)', () => {
  it.each(MUST_BE_DEFINED)('the class "%s" is defined in a stylesheet', (cls) => {
    expect(definedClasses.has(cls), `.${cls} is used or needed but not defined in any .css file`).toBe(true);
  });

  it('the Backups dialogs use the shared Modal, not the undefined modal-card / modal-close-btn / modal-error-banner', () => {
    const src = readFileSync(join(SRC, 'pages/Backups/BackupsPage.tsx'), 'utf8');
    expect(src).not.toMatch(/modal-card|modal-close-btn|modal-error-banner/);
  });

  it('the activation page no longer uses the dead login-* classes', () => {
    const src = readFileSync(join(SRC, 'pages/Activate/PlatformActivatePage.tsx'), 'utf8');
    expect(src).not.toMatch(/login-shell|login-card|login-brand|login-badge|login-platform-tag|login-form|login-error/);
  });

  it('the text-field rule does not stretch checkboxes and radios (BUG-066)', () => {
    // `.form-field input` used to give EVERY input width:100% and height:40px, so the "Mandatory update"
    // checkbox became a wide box and pushed its label out of view.
    const rule = /(?:^|\n)([^{}]*\.form-field input[^{}]*)\{[^}]*width:\s*100%/.exec(css);
    expect(rule, 'the shared text-field rule should exist').not.toBeNull();
    expect(rule![1]).toMatch(/\.form-field input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
    expect(rule![1]).not.toMatch(/\.form-field input\s*,/);
  });

  it('every CSS variable a stylesheet or inline style uses is defined by the theme (BUG-090)', () => {
    // The Support page used var(--bg-card) and var(--text-primary), which exist nowhere, so its cards
    // got no background or text colour from the theme and ignored dark mode.
    const defined = new Set<string>();
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    const sources = [...walk(SRC, ['.css']), ...tsx].map((f) => ({ f, text: readFileSync(f, 'utf8') }));
    const undefinedUses: string[] = [];
    for (const { f, text } of sources) {
      for (const m of text.matchAll(/var\((--[\w-]+)\s*(,?)/g)) {
        // A fallback, var(--x, #fff), is a deliberate optional variable.
        if (!defined.has(m[1]) && m[2] !== ',') undefinedUses.push(`${f.replace(SRC, '')}: ${m[1]}`);
      }
    }
    expect([...new Set(undefinedUses)]).toEqual([]);
  });

  it('every `floating-toast` / `banner-error` / `page-loading` used in a page is defined', () => {
    const used = new Set<string>();
    for (const f of tsx) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/className=["'`{][^"'`}]*?\b(floating-toast|banner-error|error-banner|page-loading|page-success|page-container)\b/g)) used.add(m[1]);
    }
    for (const cls of used) expect(definedClasses.has(cls), `.${cls}`).toBe(true);
  });

  it('Super Admin never imports the shared-package barrels that drag in the local device database', () => {
    // @jamanvaar/utils re-exports sound.ts, which imports the whole @jamanvaar/ui barrel, which imports
    // @jamanvaar/database - whose singleton starts polling a LAN-only bridge (localhost:5178) that has no
    // business running inside a cloud console. Use deep imports of the specific file instead.
    const offenders: string[] = [];
    for (const f of tsx.concat(walk(SRC, ['.ts']))) {
      const text = readFileSync(f, 'utf8');
      if (/from\s+['"]@jamanvaar\/(utils|ui|database|business|sync|api)['"]/.test(text)) offenders.push(f.replace(SRC, ''));
    }
    expect(offenders).toEqual([]);
  });
});
