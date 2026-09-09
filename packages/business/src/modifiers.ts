import { ModifierGroup, SelectedModifier } from '@jamanvaar/types';

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
