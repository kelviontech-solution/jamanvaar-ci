import type { Category, MenuItem } from '@jamanvaar/types';

type StandardId =
  | 'cat-thalis-meals'
  | 'cat-main-course'
  | 'cat-starters'
  | 'cat-breads'
  | 'cat-chinese-continental'
  | 'cat-beverages'
  | 'cat-desserts'
  | 'cat-combos-specials';

/** The default Indian restaurant category template: exactly these eight, in this order. */
export const STANDARD_CATEGORIES: Array<{ id: StandardId; name: string; slug: string; iconName: string; image: string }> = [
  { id: 'cat-thalis-meals', name: 'Thalis & Meals', slug: 'thalis-meals', iconName: 'UtensilsCrossed', image: '/assets/menu/thali/gujarati-thali.jpg' },
  { id: 'cat-main-course', name: 'Main Course', slug: 'main-course', iconName: 'ChefHat', image: '/assets/menu/main-course/PBM-06.jpg' },
  { id: 'cat-starters', name: 'Starters & Snacks', slug: 'starters-snacks', iconName: 'Flame', image: '/assets/menu/starters/HBK-01.jpg' },
  { id: 'cat-breads', name: 'Breads & Rice', slug: 'breads-rice', iconName: 'Wheat', image: '/assets/menu/breads/BN-07.jpg' },
  { id: 'cat-chinese-continental', name: 'Chinese & Continental', slug: 'chinese-continental', iconName: 'Soup', image: '/assets/menu/chinese/hakka-noodles.jpg' },
  { id: 'cat-beverages', name: 'Beverages', slug: 'beverages', iconName: 'CupSoda', image: '/assets/menu/beverages/cold-coffee.jpg' },
  { id: 'cat-desserts', name: 'Desserts', slug: 'desserts', iconName: 'IceCream', image: '/assets/menu/desserts/gulab-jamun.jpg' },
  { id: 'cat-combos-specials', name: 'Combos & Specials', slug: 'combos-specials', iconName: 'Sparkles', image: '/assets/menu/biryani/royal-veg-biryani.jpg' }
];

// Product names are checked first, in this order, so each dish lands where it belongs even when
// its stored category is wrong (e.g. Shahi Gulab Jamun stored under Beverages is still a dessert).
const ITEM_RULES: Array<{ id: StandardId; pattern: RegExp }> = [
  { id: 'cat-thalis-meals', pattern: /thali|thal\b|meal/i },
  { id: 'cat-combos-specials', pattern: /combo|deal|platter|special offer/i },
  { id: 'cat-beverages', pattern: /coffee|\btea\b|chai|juice|shake|chaas|lassi|mojito|mocktail|soda|cola|drink|buttermilk|smoothie|lemonade/i },
  { id: 'cat-desserts', pattern: /gulab|jamun|dessert|sweet|mithai|ice ?cream|kulfi|halwa|brownie|rasmalai|kheer|falooda|sizzler|rabri|barfi|ladoo|jalebi/i },
  { id: 'cat-chinese-continental', pattern: /noodle|manchurian|fried rice|chilli paneer|chili paneer|chinese|schezwan|hakka|pasta|pizza|burger|continental/i },
  { id: 'cat-breads', pattern: /naan|roti|paratha|kulcha|bread|rice|biryani|pulao|pulav|khichdi|rotla|bajra/i },
  { id: 'cat-starters', pattern: /kebab|kabab|tikka|corn|roll|samosa|pakora|chaat|sandwich|starter|snack|tandoor|vada|bite|tiffin/i },
  { id: 'cat-main-course', pattern: /dal|curr|gravy|kurma|sabzi|sabji|shaak|shak|handi|masala|paneer|saag|chhole|chole|makhani|lababdar|sev tameta/i }
];

// Used only when the product's own name matches nothing: the stored category's name decides.
const CATEGORY_RULES: Array<{ id: StandardId; pattern: RegExp }> = [
  { id: 'cat-thalis-meals', pattern: /thali|thal|meal/i },
  { id: 'cat-combos-specials', pattern: /combo|deal|offer|platter|chef/i },
  { id: 'cat-desserts', pattern: /dessert|sweet|mithai|ice ?cream|kulfi|halwa|brownie|jamun|rasmalai|kheer/i },
  { id: 'cat-beverages', pattern: /drink|beverage|juice|shake|chaas|lassi|coffee|\btea\b|mocktail|soda|buttermilk|smoothie/i },
  { id: 'cat-chinese-continental', pattern: /chinese|noodle|manchurian|fried rice|continental|pasta|pizza|wok|schezwan|hakka|burger/i },
  { id: 'cat-breads', pattern: /naan|roti|paratha|kulcha|bread|rice|biryani|pulao|pulav|khichdi|rotla/i },
  { id: 'cat-starters', pattern: /starter|snack|tandoor|tikka|kebab|kabab|samosa|pakora|chaat|corn|roll|tiffin|bite|sandwich/i },
  { id: 'cat-main-course', pattern: /curr|gravy|gravies|kurma|dal|sabzi|sabji|shaak|shak|handi|masala|paneer|punjabi|dhaba|royal|main/i }
];

const DEFAULT_ID: StandardId = 'cat-main-course';

function firstMatch(rules: Array<{ id: StandardId; pattern: RegExp }>, text: string): StandardId | null {
  const rule = rules.find((r) => r.pattern.test(text));
  return rule ? rule.id : null;
}

export interface StandardMenu {
  categories: Category[];
  items: MenuItem[];
  /** Products that matched neither their own name nor their stored category, and were placed in Main Course. */
  unclassified: Array<{ name: string; storedCategory: string }>;
}

/**
 * Re-expresses a restaurant's menu in the standard eight categories without touching its products:
 * each item keeps its id, name, price, image and options; only its categoryId changes. Stored
 * categories are not modified, so the saved menu and any cloud copy stay intact.
 */
export function buildStandardMenu(categories: Category[], items: MenuItem[]): StandardMenu {
  const storedName = new Map(categories.map((c) => [c.id, c.name]));
  const unclassified: StandardMenu['unclassified'] = [];

  const mappedItems = items.map((item) => {
    const stored = storedName.get(item.categoryId) ?? '';
    const id = firstMatch(ITEM_RULES, item.name) ?? firstMatch(CATEGORY_RULES, stored);
    if (!id) unclassified.push({ name: item.name, storedCategory: stored });
    return { ...item, categoryId: id ?? DEFAULT_ID };
  });

  const categoriesOut = STANDARD_CATEGORIES.map((standard, index) => ({
    id: standard.id,
    name: standard.name,
    slug: standard.slug,
    description: '',
    iconName: standard.iconName,
    sortOrder: index + 1,
    isActive: true,
    imageUrl: standard.image
  })) as Category[];

  return { categories: categoriesOut, items: mappedItems, unclassified };
}
