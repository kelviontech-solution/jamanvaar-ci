import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards for defects found by driving the Captain screens live (BUG-104/105/107/108/114). The
 * screens can't be rendered in this test setup, so these read the source for the specific
 * mistakes that caused each defect.
 */
const CAPTAIN_SRC = join(__dirname, '../apps/restaurant-system/captain/src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|ts)$/.test(name) ? [path] : [];
  });
}

const read = (relative: string) => readFileSync(join(CAPTAIN_SRC, relative), 'utf8');

describe('Captain screens (BUG-104/105/107/108/114)', () => {
  it('no dialog runs a hook after its "closed" early return (blank-screen crash when opened)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(CAPTAIN_SRC, 'components')).filter((f) => f.endsWith('.tsx'))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      const returnAt = lines.findIndex((l) => /if \(!isOpen\b.*\) return null;/.test(l));
      if (returnAt < 0) continue;
      const laterHook = lines.slice(returnAt + 1).findIndex((l) => /^\s*(const|let)\b.*=\s*use[A-Z]\w*\(/.test(l) || /^\s*use[A-Z]\w*\(/.test(l));
      if (laterHook >= 0) offenders.push(`${file.replace(CAPTAIN_SRC, '')}:${returnAt + 1 + laterHook + 1}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the keypad shows the wrong-PIN error through the same path as typed entry', () => {
    const app = read('App.tsx');
    expect(app).not.toMatch(/setTimeout\(\(\) => login\(/);
    expect(app.match(/attemptLogin\(next\)/g)?.length).toBe(2);
  });

  it('there is no pre-assigned table list and no hard-coded zone names', () => {
    const floor = read('components/tables/CaptainFloorView.tsx');
    expect(floor).not.toMatch(/'14'/);
    expect(floor).not.toMatch(/Main Dining Hall|Family Zone/);
    expect(read('store/captainStore.ts')).not.toMatch(/assignedTableNumbers: \['/);
  });

  it('no screen falls back to a made-up waiter or cashier name', () => {
    const offenders = sourceFiles(CAPTAIN_SRC).filter((f) => /Rahul|Sharma|Amit Dave/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the table card reads the running order from the database, not from a store field that does not exist', () => {
    expect(read('components/tables/CaptainFloorView.tsx')).not.toMatch(/getState\(\) as any\)\.orders/);
  });
  it('every dialog closes with the Escape key, topmost first (BUG-114)', () => {
    const dialogs = [
      'components/tables/CaptainTableWorkspaceModal.tsx',
      'components/modals/CaptainGuestCountModal.tsx',
      'components/modals/CaptainMoreDrawer.tsx',
      'components/modals/CaptainNotificationsModal.tsx',
      'components/modals/CaptainQuickMessageModal.tsx',
      'components/modals/CaptainTransferMergeModal.tsx',
      'components/modals/CaptainModifierModal.tsx'
    ];
    const missing = dialogs.filter((f) => !/useEscapeToClose\(/.test(read(f)));
    expect(missing).toEqual([]);
  });
  it('the menu never shows a blank grid: an empty menu explains itself, and a sold-out dish is marked and cannot be picked', () => {
    const src = read('components/tables/CaptainTableWorkspaceModal.tsx');
    expect(src).toContain('captain-empty-menu');
    expect(src).toMatch(/const soldOut = item\.isAvailable === false/);
    expect(src).toContain('Sold out');
    expect(src).toMatch(/if \(!soldOut\) setCustomizingItem\(item\)/);
    expect(src).toMatch(/disabled=\{soldOut\}/);
  });

  it('the table workspace fits a phone: full screen, tappable controls, and a collapsible cart', () => {
    const src = read('components/tables/CaptainTableWorkspaceModal.tsx');
    expect(src).toContain('h-dvh');
    expect(src).toMatch(/hidden md:block[^"]*"[^>]*>\s*<div className="flex items-center justify-between min-w-\[500px\]/); // the stepper is skipped on a phone
    expect(src).toContain('aria-expanded={cartOpen}');
    // Every button a waiter presses with a thumb is at least 40px tall.
    const buttons = src.match(/<button[\s\S]*?>/g) ?? [];
    const tooSmall = buttons.filter((b) => /className="[^"]*\b(w-6 h-6|w-7 h-7|p-1\b)/.test(b));
    expect(tooSmall).toEqual([]);
  });
});
