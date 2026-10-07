import type { ModifierGroup, ModifierOption, TaxGroup } from '@jamanvaar/types';
import { db } from './db';
import { ModifierGroupSync, TaxGroupSync, MenuItemSync } from './collection_sync';

/**
 * The restaurant's own authoring of what guests can customise and what tax applies: modifier groups with priced options,
 * and tax groups. Everything here is ordinary menu data that syncs like a dish and reaches guests only when the restaurant
 * publishes. Nothing is hardcoded: a restaurant that never creates a group simply has no customisations, and a dish with no
 * tax group is taxed at 0% rather than at a guessed rate.
 */

const rand = (): string => globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
export const newAuthoringId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${rand()}`;

export interface AuthoringIssue { field: string; message: string }

/** What is wrong with a modifier group, in words a restaurant owner can act on. Empty means it can be saved. */
export function validateModifierGroup(group: Pick<ModifierGroup, 'name' | 'minSelections' | 'maxSelections' | 'isRequired' | 'options'>): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const name = (group.name ?? '').trim();
  if (!name) issues.push({ field: 'name', message: 'Give the group a name, for example "Choose your cheese".' });
  const min = group.minSelections;
  const max = group.maxSelections;
  if (!Number.isInteger(min) || min < 0) issues.push({ field: 'minSelections', message: 'The minimum must be 0 or more.' });
  if (!Number.isInteger(max) || max < 0) issues.push({ field: 'maxSelections', message: 'The maximum must be 0 (no limit) or more.' });
  if (Number.isInteger(min) && Number.isInteger(max) && max > 0 && min > max) issues.push({ field: 'maxSelections', message: 'The minimum cannot be more than the maximum.' });
  const live = (group.options ?? []).filter((o) => o.isAvailable !== false);
  if ((group.isRequired || min > 0) && live.length === 0) issues.push({ field: 'options', message: 'A required group needs at least one available option.' });
  if ((group.isRequired || min > 0) && min > live.length) issues.push({ field: 'minSelections', message: `You ask for at least ${min} but only ${live.length} option(s) are available.` });
  const seen = new Set<string>();
  (group.options ?? []).forEach((o, i) => {
    const label = `Option ${i + 1}`;
    if (!(o.name ?? '').trim()) issues.push({ field: `options.${i}.name`, message: `${label} needs a name.` });
    if (typeof o.priceDelta !== 'number' || !Number.isFinite(o.priceDelta) || o.priceDelta < 0) issues.push({ field: `options.${i}.priceDelta`, message: `${label}: the extra price must be 0 or more.` });
    const key = (o.name ?? '').trim().toLowerCase();
    if (key && seen.has(key)) issues.push({ field: `options.${i}.name`, message: `"${o.name}" appears twice in this group.` });
    seen.add(key);
  });
  return issues;
}

export function validateTaxGroup(t: Pick<TaxGroup, 'name' | 'cgstPercent' | 'sgstPercent' | 'igstPercent'>): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  if (!(t.name ?? '').trim()) issues.push({ field: 'name', message: 'Give the tax group a name, for example "GST 5%".' });
  for (const [field, v] of [['cgstPercent', t.cgstPercent], ['sgstPercent', t.sgstPercent], ['igstPercent', t.igstPercent]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) issues.push({ field, message: 'A tax percentage must be between 0 and 100.' });
  }
  if (t.igstPercent > 0 && Math.abs(t.igstPercent - (t.cgstPercent + t.sgstPercent)) > 0.001 && t.cgstPercent + t.sgstPercent > 0) {
    issues.push({ field: 'igstPercent', message: 'IGST should equal CGST + SGST (or leave CGST and SGST at 0).' });
  }
  return issues;
}

export class ModifierAuthoring {
  static list(): ModifierGroup[] {
    return [...db.modifierGroups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  /** Creates or updates a group. Options keep the order they are given in, which is the order guests see. Throws with the reasons when invalid. */
  static save(input: Omit<ModifierGroup, 'id' | 'sortOrder'> & { id?: string; sortOrder?: number }): ModifierGroup {
    const options: ModifierOption[] = (input.options ?? []).map((o, i) => ({
      ...o,
      id: o.id || newAuthoringId('opt'),
      groupId: input.id ?? '',
      name: (o.name ?? '').trim(),
      priceDelta: typeof o.priceDelta === 'number' ? Math.round(o.priceDelta * 100) / 100 : 0,
      isAvailable: o.isAvailable !== false,
      sortOrder: i + 1
    }));
    const issues = validateModifierGroup({ ...input, options });
    if (issues.length > 0) throw new Error(issues.map((i) => i.message).join(' '));
    const id = input.id || newAuthoringId('mod');
    const existing = db.modifierGroups.find((g) => g.id === id);
    const group: ModifierGroup = {
      ...(existing ?? {}),
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      minSelections: input.isRequired ? Math.max(1, input.minSelections) : input.minSelections,
      maxSelections: input.maxSelections,
      isRequired: input.isRequired,
      options: options.map((o) => ({ ...o, groupId: id })),
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? db.modifierGroups.length + 1
    };
    if (existing) Object.assign(existing, group);
    else db.modifierGroups.push(group);
    db.notify();
    return group;
  }

  /** Deletes a group and takes it off every dish that used it. Returns how many dishes were changed. */
  static remove(id: string): number {
    const idx = db.modifierGroups.findIndex((g) => g.id === id);
    if (idx < 0) return 0;
    db.modifierGroups.splice(idx, 1);
    ModifierGroupSync.recordDeletion(id);
    let changed = 0;
    for (const item of db.menuItems) {
      if ((item.modifierGroupIds ?? []).includes(id)) {
        item.modifierGroupIds = item.modifierGroupIds.filter((g) => g !== id);
        changed++;
      }
    }
    if (changed > 0) MenuItemSync.stampChanges();
    db.notify();
    return changed;
  }

  /** Which dishes use this group. */
  static usedBy(id: string): string[] {
    return db.menuItems.filter((i) => (i.modifierGroupIds ?? []).includes(id)).map((i) => i.name);
  }
}

export class TaxAuthoring {
  static list(): TaxGroup[] {
    return [...db.taxGroups];
  }

  static save(input: Omit<TaxGroup, 'id'> & { id?: string }): TaxGroup {
    const issues = validateTaxGroup(input);
    if (issues.length > 0) throw new Error(issues.map((i) => i.message).join(' '));
    const id = input.id || newAuthoringId('tax');
    const existing = db.taxGroups.find((t) => t.id === id);
    const isDefault = input.isDefault === true && input.isActive;
    const group: TaxGroup = { id, name: input.name.trim(), cgstPercent: input.cgstPercent, sgstPercent: input.sgstPercent, igstPercent: input.igstPercent, isInclusive: input.isInclusive, isActive: input.isActive, isDefault };
    // One default only: marking this group clears the flag on the rest, so untaxed dishes always have one clear rate.
    if (isDefault) for (const other of db.taxGroups) if (other.id !== id) other.isDefault = false;
    if (existing) Object.assign(existing, group);
    else db.taxGroups.push(group);
    db.notify();
    return group;
  }

  static usedBy(id: string): string[] {
    return db.menuItems.filter((i) => i.taxGroupId === id).map((i) => i.name);
  }

  /** A tax group that dishes still use cannot be deleted: it would silently make them tax-free. */
  static remove(id: string): void {
    const used = TaxAuthoring.usedBy(id);
    if (used.length > 0) throw new Error(`${used.length} dish(es) still use this tax group (${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''}). Move them to another tax group first.`);
    const idx = db.taxGroups.findIndex((t) => t.id === id);
    if (idx < 0) return;
    db.taxGroups.splice(idx, 1);
    TaxGroupSync.recordDeletion(id);
    db.notify();
  }
}
