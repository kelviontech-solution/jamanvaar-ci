import React, { useRef } from 'react';
import { MenuItem } from '@jamanvaar/types';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { sound } from '@jamanvaar/ui';
import { Plus, Minus, SlidersHorizontal, Flame } from 'lucide-react';

interface PosProductCardProps {
  item: MenuItem;
}

export const PosProductCard: React.FC<PosProductCardProps> = ({ item }) => {
  const { addItemToCart, updateItemQuantity, setCustomizingItem, cart } = usePosStore();
  const lastTapRef = useRef<number>(0);

  const inCartCount = (cart?.items || [])
    .filter((i) => i.menuItemId === item.id)
    .reduce((sum, it) => sum + it.quantity, 0);

  // Check if item has mandatory required modifier choices
  const itemModifierGroups = (item.modifierGroupIds || [])
    .map((gid) => db.modifierGroups.find((g) => g.id === gid))
    .filter(Boolean);

  const hasRequiredModifiers = itemModifierGroups.some(
    (g) => g && (g.isRequired || g.minSelections > 0)
  );

  const hasAnyModifiers = itemModifierGroups.length > 0;

  const handleCardClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!item.isAvailable) {
      sound.play('warning');
      return;
    }

    // Fast tap debouncing protection (120ms)
    const now = Date.now();
    if (now - lastTapRef.current < 120) {
      return;
    }
    lastTapRef.current = now;

    // 1-Tap Direct Add to cart (fast billing flow)
    sound.play('add');
    addItemToCart(item);
  };

  const handleCustomizeClick = (e: React.MouseEvent) => {
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
      onClick={handleCardClick}
      className={`rounded-2xl p-2.5 flex flex-col gap-2 transition-all duration-150 relative select-none cursor-pointer group shadow-2xs ${
        !item.isAvailable
          ? 'opacity-60 border border-slate-200 bg-slate-50 cursor-not-allowed'
          : inCartCount > 0
          ? 'border border-jaman-saffron ring-2 ring-inset ring-jaman-saffron bg-[#FFFDFB] shadow-xs'
          : 'border border-jaman-border bg-white hover:border-jaman-saffron/60 hover:shadow-xs active:scale-[0.98]'
      }`}
    >
      {/* Active in-cart quantity badge */}
      {inCartCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-jaman-saffron text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white z-20 pointer-events-none animate-in zoom-in">
          {inCartCount}
        </div>
      )}

      {/* Name-first header: dietary mark, name, station. No photo or description in the counter grid. */}
      <div className="flex gap-2.5 items-start">
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          {/* Indian Veg / Non-Veg Indicator Symbol */}
          <div
            className={`w-5 h-5 bg-white border flex items-center justify-center rounded-md ${
              isPureVeg ? 'border-emerald-600' : 'border-rose-600'
            }`}
            role="img"
            aria-label={isPureVeg ? 'Vegetarian' : 'Non-vegetarian'}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isPureVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
          </div>
          {item.spiceLevel && item.spiceLevel !== 'NONE' && (
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" aria-label="Spicy" role="img" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-semibold text-[15px] text-jaman-navy leading-snug line-clamp-3 break-words" title={item.name}>
            {item.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {item.dietaryType === 'JAIN' && (
              <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md shrink-0">
                JAIN
              </span>
            )}
            <span className="text-[11px] font-semibold text-slate-500 truncate">
              {item.kitchenStation || 'Kitchen'} · {item.sku}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: Price & Quick Action */}
      <div className="flex items-center justify-between gap-2 mt-auto min-h-[40px]">
        <div className="flex flex-col">
          <span className={`${inCartCount > 0 ? 'text-base' : 'text-lg'} font-bold text-jaman-navy leading-tight tabular-nums shrink-0`}>
            ₹{item.price}
          </span>
          {item.takeawayPrice && item.takeawayPrice !== item.price && (
            <span className="text-[10px] text-slate-400 font-semibold">TA: ₹{item.takeawayPrice}</span>
          )}
        </div>

        {item.isAvailable ? (
          <div className="flex items-center gap-1.5">
            {/* If item has modifiers, show explicit CUSTOMIZE button */}
            {hasAnyModifiers && (
              <button
                type="button"
                onClick={handleCustomizeClick}
                title="Customize size, crust, spice, add-ons"
                className="h-9 px-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-[#FFF4ED] hover:text-jaman-saffron text-slate-700 flex items-center gap-1 transition-colors active:scale-95 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-jaman-saffron" />
                <span className={inCartCount > 0 ? 'sr-only' : undefined}>MOD</span>
              </button>
            )}

            {inCartCount > 0 ? (
              /* In-Cart Stepper */
              <div className="flex items-center bg-[#FFF7ED] border border-[#FDBA74] rounded-xl p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.play('click');
                    const matching = (cart?.items || []).filter((i) => i.menuItemId === item.id);
                    if (matching.length > 0) {
                      const last = matching[matching.length - 1];
                      updateItemQuantity(last.cartItemId || (last as any).id, -1);
                    }
                  }}
                  className="w-7 h-8 rounded-lg bg-white hover:bg-orange-100 text-jaman-saffron flex items-center justify-center font-bold transition-colors shadow-2xs active:scale-95 cursor-pointer"
                  title="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <span className="font-bold text-sm text-jaman-navy px-1.5 min-w-[20px] text-center">
                  {inCartCount}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.play('add');
                    addItemToCart(item);
                  }}
                  className="w-7 h-8 rounded-lg bg-jaman-saffron hover:bg-[#C95A12] text-white flex items-center justify-center font-bold transition-colors shadow-2xs active:scale-95 cursor-pointer"
                  title="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>
            ) : (
              /* Direct + icon button */
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
                className="w-10 h-9 rounded-xl bg-jaman-saffron hover:bg-[#C95A12] text-white flex items-center justify-center font-bold transition-colors shadow-sm shadow-jaman-saffron/25 active:scale-95 shrink-0 cursor-pointer"
                title="1-Tap Add to Order"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            )}
          </div>
        ) : (
          <span className="text-[11px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
            Out of Stock
          </span>
        )}
      </div>
    </div>
  );
};
