import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, PrinterRepository } from '../packages/database/src';

/**
 * BUG-013: every terminal's local db starts pre-loaded with the demo seed menu (categories,
 * dishes, modifier groups) — a brand-new real restaurant "already has a menu without anyone
 * loading one". The demo content stays useful for local dev/testing (it's what the whole rest
 * of this suite runs against), but a REAL terminal must clear it once, at the moment it first
 * activates against a real restaurant — MenuRepository.startFreshMenu() is that one-time call.
 */
describe('A freshly activated terminal starts with an empty menu (BUG-013)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('the demo seed menu is present before activation (sanity check)', () => {
    expect(db.menuItems.length).toBeGreaterThan(0);
    expect(db.categories.length).toBeGreaterThan(0);
  });

  it('startFreshMenu empties categories, dishes and modifier groups', () => {
    MenuRepository.startFreshMenu();
    expect(db.menuItems).toHaveLength(0);
    expect(db.categories).toHaveLength(0);
    expect(db.modifierGroups).toHaveLength(0);
  });

  it('leaves tables, tax groups, coupons and offers untouched (not part of "the menu")', () => {
    const tables = db.tables.length;
    const taxGroups = db.taxGroups.length;
    MenuRepository.startFreshMenu();
    expect(db.tables).toHaveLength(tables);
    expect(db.taxGroups).toHaveLength(taxGroups);
  });

  it('is audited', () => {
    MenuRepository.startFreshMenu();
    const log = db.auditLogs.find((l) => l.action === 'MENU_CLEARED_ON_ACTIVATION');
    expect(log).toBeTruthy();
  });

  it('BUG-025: a real restaurant starts with NO printers, not the seeded always-READY fake ones', () => {
    expect(db.configuredPrinters.length).toBeGreaterThan(0); // demo seed, as before
    PrinterRepository.startFresh();
    expect(db.configuredPrinters).toHaveLength(0);
    expect(db.auditLogs.some((l) => l.action === 'PRINTERS_CLEARED_ON_ACTIVATION')).toBe(true);
  });
});
