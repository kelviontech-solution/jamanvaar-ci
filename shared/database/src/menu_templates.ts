import { Category, ComboDeal, DietaryType, MenuItem, ModifierGroup, SpiceLevel } from '@jamanvaar/types';
import { PREBUILT_MENU_TEMPLATES_ALL, MenuTemplate, MenuTemplateCategory, MenuTemplateItem } from './menu_templates_data';

export * from './menu_templates_data';

export interface MenuImportRecord {
  id: string;
  templateId: string;
  templateName: string;
  importedAt: string;
  importedCategoriesCount: number;
  importedItemsCount: number;
  strategy: 'KEEP_EXISTING' | 'REPLACE_DUPLICATE' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE';
  version: string;
}

export const PREBUILT_MENU_TEMPLATES: MenuTemplate[] = PREBUILT_MENU_TEMPLATES_ALL;
