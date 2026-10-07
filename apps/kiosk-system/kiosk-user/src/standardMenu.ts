import type { Category, MenuItem } from '@jamanvaar/types';
import { isMenuPlaceholder, menuCategoryImage } from '@jamanvaar/utils';
export interface StandardMenu {
  categories: Category[];
  items: MenuItem[];
  unclassified: Array<{ name: string; storedCategory: string }>;
}
/** Customer navigation reflects the restaurant's real category IDs, labels and order. */
export function buildStandardMenu(categories: Category[], items: MenuItem[], branchId?: string): StandardMenu {
  const active = categories.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const ids = new Set(active.map(c => c.id));
  const visible = items.filter(i => !i.archivedAt && i.isAvailable && i.isKioskEnabled !== false && (!i.salesChannels || i.salesChannels.includes('KIOSK')) && (!i.branchIds?.length || (!!branchId && i.branchIds.includes(branchId))));
  return {
    categories: active.map(category => {
      const first = visible.find(item => item.categoryId === category.id && !isMenuPlaceholder(item.imageUrl));
      const cover = menuCategoryImage(category.imageUrl, category.name, category.description, category.templateCategoryKey);
      const imageUrl = isMenuPlaceholder(cover) ? first?.imageUrl : cover;
      return { ...category, imageUrl };
    }),
    items: visible.filter(i => ids.has(i.categoryId)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    unclassified: visible.filter(i => !ids.has(i.categoryId)).map(i => ({ name: i.name, storedCategory: i.categoryId }))
  };
}
