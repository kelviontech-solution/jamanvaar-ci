import type { ModifierGroup, ModifierOption } from '@jamanvaar/types';

export type ChoiceOption = Omit<ModifierOption, 'priceDelta'> & { priceDelta: number | string };
export type ChoiceGroup = Omit<ModifierGroup, 'options' | 'minSelections' | 'maxSelections'> & {
  kind?: 'SIZE' | 'ADD_ON';
  minSelections: number | string;
  maxSelections: number | string;
  options: ChoiceOption[];
};
export function categoryChoiceIds(category?: { defaultModifierGroupIds?: unknown }): string[] {
  return Array.isArray(category?.defaultModifierGroupIds)
    ? [...new Set(category.defaultModifierGroupIds.filter((id): id is string => typeof id === 'string'))]
    : [];
}
/** Defaults are copied on creation/category selection, never applied retroactively to saved dishes. */
export function replaceCategoryChoices(current: string[], previous: string[], next: string[]): string[] {
  return [...new Set([...current.filter((id) => !previous.includes(id)), ...next])];
}
export function makeChoiceGroup(kind: 'SIZE' | 'ADD_ON'): ChoiceGroup {
  const id = crypto.randomUUID(),
    names = kind === 'SIZE' ? ['Normal', 'Medium', 'Large'] : [''];
  return {
    id,
    kind,
    name: kind === 'SIZE' ? 'Size' : 'Add-ons',
    minSelections: kind === 'SIZE' ? 1 : 0,
    maxSelections: kind === 'SIZE' ? 1 : 0,
    isRequired: kind === 'SIZE',
    sortOrder: 0,
    options: names.map((name, sortOrder) => ({ id: crypto.randomUUID(), groupId: id, name, priceDelta: 0, isAvailable: true, sortOrder }))
  };
}
export function copyChoiceGroup(group: ChoiceGroup): ChoiceGroup {
  const id = crypto.randomUUID();
  return { ...group, id, options: group.options.map((option) => ({ ...option, id: crypto.randomUUID(), groupId: id })) };
}
/** Validate all selected groups, and normalize money/limits before the existing canonical sync API is used. */
export function validatedChoices(ids: string[], groups: ChoiceGroup[]): ModifierGroup[] {
  if (ids.length > 50 || new Set(ids).size !== ids.length) throw Error('Use at most 50 distinct choice groups.');
  return ids.map((id) => {
    const group = groups.find((row) => row.id === id);
    if (!group) throw Error('A selected choice group no longer exists. Remove it or choose another group.');
    const name = group.name.trim(),
      min = Number(group.minSelections ?? 0),
      max = Number(group.maxSelections ?? 0);
    if (!name || name.length > 120) throw Error('Give each choice group a name up to 120 characters.');
    if (
      group.minSelections === '' ||
      group.maxSelections === '' ||
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max < 0 ||
      min > 50 ||
      max > 50 ||
      (max > 0 && min > max)
    )
      throw Error(`${name}: enter valid minimum and maximum choices (0 maximum means any).`);
    if (!group.options.length || group.options.length > 100) throw Error(`${name}: add between 1 and 100 options.`);
    const optionNames = new Set<string>();
    const options = group.options.map((option) => {
      const label = option.name.trim(),
        amount = Number(option.priceDelta);
      if (!label || label.length > 120) throw Error(`${name}: give every option a name up to 120 characters.`);
      if (optionNames.has(label.toLowerCase())) throw Error(`${name}: option names must be different.`);
      optionNames.add(label.toLowerCase());
      if (
        option.priceDelta === '' ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 1_000_000 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
      )
        throw Error(`${name} / ${label}: enter a non-negative extra price with at most two decimal places.`);
      return { ...option, name: label, priceDelta: Math.round(amount * 100) / 100 };
    });
    const minimum = Math.max(min, group.isRequired ? 1 : 0);
    if (minimum > options.filter((option) => option.isAvailable !== false).length || (max > 0 && minimum > max))
      throw Error(`${name}: required choices exceed the available options or maximum.`);
    if (group.kind === 'SIZE' && (minimum !== 1 || max !== 1)) throw Error(`${name}: a size group must require exactly one choice.`);
    return { ...group, name, minSelections: minimum, maxSelections: max, isRequired: minimum > 0, options };
  });
}
