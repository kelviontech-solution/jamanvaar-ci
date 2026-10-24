import { useMemo } from 'react';
import { db } from '@jamanvaar/database';
import { Category, MenuItem } from '@jamanvaar/types';
import { getCanonicalCategoryKey } from '@jamanvaar/business';
import { formatCategoryDisplayLabel } from './PosCatalog';

export interface CategoryGroup {
  canonicalKey: string;
  displayLabel: string;
  categoryIds: string[];
  primaryCategory: Category;
  totalDishCount: number;
}

/** Dishes the POS counter grid can actually show: not archived, and sold through the POS channel. */
const isCounterDish = (item: MenuItem) => !item.archivedAt && (!item.salesChannels || item.salesChannels.includes('POS'));

/**
 * Categories that share a canonical group (e.g. two "Curries" categories from different imports)
 * collapse into one entry, so the same dish list is never split across two identical-looking
 * buttons.
 *
 * Every dish the grid shows must also be reachable from a category. A dish whose category is switched off, or whose
 * category never reached this terminal, used to appear only under "All Menu" (the rail was built from active categories
 * alone), so a freshly imported 40-dish menu looked like it had a single 12-dish category. Those dishes now get a group
 * of their own: an inactive category keeps its name, and a dish with no matching category is grouped by its subcategory
 * (or "Other dishes").
 */
export function buildCategoryGroups(categories: Category[], items: MenuItem[]): CategoryGroup[] {
  const groupMap = new Map<string, CategoryGroup>();
  const dishes = items.filter(isCounterDish);
  const countFor = (ids: string[]) => dishes.filter((i) => ids.includes(i.categoryId)).length;

  const addCategory = (cat: Category) => {
    const canonicalKey = getCanonicalCategoryKey(cat.name);
    const existing = groupMap.get(canonicalKey);
    if (existing) {
      if (!existing.categoryIds.includes(cat.id)) existing.categoryIds.push(cat.id);
      existing.totalDishCount = countFor(existing.categoryIds);
    } else {
      groupMap.set(canonicalKey, {
        canonicalKey,
        displayLabel: formatCategoryDisplayLabel(cat.name),
        categoryIds: [cat.id],
        primaryCategory: cat,
        totalDishCount: countFor([cat.id])
      });
    }
  };

  categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).forEach(addCategory);

  const covered = () => new Set(Array.from(groupMap.values()).flatMap((g) => g.categoryIds));

  // 1. Dishes in a category that exists but is switched off.
  const knownInactive = new Map(categories.filter((c) => !c.isActive).map((c) => [c.id, c]));
  const stillUncovered = () => dishes.filter((i) => !covered().has(i.categoryId));
  for (const dish of stillUncovered()) {
    const cat = knownInactive.get(dish.categoryId);
    if (cat) addCategory(cat);
  }

  // 2. Dishes whose category is not on this terminal at all.
  const orphans = stillUncovered();
  const byLabel = new Map<string, MenuItem[]>();
  for (const dish of orphans) {
    const label = (dish.subcategory || '').trim() || 'Other dishes';
    byLabel.set(label, [...(byLabel.get(label) ?? []), dish]);
  }
  let order = 10000;
  for (const [label, list] of byLabel) {
    const ids = Array.from(new Set(list.map((d) => d.categoryId)));
    const canonicalKey = `UNCATEGORISED:${label.toUpperCase()}`;
    groupMap.set(canonicalKey, {
      canonicalKey,
      displayLabel: formatCategoryDisplayLabel(label),
      categoryIds: ids,
      primaryCategory: { id: `uncategorised:${label}`, name: label, sortOrder: order++, isActive: true } as Category,
      totalDishCount: list.length
    });
  }

  return Array.from(groupMap.values());
}

/** Shared between the sidebar's category rail and the catalog grid so both count and group dishes identically. */
export function useCategoryGroups(): CategoryGroup[] {
  return useMemo(
    () => buildCategoryGroups(db.categories, db.menuItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.categories, db.menuItems]
  );
}
