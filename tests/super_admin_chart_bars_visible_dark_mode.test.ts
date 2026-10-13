import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Found by actually toggling dark mode and looking, not by reading code: .chart-bar-pillar-navy
 * uses `background: var(--jv-primary)` (dashboard.css), which is the right navy in light mode but
 * --jv-primary is redefined to near-white (#f1f5f9) in dark mode -- it's a dual-purpose token
 * (primary TEXT color in dark mode, bar FILL color here), so every navy-coloured chart bar on both
 * the Executive Dashboard (pre-existing) and the newly-added Reports & Analytics charts rendered
 * as a pale, barely-visible sliver against the dark card background instead of a distinct color.
 * Fixed with a dark-theme override using --jv-teal, which (unlike --jv-primary) stays a genuinely
 * visible, distinct hue in both themes.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/styles.css');

describe('Chart bars: navy pillar stays visible in dark mode, not near-white', () => {
  const src = readFileSync(SRC, 'utf8');

  it('has a dark-theme override for .chart-bar-pillar-navy that does not use --jv-primary', () => {
    const systemDark = /prefers-color-scheme: dark[\s\S]{0,4000}?\.chart-bar-pillar-navy\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    const manualDark = /root\[data-theme='dark'\]\s*\.chart-bar-pillar-navy\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(systemDark, 'expected a prefers-color-scheme: dark override').not.toBe('');
    expect(manualDark, 'expected a [data-theme="dark"] override').not.toBe('');
    expect(systemDark).not.toMatch(/--jv-primary/);
    expect(manualDark).not.toMatch(/--jv-primary/);
  });
});
