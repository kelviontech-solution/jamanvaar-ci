import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-122: the "Version x is available" and maintenance bars were fixed over the top of every
 * restaurant app, so on Captain they sat on top of the header and hid (and blocked taps on) the
 * "Send Msg" and profile buttons until dismissed. They now take their own row at the top of the page,
 * so the app starts below them.
 */
describe('Notice and update bars take their own row (BUG-122)', () => {
  const source = readFileSync(join(__dirname, '../packages/ui/src/PlatformNoticeBanner.tsx'), 'utf8');

  it('neither bar is positioned over the app', () => {
    expect(source).not.toMatch(/className="fixed /);
  });

  it('both bars stay visible at the top while the page scrolls', () => {
    expect(source.match(/sticky inset-x-0 top-0/g)?.length).toBe(2);
  });
});
