import React from 'react';
import type { MenuItem } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { hasRequiredModifierGroup } from '@jamanvaar/business';
import { Plus } from 'lucide-react';
import { StatusBadge } from '@jamanvaar/ui';

export interface KioskProductCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  onSelectDetails?: (item: MenuItem) => void;
  onCustomize?: (item: MenuItem) => void;
  displayName?: string;
  displayDescription?: string;
}

/** Customer-kiosk product card. Kept separate from the shared ProductCard, which Kiosk Admin and POS also use. */
export const KioskProductCard: React.FC<KioskProductCardProps> = ({
  item,
  onAdd,
  onSelectDetails,
  onCustomize,
  displayName,
  displayDescription
}) => {
  const hasModifiers = Boolean(item.modifierGroupIds && item.modifierGroupIds.length > 0);
  const hasRequiredModifiers = hasRequiredModifierGroup(item.modifierGroups);
  const description = displayDescription || item.description;

  return (
    <div
      onClick={() => onSelectDetails?.(item)}
      className="group flex flex-col h-full bg-white rounded-2xl border border-jaman-border overflow-hidden cursor-pointer select-none transition-colors hover:border-jaman-saffron/60 active:scale-[0.99]"
    >
      <div className="relative w-full aspect-[4/3] bg-jaman-ivory overflow-hidden">
        <img
          src={item.imageUrl || '/assets/menu/common/menu-placeholder-v2.svg'}
          alt={displayName || item.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).onerror = null;
            (e.target as HTMLImageElement).src = '/assets/menu/common/menu-placeholder-v2.svg';
          }}
        />
        <div className="absolute bottom-2 left-2">
          <StatusBadge status={item.dietaryType} type="dietary" />
        </div>
      </div>

      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <h3 className="text-base font-bold text-jaman-navy leading-snug line-clamp-2 min-h-[2.75rem]">
          {displayName || item.name}
        </h3>
        {item.subcategory && <span className="text-xs font-semibold text-slate-600">{item.subcategory}</span>}
        {description && (
          <p className="text-xs text-[#4A5568] leading-relaxed line-clamp-2">{description}</p>
        )}

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xl font-black text-jaman-saffron leading-none">
              {formatINR(item.price)}
              {hasModifiers && <span className="text-xs font-semibold text-[#4A5568] ml-1">+</span>}
            </div>
            {hasModifiers && (
              <span className="block mt-1 text-[11px] font-medium text-[#8C9BAE]">
                {hasRequiredModifiers ? 'Customization required' : 'Customizable'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasModifiers && onCustomize && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCustomize(item);
                }}
                className="h-11 px-3.5 rounded-full border-[1.5px] border-jaman-saffron text-jaman-saffron bg-white text-sm font-bold whitespace-nowrap active:bg-jaman-saffron/10 transition-colors"
                title="Customize"
              >
                Customize
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(item);
              }}
              className="w-12 h-12 rounded-full bg-jaman-saffron text-white flex items-center justify-center shadow-sm active:scale-90 active:bg-[#D1560D] transition-transform"
              title="Add to Cart"
              aria-label={`Add ${displayName || item.name} to cart`}
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
