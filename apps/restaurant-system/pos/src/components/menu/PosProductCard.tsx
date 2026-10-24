import { resolveModifierGroups } from '@jamanvaar/business';
import React, { useRef } from 'react';
import { MenuItem } from '@jamanvaar/types';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { sound } from '@jamanvaar/ui';
import { SlidersHorizontal, Flame } from 'lucide-react';

interface PosProductCardProps {
  item: MenuItem;
}

/**
 * A dish tile for the counter grid: tap anywhere to add one. Quantity is adjusted in the order panel, so the tile
 * only shows what a cashier needs to pick fast: the dish, its price, and how many are already on the order.
 */
export const PosProductCard: React.FC<PosProductCardProps> = ({ item }) => {
  const { quickAddOrCustomize, setCustomizingItem, cart } = usePosStore();
  const lastTapRef = useRef<number>(0);

  const inCartCount = (cart?.items || [])
    .filter((i) => i.menuItemId === item.id)
    .reduce((sum, it) => sum + it.quantity, 0);

  const hasAnyModifiers = resolveModifierGroups(item, db.modifierGroups).length > 0;

  const handleAdd = () => {
    if (!item.isAvailable) {
      sound.play('warning');
      return;
    }
    // Fast tap debouncing protection (120ms)
    const now = Date.now();
    if (now - lastTapRef.current < 120) return;
    lastTapRef.current = now;
    // 1-tap add; routes to customization when a required choice or minimum quantity above one means the dish
    // can't be added with bare defaults.
    sound.play('add');
    quickAddOrCustomize(item);
  };

  const handleCustomize = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.isAvailable) {
      sound.play('warning');
      return;
    }
    sound.play('click');
    setCustomizingItem(item);
  };

  const isPureVeg = item.dietaryType === 'VEG' || item.dietaryType === 'JAIN';

  return (
    <div
      className={`relative rounded-2xl transition-colors duration-150 ${
        !item.isAvailable
          ? 'opacity-60 border border-slate-200 bg-slate-50'
          : inCartCount > 0
          ? 'border border-jaman-saffron ring-1 ring-inset ring-jaman-saffron bg-[#FFFAF5]'
          : 'border border-jaman-border bg-white hover:border-jaman-saffron/60'
      }`}
    >
      <button
        type="button"
        onClick={handleAdd}
        disabled={!item.isAvailable}
        aria-label={item.isAvailable ? `Add ${item.name}, ₹${item.price}${inCartCount > 0 ? `, ${inCartCount} in order` : ''}` : `${item.name}, out of stock`}
        className="w-full min-h-[96px] p-3 flex flex-col justify-between gap-3 text-left rounded-2xl select-none cursor-pointer active:scale-[0.98] transition-transform disabled:cursor-not-allowed"
      >
        <span className="flex items-start gap-2 min-w-0 pr-7">
          <span
            className={`mt-0.5 w-4 h-4 bg-white border flex items-center justify-center rounded-[4px] shrink-0 ${isPureVeg ? 'border-emerald-600' : 'border-rose-600'}`}
            role="img"
            aria-label={isPureVeg ? 'Vegetarian' : 'Non-vegetarian'}
          >
            <span className={`w-2 h-2 rounded-full ${isPureVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
          </span>
          <span className="font-semibold text-[15px] text-jaman-navy leading-snug line-clamp-2 break-words" title={item.name}>
            {item.name}
          </span>
        </span>

        <span className="flex items-end justify-between gap-2 min-h-[28px]">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-base font-bold text-jaman-navy tabular-nums">₹{item.price}</span>
            {item.spiceLevel && item.spiceLevel !== 'NONE' && (
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" aria-label="Spicy" role="img" />
            )}
            {item.dietaryType === 'JAIN' && (
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">JAIN</span>
            )}
          </span>
          {!item.isAvailable && (
            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">Out of Stock</span>
          )}
        </span>
      </button>

      {inCartCount > 0 && (
        <span
          className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-jaman-saffron text-white text-xs font-bold flex items-center justify-center tabular-nums pointer-events-none"
          aria-hidden="true"
        >
          {inCartCount}
        </span>
      )}

      {hasAnyModifiers && item.isAvailable && (
        <button
          type="button"
          onClick={handleCustomize}
          title="Customize size, crust, spice, add-ons"
          aria-label={`Customize ${item.name}`}
          className="absolute bottom-2 right-2 w-9 h-9 rounded-xl bg-jaman-cream hover:bg-[#FFF4ED] text-slate-500 hover:text-jaman-saffronText flex items-center justify-center cursor-pointer active:scale-95 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
