import React, { useState, useMemo } from 'react';
import { InventoryItem, Recipe } from '@jamanvaar/types';
import { InventoryRepository, RecipeRepository, db } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import {
  Package,
  Sliders,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  Layers,
  ArrowUpDown,
  Trash
} from 'lucide-react';

interface InventoryRecipesModuleProps {
  inventoryItems: InventoryItem[];
  recipes: Recipe[];
  lowStockCount: number;
  onOpenInventoryModal: (item?: InventoryItem | null) => void;
  onOpenRecipeModal: (rec?: Recipe | null) => void;
  onOpenStockAdjustModal: (item: InventoryItem) => void;
  onOpenWastageModal: (item: InventoryItem) => void;
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

export const InventoryRecipesModule: React.FC<InventoryRecipesModuleProps> = ({
  inventoryItems,
  recipes,
  lowStockCount,
  onOpenInventoryModal,
  onOpenRecipeModal,
  onOpenStockAdjustModal,
  onOpenWastageModal,
  showToast,
  onRequestConfirm
}) => {
  // Not memoized: db.stockMovements/inventoryItems are mutated in place, not
  // reassigned, so a useMemo keyed on either reference would never invalidate.
  // App.tsx already re-renders this whole tree on every db.notify().
  const recentWastage = db.stockMovements.filter((m) => m.type === 'WASTE' || m.type === 'SPOILAGE').slice(0, 8);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('ALL');

  const inventoryCategories = useMemo(() => {
    return Array.from(new Set(inventoryItems.map((i) => i.category).filter(Boolean)));
  }, [inventoryItems]);

  const filteredInventoryItems = useMemo(() => {
    return inventoryItems.filter((it) => {
      const matchesSearch =
        !inventorySearch ||
        it.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
        it.sku.toLowerCase().includes(inventorySearch.toLowerCase());
      const matchesCat =
        inventoryCategoryFilter === 'ALL' || it.category === inventoryCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [inventoryItems, inventorySearch, inventoryCategoryFilter]);

  const handleDeleteInventory = (stock: InventoryItem) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Inventory Item',
        message: `Are you sure you want to delete "${stock.name}"? This may affect linked recipes.`,
        confirmText: 'Delete Item',
        isDanger: true,
        onConfirm: () => {
          InventoryRepository.deleteItem(stock.id);
          showToast(`Deleted raw stock: ${stock.name}`);
        }
      });
    } else {
      if (window.confirm(`Delete raw stock item "${stock.name}"?`)) {
        InventoryRepository.deleteItem(stock.id);
        showToast(`Deleted raw stock: ${stock.name}`);
      }
    }
  };

  const handleDeleteRecipe = (rec: Recipe) => {
    if (onRequestConfirm) {
      onRequestConfirm({
        isOpen: true,
        title: 'Delete Recipe BOM Formula',
        message: `Are you sure you want to remove recipe formula for "${rec.menuItemName}"? Automatic stock deduction will stop for this dish.`,
        confirmText: 'Delete Recipe',
        isDanger: true,
        onConfirm: () => {
          RecipeRepository.deleteRecipe(rec.id);
          showToast(`Deleted recipe for: ${rec.menuItemName}`);
        }
      });
    } else {
      if (window.confirm(`Delete recipe formula for "${rec.menuItemName}"?`)) {
        RecipeRepository.deleteRecipe(rec.id);
        showToast(`Deleted recipe for: ${rec.menuItemName}`);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Title & CTAs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy tracking-tight">
              Inventory & Recipe Bill of Materials (BOM)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
              LIVE TRACKING
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">
            Track raw stock levels, set minimum reorder thresholds, and automate ingredient deductions upon POS/Kiosk sales.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onOpenRecipeModal(null)}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-jaman-border text-jaman-navy font-bold text-xs flex items-center gap-2 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-jaman-saffron" />
            <span>Create Recipe Formula</span>
          </button>
          <button
            onClick={() => onOpenInventoryModal(null)}
            className="px-4 py-2.5 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-jaman-saffron/25 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Stock Item</span>
          </button>
        </div>
      </div>

      {/* 4 Inventory KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Raw Ingredients</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">{inventoryItems.length} Items</div>
          <span className="text-[10px] text-slate-500 font-bold block">In Warehouse Master</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Stock Valuation</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {formatINR(
              inventoryItems.reduce((acc: number, it: InventoryItem) => acc + it.currentStock * it.costPerUnit, 0)
            )}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold block">✓ Weighted Unit Cost</span>
        </div>

        <div
          className={`p-4.5 rounded-2xl border shadow-2xs space-y-1 ${
            lowStockCount > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-jaman-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Low Stock Alerts</span>
            {lowStockCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
          </div>
          <div className={`text-2xl font-black font-mono ${lowStockCount > 0 ? 'text-amber-800' : 'text-jaman-navy'}`}>
            {lowStockCount} Critical
          </div>
          <span className={`text-[10px] font-bold block ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
            {lowStockCount > 0 ? 'Action Required Below Min Level' : 'All Stock Levels Normal'}
          </span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-jaman-border shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">BOM Dish Formulas</span>
          <div className="text-2xl font-black text-jaman-navy font-mono">{recipes.length} Formulas</div>
          <span className="text-[10px] text-blue-700 font-bold block">Auto-Deduct on Order Sale</span>
        </div>
      </div>

      {/* Raw Stock Items Section */}
      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs space-y-0">
        {/* Search & Filter Toolbar */}
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-jaman-saffron" />
            <span className="font-extrabold text-sm text-jaman-navy">
              Raw Warehouse Ingredients ({filteredInventoryItems.length})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Search ingredient or SKU..."
                className="w-full bg-white border border-jaman-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-jaman-navy placeholder:text-slate-400 focus:outline-none focus:border-jaman-saffron"
              />
              {inventorySearch && (
                <button
                  onClick={() => setInventorySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <select
              value={inventoryCategoryFilter}
              onChange={(e) => setInventoryCategoryFilter(e.target.value)}
              className="bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {inventoryCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {(inventorySearch || inventoryCategoryFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setInventorySearch('');
                  setInventoryCategoryFilter('ALL');
                }}
                className="text-xs text-jaman-saffron font-bold hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredInventoryItems.length === 0 ? (
          <div className="py-14 text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-jaman-saffron flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-extrabold text-jaman-navy text-sm">
                {inventorySearch || inventoryCategoryFilter !== 'ALL'
                  ? 'No ingredients match your filters'
                  : 'No Raw Ingredients Recorded'}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                {inventorySearch || inventoryCategoryFilter !== 'ALL'
                  ? 'Try adjusting your search query or selecting a different category filter.'
                  : 'Add pantry staples, dairy, produce, spices, and packaging materials to manage stock.'}
              </p>
            </div>
            {inventorySearch || inventoryCategoryFilter !== 'ALL' ? (
              <button
                onClick={() => {
                  setInventorySearch('');
                  setInventoryCategoryFilter('ALL');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                onClick={() => onOpenInventoryModal(null)}
                className="px-4 py-2 rounded-xl bg-jaman-saffron text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                + Add First Ingredient
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-black text-[11px] tracking-wider">
                <tr>
                  <th className="p-4">Item Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Current Stock</th>
                  <th className="p-4">Min Threshold</th>
                  <th className="p-4">Cost / Unit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredInventoryItems.map((stock: InventoryItem) => (
                  <tr key={stock.id} className="hover:bg-[#FDFBF7] transition-colors">
                    <td className="p-4">
                      <span className="font-extrabold text-jaman-navy block text-sm">{stock.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono block">{stock.sku}</span>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                        {stock.category}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-black text-sm text-jaman-navy">
                      {stock.currentStock} <span className="text-xs text-slate-500 font-normal">{stock.unit}</span>
                    </td>
                    <td className="p-4 text-slate-500 font-mono">
                      {stock.minStockLevel} {stock.unit}
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-800">
                      ₹{stock.costPerUnit} <span className="text-[10px] text-slate-400">/{stock.unit}</span>
                    </td>
                    <td className="p-4">
                      {stock.status === 'LOW_STOCK' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          LOW STOCK
                        </span>
                      ) : stock.status === 'OUT_OF_STOCK' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          OUT OF STOCK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          IN STOCK
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onOpenStockAdjustModal(stock)}
                          className="px-3 py-1.5 bg-[#FFF4ED] hover:bg-[#FFE8D6] text-jaman-saffron border border-[#FDBA74] font-bold rounded-xl text-xs transition-all active:scale-95 shadow-2xs cursor-pointer"
                        >
                          Adjust Stock
                        </button>
                        <button
                          onClick={() => onOpenWastageModal(stock)}
                          title="Log Wastage"
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenInventoryModal(stock)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Item"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteInventory(stock)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Linked BOM Recipes Section */}
      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs">
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-jaman-navy" />
            <span className="font-extrabold text-sm text-jaman-navy">
              Configured Dish Recipe Formulas ({recipes.length})
            </span>
          </div>
          <span className="text-xs text-slate-400 font-semibold">Automatic Ingredient Consumption</span>
        </div>
        {recipes.length === 0 ? (
          <div className="py-12 text-center px-4 space-y-2">
            <Sliders className="w-8 h-8 text-slate-300 mx-auto" />
            <h4 className="font-extrabold text-jaman-navy text-sm">No Recipe Formulas Configured</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Link raw ingredients to menu dishes to automatically deduct inventory whenever an order is placed.
            </p>
            <button
              onClick={() => onOpenRecipeModal(null)}
              className="mt-2 px-3.5 py-1.5 rounded-xl bg-white border border-jaman-border text-jaman-navy font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              + Create Recipe Formula
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-black text-[11px] tracking-wider">
                <tr>
                  <th className="p-4">Menu Dish</th>
                  <th className="p-4">Ingredients Breakdown</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recipes.map((rec: Recipe) => (
                  <tr key={rec.id} className="hover:bg-[#FDFBF7] transition-colors">
                    <td className="p-4 font-black text-jaman-navy text-sm">{rec.menuItemName}</td>
                    <td className="p-4 text-slate-600">
                      <div className="flex flex-wrap gap-1.5">
                        {rec.ingredients.map((ing, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-lg bg-jaman-cream border border-jaman-border text-[11px] font-bold text-slate-700"
                          >
                            {ing.inventoryItemName}{' '}
                            <span className="text-jaman-saffron font-mono ml-1">
                              ({ing.quantityPerPortion} {ing.unit})
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onOpenRecipeModal(rec)}
                          className="p-1.5 text-slate-400 hover:text-jaman-saffron hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Recipe"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecipe(rec)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Recipe"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Wastage Log */}
      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-2xs">
        <div className="p-4 bg-jaman-cream border-b border-jaman-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash className="w-4 h-4 text-rose-600" />
            <span className="font-extrabold text-sm text-jaman-navy">Recent Wastage Log</span>
          </div>
          <span className="text-xs text-slate-400 font-semibold">Last {recentWastage.length} of {db.stockMovements.filter((m) => m.type === 'WASTE' || m.type === 'SPOILAGE').length} entries</span>
        </div>
        {recentWastage.length === 0 ? (
          <div className="py-10 text-center px-4 space-y-1">
            <p className="text-xs text-slate-400">No wastage logged yet. Use "Log Wastage" on an ingredient to record spoilage, prep trim, or breakage.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-slate-500 uppercase font-black text-[11px] tracking-wider">
                <tr>
                  <th className="p-4">Item</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Qty</th>
                  <th className="p-4">Cost Impact</th>
                  <th className="p-4">Evidence</th>
                  <th className="p-4">Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recentWastage.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FDFBF7] transition-colors">
                    <td className="p-4 font-bold text-jaman-navy">{m.itemName}</td>
                    <td className="p-4 text-slate-600">{m.reason}</td>
                    <td className="p-4 font-mono text-rose-700">{m.quantityDelta} {m.unit}</td>
                    <td className="p-4 font-mono font-bold text-rose-700">₹{(m.costImpact ?? 0).toFixed(2)}</td>
                    <td className="p-4">
                      {m.photoUrl ? (
                        <img src={m.photoUrl} alt="Wastage evidence" className="w-10 h-10 object-cover rounded-lg border border-jaman-border" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500">{new Date(m.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
