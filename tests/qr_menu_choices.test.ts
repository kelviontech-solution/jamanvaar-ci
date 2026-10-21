import { describe, expect, it } from 'vitest';
import {
  categoryChoiceIds,
  copyChoiceGroup,
  makeChoiceGroup,
  replaceCategoryChoices,
  validatedChoices
} from '../apps/restaurant-system/pos-admin/src/components/qrconsole/menuChoiceDrafts';

describe('QR category defaults and individual dish choices', () => {
  it('copies category choices onto new dishes while retaining individual extras on category changes', () => {
    const defaults = categoryChoiceIds({ defaultModifierGroupIds: ['pizza-size', 'toppings', 'pizza-size'] });
    expect(defaults).toEqual(['pizza-size', 'toppings']);
    const next = replaceCategoryChoices([...defaults, 'individual-extra'], defaults, ['pasta-size']);
    expect(next).toEqual(['individual-extra', 'pasta-size']);
    expect(defaults).toEqual(['pizza-size', 'toppings']);
  });
  it('uses a separate group and option identity when customizing a dish, preserving category and sibling prices', () => {
    const original = makeChoiceGroup('SIZE');
    original.options[1].priceDelta = 50;
    const copy = copyChoiceGroup(original);
    copy.options[1].priceDelta = 80;
    expect(copy.id).not.toBe(original.id);
    expect(original.options[1].priceDelta).toBe(50);
    expect(copy.options.every((option, index) => option.id !== original.options[index].id && option.groupId === copy.id)).toBe(true);
    expect(copy.options.map((option) => option.name)).toEqual(['Normal', 'Medium', 'Large']);
  });
  it('normalizes rupee amounts and preserves required single-size selection', () => {
    const group = makeChoiceGroup('SIZE');
    group.options[1].priceDelta = '50.25';
    expect(validatedChoices([group.id], [group])[0]).toMatchObject({
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [{ priceDelta: 0 }, { priceDelta: 50.25 }, { priceDelta: 0 }]
    });
  });
  it('requires actual addon names and rejects duplicate, negative, blank and fractional-paise amounts', () => {
    const group = makeChoiceGroup('ADD_ON');
    expect(() => validatedChoices([group.id], [group])).toThrow(/every option a name/);
    group.options[0].name = 'Cheese';
    for (const amount of [-1, '', '1.005', Number.NaN]) {
      group.options[0].priceDelta = amount;
      expect(() => validatedChoices([group.id], [group])).toThrow(/extra price/);
    }
    group.options[0].priceDelta = 30;
    group.options.push({ ...group.options[0], id: 'other', name: 'cheese' });
    expect(() => validatedChoices([group.id], [group])).toThrow(/names must be different/);
  });
  it('rejects impossible selection constraints and missing groups', () => {
    const group = makeChoiceGroup('SIZE');
    group.options.forEach((option) => (option.isAvailable = false));
    expect(() => validatedChoices([group.id], [group])).toThrow(/available options/);
    group.options[0].isAvailable = true;
    group.maxSelections = 0;
    expect(() => validatedChoices([group.id], [group])).toThrow(/exactly one/);
    expect(() => validatedChoices(['missing'], [])).toThrow(/no longer exists/);
  });
  it('allows optional extras with a configured maximum and ignores unused drafts', () => {
    const group = makeChoiceGroup('ADD_ON');
    group.options[0].name = 'Cheese';
    group.maxSelections = '1';
    expect(validatedChoices([group.id], [group, makeChoiceGroup('ADD_ON')])[0]).toMatchObject({ minSelections: 0, maxSelections: 1, isRequired: false });
    group.minSelections = '2';
    expect(() => validatedChoices([group.id], [group])).toThrow(/minimum and maximum/);
  });
});
