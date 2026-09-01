import React, { useState, useMemo, useRef, useEffect } from 'react';
import { usePosStore } from '../../store/posStore';
import { db } from '@jamanvaar/database';
import { Category } from '@jamanvaar/types';
import { getCanonicalCategoryKey } from '@jamanvaar/business';
import { sound } from '@jamanvaar/ui';
import { PosProductCard } from './PosProductCard';
import { PosCustomizationModal } from './PosCustomizationModal';
import { PosMenuManagerModal } from './PosMenuManagerModal';
import {
  Sparkles,
  Utensils,
  Settings2,
  Zap,
  Plus,
  ChevronLeft,
  ChevronRight,
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
    customizingItem
  } = usePosStore();

  const [isMenuManagerOpen, setIsMenuManagerOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Group categories by canonical category key so identical categories are merged into ONE button
  const displayCategoryGroups = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        canonicalKey: string;
        displayLabel: string;
        categoryIds: string[];
        primaryCategory: Category;
        totalDishCount: number;
      }
    >();

    const activeCategories = db.categories
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    activeCategories.forEach((cat) => {
      const canonicalKey = getCanonicalCategoryKey(cat.name);
      const label = formatCategoryDisplayLabel(cat.name);
      const existing = groupMap.get(canonicalKey);

      if (existing) {
        if (!existing.categoryIds.includes(cat.id)) {
          existing.categoryIds.push(cat.id);
        }
        existing.totalDishCount = db.menuItems.filter(
          (i) => existing.categoryIds.includes(i.categoryId)
        ).length;
      } else {
        const matchingDishesCount = db.menuItems.filter((i) => i.categoryId === cat.id).length;
        groupMap.set(canonicalKey, {
          canonicalKey,
          displayLabel: label,
          categoryIds: [cat.id],
          primaryCategory: cat,
          totalDishCount: matchingDishesCount
        });
      }
    });

    return Array.from(groupMap.values());
  }, [db.categories, db.menuItems]);

  const checkScrollState = () => {
    if (categoryScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = categoryScrollRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkScrollState();
    window.addEventListener('resize', checkScrollState);
    return () => window.removeEventListener('resize', checkScrollState);
  }, [displayCategoryGroups]);

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

  // Smooth Touchscreen Category Scrolling
  const scrollCategories = (direction: 'LEFT' | 'RIGHT') => {
    if (categoryScrollRef.current) {
      const offset = direction === 'LEFT' ? -240 : 240;
      categoryScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkScrollState, 250);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#FAF7F2] p-2.5 space-y-2 select-none min-w-0">
      {/* 1. VISIBLE & TACTILE TOUCHSCREEN CATEGORY NAVIGATION (Height: 44px, Bold 13-14px font) */}
      <div className="relative flex items-center shrink-0 bg-white border border-[#EBE6DD] rounded-2xl p-1.5 shadow-2xs">
        {/* Left Scroll Button (visible when scrollable) */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollCategories('LEFT')}
            className="w-8 h-9 rounded-xl bg-[#FAF7F2] hover:bg-orange-50 active:scale-95 text-slate-600 hover:text-[#E66817] flex items-center justify-center transition-all shrink-0 mr-1.5 cursor-pointer border border-[#EBE6DD] z-10"
            title="Scroll categories left"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}

        {/* Scrollable Category Row */}
        <div
          ref={categoryScrollRef}
          onScroll={checkScrollState}
          className="flex-1 flex items-center gap-2 overflow-x-auto py-0.5 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {/* ALL MENU Main Button */}
          <button
            type="button"
            onClick={() => { sound.play('click'); setSelectedCategory('ALL'); }}
            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 shrink-0 cursor-pointer active:scale-98 ${
              selectedCategory === 'ALL'
                ? 'bg-[#E66817] text-white shadow-xs'
                : 'bg-[#FAF7F2] hover:bg-white border border-[#EBE6DD] text-[#0B253A] hover:border-[#E66817]/40'
            }`}
          >
            <Sparkles className={`w-4 h-4 shrink-0 ${selectedCategory === 'ALL' ? 'text-white' : 'text-[#E66817]'}`} />
            <span>ALL MENU</span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                selectedCategory === 'ALL'
                  ? 'bg-black/20 text-white'
                  : 'bg-white text-slate-600 border border-[#EBE6DD]'
              }`}
            >
              {db.menuItems.length}
            </span>
          </button>

          {/* Deduplicated Canonical Category Groups */}
          {displayCategoryGroups.map((group) => {
            const isSelected =
              selectedCategory === group.canonicalKey ||
              group.categoryIds.includes(selectedCategory);

            return (
              <button
                key={group.canonicalKey}
                type="button"
                onClick={() => { sound.play('click'); setSelectedCategory(group.canonicalKey); }}
                title={group.primaryCategory.name}
                className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 cursor-pointer active:scale-98 ${
                  isSelected
                    ? 'bg-[#E66817] text-white shadow-xs'
                    : 'bg-[#FAF7F2] hover:bg-white border border-[#EBE6DD] text-[#0B253A] hover:border-[#E66817]/40'
                }`}
              >
                <span>{group.displayLabel}</span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                    isSelected
                      ? 'bg-black/20 text-white'
                      : 'bg-white text-slate-600 border border-[#EBE6DD]'
                  }`}
                >
                  {group.totalDishCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Scroll Button (visible when scrollable) */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollCategories('RIGHT')}
            className="w-8 h-9 rounded-xl bg-[#FAF7F2] hover:bg-orange-50 active:scale-95 text-slate-600 hover:text-[#E66817] flex items-center justify-center transition-all shrink-0 ml-1.5 cursor-pointer border border-[#EBE6DD] z-10"
            title="Scroll categories right"
          >
            <ChevronRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* 2. SECONDARY TOOLBAR: DIETARY FILTERS + QUICK ADD */}
      <div className="flex items-center justify-between gap-2 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Left: Food Type Dietary Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white border border-[#EBE6DD] p-1 rounded-xl shadow-2xs shrink-0">
          {[
            { id: 'ALL', label: 'All', icon: '🍽️', activeBg: 'bg-[#0B253A] text-white' },
            { id: 'VEG', label: 'Veg', icon: '🟢', activeBg: 'bg-[#16A34A] text-white' },
            { id: 'JAIN', label: 'Jain', icon: '🌾', activeBg: 'bg-[#E66817] text-white' },
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
                    : 'bg-[#FAF7F2] border border-transparent text-[#0B253A] hover:bg-slate-100'
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
          <div className="flex items-center gap-1 bg-[#FFF4ED] border border-[#FDBA74] px-2 py-1 rounded-lg text-xs font-black text-[#E66817] shrink-0">
            <Zap className="w-3 h-3 fill-[#E66817]" />
            <span>QUICK:</span>
          </div>

          {popularQuickAddItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => usePosStore.getState().addItemToCart(item)}
              className="min-h-[32px] bg-white border border-[#EBE6DD] hover:border-[#E66817] hover:bg-[#FFFDFB] px-2.5 py-1 rounded-lg text-xs font-bold text-[#0B253A] flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
              title={`1-Tap Add ${item.name} (₹${item.price})`}
            >
              <span className="truncate max-w-[130px]">{item.name}</span>
              <span className="font-mono text-[#E66817] font-black text-xs">₹{item.price}</span>
              <Plus className="w-3 h-3 text-[#E66817] stroke-[3]" />
            </button>
          ))}
        </div>

        {/* Right side: Search Status indicator & Manage Menu button */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {searchQuery && (
            <div className="flex items-center gap-1.5 bg-[#FFF4ED] border border-[#FDBA74] px-2.5 py-1 rounded-lg text-xs shrink-0 animate-in fade-in">
              <Search className="w-3.5 h-3.5 text-[#E66817]" />
              <span className="text-slate-600 font-bold truncate max-w-[110px]">"{searchQuery}"</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-4 h-4 rounded bg-orange-200/60 hover:bg-rose-100 text-[#E66817] hover:text-rose-600 flex items-center justify-center font-black cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3 h-3 stroke-[3]" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsMenuManagerOpen(true)}
            className="min-h-[32px] px-3 py-1 bg-white hover:bg-[#FFF4ED] border border-[#EBE6DD] hover:border-[#FDBA74] text-[#0B253A] hover:text-[#E66817] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="Open Menu Manager & Prebuilt Starter Library (30 Types)"
          >
            <Settings2 className="w-3.5 h-3.5 text-[#E66817]" />
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
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-[#EBE6DD] shadow-2xs space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF4ED] text-[#E66817] flex items-center justify-center shadow-xs">
              <Utensils className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-[#0B253A]">No dishes match your selection</h3>
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
              className="min-h-[40px] px-5 py-1.5 rounded-xl bg-[#E66817] text-white font-bold text-xs shadow-md shadow-[#E66817]/20 active:scale-95 cursor-pointer"
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
