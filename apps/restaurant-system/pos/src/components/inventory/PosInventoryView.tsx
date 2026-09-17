import React, { useState, useMemo } from 'react';
import { db, MenuRepository } from '@jamanvaar/database';
import { MenuItem } from '@jamanvaar/types';
import { usePosStore } from '../../store/posStore';
import { formatINR } from '@jamanvaar/utils';
import {
  Package,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  Filter,
  Check,
  X,
  Sparkles,
  Utensils,
  ChevronDown,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

type AvailabilityFilter = 'ALL' | 'AVAILABLE' | 'UNAVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';

const UNAVAILABLE_REASONS = [
  'Out of stock',
  'Kitchen station unavailable',
  'Ingredient unavailable',
  'Temporarily unavailable',
  'Other'
];

export const PosInventoryView: React.FC = () => {
  const { currentUser } = usePosStore();

  const [search, setSearch] = useState('');
  const [selectedStation, setSelectedStation] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [, setRefreshKey] = useState(0);

  // Single Item Confirmation Modal State
  const [pendingItemAction, setPendingItemAction] = useState<{
    item: MenuItem;
    targetAvailability: boolean;
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState(UNAVAILABLE_REASONS[0]);

  // Bulk Confirmation Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTargetAvailability, setBulkTargetAvailability] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const menuItems = db.menuItems;

  // Real database counts (never hardcoded)
  const totalCount = menuItems.length;
  const availableCount = menuItems.filter((i) => i.isAvailable !== false).length;
  const unavailableCount = menuItems.filter((i) => i.isAvailable === false).length;
  const lowStockCount = menuItems.filter(
    (i) => i.stockQuantity !== undefined && i.stockQuantity > 0 && i.stockQuantity <= (i.lowStockThreshold || 5)
  ).length;
  const outOfStockCount = menuItems.filter(
    (i) => i.isAvailable === false || i.stockQuantity === 0
  ).length;

  // Dynamically derived kitchen stations
  const dynamicStations = useMemo(() => {
    const stationsSet = new Set<string>();
    menuItems.forEach((i) => {
      if (i.kitchenStation) stationsSet.add(i.kitchenStation);
    });
    return ['ALL', ...Array.from(stationsSet)];
  }, [menuItems]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // 1. Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchStation = item.kitchenStation?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchStation) return false;
      }

      // 2. Station filter
      if (selectedStation !== 'ALL' && item.kitchenStation !== selectedStation) {
        return false;
      }

      // 3. Availability status filter
      if (availabilityFilter === 'AVAILABLE' && item.isAvailable === false) {
        return false;
      }
      if (availabilityFilter === 'UNAVAILABLE' && item.isAvailable !== false) {
        return false;
      }
      if (availabilityFilter === 'LOW_STOCK') {
        const isLow =
          item.stockQuantity !== undefined &&
          item.stockQuantity > 0 &&
          item.stockQuantity <= (item.lowStockThreshold || 5);
        if (!isLow) return false;
      }
      if (availabilityFilter === 'OUT_OF_STOCK') {
        const isOut = item.isAvailable === false || item.stockQuantity === 0;
        if (!isOut) return false;
      }

      return true;
    });
  }, [menuItems, search, selectedStation, availabilityFilter]);

  // Handle single item availability update
  const handleConfirmSingleAction = () => {
    if (!pendingItemAction) return;
    const { item, targetAvailability } = pendingItemAction;

    MenuRepository.toggleItemAvailability(
      item.id,
      targetAvailability,
      !targetAvailability ? selectedReason : undefined,
      currentUser?.fullName || 'Cashier'
    );

    showToast(
      targetAvailability
        ? `✓ "${item.name}" marked as AVAILABLE for billing.`
        : `✓ "${item.name}" marked as UNAVAILABLE.`
    );

    setPendingItemAction(null);
    setRefreshKey((k) => k + 1);
  };

  // Handle bulk availability update
  const handleConfirmBulkAction = () => {
    if (selectedItemIds.length === 0) return;

    MenuRepository.bulkToggleAvailability(
      selectedItemIds,
      bulkTargetAvailability,
      !bulkTargetAvailability ? selectedReason : undefined,
      currentUser?.fullName || 'Cashier'
    );

    showToast(
      `✓ Updated ${selectedItemIds.length} dishes to ${
        bulkTargetAvailability ? 'AVAILABLE' : 'UNAVAILABLE'
      }.`
    );

    setSelectedItemIds([]);
    setIsBulkModalOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItemIds(filteredItems.map((i) => i.id));
    } else {
      setSelectedItemIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-jaman-cream p-3 sm:p-4 overflow-hidden select-none space-y-3">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-jaman-navy text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-150 shrink-0 border border-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Header & 4 Compact Summary Cards */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 bg-white border border-jaman-border p-3.5 rounded-2xl shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Package className="w-4 h-4 text-jaman-saffron" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-jaman-navy leading-tight">
                Kitchen Inventory & Availability
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Control which dishes are available for billing and kitchen preparation.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Compact Real Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          {/* Total Dishes */}
          <div className="bg-jaman-cream border border-jaman-border px-3 py-1.5 rounded-xl text-left">
            <span className="text-slate-400 block text-[9px] uppercase font-black tracking-wider">
              TOTAL DISHES
            </span>
            <strong className="text-sm font-black font-mono text-jaman-navy">{totalCount}</strong>
          </div>

          {/* Available */}
          <div className="bg-emerald-50/60 border border-emerald-200 px-3 py-1.5 rounded-xl text-left">
            <span className="text-emerald-700 block text-[9px] uppercase font-black tracking-wider">
              AVAILABLE
            </span>
            <strong className="text-sm font-black font-mono text-emerald-800">{availableCount}</strong>
          </div>

          {/* Unavailable */}
          <div className="bg-rose-50/60 border border-rose-200 px-3 py-1.5 rounded-xl text-left">
            <span className="text-rose-700 block text-[9px] uppercase font-black tracking-wider">
              UNAVAILABLE
            </span>
            <strong className="text-sm font-black font-mono text-rose-800">{unavailableCount}</strong>
          </div>

          {/* Low Stock */}
          <div className="bg-amber-50/60 border border-amber-200 px-3 py-1.5 rounded-xl text-left">
            <span className="text-amber-700 block text-[9px] uppercase font-black tracking-wider">
              LOW STOCK
            </span>
            <strong className="text-sm font-black font-mono text-amber-800">{lowStockCount}</strong>
          </div>
        </div>
      </div>

      {/* Controls Row: Search, Availability Filter Tabs & Station Selector */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by dish name, SKU, or station..."
            className="w-full bg-white border border-jaman-border focus:border-jaman-saffron rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-jaman-navy placeholder:text-slate-400 focus:outline-none shadow-2xs transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Availability Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 bg-white border border-jaman-border p-1 rounded-xl shadow-2xs scrollbar-none shrink-0">
          {[
            { id: 'ALL', label: 'All', count: totalCount },
            { id: 'AVAILABLE', label: 'Available', count: availableCount },
            { id: 'UNAVAILABLE', label: 'Unavailable', count: unavailableCount },
            { id: 'LOW_STOCK', label: 'Low Stock', count: lowStockCount },
            { id: 'OUT_OF_STOCK', label: 'Out of Stock', count: outOfStockCount }
          ].map((f) => {
            const active = availabilityFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setAvailabilityFilter(f.id as AvailabilityFilter)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-jaman-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[10px] font-mono px-1 rounded-full ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Station Selector Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-jaman-border px-2.5 py-1 rounded-xl shadow-2xs text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-400 text-[11px] font-semibold">Station:</span>
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="bg-transparent font-bold text-xs text-jaman-navy focus:outline-none cursor-pointer"
          >
            {dynamicStations.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All Kitchen Stations' : st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Selection Action Bar if items selected */}
      {selectedItemIds.length > 0 && (
        <div className="bg-jaman-navy text-white px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-lg text-xs font-bold animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <span className="bg-jaman-saffron text-white px-2 py-0.5 rounded-md font-mono text-[11px]">
              {selectedItemIds.length}
            </span>
            <span>dishes selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBulkTargetAvailability(true);
                setIsBulkModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition-colors"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Mark Available</span>
            </button>

            <button
              onClick={() => {
                setBulkTargetAvailability(false);
                setIsBulkModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5 stroke-[3]" />
              <span>Mark Unavailable</span>
            </button>

            <button
              onClick={() => setSelectedItemIds([])}
              className="text-slate-300 hover:text-white px-2 py-1"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Items Table (Full Width & Clean Row Spacing) */}
      <div className="flex-1 bg-white border border-jaman-border rounded-2xl shadow-2xs overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-jaman-cream border-b border-jaman-border text-slate-400 font-bold sticky top-0 z-10 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedItemIds.length > 0 && selectedItemIds.length === filteredItems.length}
                    onChange={handleSelectAll}
                    className="rounded text-jaman-saffron focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-3 w-[35%]">DISH / SKU</th>
                <th className="p-3 w-[18%]">KITCHEN STATION</th>
                <th className="p-3 w-[10%]">PRICE</th>
                <th className="p-3 w-[15%]">AVAILABILITY</th>
                <th className="p-3 w-[10%]">STOCK</th>
                <th className="p-3 w-[12%] text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const isChecked = selectedItemIds.includes(item.id);
                  const isPureVeg = item.dietaryType === 'VEG' || item.dietaryType === 'JAIN';

                  // Stock representation
                  let stockText = 'Stock tracking not configured';
                  if (item.stockQuantity !== undefined) {
                    if (item.stockQuantity === 0) {
                      stockText = 'OUT OF STOCK';
                    } else if (item.stockQuantity <= (item.lowStockThreshold || 5)) {
                      stockText = `LOW • ${item.stockQuantity}`;
                    } else {
                      stockText = `${item.stockQuantity}`;
                    }
                  }

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-jaman-cream/60 transition-colors h-16 ${
                        !item.isAvailable ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectRow(item.id)}
                          className="rounded text-jaman-saffron focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Dish / SKU */}
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          {/* Veg Dot */}
                          <div
                            className={`w-3.5 h-3.5 border flex items-center justify-center p-0.5 rounded-xs shrink-0 ${
                              isPureVeg ? 'border-emerald-600' : 'border-rose-600'
                            }`}
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isPureVeg ? 'bg-emerald-600' : 'bg-rose-600'
                              }`}
                            />
                          </div>

                          {/* Image */}
                          <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-jaman-border">
                            <img
                              src={
                                item.imageUrl ||
                                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80'
                              }
                              alt={item.name}
                              className={`w-full h-full object-cover ${
                                !item.isAvailable ? 'grayscale opacity-60' : ''
                              }`}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=150&q=80';
                              }}
                            />
                          </div>

                          {/* Name & SKU */}
                          <div className="min-w-0">
                            <strong className="text-xs font-extrabold text-jaman-navy block truncate">
                              {item.name}
                            </strong>
                            <span className="text-[10px] text-slate-400 font-mono">
                              SKU: {item.sku}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Kitchen Station */}
                      <td className="p-3">
                        <span className="inline-block text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 truncate max-w-[140px]">
                          {item.kitchenStation || 'Main Kitchen'}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="p-3 font-mono font-black text-xs text-jaman-navy">
                        {formatINR(item.price)}
                      </td>

                      {/* Availability Status Badge */}
                      <td className="p-3">
                        {item.isAvailable ? (
                          item.stockQuantity !== undefined &&
                          item.stockQuantity <= (item.lowStockThreshold || 5) &&
                          item.stockQuantity > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                              <span>LOW STOCK</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>AVAILABLE</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            <span>UNAVAILABLE</span>
                          </span>
                        )}
                      </td>

                      {/* Stock Quantity */}
                      <td className="p-3 text-[11px] text-slate-500 font-medium">
                        {stockText}
                      </td>

                      {/* 1-Tap Action Button (Never "Mark as 86") */}
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setPendingItemAction({
                              item,
                              targetAvailability: !item.isAvailable
                            })
                          }
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer ${
                            item.isAvailable
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                          title={
                            item.isAvailable
                              ? `Set ${item.name} as unavailable for billing`
                              : `Set ${item.name} as available for billing`
                          }
                        >
                          {item.isAvailable ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Mark Unavailable</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Mark Available</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Utensils className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-jaman-navy">No dishes match your filters</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try clearing your search query or status filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SINGLE ITEM CONFIRMATION DIALOG */}
      {pendingItemAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-jaman-border rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {pendingItemAction.targetAvailability ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                )}
                <h3 className="text-base font-black text-jaman-navy">
                  {pendingItemAction.targetAvailability
                    ? `Mark "${pendingItemAction.item.name}" available?`
                    : `Mark "${pendingItemAction.item.name}" unavailable?`}
                </h3>
              </div>
              <button
                onClick={() => setPendingItemAction(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {pendingItemAction.targetAvailability
                ? `"${pendingItemAction.item.name}" will be restored to the POS menu, Kiosk, and Captain app, and can be billed immediately.`
                : `"${pendingItemAction.item.name}" will no longer appear as available for cashier billing or online orders.`}
            </p>

            {/* Optional Reason for Unavailable */}
            {!pendingItemAction.targetAvailability && (
              <div className="space-y-2 pt-1">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">
                  Select Reason (Optional):
                </span>
                <div className="space-y-1.5">
                  {UNAVAILABLE_REASONS.map((r) => (
                    <label
                      key={r}
                      onClick={() => setSelectedReason(r)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        selectedReason === r
                          ? 'border-jaman-saffron bg-amber-50/50 text-jaman-navy font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span>{r}</span>
                      <input
                        type="radio"
                        name="unavailableReason"
                        checked={selectedReason === r}
                        onChange={() => setSelectedReason(r)}
                        className="text-jaman-saffron focus:ring-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingItemAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSingleAction}
                className={`px-5 py-2 rounded-xl font-black text-xs text-white uppercase tracking-wider transition-all shadow-md active:scale-95 ${
                  pendingItemAction.targetAvailability
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                }`}
              >
                {pendingItemAction.targetAvailability ? 'Mark Available' : 'Mark Unavailable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK ACTION CONFIRMATION DIALOG */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-jaman-border rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-jaman-navy">
                {bulkTargetAvailability
                  ? `Mark ${selectedItemIds.length} dishes available?`
                  : `Mark ${selectedItemIds.length} dishes unavailable?`}
              </h3>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {bulkTargetAvailability
                ? `All ${selectedItemIds.length} selected dishes will be restored for counter billing across POS and Captain.`
                : `All ${selectedItemIds.length} selected dishes will immediately become unavailable for billing.`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBulkAction}
                className={`px-5 py-2 rounded-xl font-black text-xs text-white uppercase tracking-wider transition-all shadow-md active:scale-95 ${
                  bulkTargetAvailability
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                }`}
              >
                Confirm Bulk Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
