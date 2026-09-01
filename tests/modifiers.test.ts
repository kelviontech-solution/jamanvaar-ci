import { describe, expect, it } from 'vitest';
import { validateModifiers } from '../shared/business/src/modifiers';
import { ModifierGroup } from '../shared/types/src/domain';

describe('Modifier Selection Validation', () => {
  const groups: ModifierGroup[] = [
    {
      id: 'grp-spice',
      name: 'Spice Level',
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      sortOrder: 1,
      options: [
        { id: 'opt-mild', groupId: 'grp-spice', name: 'Mild', priceDelta: 0, isAvailable: true, sortOrder: 1 },
        { id: 'opt-spicy', groupId: 'grp-spice', name: 'Spicy', priceDelta: 0, isAvailable: true, sortOrder: 2 }
      ]
    },
    {
      id: 'grp-addons',
      name: 'Addons',
      minSelections: 0,
      maxSelections: 2,
      isRequired: false,
      sortOrder: 2,
      options: [
        { id: 'opt-cheese', groupId: 'grp-addons', name: 'Cheese', priceDelta: 30, isAvailable: true, sortOrder: 1 },
        { id: 'opt-dip', groupId: 'grp-addons', name: 'Dip', priceDelta: 20, isAvailable: true, sortOrder: 2 },
        { id: 'opt-raita', groupId: 'grp-addons', name: 'Raita', priceDelta: 25, isAvailable: true, sortOrder: 3 }
      ]
    }
  ];

  it('fails when required group is missing selection', () => {
    const result = validateModifiers(groups, []);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes when required group has exactly one valid option', () => {
    const result = validateModifiers(groups, [
      { groupId: 'grp-spice', groupName: 'Spice Level', optionId: 'opt-mild', optionName: 'Mild', priceDelta: 0 }
    ]);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('fails when selections exceed maxSelections limit', () => {
    const result = validateModifiers(groups, [
      { groupId: 'grp-spice', groupName: 'Spice Level', optionId: 'opt-mild', optionName: 'Mild', priceDelta: 0 },
      { groupId: 'grp-addons', groupName: 'Addons', optionId: 'opt-cheese', optionName: 'Cheese', priceDelta: 30 },
      { groupId: 'grp-addons', groupName: 'Addons', optionId: 'opt-dip', optionName: 'Dip', priceDelta: 20 },
      { groupId: 'grp-addons', groupName: 'Addons', optionId: 'opt-raita', optionName: 'Raita', priceDelta: 25 }
    ]);
    expect(result.isValid).toBe(false);
  });
});
