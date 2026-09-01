import React, { useState, useMemo, useEffect } from 'react';
import { db, QrOrderingRepository, TableRepository, MenuRepository } from '@jamanvaar/database';
import { MenuItem, DiningTable, Order, SelectedModifier, DietaryType } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  Smartphone,
  X,
  Search,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Flame,
  ChefHat,
  Info,
  Check,
  CreditCard,
  QrCode,
  DollarSign,
  UtensilsCrossed,
  RotateCcw,
  Maximize2
} from 'lucide-react';

interface CustomerQrExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTableNumber?: string;
  initialOrderId?: string;
}

interface LocalCartItem {
  cartId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  specialInstructions: string;
  totalPrice: number;
}

export const CustomerQrExperienceModal: React.FC<CustomerQrExperienceModalProps> = ({
  isOpen,
  onClose,
  initialTableNumber = '12',
  initialOrderId
}) => {
  const [deviceWidth, setDeviceWidth] = useState<'375' | '390' | '412'>('390');
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>(initialTableNumber);
  const [viewState, setViewState] = useState<'MENU' | 'CUSTOMIZE' | 'CART' | 'CONFIRMATION' | 'TRACKING'>('MENU');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');

  // Customization modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [selectedSpice, setSelectedSpice] = useState<string>('Medium');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [specialNote, setSpecialNote] = useState<string>('');

  // Cart state
  const [cartItems, setCartItems] = useState<LocalCartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [guestName, setGuestName] = useState<string>('Guest');

  // Confirmed / active tracked order
  const [activeTrackedOrderId, setActiveTrackedOrderId] = useState<string | null>(initialOrderId || null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (initialTableNumber) setSelectedTableNumber(initialTableNumber);
  }, [initialTableNumber]);

  useEffect(() => {
    if (initialOrderId) {
      setActiveTrackedOrderId(initialOrderId);
      setViewState('TRACKING');
    }
  }, [initialOrderId]);

  // Subscribe to DB updates for live order tracking status
  useEffect(() => {
    const unsub = db.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const tables = db.tables;
  const currentTable = tables.find((t) => t.tableNumber === selectedTableNumber) || {
    tableNumber: selectedTableNumber,
    zone: 'AC Balcony',
    capacity: 4
  };

  const categories = db.categories.filter((c) => c.isActive);
  const menuItems = db.menuItems.filter((m) => m.isAvailable !== false);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (activeCategory !== 'ALL' && item.categoryId !== activeCategory) return false;
      if (dietaryFilter === 'VEG' && item.dietaryType !== 'VEG' && item.dietaryType !== 'JAIN') return false;
      if (dietaryFilter === 'NON_VEG' && item.dietaryType !== 'NON_VEG') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [menuItems, activeCategory, dietaryFilter, searchQuery]);

  // Tracked order from DB
  const trackedOrder: Order | undefined = useMemo(() => {
    if (!activeTrackedOrderId) return undefined;
    return db.orders.find((o) => o.id === activeTrackedOrderId || o.orderNumber === activeTrackedOrderId);
  }, [activeTrackedOrderId, db.orders]);

  // Cart Calculations
  const cartSubtotal = cartItems.reduce((s, it) => s + it.totalPrice, 0);
  const cartCgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartSgst = Math.round(cartSubtotal * 0.025 * 100) / 100;
  const cartTax = cartCgst + cartSgst;
  const cartTotal = Math.round(cartSubtotal + cartTax);
  const totalItemCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  const handleOpenCustomize = (item: MenuItem) => {
    setCustomizingItem(item);
    setItemQuantity(1);
    setSelectedSpice('Medium');
    setSelectedAddons([]);
    setSpecialNote('');
    setViewState('CUSTOMIZE');
  };

  const handleAddCustomizedToCart = () => {
    if (!customizingItem) return;

    const modifiers: SelectedModifier[] = [];
    if (selectedSpice) {
      modifiers.push({
        groupId: 'mod-spice',
        groupName: 'Spice Level',
        optionId: `spice-${selectedSpice.toLowerCase()}`,
        optionName: selectedSpice,
        priceDelta: 0
      });
    }

    let addOnTotalDelta = 0;
    selectedAddons.forEach((addonName) => {
      let delta = 0;
      if (addonName === 'Extra Cheese') delta = 40;
      else if (addonName === 'Extra Butter') delta = 20;
      else if (addonName === 'Extra Chutney') delta = 0;
      else if (addonName === 'Extra Onion') delta = 0;

      addOnTotalDelta += delta;
      modifiers.push({
        groupId: 'mod-addons',
        groupName: 'Add-ons',
        optionId: `addon-${addonName.toLowerCase().replace(/\s+/g, '-')}`,
        optionName: addonName,
        priceDelta: delta
      });
    });

    const unitPrice = customizingItem.price + addOnTotalDelta;
    const totalPrice = unitPrice * itemQuantity;

    const newItem: LocalCartItem = {
      cartId: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      menuItem: customizingItem,
      quantity: itemQuantity,
      selectedModifiers: modifiers,
      specialInstructions: specialNote,
      totalPrice
    };

    setCartItems((prev) => [...prev, newItem]);
    setCustomizingItem(null);
    setViewState('MENU');
  };

  const handleUpdateCartQty = (cartId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.cartId !== cartId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const unitPrice = item.totalPrice / item.quantity;
          return {
            ...item,
            quantity: nextQty,
            totalPrice: unitPrice * nextQty
          };
        })
        .filter(Boolean) as LocalCartItem[]
    );
  };

  const handlePlaceOrder = () => {
    if (cartItems.length === 0) return;

    const newOrder = QrOrderingRepository.createCustomerQrOrder({
      tableNumber: selectedTableNumber,
      items: cartItems.map((ci) => ({
        menuItemId: ci.menuItem.id,
        quantity: ci.quantity,
        selectedModifiers: ci.selectedModifiers,
        specialInstructions: ci.specialInstructions
      })),
      customerNotes: cartItems
        .map((ci) => ci.specialInstructions)
        .filter(Boolean)
        .join('; '),
      customerName: guestName ? `${guestName} (Table ${selectedTableNumber})` : `Guest (Table ${selectedTableNumber})`,
      paymentMethod: paymentMode
    });

    setActiveTrackedOrderId(newOrder.id);
    setCartItems([]);
    setViewState('CONFIRMATION');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#121B28] border border-slate-700 w-full max-w-5xl h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Preview Control Bar */}
        <div className="bg-[#0B1522] border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#E66817]/20 border border-[#E66817]/40 flex items-center justify-center text-[#E66817]">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide text-white">
                  Customer QR Scan-to-Order Simulator
                </h2>
                <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  LIVE DEMO PREVIEW
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Experience the guest mobile flow: scan QR, customize dishes, add to cart, and track order in real-time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Table Selector for Testing */}
            <div className="flex items-center gap-1.5 bg-[#172334] border border-slate-700 px-2.5 py-1.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Simulate Table:</span>
              <select
                value={selectedTableNumber}
                onChange={(e) => setSelectedTableNumber(e.target.value)}
                className="bg-transparent text-xs font-black text-[#E66817] focus:outline-none cursor-pointer"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.tableNumber} className="bg-[#121B28] text-white">
                    Table {t.tableNumber} ({t.zone})
                  </option>
                ))}
              </select>
            </div>

            {/* Viewport Width Selector */}
            <div className="flex items-center bg-[#172334] border border-slate-700 p-1 rounded-xl gap-1">
              {(['375', '390', '412'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setDeviceWidth(w)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    deviceWidth === w ? 'bg-[#E66817] text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Stage: Phone Mockup Container */}
        <div className="flex-1 overflow-y-auto bg-[#070D14] flex items-center justify-center p-3 sm:p-6">
          <div
            style={{ width: `${deviceWidth}px` }}
            className="h-[760px] max-h-[82vh] bg-[#FAF7F2] text-[#0B253A] rounded-[42px] border-[10px] border-slate-900 shadow-2xl flex flex-col overflow-hidden relative"
          >
            {/* Phone Notch / Dynamic Island */}
            <div className="h-6 bg-slate-900 flex items-center justify-center shrink-0">
              <div className="w-20 h-3.5 bg-black rounded-full" />
            </div>

            {/* Phone Screen Body */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF7F2]">
              {/* ============================================================ */}
              {/* VIEW 1: DIGITAL MENU BROWSER                                 */}
              {/* ============================================================ */}
              {viewState === 'MENU' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Customer App Top Header */}
                  <div className="bg-[#0B253A] text-white px-4 pt-3 pb-3 shrink-0 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-[#E66817] flex items-center justify-center font-black text-white text-xs shadow-xs">
                          J
                        </div>
                        <div>
                          <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
                            <span>JAMANVAAR</span>
                            <span className="text-[9px] font-bold bg-[#E66817]/30 text-[#FED7AA] border border-[#E66817]/40 px-1.5 py-0.2 rounded">
                              QR MENU
                            </span>
                          </h1>
                          <p className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                            <span>📍 Table {currentTable.tableNumber}</span>
                            <span>•</span>
                            <span>{currentTable.zone}</span>
                          </p>
                        </div>
                      </div>

                      {/* Cart Pill */}
                      <button
                        onClick={() => setViewState('CART')}
                        className="relative bg-[#E66817] hover:bg-[#EA580C] text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Cart</span>
                        {totalItemCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-white text-[#E66817] text-[10px] font-black flex items-center justify-center">
                            {totalItemCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Table Identified Banner */}
                    <div className="mt-2.5 bg-white/10 border border-white/15 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-200">
                        Ordering for <strong>Table {currentTable.tableNumber}</strong>
                      </span>
                      <span className="text-emerald-300 font-bold flex items-center gap-1 text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Kitchen Live
                      </span>
                    </div>

                    {/* Search Bar */}
                    <div className="mt-2 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search delicacies, tikkas, naan, biryani..."
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-300 focus:outline-none focus:bg-white focus:text-[#0B253A] focus:placeholder:text-slate-400 transition-all"
                      />
                    </div>
                  </div>

                  {/* Category Pills Strip */}
                  <div className="bg-white border-b border-[#EBE6DD] px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
                    <button
                      onClick={() => setActiveCategory('ALL')}
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                        activeCategory === 'ALL'
                          ? 'bg-[#E66817] text-white shadow-xs'
                          : 'bg-[#FAF7F2] text-slate-600 hover:text-[#0B253A]'
                      }`}
                    >
                      🌟 All Specialties
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                          activeCategory === cat.id
                            ? 'bg-[#0B253A] text-white shadow-xs'
                            : 'bg-[#FAF7F2] text-slate-600 hover:text-[#0B253A]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Veg / Non-Veg Quick Filter */}
                  <div className="px-3 py-1.5 bg-[#FAF7F2] border-b border-[#EBE6DD] flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0">
                    <span>{filteredMenuItems.length} dishes available</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDietaryFilter('ALL')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer ${
                          dietaryFilter === 'ALL' ? 'bg-slate-300 text-slate-900 font-black' : 'text-slate-500'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setDietaryFilter('VEG')}
                        className={`px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer ${
                          dietaryFilter === 'VEG' ? 'bg-emerald-100 text-emerald-800 font-black' : 'text-slate-500'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-600" /> Veg
                      </button>
                    </div>
                  </div>

                  {/* Dish Cards List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {filteredMenuItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-[#EBE6DD] rounded-2xl p-3 shadow-2xs flex gap-3 hover:border-[#E66817]/40 transition-all group"
                      >
                        {/* Dish Details */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className={`w-3 h-3 rounded-sm border flex items-center justify-center p-0.5 ${
                                  item.dietaryType === 'NON_VEG'
                                    ? 'border-rose-600 text-rose-600'
                                    : 'border-emerald-600 text-emerald-600'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'
                                  }`}
                                />
                              </span>
                              {item.spiceLevel === 'SPICY' || item.spiceLevel === 'EXTRA_SPICY' ? (
                                <span className="text-[10px] font-black text-rose-600 flex items-center">
                                  🌶️ {item.spiceLevel}
                                </span>
                              ) : null}
                              {item.isPopular && (
                                <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                                  Bestseller
                                </span>
                              )}
                            </div>

                            <h3 className="font-extrabold text-xs text-[#0B253A] leading-snug">{item.name}</h3>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                              {item.description}
                            </p>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-mono font-black text-sm text-[#0B253A]">
                              {formatINR(item.price)}
                            </span>
                            <button
                              onClick={() => handleOpenCustomize(item)}
                              className="bg-[#FFF4ED] hover:bg-[#E66817] text-[#E66817] hover:text-white border border-[#E66817]/30 px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>ADD</span>
                            </button>
                          </div>
                        </div>

                        {/* Dish Image */}
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 relative border border-[#EBE6DD]">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <UtensilsCrossed className="w-6 h-6" />
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 text-[8px] font-black bg-black/60 text-white px-1 py-0.2 rounded backdrop-blur-xs">
                            Customizable
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sticky Footer Bar if cart has items */}
                  {totalItemCount > 0 && (
                    <div className="bg-white border-t border-[#EBE6DD] p-3 shadow-lg flex items-center justify-between shrink-0">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-bold">
                          {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in Table {currentTable.tableNumber} cart
                        </span>
                        <span className="font-mono font-black text-sm text-[#0B253A]">{formatINR(cartTotal)}</span>
                      </div>
                      <button
                        onClick={() => setViewState('CART')}
                        className="bg-[#E66817] hover:bg-[#EA580C] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
                      >
                        <span>View Table Cart</span>
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* VIEW 2: DISH CUSTOMIZATION & MODIFIER PICKER                */}
              {/* ============================================================ */}
              {viewState === 'CUSTOMIZE' && customizingItem && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                  {/* Header */}
                  <div className="bg-[#FAF7F2] border-b border-[#EBE6DD] px-3 py-2.5 flex items-center justify-between shrink-0">
                    <button
                      onClick={() => setViewState('MENU')}
                      className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Menu</span>
                    </button>
                    <span className="text-xs font-black text-[#0B253A]">Customize Dish</span>
                  </div>

                  {/* Scrollable Customizer */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Item Snapshot */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                        {customizingItem.imageUrl && (
                          <img
                            src={customizingItem.imageUrl}
                            alt={customizingItem.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <h2 className="font-extrabold text-xs text-[#0B253A]">{customizingItem.name}</h2>
                        <p className="text-[11px] text-slate-500">{customizingItem.description}</p>
                        <span className="font-mono font-black text-xs text-[#E66817] mt-1 block">
                          Base: {formatINR(customizingItem.price)}
                        </span>
                      </div>
                    </div>

                    {/* Spice Level Option */}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-[#0B253A] flex items-center justify-between">
                        <span>1. Select Spice Level</span>
                        <span className="text-[10px] text-slate-400 font-bold">Required</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Mild', 'Medium', 'Spicy', 'Extra Spicy'].map((spice) => (
                          <button
                            key={spice}
                            onClick={() => setSelectedSpice(spice)}
                            className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                              selectedSpice === spice
                                ? 'bg-amber-50 border-[#E66817] text-[#0B253A] font-black'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>{spice}</span>
                            {selectedSpice === spice && <Check className="w-3.5 h-3.5 text-[#E66817]" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Add-ons Modifiers */}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-[#0B253A] flex items-center justify-between">
                        <span>2. Add Extras / Modifiers</span>
                        <span className="text-[10px] text-slate-400 font-bold">Optional</span>
                      </label>
                      <div className="space-y-1.5">
                        {[
                          { name: 'Extra Cheese', price: 40 },
                          { name: 'Extra Butter', price: 20 },
                          { name: 'Extra Chutney', price: 0 },
                          { name: 'Extra Onion', price: 0 }
                        ].map((addon) => {
                          const isSelected = selectedAddons.includes(addon.name);
                          return (
                            <button
                              key={addon.name}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedAddons((prev) => prev.filter((a) => a !== addon.name));
                                } else {
                                  setSelectedAddons((prev) => [...prev, addon.name]);
                                }
                              }}
                              className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-50 border-[#E66817] text-[#0B253A] font-black'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                                    isSelected ? 'bg-[#E66817] border-[#E66817] text-white' : 'border-slate-300'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <span>{addon.name}</span>
                              </div>
                              <span className="font-mono text-xs font-bold text-slate-500">
                                {addon.price > 0 ? `+${formatINR(addon.price)}` : 'Free'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Special Instructions Note */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-[#0B253A]">
                        3. Chef / Kitchen Notes
                      </label>
                      <textarea
                        value={specialNote}
                        onChange={(e) => setSpecialNote(e.target.value)}
                        placeholder="e.g. No onion, less spicy gravy, extra crispy..."
                        rows={2}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl p-2.5 text-xs text-[#0B253A] placeholder:text-slate-400 focus:outline-none focus:border-[#E66817]"
                      />
                    </div>
                  </div>

                  {/* Quantity & Add Action */}
                  <div className="bg-[#FAF7F2] border-t border-[#EBE6DD] p-3 shrink-0 flex items-center justify-between gap-3">
                    {/* Quantity Picker */}
                    <div className="flex items-center border border-slate-300 rounded-xl bg-white p-1">
                      <button
                        onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono font-black text-xs text-[#0B253A]">
                        {itemQuantity}
                      </span>
                      <button
                        onClick={() => setItemQuantity((q) => q + 1)}
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={handleAddCustomizedToCart}
                      className="flex-1 bg-[#E66817] hover:bg-[#EA580C] text-white py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-between shadow-md shadow-[#E66817]/30 transition-all active:scale-95 cursor-pointer"
                    >
                      <span>Add to Table {currentTable.tableNumber}</span>
                      <span className="font-mono">
                        {formatINR(
                          (customizingItem.price +
                            selectedAddons.reduce((sum, a) => sum + (a === 'Extra Cheese' ? 40 : a === 'Extra Butter' ? 20 : 0), 0)) *
                            itemQuantity
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* VIEW 3: CUSTOMER TABLE CART & DEMO CHECKOUT                 */}
              {/* ============================================================ */}
              {viewState === 'CART' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF7F2]">
                  {/* Cart Header */}
                  <div className="bg-[#0B253A] text-white px-3 py-3 flex items-center justify-between shrink-0 shadow-sm">
                    <button
                      onClick={() => setViewState('MENU')}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-200 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <div className="text-center">
                      <h2 className="text-xs font-black">Table {currentTable.tableNumber} Order Cart</h2>
                      <span className="text-[10px] text-amber-300 font-bold">{currentTable.zone}</span>
                    </div>
                    <button
                      onClick={() => setCartItems([])}
                      className="text-[11px] text-slate-300 hover:text-rose-300 font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {cartItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <ShoppingBag className="w-10 h-10 text-slate-300" />
                        <h3 className="text-xs font-black text-[#0B253A]">Your Table Cart is Empty</h3>
                        <p className="text-[11px] text-slate-500">
                          Scan dishes from the digital menu to order directly to Table {currentTable.tableNumber}.
                        </p>
                        <button
                          onClick={() => setViewState('MENU')}
                          className="px-4 py-2 bg-[#E66817] text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                        >
                          Browse Delicacies
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-3 shadow-2xs divide-y divide-slate-100">
                          {cartItems.map((ci) => (
                            <div key={ci.cartId} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-extrabold text-xs text-[#0B253A]">{ci.menuItem.name}</h4>
                                  {ci.selectedModifiers.length > 0 && (
                                    <p className="text-[10px] text-slate-500">
                                      {ci.selectedModifiers.map((m) => m.optionName).join(', ')}
                                    </p>
                                  )}
                                  {ci.specialInstructions && (
                                    <p className="text-[10px] text-amber-700 italic">
                                      Note: &ldquo;{ci.specialInstructions}&rdquo;
                                    </p>
                                  )}
                                </div>
                                <span className="font-mono font-black text-xs text-[#0B253A]">
                                  {formatINR(ci.totalPrice)}
                                </span>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {formatINR(ci.totalPrice / ci.quantity)} each
                                </span>
                                <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                                  <button
                                    onClick={() => handleUpdateCartQty(ci.cartId, -1)}
                                    className="w-5 h-5 rounded hover:bg-white flex items-center justify-center text-slate-600 cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center font-mono font-bold text-xs">{ci.quantity}</span>
                                  <button
                                    onClick={() => handleUpdateCartQty(ci.cartId, 1)}
                                    className="w-5 h-5 rounded hover:bg-white flex items-center justify-center text-slate-600 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Customer Info (Optional) */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-3 space-y-2 shadow-2xs">
                          <label className="text-[11px] font-black text-[#0B253A]">Guest Name (Optional)</label>
                          <input
                            type="text"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="Guest / Your Name"
                            className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs text-[#0B253A] focus:outline-none focus:border-[#E66817]"
                          />
                        </div>

                        {/* Payment Method Selector */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-3 space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black text-[#0B253A]">Select Demo Payment</label>
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                              DEMO SIMULATION
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { id: 'UPI', label: 'UPI QR', icon: QrCode },
                              { id: 'CASH', label: 'Pay at Counter', icon: DollarSign },
                              { id: 'CARD', label: 'Card / POS', icon: CreditCard }
                            ].map((pm) => {
                              const Icon = pm.icon;
                              const isSelected = paymentMode === pm.id;
                              return (
                                <button
                                  key={pm.id}
                                  onClick={() => setPaymentMode(pm.id as any)}
                                  className={`p-2 rounded-xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-50 border-[#E66817] text-[#0B253A] font-black'
                                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#E66817]' : 'text-slate-400'}`} />
                                  <span className="text-[10px]">{pm.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Bill Breakdown */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-3 space-y-1.5 shadow-2xs text-xs">
                          <div className="flex justify-between text-slate-500">
                            <span>Subtotal</span>
                            <span className="font-mono">{formatINR(cartSubtotal)}</span>
                          </div>
                          <div className="flex justify-between text-slate-500">
                            <span>GST (5% Restaurant Tax)</span>
                            <span className="font-mono">{formatINR(cartTax)}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-100 flex justify-between font-extrabold text-sm text-[#0B253A]">
                            <span>Total Payable</span>
                            <span className="font-mono text-[#E66817]">{formatINR(cartTotal)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Checkout Action Button */}
                  {cartItems.length > 0 && (
                    <div className="bg-white border-t border-[#EBE6DD] p-3 shrink-0 shadow-lg">
                      <button
                        onClick={handlePlaceOrder}
                        className="w-full bg-[#E66817] hover:bg-[#EA580C] text-white py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-[#E66817]/30 transition-all active:scale-98 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Place Table {currentTable.tableNumber} Order • {formatINR(cartTotal)}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* VIEW 4: ORDER CONFIRMATION & TOKEN SCREEN                    */}
              {/* ============================================================ */}
              {viewState === 'CONFIRMATION' && (
                <div className="flex-1 flex flex-col items-center justify-between p-6 bg-white text-center">
                  <div className="space-y-4 my-auto">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm animate-bounce">
                      <Check className="w-8 h-8 stroke-[3]" />
                    </div>

                    <div>
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase">
                        Order Received by POS
                      </span>
                      <h2 className="text-xl font-black text-[#0B253A] mt-2">Order Confirmed!</h2>
                      <p className="text-xs text-slate-500">
                        Thank you! Your delicacies are sent directly to our kitchen.
                      </p>
                    </div>

                    {trackedOrder && (
                      <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-4 space-y-2 text-left shadow-2xs">
                        <div className="flex justify-between items-center pb-2 border-b border-[#EBE6DD]">
                          <span className="text-xs font-bold text-slate-500">Order Number:</span>
                          <span className="font-mono font-black text-sm text-[#0B253A]">
                            #{trackedOrder.orderNumber}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-[#EBE6DD]">
                          <span className="text-xs font-bold text-slate-500">Token Number:</span>
                          <span className="font-mono font-black text-sm bg-[#E66817] text-white px-2 py-0.5 rounded-md">
                            #T-{trackedOrder.tokenNumber}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-[#EBE6DD]">
                          <span className="text-xs font-bold text-slate-500">Table & Zone:</span>
                          <span className="text-xs font-black text-[#0B253A]">
                            Table {trackedOrder.tableNumber} ({currentTable.zone})
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-[#EBE6DD]">
                          <span className="text-xs font-bold text-slate-500">Estimated Prep Time:</span>
                          <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>15–20 minutes</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-xs font-bold text-slate-500">Total Amount:</span>
                          <span className="font-mono font-black text-base text-[#E66817]">
                            {formatINR(trackedOrder.totalAmount)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full space-y-2 pt-4 shrink-0">
                    <button
                      onClick={() => setViewState('TRACKING')}
                      className="w-full bg-[#0B253A] hover:bg-[#123959] text-white py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-[#E66817]" />
                      <span>Track Live Preparation Status</span>
                    </button>
                    <button
                      onClick={() => setViewState('MENU')}
                      className="w-full bg-[#FAF7F2] hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Order More Delicacies
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* VIEW 5: LIVE ORDER STATUS TIMELINE TRACKING                 */}
              {/* ============================================================ */}
              {viewState === 'TRACKING' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF7F2]">
                  {/* Tracking Header */}
                  <div className="bg-[#0B253A] text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
                    <button
                      onClick={() => setViewState('MENU')}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-200 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Menu</span>
                    </button>
                    <div className="text-center">
                      <h2 className="text-xs font-black">Live Order Tracker</h2>
                      <span className="text-[10px] text-amber-300 font-bold">
                        Table {trackedOrder?.tableNumber || currentTable.tableNumber}
                      </span>
                    </div>
                    <span className="w-6" />
                  </div>

                  {/* Tracking Content */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {trackedOrder ? (
                      <>
                        {/* Status Card */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-black text-sm text-[#0B253A]">
                              #{trackedOrder.orderNumber}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                                trackedOrder.orderStatus === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : trackedOrder.orderStatus === 'PREPARING'
                                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                                  : trackedOrder.orderStatus === 'READY'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              ● {trackedOrder.orderStatus}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>Token #{trackedOrder.tokenNumber}</span>
                            <span>•</span>
                            <span>Table {trackedOrder.tableNumber}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-[#0B253A]">
                              {formatINR(trackedOrder.totalAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-4">
                          <h3 className="text-xs font-black text-[#0B253A] uppercase tracking-wider">
                            Preparation Timeline
                          </h3>

                          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                            {[
                              { key: 'NEW', label: 'Order Received', desc: 'Received and verified at POS terminal' },
                              { key: 'ACCEPTED', label: 'Accepted by POS', desc: 'Cashier reviewed and scheduled' },
                              { key: 'PREPARING', label: 'Cooking in Kitchen', desc: 'Chef preparing fresh at Tandoor / Curry stations' },
                              { key: 'READY', label: 'Delicacies Ready', desc: 'Ready for table serving' },
                              { key: 'SERVED', label: 'Served at Table', desc: 'Delivered to your table' },
                              { key: 'COMPLETED', label: 'Completed', desc: 'Billed and settled' }
                            ].map((stage, idx) => {
                              const orderStatusOrder = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
                              const currentIdx = orderStatusOrder.indexOf(trackedOrder.orderStatus);
                              const stageIdx = orderStatusOrder.indexOf(stage.key);
                              const isCompleted = currentIdx >= stageIdx;
                              const isCurrent = currentIdx === stageIdx;

                              return (
                                <div key={stage.key} className="relative group">
                                  <div
                                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                      isCompleted
                                        ? 'bg-[#E66817] border-[#E66817] text-white'
                                        : 'bg-white border-slate-300'
                                    }`}
                                  >
                                    {isCompleted && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                  </div>
                                  <div>
                                    <h4
                                      className={`text-xs font-bold leading-tight ${
                                        isCurrent
                                          ? 'text-[#E66817] font-black'
                                          : isCompleted
                                          ? 'text-[#0B253A]'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {stage.label}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{stage.desc}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Ordered Items Summary */}
                        <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs space-y-2">
                          <h3 className="text-xs font-black text-[#0B253A]">Ordered Items</h3>
                          <div className="divide-y divide-slate-100 text-xs">
                            {trackedOrder.items.map((it) => (
                              <div key={it.id} className="py-1.5 flex justify-between">
                                <span className="text-slate-700">
                                  {it.quantity} × {it.name}
                                </span>
                                <span className="font-mono font-bold text-slate-900">
                                  {formatINR(it.totalPrice)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-6 space-y-2">
                        <p className="text-xs text-slate-500">No active QR order selected for tracking.</p>
                      </div>
                    )}
                  </div>

                  {/* Back to Menu Action */}
                  <div className="bg-white border-t border-[#EBE6DD] p-3 shrink-0">
                    <button
                      onClick={() => setViewState('MENU')}
                      className="w-full bg-[#FAF7F2] hover:bg-slate-200 text-[#0B253A] py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Back to Digital Menu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
