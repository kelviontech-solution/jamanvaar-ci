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
  Zap,
  Plus,
  Search,
  X
} from 'lucide-react';

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

  // Calculate real most-ordered items from local sales data
  const popularQuickAddItems = useMemo(() => {
    const salesMap = new Map<string, number>();
    db.orders.forEach((ord) => {
      ord.items?.forEach((item) => {
        salesMap.set(item.menuItemId, (salesMap.get(item.menuItemId) || 0) + item.quantity);
      });
    });

    const sorted = [...db.menuItems]
      .filter((i) => i.isAvailable)
      .sort((a, b) => {
        const salesA = salesMap.get(a.id) || 0;
        const salesB = salesMap.get(b.id) || 0;
        if (salesB !== salesA) return salesB - salesA;
        return (b.isPopular ? 1 : 0) - (a.isPopular ? 1 : 0);
      });

    return sorted.slice(0, 5);
  }, [db.orders, db.menuItems]);

  // What the category rail in the sidebar has selected, shown here as a small heading so it's
  // clear which list of dishes is on screen (the categories themselves live in PosSidebar now).
  const selectedGroup = displayCategoryGroups.find(
    (g) => g.canonicalKey === selectedCategory || g.categoryIds.includes(selectedCategory)
  );
  const currentCategoryLabel = selectedCategory === 'ALL' ? 'All Menu' : selectedGroup?.displayLabel ?? 'Menu';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-jaman-cream p-2.5 space-y-2 select-none min-w-0">
      {/* 1. CURRENT CATEGORY HEADING (the categories themselves are chosen in the left sidebar) */}
      <div className="flex items-center justify-between shrink-0 bg-white border border-jaman-border rounded-2xl px-4 py-2.5 shadow-2xs">
        <h2 className="font-black text-sm sm:text-base text-jaman-navy tracking-tight truncate">{currentCategoryLabel}</h2>
        <span className="text-xs font-mono font-bold text-slate-500 bg-jaman-cream border border-jaman-border px-2 py-0.5 rounded-md shrink-0">
          {filteredMenuItems.length} dish{filteredMenuItems.length === 1 ? '' : 'es'}
        </span>
      </div>

      {/* 2. SECONDARY TOOLBAR: DIETARY FILTERS + QUICK ADD */}
      <div className="flex items-center justify-between gap-2 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Left: Food Type Dietary Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white border border-jaman-border p-1 rounded-xl shadow-2xs shrink-0">
          {[
            { id: 'ALL', label: 'All', icon: '🍽️', activeBg: 'bg-jaman-navy text-white' },
            { id: 'VEG', label: 'Veg', icon: '🟢', activeBg: 'bg-[#16A34A] text-white' },
            { id: 'JAIN', label: 'Jain', icon: '🌾', activeBg: 'bg-jaman-saffron text-white' },
            { id: 'NON_VEG', label: 'Non-Veg', icon: '🍗', activeBg: 'bg-rose-700 text-white' }
          ].map((df) => {
            const active = dietaryFilter === df.id;
            return (
              <button
                key={df.id}
                type="button"
                onClick={() => setDietaryFilter(df.id as any)}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                  active
                    ? `${df.activeBg} shadow-xs font-black`
                    : 'bg-jaman-cream border border-transparent text-jaman-navy hover:bg-slate-100'
                }`}
              >
                <span>{df.icon}</span>
                <span>{df.label}</span>
              </button>
            );
          })}
        </div>

        {/* Middle: Quick Add Chips */}
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto shrink min-w-0">
          <div className="flex items-center gap-1 bg-[#FFF4ED] border border-[#FDBA74] px-2 py-1 rounded-lg text-xs font-black text-jaman-saffron shrink-0">
            <Zap className="w-3 h-3 fill-jaman-saffron" />
            <span>QUICK:</span>
          </div>

          {popularQuickAddItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => usePosStore.getState().addItemToCart(item)}
              className="min-h-[32px] bg-white border border-jaman-border hover:border-jaman-saffron hover:bg-[#FFFDFB] px-2.5 py-1 rounded-lg text-xs font-bold text-jaman-navy flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
              title={`1-Tap Add ${item.name} (₹${item.price})`}
            >
              <span className="truncate max-w-[130px]">{item.name}</span>
              <span className="font-mono text-jaman-saffron font-black text-xs">₹{item.price}</span>
              <Plus className="w-3 h-3 text-jaman-saffron stroke-[3]" />
            </button>
          ))}
        </div>

        {/* Right side: Search Status indicator & Manage Menu button */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {searchQuery && (
            <div className="flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] px-2.5 py-1 rounded-lg text-xs shrink-0 animate-in fade-in">
              <Search className="w-3.5 h-3.5 text-jaman-saffron" />
              <span className="text-slate-600 font-bold truncate max-w-[110px]">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-4 h-4 rounded bg-orange-200/60 hover:bg-rose-100 text-jaman-saffron hover:text-rose-600 flex items-center justify-center font-black cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3 h-3 stroke-[3]" />
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
            className="min-h-[32px] px-3 py-1 bg-white hover:bg-[#FFF4ED] border border-jaman-border hover:border-[#FDBA74] text-jaman-navy hover:text-jaman-saffron rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="Open Menu Manager & Prebuilt Starter Library (30 Types)"
          >
            <Settings2 className="w-3.5 h-3.5 text-jaman-saffron" />
            <span className="hidden md:inline">Menu</span>
          </button>
        </div>
      </div>

      {/* 3. MENU GRID (Spacious 3-4 column layout with large, high-legibility cards) */}
      <div className="flex-1 overflow-y-auto p-0.5 pr-1 scrollbar-thin">
        {filteredMenuItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {filteredMenuItems.map((item) => (
              <PosProductCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-jaman-border shadow-2xs space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center shadow-xs">
              <Utensils className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-jaman-navy">No dishes match your selection</h3>
            <p className="text-xs text-slate-400 max-w-sm">
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
