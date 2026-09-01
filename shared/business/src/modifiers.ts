import { ModifierGroup, SelectedModifier } from '@jamanvaar/types';

export interface ModifierValidationResult {
  isValid: boolean;
  errors: string[];
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
