import { describe, it, expect, beforeEach } from 'vitest';
import { db, ModifierAuthoring, TaxAuthoring, validateModifierGroup, validateTaxGroup } from '../packages/database/src';

const opt = (name: string, priceDelta = 0) => ({ id: '', groupId: '', name, priceDelta, isAvailable: true, sortOrder: 0 });

describe('Restaurant authoring of modifier groups and tax groups', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('a valid group is saved with generated ids, ordered options and the group id on every option', () => {
    const g = ModifierAuthoring.save({ name: ' Cheese ', minSelections: 1, maxSelections: 1, isRequired: true, options: [opt('Regular'), opt('Extra Cheese', 40)] });
    expect(g.id).toMatch(/^mod-/);
    expect(g.name).toBe('Cheese');
    expect(g.options.map((o) => o.name)).toEqual(['Regular', 'Extra Cheese']);
    expect(g.options.map((o) => o.sortOrder)).toEqual([1, 2]);
    expect(g.options.every((o) => o.groupId === g.id && o.id.startsWith('opt-'))).toBe(true);
    expect(new Set(g.options.map((o) => o.id)).size).toBe(2);
    expect(ModifierAuthoring.list().some((x) => x.id === g.id)).toBe(true);
  });

  it('saving again with the same id edits the group in place (ids of existing options are kept)', () => {
    const g = ModifierAuthoring.save({ name: 'Size', minSelections: 0, maxSelections: 1, isRequired: false, options: [opt('Small'), opt('Large', 30)] });
    const again = ModifierAuthoring.save({ ...g, name: 'Portion', options: [g.options[0], { ...g.options[1], priceDelta: 35 }, opt('Family', 80)] });
    expect(again.id).toBe(g.id);
    expect(db.modifierGroups.filter((x) => x.id === g.id)).toHaveLength(1);
    expect(again.options[0].id).toBe(g.options[0].id);
    expect(again.options[1].priceDelta).toBe(35);
    expect(again.options).toHaveLength(3);
  });

  it('says in plain words what is wrong, and saves nothing', () => {
    const before = db.modifierGroups.length;
    expect(() => ModifierAuthoring.save({ name: '', minSelections: 0, maxSelections: 1, isRequired: false, options: [] })).toThrow(/name/);
    expect(() => ModifierAuthoring.save({ name: 'X', minSelections: 3, maxSelections: 2, isRequired: false, options: [opt('a'), opt('b'), opt('c')] })).toThrow(/minimum cannot be more/);
    expect(() => ModifierAuthoring.save({ name: 'X', minSelections: 1, maxSelections: 1, isRequired: true, options: [] })).toThrow(/at least one available option/);
    expect(() => ModifierAuthoring.save({ name: 'X', minSelections: 0, maxSelections: 2, isRequired: false, options: [opt('a', -5)] })).toThrow(/0 or more/);
    expect(() => ModifierAuthoring.save({ name: 'X', minSelections: 0, maxSelections: 2, isRequired: false, options: [opt('Same'), opt('same')] })).toThrow(/twice/);
    expect(db.modifierGroups.length).toBe(before);
    expect(validateModifierGroup({ name: 'ok', minSelections: 0, maxSelections: 0, isRequired: false, options: [opt('a')] })).toEqual([]);
  });

  it('deleting a group removes it from every dish that used it and reports how many', () => {
    const g = ModifierAuthoring.save({ name: 'Toppings', minSelections: 0, maxSelections: 3, isRequired: false, options: [opt('Olives', 10)] });
    const items = db.menuItems.slice(0, 2);
    items.forEach((i) => (i.modifierGroupIds = [...(i.modifierGroupIds ?? []), g.id]));
    expect(ModifierAuthoring.usedBy(g.id)).toHaveLength(2);
    expect(ModifierAuthoring.remove(g.id)).toBe(2);
    expect(db.modifierGroups.some((x) => x.id === g.id)).toBe(false);
    expect(items.every((i) => !i.modifierGroupIds.includes(g.id))).toBe(true);
  });

  it('tax groups are validated, and one that dishes still use cannot be deleted', () => {
    expect(validateTaxGroup({ name: '', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5 }).length).toBeGreaterThan(0);
    expect(validateTaxGroup({ name: 'GST', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 9 }).length).toBeGreaterThan(0);
    expect(validateTaxGroup({ name: 'GST', cgstPercent: 200, sgstPercent: 0, igstPercent: 0 }).length).toBeGreaterThan(0);
    const t = TaxAuthoring.save({ name: 'GST 12%', cgstPercent: 6, sgstPercent: 6, igstPercent: 12, isInclusive: false, isActive: true });
    db.menuItems[0].taxGroupId = t.id;
    expect(() => TaxAuthoring.remove(t.id)).toThrow(/still use this tax group/);
    db.menuItems[0].taxGroupId = undefined;
    TaxAuthoring.remove(t.id);
    expect(db.taxGroups.some((x) => x.id === t.id)).toBe(false);
  });
});
