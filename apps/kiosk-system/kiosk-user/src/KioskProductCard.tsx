import React from 'react';
import type { MenuItem } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { hasRequiredModifierGroup } from '@jamanvaar/business';
import { Plus } from 'lucide-react';
import { CachedImg, StatusBadge } from '@jamanvaar/ui';

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
      data-testid="kiosk-menu-card"
      className="kiosk-product-card group flex flex-col h-full min-w-0 bg-white rounded-2xl border border-jaman-border overflow-hidden select-none shadow-sm transition-shadow hover:border-jaman-saffron/60 hover:shadow-md"
    >
      <button type="button" disabled={!onSelectDetails} aria-label={`View details for ${displayName || item.name}`} onClick={() => onSelectDetails?.(item)} className="kiosk-product-media relative w-full shrink-0 bg-jaman-ivory overflow-hidden text-left focus-visible:outline focus-visible:outline-4 focus-visible:outline-jaman-navy focus-visible:-outline-offset-4">
        <CachedImg
          src={item.imageUrl || '/assets/menu/common/menu-placeholder-v2.svg'}
          dishName={item.name}
          alt={displayName || item.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-2 left-2">
          <StatusBadge status={item.dietaryType} type="dietary" />
        </div>
      </button>

      <div className="kiosk-product-body">
        <h3 className="kiosk-product-name text-base font-bold text-jaman-navy">
          <button type="button" disabled={!onSelectDetails} onClick={() => onSelectDetails?.(item)} className="text-left w-full line-clamp-2" title={displayName || item.name}>{displayName || item.name}</button>
        </h3>
        <span className="kiosk-product-subcategory text-xs font-semibold text-slate-600 truncate" title={item.subcategory} aria-hidden={!item.subcategory || undefined}>{item.subcategory}</span>
        <p className="kiosk-product-description text-[#4A5568] line-clamp-2" aria-hidden={!description || undefined}>{description}</p>

        <div className="kiosk-product-price mt-auto min-w-0">
          <div data-kiosk-price className="text-xl font-black text-jaman-saffron leading-tight tabular-nums">
            {formatINR(item.price)}
            {hasModifiers && <span className="text-xs font-semibold text-[#4A5568] ml-1">+</span>}
          </div>
          <span className={`kiosk-product-note block text-xs ${hasRequiredModifiers ? 'font-bold text-[#0B253A]' : 'font-semibold text-[#52677A]'}`} aria-hidden={!hasModifiers || undefined}>
            {hasModifiers ? (hasRequiredModifiers ? 'Customization required' : 'Customizable') : null}
          </span>
        </div>

        <div className="kiosk-product-actions flex items-center justify-end gap-2 shrink-0">
          {hasModifiers && onCustomize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCustomize(item);
              }}
              className="kiosk-product-action kiosk-product-customize text-sm font-bold whitespace-nowrap"
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
            className="kiosk-product-action kiosk-product-add bg-jaman-saffron text-white"
            title="Add to Cart"
            aria-label={`Add ${displayName || item.name} to cart`}
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
