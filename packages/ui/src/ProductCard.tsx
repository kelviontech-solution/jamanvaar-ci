import React from 'react';
import { MenuItem } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { hasRequiredModifierGroup } from '@jamanvaar/business';
import { Plus } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { sound } from './SoundManager';

export interface ProductCardProps {
  item: MenuItem;
  /** Adds the dish to an order. Leave out on a screen that only lists dishes (a catalog editor): no + button is shown. */
  onAdd?: (item: MenuItem) => void;
  onSelectDetails?: (item: MenuItem) => void;
  /**
   * When provided, a secondary "Customize" button renders to the left of
   * the + button for any item that has modifier groups. Purely additive —
   * existing callers that don't pass this see no change at all. This lets
   * a caller (e.g. the customer kiosk) make + mean "add directly" while
   * Customize means "open the options modal", instead of one button
   * forcing the modal for every item that has even one optional add-on.
   */
  onCustomize?: (item: MenuItem) => void;
  className?: string;
  /** Pre-resolved localized name/description (see @jamanvaar/utils
   *  localizedName/localizedDescription) — fall back to item.name/
   *  item.description when omitted, so existing callers are unaffected. */
  displayName?: string;
  displayDescription?: string;
  /** Hides the SKU and kitchen-station badges overlaid on the image.
   *  Defaults to false, so existing callers (kiosk-admin, POS — staff
   *  tools where that ops info is useful) see no change. A guest-facing
   *  screen like the customer kiosk can opt in to keep the food photo as
   *  the card's uncluttered visual focus. */
  hideOpsBadges?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  onAdd,
  onSelectDetails,
  onCustomize,
  className = '',
  displayName,
  displayDescription,
  hideOpsBadges = false
}) => {
  const hasModifiers = item.modifierGroupIds && item.modifierGroupIds.length > 0;
  const hasRequiredModifiers = hasRequiredModifierGroup(item.modifierGroups);

  return (
    <div
      onClick={() => {
        sound.play('click');
        if (onSelectDetails) onSelectDetails(item);
      }}
      className={`group relative bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer active:scale-[0.99] select-none ${className}`}
    >
      <div className="relative w-full h-52 sm:h-60 bg-[#F4EFE6] overflow-hidden">
        <img
          src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
          }}
        />

        {!hideOpsBadges && (
          <>
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span className="bg-[#0B253A]/85 backdrop-blur-md text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                {item.sku}
              </span>
            </div>
            <div className="absolute top-2.5 right-2.5">
              <span className="bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md">
                {item.kitchenStation || 'Kitchen'}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {item.dietaryType === 'VEG' && (
              <span className="w-4 h-4 border border-emerald-600 flex items-center justify-center p-0.5 rounded-sm shrink-0" title="Pure Veg">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
              </span>
            )}
            {item.dietaryType === 'NON_VEG' && (
              <span className="w-4 h-4 border border-red-600 flex items-center justify-center p-0.5 rounded-sm shrink-0" title="Non-Veg">
                <span className="w-2 h-2 rounded-full bg-red-600" />
              </span>
            )}
            {item.dietaryType === 'JAIN' && (
              <span className="w-4 h-4 border border-[#E66817] flex items-center justify-center p-0.5 rounded-sm shrink-0" title="Pure Jain">
                <span className="w-2 h-2 rounded-full bg-[#E66817]" />
              </span>
            )}
            <h3 className="text-base sm:text-lg font-bold text-[#0B253A] line-clamp-1 group-hover:text-[#E66817] transition-colors">
              {displayName || item.name}
            </h3>
          </div>
          {/* Only render description if it exists */}
          {(displayDescription || item.description) && (
            <p className="text-xs sm:text-sm text-[#4A5568] mt-1 line-clamp-1 leading-relaxed">
              {displayDescription || item.description}
            </p>
          )}
        </div>

        <div className="mt-3 pt-1 flex items-center justify-between">
          <div className="text-lg sm:text-xl font-black text-[#E66817]">
            {formatINR(item.price)}
          </div>

          <div className="flex items-center gap-2">
            {hasModifiers && onCustomize && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.play('click');
                  onCustomize(item);
                }}
                className="px-4 h-10 rounded-full border-[1.5px] border-[#E66817] text-[#E66817] bg-white hover:bg-[#FFF4ED] text-sm font-bold whitespace-nowrap transition-colors active:scale-95"
                title="Customize"
                aria-label={`Customize ${item.name}`}
              >
                Customize
              </button>
            )}
            {onAdd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                sound.play('add');
                onAdd(item);
              }}
              className="w-10 h-10 rounded-full bg-[#E66817] hover:bg-[#F27A2B] active:bg-[#D1560D] text-white flex items-center justify-center shadow-sm shadow-[#E66817]/25 transition-transform active:scale-90 shrink-0"
              title="Add to Cart"
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
