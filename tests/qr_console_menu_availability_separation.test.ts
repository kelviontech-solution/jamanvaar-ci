import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QrConsole.tsx's "MENU" tab renders QrCatalog (the full dish editor -- "Shared menu editor") and
 * QrMenuAvailability (a separate, per-branch "which published dishes can guests order right now"
 * toggle + publish control) stacked directly on top of each other with no visual break, for a
 * solo-QR restaurant that has no separate Restaurant Admin app. They are two real, different tools,
 * not an accidental duplicate -- but QrMenuAvailability's own copy still said "Edit dishes in Menu
 * & Categories" even in that exact context, where that page doesn't exist and the real editor was
 * already rendered directly above it, and nothing visually distinguished the two stacked dish
 * lists from each other. A Super Admin reported this as "the UI is broken / not proper", which,
 * read in context, was this: not a crash, a page that looks like one broken duplicated list.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src');

describe('QR console Menu tab: the dish editor and the availability/publish list read as two tools, not a duplicate', () => {
  it('QrMenuAvailability no longer unconditionally tells the solo-QR admin to go edit dishes on a page that, in that exact context, does not exist', () => {
    const src = readFileSync(join(SRC, 'components/qrconsole/QrAdvanced.tsx'), 'utf8');
    // The old, unconditional sentence must be gone as a flat string -- it now only appears inside
    // the non-solo-QR branch of a ternary, paired with the real "Open Menu & Categories" link.
    const unconditional = /<p className="text-sm text-slate-500">\s*Uses the same catalog, modifiers, taxes and branch availability as your\s*restaurant\. Edit dishes in Menu & Categories\./;
    expect(src).not.toMatch(unconditional);
    // The solo-QR branch must instead point at the editor actually on screen.
    expect(src).toMatch(/using Edit shared draft/);
  });

  it('uses an explicit editor/availability selector rather than stacking both menus', () => {
    const src = readFileSync(join(SRC, 'components/qrconsole/QrConsole.tsx'), 'utf8');
    expect(src).toContain('{tab === "MENU" && <QrMenuWorkspace');
    expect(src).toContain("['EDIT','AVAILABILITY']");
    expect(src).toContain('Edit shared draft');
    expect(src).toContain('Published guest availability');
    expect(src).toContain("mode==='EDIT'?<QrCatalog/>:<QrMenuAvailability");
    expect(src).not.toContain("mode==='EDIT'&&/^\\/qr\\//");
    expect(src).toContain('if(await requestQrLeave())setMode(value)');
  });
});
