import { CashierSpeedBar } from './CashierSpeedBar';
import React, { useState, useMemo } from 'react';
import { usePosStore, isManagerOrAboveRole } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { sound } from '@jamanvaar/ui';
import { PosProductCard } from './PosProductCard';
import { PosCustomizationModal } from './PosCustomizationModal';
import { PosMenuManagerModal } from './PosMenuManagerModal';
import { useCategoryGroups } from './useCategoryGroups';
import {
  Utensils,
  Settings2,
  Search,
  X } from 'lucide-react';

/**
 * Format category names for clean, readable touchscreen display
 */
export const formatCategoryDisplayLabel = (name: string): string => {
  const upper = (name || '').trim().toUpperCase();
  if (
    upper.includes('MAIN COURSE') ||
    upper.includes('CURR') ||
    upper.includes('GRAV') ||
    upper.includes('SABZI') ||
    upper.includes('DAL')
  ) {
    return 'MAIN COURSE';
  }
  if (
    upper.includes('NAAN') ||
    upper.includes('ROTI') ||
    upper.includes('BREAD') ||
    upper.includes('PARATHA') ||
    upper.includes('KULCHA')
  ) {
    return 'NAAN & ROTI';
  }
  if (upper.includes('TANDOOR') || upper.includes('KEBAB') || upper.includes('TIKKA')) {
    return 'TANDOOR & KEBAB';
  }
  if (upper.includes('STARTER') || upper.includes('QUICK BITE') || upper.includes('APPETIZER')) {
    return 'STARTERS';
  }
  if (
    upper.includes('BEVERAGE') ||
    upper.includes('DRINKS') ||
    upper.includes('SHAKE') ||
    upper.includes('JUICE') ||
    upper.includes('TEA') ||
    upper.includes('COFFEE')
  ) {
    return 'BEVERAGES';
  }
  if (
    upper.includes('DESSERT') ||
    upper.includes('SWEET') ||
    upper.includes('MITHAI') ||
    upper.includes('ICE CREAM')
  ) {
    return 'DESSERTS';
  }
  if (
    upper.includes('BIRYANI') ||
    upper.includes('RICE') ||
    upper.includes('PULAO') ||
    upper.includes('KHICHDI')
  ) {
    return 'BIRYANI & RICE';
  }
  if (upper.includes('PIZZA') || upper.includes('PASTA')) {
    return 'PIZZA & PASTA';
  }
  if (
    upper.includes('BURGER') ||
    upper.includes('SANDWICH') ||
    upper.includes('WRAP') ||
    upper.includes('FRIES')
  ) {
    return 'BURGERS & SNACKS';
  }
  if (upper.includes('GUJARATI') || upper.includes('KATHIYAWADI') || upper.includes('THALI')) {
    return 'GUJARATI SPECIAL';
  }
  if (
    upper.includes('SOUTH INDIAN') ||
    upper.includes('DOSA') ||
    upper.includes('IDLI') ||
    upper.includes('VADA')
  ) {
    return 'SOUTH INDIAN';
  }
  if (
    upper.includes('CHINESE') ||
    upper.includes('MOMOS') ||
    upper.includes('NOODLE') ||
    upper.includes('MANCHURIAN')
  ) {
    return 'CHINESE & MOMOS';
  }
  if (upper.includes('CHAAT') || upper.includes('PANI PURI') || upper.includes('PAV BHAJI')) {
    return 'CHAAT SPECIALS';
  }
  return upper;
};

export const PosCatalog: React.FC = () => {
  const {
    selectedCategory,
    setSelectedCategory,
    dietaryFilter,
    setDietaryFilter,
    searchQuery,
    setSearchQuery,
    customizingItem,
    currentUser,
    requestManagerOverride
  } = usePosStore();

  const [isMenuManagerOpen, setIsMenuManagerOpen] = useState(false);

  // Categories are chosen in the sidebar (PosSidebar), not here; this hook is shared so both agree
  // on the same grouping and dish counts.
  const displayCategoryGroups = useCategoryGroups();

  const filteredMenuItems = useMemo(() => {
    return db.menuItems.filter((item) => {
      // BUG: a dish archived (deleted) from Restaurant Admin stayed fully visible and orderable at
      // the POS counter forever -- Restaurant Admin's own menu list already excludes archivedAt
      // (see MenuCategoriesModule.tsx), this grid never did, so the two disagreed on dish counts and
      // staff could keep selling something the restaurant explicitly discontinued.
      if (item.archivedAt) return false;

      // #3: Kiosk (standardMenu.ts) and QR (qr-menu.service.ts) both already honor salesChannels
      // -- a dish restricted to e.g. salesChannels: ['QR'] disappeared from those two, but kept
      // showing up here at the POS counter, since this filter never checked the field at all.
      if (item.salesChannels && !item.salesChannels.includes('POS')) return false;

      // 1. Category filter (matches against canonical category group or category ID)
      if (selectedCategory !== 'ALL') {
        const selectedGroup = displayCategoryGroups.find(
          (g) => g.canonicalKey === selectedCategory || g.categoryIds.includes(selectedCategory)
        );

        if (selectedGroup) {
          if (!selectedGroup.categoryIds.includes(item.categoryId)) {
            return false;
          }
        } else if (item.categoryId !== selectedCategory) {
          return false;
        }
      }

      // 2. Dietary filter
      if (dietaryFilter === 'VEG' && item.dietaryType !== 'VEG' && item.dietaryType !== 'JAIN') {
        return false;
      }
      if (dietaryFilter === 'JAIN' && item.dietaryType !== 'JAIN') {
        return false;
      }
      if (dietaryFilter === 'NON_VEG' && item.dietaryType !== 'NON_VEG') {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchStation = item.kitchenStation?.toLowerCase().includes(q);
        return matchName || matchSku || matchDesc || matchStation;
      }

      return true;
    });
  }, [selectedCategory, displayCategoryGroups, dietaryFilter, searchQuery, db.menuItems]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent space-y-2 select-none min-w-0">
      <CashierSpeedBar />

      {/* One calm row: food-type filter, the active search, and the menu manager. */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div role="group" aria-label="Food type" className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-white border border-jaman-border">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'VEG', label: 'Veg' },
            { id: 'JAIN', label: 'Jain' },
            { id: 'NON_VEG', label: 'Non-Veg' }
          ].map((df) => {
            const active = dietaryFilter === df.id;
            return (
              <button
                key={df.id}
                type="button"
                aria-pressed={active}
                onClick={() => setDietaryFilter(df.id as any)}
                className={`min-h-9 px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  active ? 'bg-[#FFF2E8] text-jaman-saffronText' : 'text-slate-600 hover:text-jaman-navy'
                }`}
              >
                {df.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto min-w-0">
          {searchQuery && (
            <div className="flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] pl-2.5 pr-1 h-9 rounded-xl text-xs min-w-0">
              <Search className="w-3.5 h-3.5 text-jaman-saffronText shrink-0" aria-hidden="true" />
              <span className="text-slate-700 font-semibold truncate max-w-[140px]">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-7 h-7 rounded-lg hover:bg-orange-200/60 text-jaman-saffronText flex items-center justify-center cursor-pointer"
                title="Clear Search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              // security-audit MED-06: menu edits made here propagate to every
              // terminal fleet-wide via entity-sync, so any PIN that merely
              // passes canUseTerminal (any floor role) used to be able to open
              // this and reprice the whole menu with no further check.
              if (isManagerOrAboveRole(currentUser)) {
                setIsMenuManagerOpen(true);
                return;
              }
              requestManagerOverride(
                'PRICE_OVERRIDE',
                'Manager Approval Required',
                'Opening Menu Manager (prices, items, categories) requires a Manager or Owner PIN.',
                () => setIsMenuManagerOpen(true)
              );
            }}
            className="min-h-10 px-3.5 bg-white hover:bg-[#FFF4ED] border border-jaman-border hover:border-[#FDBA74] text-jaman-navy hover:text-jaman-saffronText rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Open Menu Manager & Prebuilt Starter Library (30 Types)"
          >
            <Settings2 className="w-4 h-4 text-jaman-saffronText" aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </div>

      {/* MENU GRID (Spacious 3-4 column layout with large, high-legibility cards) */}
      <div className="flex-1 overflow-y-auto p-3.5 scrollbar-thin bg-white border border-jaman-border rounded-2xl">
        {filteredMenuItems.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3 pb-1">
            {filteredMenuItems.map((item) => (
              <PosProductCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-jaman-border shadow-2xs space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffronText flex items-center justify-center shadow-xs">
              <Utensils className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-jaman-navy">No dishes match your selection</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Try choosing "All Menu" or clearing the active search filter to view all dishes.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('ALL');
                setDietaryFilter('ALL');
                setSearchQuery('');
              }}
              className="min-h-[40px] px-5 py-1.5 rounded-xl bg-jaman-saffron text-white font-bold text-xs shadow-md shadow-jaman-saffron/20 active:scale-95 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {customizingItem && <PosCustomizationModal />}
      <PosMenuManagerModal
        isOpen={isMenuManagerOpen}
        onClose={() => setIsMenuManagerOpen(false)}
      />
    </div>
  );
};
