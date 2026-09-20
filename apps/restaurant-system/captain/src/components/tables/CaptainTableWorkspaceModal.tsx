import React, { useState, useMemo } from 'react';
import { useEscapeToClose } from '../useEscapeToClose';
import { useCaptainStore, CartItemEntry } from '../../store/captainStore';
import { DiningTable, MenuItem, SelectedModifier } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import { priceOrderLines } from '@jamanvaar/business';
import { captainDb } from '@jamanvaar/database';
import { EmptyState } from '@jamanvaar/ui';
import { CaptainModifierModal } from '../modals/CaptainModifierModal';
import {
  X,
  Plus,
  Minus,
  Trash2,
  Receipt,
  MessageSquare,
  Users,
  Flame,
  CheckCircle2,
  ChefHat,
  Search,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  ArrowRight,
  UtensilsCrossed,
  Tag
} from 'lucide-react';

interface CaptainTableWorkspaceModalProps {
  table: DiningTable | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenTransferMerge: () => void;
  onOpenSendMessage: (tableNumber: string) => void;
}

export const CaptainTableWorkspaceModal: React.FC<CaptainTableWorkspaceModalProps> = ({
  table,
  isOpen,
  onClose,
  onOpenTransferMerge,
  onOpenSendMessage
}) => {
  useEscapeToClose(isOpen, onClose);
  const {
    currentCaptain,
    categories,
    menuItems,
    cartItems,
    addItemToCart,
    updateCartQuantity,
    removeCartItem,
    clearCart,
    sendKOT,
    requestBill,
    repeatPreviousOrder,
    serveReadyForTable
  } = useCaptainStore();

  // A freshly-opened table with nothing ordered yet should land straight on
  // the menu, not an empty "Order" tab the captain has to tap through —
  // that extra step was pure friction on top of the mandatory guest-count
  // modal already gating this screen.
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'ORDER' | 'MENU'>(() =>
    cartItems.length === 0 ? 'MENU' : 'ORDER'
  );
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'JAIN' | 'NON_VEG'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [kotSuccessAlert, setKotSuccessAlert] = useState(false);
  const [repeatOrderError, setRepeatOrderError] = useState('');

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) return false;
      if (dietaryFilter === 'VEG' && item.dietaryType !== 'VEG') return false;
      if (dietaryFilter === 'NON_VEG' && item.dietaryType !== 'NON_VEG') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [menuItems, selectedCategory, dietaryFilter, searchQuery]);

  const unFiredCartItems = cartItems.filter((ci) => !ci.isFired);
  const firedCartItems = cartItems.filter((ci) => ci.isFired);

  // The same pricing rules as the order itself and POS (CGST + SGST, round-off).
  const priced = priceOrderLines(cartItems.map((ci) => ({ unitPrice: ci.unitPrice, quantity: ci.quantity })));
  const subtotal = priced.subtotal;
  const gst = priced.taxAmount;
  const roundOff = priced.roundOffAmount;
  const total = priced.totalAmount;

  // What the kitchen is doing with each dish right now, read from the running order.
  const liveOrder = table?.currentOrderId ? captainDb.orders.find((o) => o.id === table.currentOrderId) : undefined;
  const kitchenStateOf = (menuItemId: string): 'READY' | 'SERVED' | 'COOKING' => {
    const lines = liveOrder?.items.filter((oi) => oi.menuItemId === menuItemId) ?? [];
    if (lines.length > 0 && lines.every((l) => l.kitchenStatus === 'SERVED')) return 'SERVED';
    if (lines.length > 0 && lines.every((l) => l.kitchenStatus === 'READY' || l.kitchenStatus === 'SERVED')) return 'READY';
    return 'COOKING';
  };

  // Handle Send KOT action
  const handleFireKot = () => {
    const kots = sendKOT();
    if (kots) {
      setKotSuccessAlert(true);
      setTimeout(() => setKotSuccessAlert(false), 3000);
      setActiveWorkspaceTab('ORDER');
    }
  };

  if (!isOpen || !table) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-5xl h-[92vh] bg-white rounded-3xl shadow-2xl border border-jaman-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ── 1. Workspace Top Header ── */}
        <div className="bg-jaman-navy text-white p-3 sm:p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-jaman-saffron text-white flex items-center justify-center font-black text-lg shadow-sm">
              {table.tableNumber}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black">TABLE {table.tableNumber}</h2>
                <span className="bg-white/10 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {table.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {(table as any).section || table.zone || 'Main Dining'} • {table.currentGuests || 2} Guests • Captain {currentCaptain?.name}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenSendMessage(table.tableNumber)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Send note to kitchen or manager for this table"
            >
              <MessageSquare className="w-3.5 h-3.5 text-jaman-saffron" />
              <span className="hidden sm:inline">Kitchen Note</span>
            </button>

            <button
              type="button"
              onClick={() => requestBill(table.tableNumber)}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title="Request final bill from POS Cashier"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Request Bill</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 2. Order Status Progress Stepper ── */}
        <div className="bg-jaman-cream border-b border-jaman-border px-4 py-2 overflow-x-auto scrollbar-none shrink-0">
          <div className="flex items-center justify-between min-w-[500px] text-[11px] font-bold text-slate-500">
            <span className={`flex items-center gap-1 ${cartItems.length > 0 ? 'text-emerald-700 font-black' : ''}`}>
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px]">1</span>
              Order Taken
            </span>
            <span className="text-slate-300">➔</span>
            <span className={`flex items-center gap-1 ${firedCartItems.length > 0 ? 'text-emerald-700 font-black' : ''}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${firedCartItems.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>2</span>
              KOT Sent
            </span>
            <span className="text-slate-300">➔</span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px]">3</span>
              Cooking
            </span>
            <span className="text-slate-300">➔</span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px]">4</span>
              Food Ready
            </span>
            <span className="text-slate-300">➔</span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px]">5</span>
              Served
            </span>
            <span className="text-slate-300">➔</span>
            <span className={`flex items-center gap-1 ${table.status === 'BILL_REQUESTED' ? 'text-purple-700 font-black' : ''}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${table.status === 'BILL_REQUESTED' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>6</span>
              Bill Requested
            </span>
          </div>
        </div>

        {/* ── 3. Workspace Mode Switcher ── */}
        <div className="px-4 py-2 border-b border-jaman-border bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('ORDER')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeWorkspaceTab === 'ORDER'
                  ? 'bg-jaman-navy text-white shadow-xs'
                  : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'
              }`}
            >
              Current Order & Bill ({cartItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('MENU')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                activeWorkspaceTab === 'MENU'
                  ? 'bg-jaman-saffron text-white shadow-xs'
                  : 'bg-[#FFF4ED] text-jaman-saffron hover:bg-[#FFE8D6]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Take Order / Menu Catalog</span>
            </button>
          </div>

          {unFiredCartItems.length > 0 && activeWorkspaceTab === 'MENU' && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg animate-pulse">
              ⚡ {unFiredCartItems.length} new items ready to fire
            </span>
          )}
        </div>

        {/* ── 4. Main Body: Split or Switch Views ── */}
        <div className="flex-1 flex overflow-hidden">
          {activeWorkspaceTab === 'ORDER' ? (
            /* ── VIEW A: Current Order & Bill Details ── */
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Left Column: Fired & Pending Items List */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
                {kotSuccessAlert && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>KOT Fired to Kitchen Stations successfully! KDS updated in real-time.</span>
                  </div>
                )}

                {/* Items List */}
                {cartItems.length > 0 ? (
                  <div className="space-y-2.5">
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                          item.isFired ? 'bg-white border-jaman-border' : 'bg-[#FFFBF7] border-[#FDBA74]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center font-black text-xs font-mono text-jaman-navy mt-0.5">
                            {item.quantity}×
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-xs sm:text-sm text-jaman-navy">
                                {item.menuItem.name}
                              </span>
                              {item.isFired ? (
                                (() => {
                                  const state = kitchenStateOf(item.menuItem.id);
                                  return state === 'SERVED' ? (
                                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">✓ Served</span>
                                  ) : state === 'READY' ? (
                                    <>
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-1.5 py-0.2 rounded">🔔 Ready to serve</span>
                                      {table && (
                                        <button
                                          type="button"
                                          onClick={() => serveReadyForTable(table.tableNumber)}
                                          className="text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded cursor-pointer"
                                          title="Mark the ready dishes on this table as delivered"
                                        >
                                          Mark served
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">🔥 In Kitchen</span>
                                  );
                                })()
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded animate-pulse">
                                  ⚡ Pending Fire
                                </span>
                              )}
                            </div>

                            {/* Modifiers & Notes */}
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                              </p>
                            )}
                            {item.specialNotes && (
                              <p className="text-[11px] text-amber-700 italic mt-0.5">
                                Note: {item.specialNotes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-black font-mono text-sm text-jaman-navy">
                            {formatINR(item.totalPrice)}
                          </span>

                          {!item.isFired && (
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <EmptyState
                      icon={<UtensilsCrossed className="w-8 h-8" />}
                      description={`No dishes added to Table ${table.tableNumber} yet.`}
                      actionText="+ Open Menu & Add Dishes"
                      onAction={() => setActiveWorkspaceTab('MENU')}
                    />
                    <div className="flex justify-center -mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const repeated = repeatPreviousOrder(table.tableNumber);
                          if (!repeated) {
                            setRepeatOrderError('No previous completed order found for this table.');
                            setTimeout(() => setRepeatOrderError(''), 3000);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-jaman-navy border border-jaman-border font-black text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Repeat Previous Order</span>
                      </button>
                    </div>
                    {repeatOrderError && (
                      <p className="text-[11px] font-bold text-rose-600 text-center">{repeatOrderError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Bill Breakdown & Primary Dispatch Controls */}
              <div className="w-full md:w-80 bg-jaman-cream border-t md:border-t-0 md:border-l border-jaman-border p-4 sm:p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    Table Financial Summary
                  </h3>

                  <div className="space-y-2 text-xs font-semibold text-slate-600 bg-white p-3.5 rounded-2xl border border-jaman-border">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono text-jaman-navy">{formatINR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (CGST 2.5% + SGST 2.5%)</span>
                      <span className="font-mono text-jaman-navy">{formatINR(gst)}</span>
                    </div>
                    {roundOff !== 0 && (
                      <div className="flex justify-between">
                        <span>Round Off</span>
                        <span className="font-mono text-jaman-navy">{roundOff > 0 ? '+' : ''}{formatINR(roundOff)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-black text-jaman-navy">
                      <span>Total Payable</span>
                      <span className="font-mono text-base text-jaman-navy">{formatINR(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Dispatch / Fire KOT Button if unFired items exist */}
                <div className="space-y-2">
                  {unFiredCartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleFireKot}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-jaman-saffron to-[#EA580C] hover:brightness-105 text-white font-black text-xs sm:text-sm shadow-md shadow-jaman-saffron/25 active:scale-98 transition-all cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 fill-white" />
                        <span>SEND KOT ({unFiredCartItems.length} New)</span>
                      </div>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveWorkspaceTab('MENU')}
                    className="w-full py-3 px-4 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] text-white font-black text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add More Dishes to Order</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => requestBill(table.tableNumber)}
                    className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Send Bill Request to Counter POS</span>
                  </button>

                  {/* Only offered while nothing has been fired to the kitchen
                      yet — clearCart() wipes the whole cart, so it would be
                      unsafe to expose once items are already cooking. */}
                  {firedCartItems.length === 0 && unFiredCartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Discard this unfired order and start over? Nothing has been sent to the kitchen yet.')) {
                          clearCart();
                        }
                      }}
                      className="w-full py-2 px-4 rounded-2xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard Order</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── VIEW B: Fast Touch Menu Ordering Catalog ── */
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Menu Categories & Dish Cards */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search & Dietary Filters */}
                <div className="p-3 bg-white border-b border-jaman-border flex items-center justify-between gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search dish or SKU..."
                      className="w-full pl-8 pr-3 py-1.5 bg-jaman-cream border border-jaman-border rounded-xl text-xs text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    {(['ALL', 'VEG', 'NON_VEG'] as const).map((diet) => (
                      <button
                        key={diet}
                        type="button"
                        onClick={() => setDietaryFilter(diet)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                          dietaryFilter === diet
                            ? 'bg-jaman-navy text-white'
                            : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {diet === 'ALL' ? 'All' : diet === 'VEG' ? '🟢 Veg' : '🔴 Non-Veg'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Pills */}
                <div className="px-3 py-2 bg-jaman-cream border-b border-jaman-border flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${
                      selectedCategory === 'ALL'
                        ? 'bg-jaman-saffron text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-jaman-border'
                    }`}
                  >
                    All Dishes ({menuItems.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                        selectedCategory === cat.id
                          ? 'bg-jaman-saffron text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-jaman-border'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Dish Cards Grid */}
                <div className="flex-1 p-3 sm:p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredMenuItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setCustomizingItem(item)}
                      className="bg-white border border-jaman-border hover:border-jaman-saffron rounded-2xl p-3 flex flex-col justify-between space-y-2 shadow-2xs hover:shadow-md transition-all active:scale-98 cursor-pointer"
                    >
                      {/* Image preview */}
                      <div className="w-full h-24 rounded-xl bg-slate-100 overflow-hidden relative">
                        <img
                          src={item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
                          }}
                        />
                        <span className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full ${item.dietaryType === 'VEG' ? 'bg-emerald-500 ring-2 ring-white' : 'bg-rose-500 ring-2 ring-white'}`} />
                      </div>

                      <div>
                        <h4 className="font-extrabold text-xs text-jaman-navy line-clamp-2 leading-tight">
                          {item.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                          {item.kitchenStation || 'Kitchen'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="font-black font-mono text-xs text-jaman-navy">
                          {formatINR(item.price)}
                        </span>
                        {/* Direct-add with default options (no spice change,
                            no Jain, no extras) — the same result a captain
                            gets by opening Customize and tapping "Add to
                            Order" without changing anything, so every dish
                            no longer forces the modal open just to accept
                            the defaults. Tapping the rest of the card still
                            opens Customize for a real modifier change. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addItemToCart(item, [], '', 'COURSE_1', 1);
                          }}
                          className="w-7 h-7 rounded-lg bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center font-black text-xs hover:bg-jaman-saffron hover:text-white transition-colors cursor-pointer active:scale-90"
                          title="Quick Add"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Order Cart Column */}
              <div className="w-full md:w-72 bg-jaman-cream border-t md:border-t-0 md:border-l border-jaman-border p-4 flex flex-col justify-between space-y-3 shrink-0">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Live Cart ({cartItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveWorkspaceTab('ORDER')}
                      className="text-xs font-bold text-jaman-saffron hover:underline"
                    >
                      View Full Order
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {cartItems.map((ci) => (
                      <div key={ci.id} className="p-2.5 rounded-xl bg-white border border-jaman-border flex items-center justify-between text-xs">
                        <div className="truncate mr-2">
                          <span className="font-bold text-jaman-navy truncate block">{ci.menuItem.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">{formatINR(ci.unitPrice)} × {ci.quantity}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(ci.id, -1)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-jaman-navy font-bold flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="font-bold font-mono text-xs w-4 text-center">{ci.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(ci.id, 1)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-jaman-navy font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-jaman-border space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span>Total:</span>
                    <span className="font-mono text-sm font-black text-jaman-navy">{formatINR(total)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleFireKot}
                    disabled={unFiredCartItems.length === 0}
                    className="w-full py-3 px-3 rounded-xl bg-jaman-saffron hover:bg-[#EA580C] disabled:opacity-50 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Flame className="w-4 h-4 fill-white" />
                    <span>FIRE KOT ({unFiredCartItems.length})</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modifier / Customizer Modal */}
      <CaptainModifierModal
        item={customizingItem}
        isOpen={!!customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={(it, mods, nts, crs, qty) => {
          addItemToCart(it, mods, nts, crs, qty);
          setCustomizingItem(null);
        }}
      />
    </div>
  );
};
