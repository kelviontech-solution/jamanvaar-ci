import { useMemo } from 'react';
import { db } from '@jamanvaar/database';
import { Category } from '@jamanvaar/types';
import { getCanonicalCategoryKey } from '@jamanvaar/business';
import { formatCategoryDisplayLabel } from './PosCatalog';

export interface CategoryGroup {
  canonicalKey: string;
  displayLabel: string;
  categoryIds: string[];
  primaryCategory: Category;
  totalDishCount: number;
}

/**
 * Categories that share a canonical group (e.g. two "Curries" categories from different imports)
 * collapse into one entry, so the same dish list is never split across two identical-looking
 * buttons. Shared between the sidebar's category rail and the catalog grid so both count and
 * group dishes identically.
 */
export function useCategoryGroups(): CategoryGroup[] {
  return useMemo(() => {
    const groupMap = new Map<string, CategoryGroup>();

    const activeCategories = db.categories
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    activeCategories.forEach((cat) => {
      const canonicalKey = getCanonicalCategoryKey(cat.name);
      const label = formatCategoryDisplayLabel(cat.name);
      const existing = groupMap.get(canonicalKey);

      if (existing) {
        if (!existing.categoryIds.includes(cat.id)) {
          existing.categoryIds.push(cat.id);
        }
        existing.totalDishCount = db.menuItems.filter((i) => existing.categoryIds.includes(i.categoryId)).length;
      } else {
        const matchingDishesCount = db.menuItems.filter((i) => i.categoryId === cat.id).length;
        groupMap.set(canonicalKey, {
          canonicalKey,
          displayLabel: label,
          categoryIds: [cat.id],
          primaryCategory: cat,
          totalDishCount: matchingDishesCount
        });
      }
    });

    return Array.from(groupMap.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.categories, db.menuItems]);
}
