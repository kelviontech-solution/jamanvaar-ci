/**
 * Resolves a menu item's or category's display name/description in a given
 * language, falling back to the base (English) field when no translation
 * exists for that language or that field. This is the one place that
 * fallback logic lives — every caller (ProductCard, CategoryCard, the
 * customization modal, combo cards) should go through this rather than
 * re-deciding "what if the translation is missing" for itself.
 */

export interface TranslatableEntity {
  name: string;
  description?: string;
  translations?: Record<string, { name: string; description?: string }>;
}

export function localizedName(entity: TranslatableEntity, lang: string): string {
  const translated = entity.translations?.[lang]?.name;
  return translated && translated.trim().length > 0 ? translated : entity.name;
}

export function localizedDescription(entity: TranslatableEntity, lang: string): string | undefined {
  const translated = entity.translations?.[lang]?.description;
  if (translated && translated.trim().length > 0) return translated;
  return entity.description;
}
