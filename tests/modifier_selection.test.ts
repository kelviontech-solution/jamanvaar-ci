import { describe, it, expect } from 'vitest';
import { resolveModifierGroups, defaultModifierSelection, selectionToModifiers, missingRequiredGroups } from '@jamanvaar/business';
import type { ModifierGroup, MenuItem } from '@jamanvaar/types';

/**
 * BUG-112: Captain's dish dialog offered the same four made-up options (spice, Jain, Extra Cheese
 * +₹40, Extra Butter +₹25) on every dish, ignoring the modifier groups the restaurant set up.
 */
const opt = (id: string, groupId: string, name: string, priceDelta = 0, extra: object = {}) => ({ id, groupId, name, priceDelta, isAvailable: true, sortOrder: 1, ...extra });
const groups: ModifierGroup[] = [
  { id: 'g-spice', name: 'Spice Level', minSelections: 1, maxSelections: 1, isRequired: true, sortOrder: 2, options: [opt('o-mild', 'g-spice', 'Mild', 0, { isDefault: true }), opt('o-hot', 'g-spice', 'Hot')] },
  { id: 'g-extras', name: 'Extras', minSelections: 0, maxSelections: 2, isRequired: false, sortOrder: 1, options: [opt('o-cheese', 'g-extras', 'Cheese', 30), opt('o-gone', 'g-extras', 'Sold out', 10, { isAvailable: false })] },
  { id: 'g-empty', name: 'Nothing', minSelections: 0, maxSelections: 1, isRequired: false, sortOrder: 3, options: [] }
];
const dish = (modifierGroupIds: string[]) => ({ id: 'd', modifierGroupIds }) as unknown as MenuItem;

describe('Dish options from the restaurant\'s own modifier groups (BUG-112)', () => {
  it('a dish with no modifier groups offers no options', () => {
    expect(resolveModifierGroups(dish([]), groups)).toEqual([]);
    expect(resolveModifierGroups({ id: 'x' } as MenuItem, groups)).toEqual([]);
  });

  it('offers only that dish\'s groups, in order, with sold-out options and empty groups left out', () => {
    const resolved = resolveModifierGroups(dish(['g-spice', 'g-extras', 'g-empty', 'g-missing']), groups);
    expect(resolved.map((g) => g.id)).toEqual(['g-extras', 'g-spice']);
    expect(resolved[0].options.map((o) => o.id)).toEqual(['o-cheese']);
  });

  it('starts with each group\'s default option chosen', () => {
    const resolved = resolveModifierGroups(dish(['g-spice', 'g-extras']), groups);
    expect(defaultModifierSelection(resolved)).toEqual({ 'g-spice': ['o-mild'] });
  });

  it('turns the chosen options into order modifiers with their real prices', () => {
    const resolved = resolveModifierGroups(dish(['g-spice', 'g-extras']), groups);
    const mods = selectionToModifiers(resolved, { 'g-spice': ['o-hot'], 'g-extras': ['o-cheese'] });
    expect(mods).toEqual([
      { groupId: 'g-extras', groupName: 'Extras', optionId: 'o-cheese', optionName: 'Cheese', priceDelta: 30 },
      { groupId: 'g-spice', groupName: 'Spice Level', optionId: 'o-hot', optionName: 'Hot', priceDelta: 0 }
    ]);
  });

  it('ignores options that do not belong to the group and respects the maximum', () => {
    const resolved = resolveModifierGroups(dish(['g-spice']), groups);
    const mods = selectionToModifiers(resolved, { 'g-spice': ['o-mild', 'o-hot', 'o-cheese'] });
    expect(mods.map((m) => m.optionId)).toEqual(['o-mild']);
  });

  it('says which required groups still need a choice', () => {
    const resolved = resolveModifierGroups(dish(['g-spice', 'g-extras']), groups);
    expect(missingRequiredGroups(resolved, {})).toEqual(['Spice Level']);
    expect(missingRequiredGroups(resolved, { 'g-spice': ['o-hot'] })).toEqual([]);
  });
});
