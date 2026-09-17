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
      className={`rounded-2xl p-3 flex flex-col justify-between transition-all duration-150 relative select-none cursor-pointer group shadow-2xs ${
        !item.isAvailable
          ? 'opacity-60 border border-slate-200 bg-slate-50 cursor-not-allowed'
          : inCartCount > 0
          ? 'border-2 border-jaman-saffron bg-[#FFFDFB] shadow-xs'
          : 'border border-jaman-border bg-white hover:border-jaman-saffron/70 hover:shadow-xs active:scale-[0.98]'
      }`}
    >
      {/* Active in-cart quantity badge */}
      {inCartCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-jaman-saffron text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white z-20 pointer-events-none animate-in zoom-in">
          {inCartCount}
        </div>
      )}

      {/* Top row: Dietary dot + Jain tag + Spice flame + Station badge */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          {/* Indian Veg / Non-Veg Indicator Symbol */}
          <div
            className={`w-3.5 h-3.5 border flex items-center justify-center p-0.5 rounded-xs ${
              isPureVeg ? 'border-emerald-600' : 'border-rose-600'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isPureVeg ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            />
          </div>

          {item.dietaryType === 'JAIN' && (
            <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
              JAIN
            </span>
          )}

          {item.spiceLevel && item.spiceLevel !== 'NONE' && (
            <span className="text-xs font-bold text-amber-600 flex items-center">
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            </span>
          )}
        </div>

        {/* Kitchen Station */}
        <span className="text-[10px] font-bold text-slate-500 bg-jaman-cream px-2 py-0.5 rounded-md border border-jaman-border truncate max-w-[110px]">
          {item.kitchenStation || 'Kitchen'}
        </span>
      </div>

      {/* Center: Prominent Image & Big Bold Dish Name */}
      <div className="flex gap-2.5 items-center mb-2">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-jaman-cream border border-jaman-border shrink-0 relative flex items-center justify-center shadow-2xs">
          <img
            src={item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-sm text-jaman-navy leading-snug line-clamp-2 min-h-[36px] flex items-center">
            {item.name}
          </h3>
          <span className="text-[10px] text-slate-400 font-mono font-bold block mt-0.5">SKU: {item.sku}</span>
        </div>
      </div>

      {/* Bottom row: Price & Quick Action */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-auto">
        <div className="flex flex-col">
          <span className="text-base sm:text-lg font-black text-jaman-navy font-mono leading-tight">
            ₹{item.price}
          </span>
          {item.takeawayPrice && item.takeawayPrice !== item.price && (
            <span className="text-[9px] text-slate-400 font-semibold">TA: ₹{item.takeawayPrice}</span>
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
                className="h-8 px-2 rounded-lg font-bold text-xs bg-slate-100 hover:bg-[#FFF4ED] hover:text-jaman-saffron text-slate-700 flex items-center gap-1 transition-colors active:scale-95 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-jaman-saffron" />
                <span>MOD</span>
              </button>
            )}

            {inCartCount > 0 ? (
              /* In-Cart Stepper (Spacious 30px touch buttons) */
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
                  className="w-7 h-7 rounded-lg bg-white hover:bg-orange-100 text-jaman-saffron flex items-center justify-center font-black transition-colors shadow-2xs active:scale-95 cursor-pointer"
                  title="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <span className="font-mono font-black text-sm text-jaman-navy px-2 min-w-[20px] text-center">
                  {inCartCount}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.play('add');
                    addItemToCart(item);
                  }}
                  className="w-7 h-7 rounded-lg bg-jaman-saffron hover:bg-[#EA580C] text-white flex items-center justify-center font-black transition-colors shadow-2xs active:scale-95 cursor-pointer"
                  title="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>
            ) : (
              /* Direct + icon button (Spacious 32px touch target) */
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
                className="w-8 h-8 rounded-xl bg-jaman-cream group-hover:bg-jaman-saffron border border-jaman-border group-hover:border-jaman-saffron text-jaman-navy group-hover:text-white flex items-center justify-center font-black transition-all shadow-2xs active:scale-95 shrink-0 cursor-pointer"
                title="1-Tap Add to Order"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            )}
          </div>
        ) : (
          <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
            Out of Stock
          </span>
        )}
      </div>
    </div>
  );
};
