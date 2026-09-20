import { MenuItem, ModifierGroup, SelectedModifier } from '@jamanvaar/types';

export interface ModifierValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * True only when at least one of an item's modifier groups actually demands
 * a choice before the item is a valid order (matches validateModifiers'
 * own definition of "required" below: isRequired OR minSelections > 0). An
 * item whose only modifier groups are optional add-ons (extra cheese, etc.)
 * returns false here — a UI can use that to add such an item straight to
 * cart with its defaults instead of forcing a customization step open for
 * every item that merely has *some* modifier group.
 */
export function hasRequiredModifierGroup(groups: ModifierGroup[] | undefined | null): boolean {
  return Boolean(groups?.some((g) => g.isRequired || g.minSelections > 0));
}

/**
 * Validates selected modifiers against a list of modifier groups
 */
export function validateModifiers(
  groups: ModifierGroup[],
  selectedModifiers: SelectedModifier[]
): ModifierValidationResult {
  const errors: string[] = [];

  for (const group of groups) {
    const selectedInGroup = selectedModifiers.filter((m) => m.groupId === group.id);
    const count = selectedInGroup.length;

    if (group.isRequired && count === 0) {
      errors.push(`Please select at least one option for '${group.name}'.`);
    }

    if (group.minSelections > 0 && count < group.minSelections) {
      errors.push(`'${group.name}' requires at least ${group.minSelections} selection(s).`);
    }

    if (group.maxSelections > 0 && count > group.maxSelections) {
      errors.push(`'${group.name}' allows at most ${group.maxSelections} selection(s).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export type ModifierSelection = Record<string, string[]>;

/** The modifier groups a dish really has: its own groups, with sold-out options and empty groups left out. */
export function resolveModifierGroups(item: MenuItem, allGroups: ModifierGroup[]): ModifierGroup[] {
  const ids = item.modifierGroupIds ?? [];
  return ids
    .map((id) => allGroups.find((g) => g.id === id))
    .filter((g): g is ModifierGroup => !!g)
    .map((g) => ({ ...g, options: g.options.filter((o) => o.isAvailable).sort((a, b) => a.sortOrder - b.sortOrder) }))
    .filter((g) => g.options.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Each group's default option(s), so a required group starts valid. */
export function defaultModifierSelection(groups: ModifierGroup[]): ModifierSelection {
  const selection: ModifierSelection = {};
  for (const g of groups) {
    const defaults = g.options.filter((o) => o.isDefault).slice(0, Math.max(1, g.maxSelections));
    if (defaults.length > 0) selection[g.id] = defaults.map((o) => o.id);
  }
  return selection;
}

/** The order modifiers for what was chosen, with their real prices. Unknown options and anything past a group's maximum are ignored. */
export function selectionToModifiers(groups: ModifierGroup[], selection: ModifierSelection): SelectedModifier[] {
  const out: SelectedModifier[] = [];
  for (const g of groups) {
    const chosen = (selection[g.id] ?? []).slice(0, Math.max(1, g.maxSelections));
    for (const optionId of chosen) {
      const option = g.options.find((o) => o.id === optionId);
      if (option) out.push({ groupId: g.id, groupName: g.name, optionId: option.id, optionName: option.name, priceDelta: option.priceDelta });
    }
  }
  return out;
}

/** Names of required groups that have fewer choices than they need. */
export function missingRequiredGroups(groups: ModifierGroup[], selection: ModifierSelection): string[] {
  return groups
    .filter((g) => g.isRequired && (selection[g.id]?.length ?? 0) < Math.max(1, g.minSelections))
    .map((g) => g.name);
}
