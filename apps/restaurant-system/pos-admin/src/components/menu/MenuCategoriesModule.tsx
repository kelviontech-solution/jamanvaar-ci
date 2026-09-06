import React, { useState, useMemo } from 'react';
import { Category, MenuItem } from '@jamanvaar/types';
import { db, MenuRepository } from '@jamanvaar/database';
import {
  Plus,
  Search,
  UtensilsCrossed,
  Copy,
  Edit2,
  Trash2,
  Percent
} from 'lucide-react';

interface MenuCategoriesModuleProps {
  categories: Category[];
  menuItems: MenuItem[];
  onOpenItemModal: (item?: MenuItem | null) => void;
  onOpenCategoryModal: (cat?: Category | null) => void;
  onOpenPrebuiltMenuModal: () => void;
  onOpenBulkPriceModal: () => void;
  showToast: (msg: string) => void;
  onRequestConfirm?: (dialog: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }) => void;
}

export const MenuCategoriesModule: React.FC<MenuCategoriesModuleProps> = ({
  categories,
  menuItems,
  onOpenItemModal,
  onOpenCategoryModal,
  onOpenPrebuiltMenuModal,
  onOpenBulkPriceModal,
  showToast,
  onRequestConfirm
}) => {
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        !menuSearch ||
        item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.sku.toLowerCase().includes(menuSearch.toLowerCase());

      const matchesCat =
        selectedCategoryFilter === 'ALL' || item.categoryId === selectedCategoryFilter;

      const matchesDiet =
        dietaryFilter === 'ALL' ||
        (dietaryFilter === 'VEG' && item.dietaryType === 'VEG') ||
        (dietaryFilter === 'NON_VEG' && item.dietaryType === 'NON_VEG');

      return matchesSearch && matchesCat && matchesDiet;
    });
  }, [menuItems, menuSearch, selectedCategoryFilter, dietaryFilter]);

  const handleDuplicateDish = (dish: MenuItem) => {
    MenuRepository.createMenuItem({
      name: `${dish.name} (Copy)`,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      price: dish.price,
      categoryId: dish.categoryId,
      kitchenStation: dish.kitchenStation,
      dietaryType: dish.dietaryType,
      spiceLevel: dish.spiceLevel,
      description: dish.description,
      imageUrl: dish.imageUrl,
      isAvailable: true,
      isPopular: false,
      isFeatured: false
    });
    showToast(`Duplicated dish: ${dish.name}`);
  };

  const handleDeleteDish = (dish: MenuItem) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Menu Dish',
        message: `Are you sure you want to permanently remove "${dish.name}" from your restaurant menu?`,
        confirmText: 'Delete Dish',
        isDanger: true,
        onConfirm: () => {
          MenuRepository.deleteMenuItem(dish.id);
          showToast(`Deleted dish: ${dish.name}`);
        }
      });
    } else {
      if (window.confirm(`Delete dish "${dish.name}"?`)) {
        MenuRepository.deleteMenuItem(dish.id);
        showToast(`Deleted dish: ${dish.name}`);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B253A] tracking-tight">Menu & Catalog Manager</h1>
            <span className="bg-orange-50 text-[#E66817] font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-orange-200/70">
              {menuItems.length} ITEMS
            </span>
          </div>
          <p className="text-xs text-[#4A5568] mt-0.5">Create, edit dishes, adjust pricing, upload device photos, and import templates.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenItemModal(null)}
            className="px-3.5 py-2 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dish</span>
          </button>

          <button
            onClick={() => onOpenCategoryModal(null)}
            className="px-3.5 py-2 rounded-xl bg-[#0B253A] hover:bg-[#1E3A4C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>

          <button
            onClick={onOpenPrebuiltMenuModal}
            className="px-3.5 py-2 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>🍕 Load 14 Templates</span>
          </button>

          <button
            onClick={onOpenBulkPriceModal}
            className="px-3.5 py-2 rounded-xl bg-white border border-[#EBE6DD] text-[#0B253A] text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Percent className="w-3.5 h-3.5 text-[#E66817]" />
            <span>Bulk Price Adjust</span>
          </button>
        </div>
      </div>

      {/* Search, Dietary Filter & Category Navigation Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-[#EBE6DD] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Dish Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search dish by name, description, SKU or tag..."
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
            />
            {menuSearch && (
              <button
                onClick={() => setMenuSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>

          {/* Dietary Filter Segmented Control */}
          <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 rounded-xl border border-[#EBE6DD] self-start sm:self-auto shrink-0 text-xs">
            {[
              { id: 'ALL', label: 'All Diets' },
              { id: 'VEG', label: '🟢 Veg' },
              { id: 'NON_VEG', label: '🔴 Non-Veg' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDietaryFilter(d.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                  dietaryFilter === d.id
                    ? 'bg-white text-[#0B253A] shadow-2xs font-black'
                    : 'text-slate-600 hover:text-[#0B253A]'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100">
          <button
            onClick={() => setSelectedCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-[#0B253A] text-white shadow-xs'
                : 'bg-[#FAF7F2] hover:bg-[#F4EFE6] text-slate-700'
            }`}
          >
            All Categories ({menuItems.length})
          </button>

          {categories.map((c: Category) => (
            <div key={c.id} className="relative group shrink-0">
              <button
                onClick={() => setSelectedCategoryFilter(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategoryFilter === c.id
                    ? 'bg-[#0B253A] text-white shadow-xs'
                    : 'bg-[#FAF7F2] hover:bg-[#F4EFE6] text-slate-700'
                }`}
              >
                <span>{c.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  selectedCategoryFilter === c.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {menuItems.filter(m => m.categoryId === c.id).length}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dishes Grid or Empty State */}
      {filteredMenuItems.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#EBE6DD] shadow-2xs space-y-3 max-w-lg mx-auto my-6">
          <div className="w-12 h-12 bg-orange-50 text-[#E66817] rounded-2xl flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base text-[#0B253A]">No Dishes Match Filters</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No menu dishes found matching the current search, category, or dietary filter.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => {
                setMenuSearch('');
                setSelectedCategoryFilter('ALL');
                setDietaryFilter('ALL');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              Clear Filters
            </button>
            <button
              onClick={() => onOpenItemModal(null)}
              className="px-4 py-2 bg-[#E66817] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              + Add New Dish
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredMenuItems.map((item: MenuItem) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-[#EBE6DD] overflow-hidden shadow-2xs flex flex-col justify-between group hover:shadow-xs transition-all hover:border-[#D8D1C3]"
            >
              <div className="relative h-36 bg-slate-100 overflow-hidden">
                <img
                  src={item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
                  }}
                />
                <span className="absolute top-2.5 right-2.5 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-mono font-black text-[#0B253A] shadow-2xs">
                  {item.sku}
                </span>

                {/* Veg / Non-Veg Indicator Badge */}
                <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs p-1 rounded-md shadow-2xs">
                  <div
                    className={`w-3.5 h-3.5 border-2 flex items-center justify-center rounded-xs ${
                      item.dietaryType === 'NON_VEG' ? 'border-rose-600' : 'border-emerald-600'
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="font-extrabold text-sm text-[#0B253A] leading-tight group-hover:text-[#E66817] transition-colors">
                      {item.name}
                    </h4>
                    <span className="font-mono font-black text-sm text-emerald-800 shrink-0">₹{item.price}</span>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => {
                      item.isAvailable = !item.isAvailable;
                      db.notify();
                      showToast(`${item.name} is now ${item.isAvailable ? 'IN STOCK' : 'OUT OF STOCK (86)'}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      item.isAvailable
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
                        : 'bg-rose-50 text-rose-800 border border-rose-200/80 hover:bg-rose-100'
                    }`}
                  >
                    {item.isAvailable ? '✓ In Stock' : '🚫 86 Out'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDuplicateDish(item)}
                      title="Duplicate Dish"
                      className="p-1.5 hover:bg-[#FAF7F2] rounded-lg text-slate-400 hover:text-[#0B253A] transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onOpenItemModal(item)}
                      title="Edit Dish"
                      className="p-1.5 hover:bg-[#FFF4ED] rounded-lg text-slate-400 hover:text-[#E66817] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDish(item)}
                      title="Delete Dish"
                      className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
