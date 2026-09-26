import React, { useEffect, useRef, useState } from 'react';
import { Category, MenuItem, ComboDeal } from '@jamanvaar/types';
import { db, MenuRepository, ComboRepository, AuditRepository, PREBUILT_MENU_TEMPLATES } from '@jamanvaar/database';
import { MenuBuilderService } from '@jamanvaar/business';
import {
  Plus,
  Search,
  UtensilsCrossed,
  Copy,
  Edit2,
  Trash2,
  Percent,
  Sparkles,
  Package,
  Upload,
  Download,
  Wand2
} from 'lucide-react';
import { ComboModal } from './ComboModal';

interface MenuCategoriesModuleProps {
  categories: Category[];
  menuItems: MenuItem[];
  onOpenItemModal: (item?: MenuItem | null) => void;
  onOpenCategoryModal: (cat?: Category | null) => void;
  onCategoriesChanged?: () => void;
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
  onCategoriesChanged,
  onOpenPrebuiltMenuModal,
  onOpenBulkPriceModal,
  showToast,
  onRequestConfirm
}) => {
  const [menuSearch, setMenuSearch] = useState('');
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // BUG-014: no CSV import existed anywhere for menus, and there was no one-click way to
  // load a starter menu — an empty menu showed only "No menu dishes found" with no way out.
  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after fixing it
    if (!file) return;
    file.text().then((text) => {
      const result = MenuBuilderService.importCSV(text);
      AuditRepository.log({
        action: 'MENU_CSV_IMPORTED',
        category: 'MENU',
        details: `Imported ${result.itemsImported} dish(es) and created ${result.categoriesCreated} categor${result.categoriesCreated === 1 ? 'y' : 'ies'} from "${file.name}"`,
        username: 'Manager'
      });
      if (result.errors.length > 0) {
        const preview = result.errors
          .slice(0, 5)
          .map((er) => `Row ${er.row}: ${er.message}`)
          .join(' · ');
        const more = result.errors.length > 5 ? ` (+${result.errors.length - 5} more)` : '';
        showToast(
          `Imported ${result.itemsImported} dish(es). ${result.errors.length} row(s) had problems and were skipped — ${preview}${more}`
        );
      } else {
        showToast(`Imported ${result.itemsImported} dish(es) into ${result.categoriesCreated} new categor${result.categoriesCreated === 1 ? 'y' : 'ies'}.`);
      }
    });
  };

  const handleDownloadCsvTemplate = () => {
    const templateRow = ['Category,Item Name,SKU,Price,Dietary Type,Spice Level,Description,Image URL', '"Starters","Veg Spring Roll","STR-001",180,VEG,MEDIUM,"Crispy vegetable rolls",""'].join('\n');
    const csv = menuItems.length > 0 ? MenuBuilderService.exportCSV() : templateRow;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jamanvaar-menu-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // "One button that loads the default items" (owner's words). Loads every bundled cuisine
  // template at once, skipping anything that already exists by name — the same trusted
  // import path "Load 14 Templates" uses, just with no picker to click through first.
  const handleLoadDefaultItems = () => {
    setLoadingDefaults(true);
    try {
      const result = MenuBuilderService.importTemplates(
        PREBUILT_MENU_TEMPLATES.map((t) => t.id),
        {
          importCategories: true,
          importItems: true,
          importImages: true,
          importModifiers: true,
          importCombos: true,
          importSuggestedPrices: true,
          duplicateStrategy: 'SKIP_DUPLICATE'
        }
      );
      showToast(`Loaded ${result.importedItemsCount} default dish(es) across ${result.importedCategoriesCount} categories.`);
    } finally {
      setLoadingDefaults(false);
    }
  };
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  // The category strip scrolls sideways; whichever category is selected is brought into view (and centred) on its own.
  const categoryStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = categoryStripRef.current;
    if (!strip) return;
    const pill = strip.querySelector<HTMLElement>(`[data-cat-pill="${selectedCategoryFilter}"]`);
    if (!pill) return;
    const target = pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [selectedCategoryFilter, categories.length]);
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');

  // Combos & Meal Deals — the data layer (ComboRepository) already existed
  // and is consumed by Kiosk, but there was no Restaurant Admin screen to
  // actually create or edit a combo; re-reads on every db.notify() the same
  // way menuItems/categories do (App.tsx subscribes and re-renders this tree).
  const combos = ComboRepository.getAllCombos();
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [comboToEdit, setComboToEdit] = useState<ComboDeal | null>(null);

  // Not memoised on `menuItems`: that is the database's own array, edited in place (Load Default Items, Save,
  // Delete, a sync), so its identity never changes and a memo keyed on it kept showing the old list (BUG-146/150).
  // Filtering a few hundred dishes on each render is cheap.
  const filteredMenuItems = (() => {
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
  })();

  // A menu never keeps the same dish twice: any copies that arrive (a sync, an old import) are cleared, and the owner can also run it by hand.
  const handleRemoveDuplicates = (quiet = false) => {
    const { removed } = MenuRepository.removeDuplicateDishes();
    if (removed > 0) showToast(`Removed ${removed} duplicate dish${removed === 1 ? '' : 'es'}.`);
    else if (!quiet) showToast('No duplicate dishes found.');
  };
  useEffect(() => {
    handleRemoveDuplicates(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItems.length]);

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

  const handleDeleteCombo = (combo: ComboDeal) => {
    const doDelete = () => {
      ComboRepository.deleteCombo(combo.id);
      AuditRepository.log({
        action: 'COMBO_DELETED',
        category: 'MENU',
        details: `Deleted combo "${combo.name}"`,
        username: 'Manager'
      });
      showToast(`Deleted combo: ${combo.name}`);
    };
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Combo Deal',
        message: `Are you sure you want to permanently remove "${combo.name}"?`,
        confirmText: 'Delete Combo',
        isDanger: true,
        onConfirm: doDelete
      });
    } else if (window.confirm(`Delete combo "${combo.name}"?`)) {
      doDelete();
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">Menu & Catalog Manager</h1>
            <span className="bg-orange-50 text-jaman-saffron font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-orange-200/70">
              {menuItems.length} ITEMS
            </span>
          </div>
          <p className="text-xs text-[#4A5568] mt-0.5">Create, edit dishes, adjust pricing, upload device photos, and import templates.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenItemModal(null)}
            className="px-3.5 py-2 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dish</span>
          </button>

          <button
            onClick={() => onOpenCategoryModal(null)}
            className="px-3.5 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>

          <button
            onClick={onOpenPrebuiltMenuModal}
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>🍕 Load 14 Templates</span>
          </button>

          <button
            onClick={handleLoadDefaultItems}
            disabled={loadingDefaults}
            title="Load a full default starter menu in one click"
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          >
            <Wand2 className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>{loadingDefaults ? 'Loading…' : 'Load Default Items'}</span>
          </button>

          <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFileSelected} style={{ display: 'none' }} />
          <button
            onClick={() => csvInputRef.current?.click()}
            title="Upload a menu CSV (download the template first if you need the columns)"
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>Upload CSV</span>
          </button>
          <button
            onClick={handleDownloadCsvTemplate}
            title="Download a CSV template (or your current menu, if you have one)"
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>Download CSV Template</span>
          </button>

          <button
            onClick={onOpenBulkPriceModal}
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Percent className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>Bulk Price Adjust</span>
          </button>

          <button
            onClick={() => handleRemoveDuplicates()}
            className="px-3.5 py-2 rounded-xl bg-white border border-jaman-border text-jaman-navy text-xs font-bold hover:bg-[#F8F6F0] transition-colors cursor-pointer flex items-center gap-1.5"
            title="Remove dishes that appear more than once"
          >
            <Copy className="w-3.5 h-3.5 text-jaman-saffron" />
            <span>Remove Duplicates</span>
          </button>
        </div>
      </div>

      {/* Search, Dietary Filter & Category Navigation Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-jaman-border shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Dish Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search dish by name, description, SKU or tag..."
              className="w-full bg-jaman-cream border border-jaman-border rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
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
          <div className="flex items-center gap-1 bg-jaman-cream p-1 rounded-xl border border-jaman-border self-start sm:self-auto shrink-0 text-xs">
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
                    ? 'bg-white text-jaman-navy shadow-2xs font-black'
                    : 'text-slate-600 hover:text-jaman-navy'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Strip */}
        <div ref={categoryStripRef} className="relative flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 border-t border-slate-100" style={{ scrollBehavior: 'smooth' }}>
          <button
            data-cat-pill="ALL"
            onClick={() => setSelectedCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-jaman-navy text-white shadow-xs'
                : 'bg-jaman-cream hover:bg-[#F4EFE6] text-slate-700'
            }`}
          >
            All Categories ({menuItems.length})
          </button>

          {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c: Category) => (
            <div key={c.id} data-cat-pill={c.id} className="relative group shrink-0">
              <button
                onClick={() => setSelectedCategoryFilter(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCategoryFilter === c.id
                    ? 'bg-jaman-navy text-white shadow-xs'
                    : 'bg-jaman-cream hover:bg-[#F4EFE6] text-slate-700'
                }`}
              >
                <span>{c.name}{c.qrVisible === false ? ' (hidden from QR)' : ''}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  selectedCategoryFilter === c.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {menuItems.filter(m => m.categoryId === c.id).length}
                </span>
              </button>
            </div>
          ))}
        </div>
        {selectedCategoryFilter !== 'ALL' && categories.some((c: Category) => c.id === selectedCategoryFilter) && (
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
            <span>
              Showing {filteredMenuItems.length} dish{filteredMenuItems.length === 1 ? '' : 'es'} in{' '}
              <strong className="text-jaman-navy">{categories.find((c: Category) => c.id === selectedCategoryFilter)?.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => onOpenCategoryModal(categories.find((c: Category) => c.id === selectedCategoryFilter))}
              className="font-bold text-jaman-saffron hover:underline cursor-pointer"
            >
              Edit this category
            </button>
          </div>
        )}
      </div>

      {/* Dishes Grid or Empty State */}
      {menuItems.length === 0 ? (
        // BUG-013/014: a brand-new restaurant's menu is genuinely empty now (no demo seed),
        // and this used to show nothing but "No menu dishes found…" with no way forward.
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-jaman-border shadow-2xs space-y-4 max-w-xl mx-auto my-6">
          <div className="w-14 h-14 bg-orange-50 text-jaman-saffron rounded-2xl flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-black text-base text-jaman-navy">This restaurant has no menu yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Upload a menu CSV, load a default starter menu in one click, or add dishes one at a time.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              onClick={() => csvInputRef.current?.click()}
              className="px-4 py-2 bg-jaman-saffron hover:bg-[#EA580C] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload CSV
            </button>
            <button
              onClick={handleLoadDefaultItems}
              disabled={loadingDefaults}
              className="px-4 py-2 bg-white border border-jaman-border hover:bg-[#F8F6F0] text-jaman-navy text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
            >
              <Wand2 className="w-3.5 h-3.5 text-jaman-saffron" />
              {loadingDefaults ? 'Loading…' : 'Load Default Items'}
            </button>
            <button
              onClick={handleDownloadCsvTemplate}
              className="px-4 py-2 bg-white border border-jaman-border hover:bg-[#F8F6F0] text-jaman-navy text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-jaman-saffron" />
              Download Template
            </button>
            <button
              onClick={() => onOpenItemModal(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              + Add One Dish
            </button>
          </div>
        </div>
      ) : filteredMenuItems.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-jaman-border shadow-2xs space-y-3 max-w-lg mx-auto my-6">
          <div className="w-12 h-12 bg-orange-50 text-jaman-saffron rounded-2xl flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base text-jaman-navy">No Dishes Match Filters</h3>
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
              className="px-4 py-2 bg-jaman-saffron text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
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
              className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs flex flex-col justify-between group hover:shadow-xs transition-all hover:border-[#D8D1C3]"
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
                <span className="absolute top-2.5 right-2.5 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-mono font-black text-jaman-navy shadow-2xs">
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
                    <h4 className="font-extrabold text-sm text-jaman-navy leading-tight group-hover:text-jaman-saffron transition-colors">
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
                      onClick={() => onOpenItemModal(item)}
                      title="Edit Dish"
                      className="p-1.5 hover:bg-[#FFF4ED] rounded-lg text-slate-400 hover:text-jaman-saffron transition-colors cursor-pointer"
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

      {/* Combos & Meal Deals */}
      <div className="pt-2 border-t border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-jaman-navy tracking-tight">Combos & Meal Deals</h2>
              <span className="bg-orange-50 text-jaman-saffron font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-orange-200/70">
                {combos.length} ACTIVE
              </span>
            </div>
            <p className="text-xs text-[#4A5568] mt-0.5">Bundle dishes into a fixed-price deal with an automatic savings badge.</p>
          </div>
          <button
            onClick={() => {
              setComboToEdit(null);
              setIsComboModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-jaman-navy hover:bg-jaman-darkBorder text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Combo</span>
          </button>
        </div>

        {combos.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-jaman-border shadow-2xs space-y-3 max-w-lg mx-auto">
            <div className="w-12 h-12 bg-orange-50 text-jaman-saffron rounded-2xl flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="font-black text-sm text-jaman-navy">No Combos Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Bundle popular dishes into a discounted combo to increase average order value on Kiosk and QR ordering.
            </p>
            <button
              onClick={() => {
                setComboToEdit(null);
                setIsComboModalOpen(true);
              }}
              className="px-4 py-2 bg-jaman-navy text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              + Create First Combo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {combos.map((combo) => (
              <div
                key={combo.id}
                className="bg-white rounded-2xl border border-jaman-border p-4 shadow-2xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-extrabold text-sm text-jaman-navy">{combo.name}</h4>
                    {combo.featured && (
                      <span className="shrink-0 flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        <Sparkles className="w-2.5 h-2.5" /> Featured
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{combo.description}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-mono font-black text-lg text-emerald-800">₹{combo.basePrice}</span>
                    {combo.originalPrice > combo.basePrice && (
                      <span className="text-xs text-slate-400 line-through">₹{combo.originalPrice}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {combo.mainItemIds.length} main{combo.mainItemIds.length === 1 ? '' : 's'}
                    {combo.sideItemIds.length > 0 && ` • ${combo.sideItemIds.length} side(s)`}
                    {combo.drinkItemIds.length > 0 && ` • ${combo.drinkItemIds.length} drink(s)`}
                    {combo.dessertItemIds.length > 0 && ` • ${combo.dessertItemIds.length} dessert(s)`}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => {
                      ComboRepository.toggleAvailability(combo.id);
                      showToast(`${combo.name} is now ${combo.isAvailable ? 'paused' : 'active'}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      combo.isAvailable
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {combo.isAvailable ? '● Active' : '○ Paused'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setComboToEdit(combo);
                        setIsComboModalOpen(true);
                      }}
                      title="Edit Combo"
                      className="p-1.5 hover:bg-[#FFF4ED] rounded-lg text-slate-400 hover:text-jaman-saffron transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCombo(combo)}
                      title="Delete Combo"
                      className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ComboModal
        isOpen={isComboModalOpen}
        onClose={() => setIsComboModalOpen(false)}
        comboToEdit={comboToEdit}
        menuItems={menuItems}
        onSaved={() => showToast(comboToEdit ? `Updated combo: ${comboToEdit.name}` : 'Combo created')}
      />
    </div>
  );
};
