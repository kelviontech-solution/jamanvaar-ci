export const CATEGORY_ICON_OPTIONS = [
  ['auto', 'Automatic — match category'], ['UtensilsCrossed', 'Meals / Thali'], ['Pizza', 'Pizza'],
  ['Flame', 'Tandoor / Grill'], ['Soup', 'Dal / Soup / Curry'], ['Wheat', 'Bread / Roti'],
  ['Sandwich', 'Burger / Sandwich'], ['Salad', 'Vegetables / Salad'], ['Leaf', 'Jain / Satvik'],
  ['Coffee', 'Coffee / Tea'], ['CupSoda', 'Cold Drinks / Shakes'], ['Milk', 'Lassi / Dairy'],
  ['IceCreamBowl', 'Ice Cream / Kulfi'], ['CakeSlice', 'Cake / Dessert'], ['Cookie', 'Sweets / Cookies'],
  ['Croissant', 'Bakery'], ['Popcorn', 'Snacks / Farsan'], ['ChefHat', 'Chef Specials'],
  ['Drumstick', 'Chicken'], ['Beef', 'Mutton / Meat'], ['Fish', 'Seafood'], ['EggFried', 'Eggs'],
  ['Package', 'Combos / Meal Deals'], ['CookingPot', 'Rice / Biryani / Noodles'], ['Carrot', 'Chutney / Accompaniments']
] as const;
export type CategoryIconName = typeof CATEGORY_ICON_OPTIONS[number][0];
export type CategoryTone = 'orange' | 'emerald' | 'amber' | 'sky' | 'rose' | 'violet';
const rules: Array<{ pattern: RegExp; icon: CategoryIconName; tone: CategoryTone }> = [
  { pattern: /combo|deal|pack|quick meal|tiffin|delivery meal/i, icon: 'Package', tone: 'orange' },
  { pattern: /jain|satvik|vegan/i, icon: 'Leaf', tone: 'emerald' },
  { pattern: /ice cream|kulfi|falooda|sundae|frozen/i, icon: 'IceCreamBowl', tone: 'rose' },
  { pattern: /coffee|kaapi|kaffe|tea\b|chai|espresso/i, icon: 'Coffee', tone: 'amber' },
  { pattern: /chaas|lassi|milk|dairy/i, icon: 'Milk', tone: 'sky' },
  { pattern: /juice|drink|shake|beverage|cooler|soda/i, icon: 'CupSoda', tone: 'sky' },
  { pattern: /cake|pastr|dessert|warm sweet/i, icon: 'CakeSlice', tone: 'rose' },
  { pattern: /sweet|mithai|cookie|biscuit/i, icon: 'Cookie', tone: 'violet' },
  { pattern: /pizza/i, icon: 'Pizza', tone: 'orange' },
  { pattern: /bread|roti|rotli|rotla|bhakri|thepla|paratha|naan|kulcha/i, icon: 'Wheat', tone: 'amber' },
  { pattern: /bakery|bake|savour|puff|croissant/i, icon: 'Croissant', tone: 'amber' },
  { pattern: /burger|sandwich|wrap|roll|pav|bun/i, icon: 'Sandwich', tone: 'orange' },
  { pattern: /fish|seafood|prawn/i, icon: 'Fish', tone: 'sky' },
  { pattern: /mutton|meat|keema/i, icon: 'Beef', tone: 'rose' },
  { pattern: /chicken/i, icon: 'Drumstick', tone: 'orange' },
  { pattern: /egg|omelette/i, icon: 'EggFried', tone: 'amber' },
  { pattern: /salad|vegetable|shaak/i, icon: 'Salad', tone: 'emerald' },
  { pattern: /dal\b|kadhi|soup|gravy|gravies|curr(?:y|ies)|korma/i, icon: 'Soup', tone: 'orange' },
  { pattern: /biryani|rice|khichdi|noodle|pasta|momo|dosa|idli|vada|uttapam|breakfast|wok|chinese/i, icon: 'CookingPot', tone: 'amber' },
  { pattern: /fries|fried|snack|farsan|chaat|street/i, icon: 'Popcorn', tone: 'amber' },
  { pattern: /chutney|dip|accomp|side/i, icon: 'Carrot', tone: 'emerald' },
  { pattern: /tandoor|grill|kebab|starter|appetizer/i, icon: 'Flame', tone: 'orange' },
  { pattern: /special|signature|chef|gourmet|favo(?:u)?rite/i, icon: 'ChefHat', tone: 'violet' }
];
/** A custom icon is respected; legacy generic utensil icons gain a suitable automatic default. */
export function categoryVisual(name: string, storedIcon?: string): { icon: CategoryIconName; tone: CategoryTone } {
  if (storedIcon === 'Cake') storedIcon = 'CakeSlice';
  const match = rules.find(rule => rule.pattern.test(name));
  const explicit = storedIcon && !['auto', 'Utensils'].includes(storedIcon) && CATEGORY_ICON_OPTIONS.some(([icon]) => icon === storedIcon);
  return { icon: explicit ? storedIcon as CategoryIconName : match?.icon ?? 'UtensilsCrossed', tone: match?.tone ?? 'orange' };
}
