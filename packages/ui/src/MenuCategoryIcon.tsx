import React from 'react';
import { Beef, CakeSlice, Carrot, ChefHat, Coffee, CookingPot, Cookie, Croissant, CupSoda, Drumstick, EggFried, Fish, Flame, IceCreamBowl, Leaf, Milk, Package, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, Wheat } from 'lucide-react';
import { categoryVisual } from '../../utils/src/category_visuals';

const icons = { Beef, CakeSlice, Carrot, ChefHat, Coffee, CookingPot, Cookie, Croissant, CupSoda, Drumstick, EggFried, Fish, Flame, IceCreamBowl, Leaf, Milk, Package, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, Wheat, auto: UtensilsCrossed };
const tones = { orange: 'bg-orange-50 text-orange-700 ring-orange-100', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100', amber: 'bg-amber-50 text-amber-700 ring-amber-100', sky: 'bg-sky-50 text-sky-700 ring-sky-100', rose: 'bg-rose-50 text-rose-700 ring-rose-100', violet: 'bg-violet-50 text-violet-700 ring-violet-100' };
/** Small consistent food icons, with a finite import list instead of bundling every Lucide icon. */
export function MenuCategoryIcon({ name, iconName, className = '', size = 'sm' }: { name: string; iconName?: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const visual = categoryVisual(name, iconName);
  const Icon = icons[visual.icon];
  const dimensions = size === 'lg' ? 'w-12 h-12 rounded-2xl' : size === 'md' ? 'w-9 h-9 rounded-xl' : 'w-7 h-7 rounded-lg';
  return <span data-testid="menu-category-icon" data-icon={visual.icon} aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${dimensions} ${tones[visual.tone]} ${className}`}><Icon className={size === 'lg' ? 'w-6 h-6' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} strokeWidth={1.8} /></span>;
}
