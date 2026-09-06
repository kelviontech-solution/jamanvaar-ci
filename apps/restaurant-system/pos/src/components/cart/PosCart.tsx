import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { OrderType } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import { JAMANVAAR_LOGOS, sound } from '@jamanvaar/ui';
import { PosOrderNotesModal } from './PosOrderNotesModal';
import { PosDiscountModal } from './PosDiscountModal';
import { PosCustomerSearchDrawer } from '../customers/PosCustomerSearchDrawer';
import { PosRepeatOrderModal } from '../orders/PosRepeatOrderModal';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Tag,
  CirclePause,
  Send,
  CreditCard,
  User,
  Utensils,
  Percent,
  ChevronRight,
  MessageSquare,
  Check,
  Flame,
  UserPlus,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Zap
} from 'lucide-react';

export const PosCart: React.FC = () => {
  const {
    cart,
    orderType,
    setOrderType,
    selectedTable,
    selectedCustomer,
    guestCount,
    setGuestCount,
    orderNotes,
    updateItemQuantity,
    removeItemFromCart,
    applyBillDiscountPercent,
    billDiscountPercent,
    clearCart,
    holdCurrentOrder,
    sendKOT,
    setIsPaymentOpen,
    setActiveTab,
    addItemToCart,
    requestManagerOverride,
    currentUser,
    isDiscountModalOpen,
    setIsDiscountModalOpen,
    executeInstantBill,
    isInstantBillProcessing
  } = usePosStore();

  const [discountInputOpen, setDiscountInputOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [repeatModalOpen, setRepeatModalOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [kotSentState, setKotSentState] = useState(false);

  const orderTypes: { id: OrderType; label: string; icon: string }[] = [
    { id: 'DINE_IN', label: 'Dine-In', icon: '🍽️' },
    { id: 'TAKEAWAY', label: 'Takeaway', icon: '🛍️' },
    { id: 'DELIVERY', label: 'Delivery', icon: '🛵' },
    { id: 'TOKEN_QR', label: 'Token', icon: '🎫' }
  ];

  const handleApplyDiscount = (percent: number) => {
    const isManager =
      currentUser?.roleId === 'role-manager' || currentUser?.roleId === 'role-super-admin';
    if (percent > 10 && !isManager) {
      requestManagerOverride(
        'HIGH_DISCOUNT',
        `High Discount Authorization (${percent}%)`,
        `Cashier ${currentUser?.fullName} requested ${percent}% bill discount exceeding standard 10% limit.`,
        () => {
          applyBillDiscountPercent(percent);
          setDiscountInputOpen(false);
        }
      );
    } else {
      applyBillDiscountPercent(percent);
      setDiscountInputOpen(false);
    }
  };

  const handleSendKot = () => {
    const kots = sendKOT();
    if (kots && kots.length > 0) {
      sound.play('kot');
      setKotSentState(true);
      setTimeout(() => setKotSentState(false), 3000);
    } else {
      sound.play('warning');
    }
  };

  const hasItems = cart.items.length > 0;

  // Quick favorite dishes for 1-click cart start (only available items)
  const quickFavorites = db.menuItems.filter((i) => i.isAvailable !== false).slice(0, 4);

  return (
    <div className="w-84 md:w-92 lg:w-96 min-w-[340px] max-w-[420px] bg-white border-l border-[#EBE6DD] flex flex-col h-full select-none shrink-0 shadow-lg z-10">
      {/* Active Order Header */}
      <div className="p-3 border-b border-[#EBE6DD] bg-slate-50/80 shrink-0 space-y-2">
        {/* Order Identifier & Clear Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xs text-[#0B2B39] uppercase tracking-wide">
              New Order — Unsaved
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              • {currentUser?.fullName || 'Cashier'}
            </span>
          </div>

          {hasItems && (
            <div className="relative">
              {!clearConfirmOpen ? (
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="text-[11px] font-bold text-rose-500 hover:text-rose-700 flex items-center gap-0.5 transition-colors cursor-pointer"
                  title="Clear Cart"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg animate-in fade-in">
                  <span className="text-[10px] font-bold text-rose-700">Clear?</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearCart();
                      setClearConfirmOpen(false);
                    }}
                    className="text-[10px] font-black text-rose-700 hover:underline px-1"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearConfirmOpen(false)}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-700 px-1"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order Type Switcher (Comfortable 48px+ touch targets) */}
        <div className="grid grid-cols-4 gap-1.5 bg-[#FAF7F2] border border-[#EBE6DD] p-1.5 rounded-2xl">
          {orderTypes.map((t) => {
            const active = orderType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOrderType(t.id)}
                className={`min-h-[48px] py-1.5 px-1 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
                  active
                    ? 'bg-[#E66817] text-white shadow-sm ring-2 ring-[#E66817]/25'
                    : 'bg-white border border-[#EBE6DD] text-slate-700 hover:text-[#0B253A] hover:border-[#E66817]/40 shadow-2xs'
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span className="text-[10px] truncate font-black tracking-tight uppercase">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dine-In Table Pill (min 46px height) */}
        {orderType === 'DINE_IN' && (
          <div className="flex items-center justify-between bg-white border border-[#EBE6DD] px-3.5 py-2 rounded-2xl text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('TABLES')}
              className="min-h-[36px] flex items-center gap-2 text-[#0B2B39] font-black hover:text-[#E66817] transition-colors truncate cursor-pointer"
            >
              <Utensils className="w-4 h-4 text-[#E66817] shrink-0" />
              <span className="truncate text-xs sm:text-sm">
                {selectedTable ? `Table #${selectedTable.tableNumber}` : 'Select Table'}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {selectedTable && (
              <div className="flex items-center gap-1.5 text-slate-600 shrink-0">
                <span className="text-[11px] font-bold">Guests:</span>
                <select
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-xs text-[#0B2B39] cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Customer Fast Drawer Trigger & Quick Notes Trigger */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setCustomerDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-white border border-[#EBE6DD] hover:border-slate-400 px-2.5 py-1.5 rounded-xl text-xs text-left truncate transition-colors"
          >
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate font-semibold text-slate-700 text-[11px]">
              {selectedCustomer ? selectedCustomer.name : 'Attach Customer'}
            </span>
          </button>

          <button
            onClick={() => setNotesModalOpen(true)}
            className={`flex items-center gap-1.5 border px-2.5 py-1.5 rounded-xl text-xs text-left truncate transition-colors ${
              orderNotes
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-[#EBE6DD] hover:border-slate-400 text-slate-700'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate font-semibold text-[11px]">
              {orderNotes ? orderNotes : 'Chef Notes'}
            </span>
          </button>
        </div>
      </div>

      {/* Cart Items List or Rich Functional Empty State */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#FAF7F2]/40">
        {hasItems ? (
          <>
            {cart.items.map((ci) => (
              <div
                key={ci.cartItemId}
                className="bg-white border border-[#EBE6DD] rounded-2xl p-2.5 shadow-2xs space-y-1.5 hover:border-slate-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* Dietary Dot */}
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          ci.item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                      />
                      <h4 className="font-bold text-xs text-[#0B2B39] leading-tight truncate">
                        {ci.item.name}
                      </h4>
                    </div>

                    {/* Modifiers summary */}
                    {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                      <div className="text-[10px] text-slate-500 pl-3 pt-0.5 space-y-0.2">
                        {ci.selectedModifiers.map((m, idx) => (
                          <div key={idx} className="truncate">
                            + {m.optionName} {m.priceDelta > 0 ? `(+₹${m.priceDelta})` : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    {ci.specialInstructions && (
                      <div className="text-[10px] text-amber-700 pl-3 font-medium truncate">
                        Note: {ci.specialInstructions}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-xs text-[#0B2B39]">₹{ci.itemTotal}</span>
                    <span className="block text-[10px] text-slate-400 font-mono">
                      @ ₹{ci.unitPrice}
                    </span>
                  </div>
                </div>

                {/* Quick Note Preset Chips */}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                  {['Less Spicy', 'No Onion', 'Extra Cheese', 'No Garlic'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const existing = ci.specialInstructions ? `${ci.specialInstructions}, ` : '';
                        usePosStore.getState().updateItemSpecialInstructions(ci.cartItemId, `${existing}${preset}`);
                      }}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-500 text-[9px] font-semibold transition-colors shrink-0"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>

                {/* Quantity Stepper (Comfortable 38x38px touch targets) */}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { sound.play('remove'); removeItemFromCart(ci.cartItemId); }}
                    className="min-h-[38px] text-xs text-slate-400 hover:text-rose-600 font-black px-2.5 py-1.5 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>

                  <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => { sound.play('remove'); updateItemQuantity(ci.cartItemId, -1); }}
                      className="w-9 h-9 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center shadow-2xs active:scale-95 cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <span className="font-mono font-black text-sm text-[#0B2B39] min-w-[28px] text-center">
                      {ci.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => { sound.play('click'); updateItemQuantity(ci.cartItemId, 1); }}
                      className="w-9 h-9 rounded-lg bg-[#E66817] hover:bg-[#EA580C] text-white font-black flex items-center justify-center shadow-2xs active:scale-95 cursor-pointer"
                      title="Increase quantity"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Smart Suggestions: Often Ordered Together */}
            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-2.5 shadow-2xs space-y-1.5 mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#E66817]" />
                <span>Frequently Paired Together</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {db.menuItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { sound.play('add'); addItemToCart(item); }}
                    className="px-2 py-1 rounded-lg bg-[#FAF7F2] hover:bg-[#FFF4ED] border border-[#EBE6DD] hover:border-[#FDBA74] text-[11px] font-bold text-[#0B2B39] flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-[#E66817]" />
                    <span>{item.name}</span>
                    <span className="text-slate-400 font-mono text-[10px]">₹{item.price}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Clean Minimal Empty Cart State */
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-center shadow-xs p-2.5">
              <img
                src={JAMANVAAR_LOGOS.mark}
                alt="JAMANVAAR"
                className="w-full h-full object-contain drop-shadow-xs"
              />
            </div>
            <div>
              <h4 className="font-black text-sm text-[#0B2B39]">Billing Counter Ready</h4>
              <p className="text-xs text-slate-400 max-w-[200px] mx-auto mt-1 leading-relaxed">
                Tap any dish from the menu to add it to this order.
              </p>
            </div>

            {/* ↻ Repeat Last Order Fast Action */}
            {db.orders.length > 0 && (
              <button
                type="button"
                onClick={() => setRepeatModalOpen(true)}
                className="w-full py-2.5 px-3 bg-[#FFFDFB] hover:bg-[#FFF4ED] border border-[#EBE6DD] hover:border-[#FDBA74] text-[#0B2B39] hover:text-[#E66817] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs mt-2 cursor-pointer active:scale-98"
                title="Repeat previous order"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#E66817]" />
                <span>↻ Repeat Last Order</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Financials & Settle Panel */}
      <div className="p-3.5 bg-white border-t border-[#EBE6DD] shrink-0 space-y-2">
        {/* Quick Discounts & Hold Order Button */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsDiscountModalOpen(true)}
            disabled={!hasItems}
            className={`px-3 py-2 rounded-2xl border text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              cart.discountAmount > 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
                : hasItems
                ? 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-700 hover:border-[#E66817]/40 hover:text-[#0B253A]'
                : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-400 cursor-not-allowed opacity-75'
            }`}
          >
            <Tag className={`w-3.5 h-3.5 ${cart.discountAmount > 0 ? 'text-emerald-600' : 'text-[#E66817]'}`} />
            <span>
              {cart.discountAmount > 0
                ? `${billDiscountPercent > 0 ? `${billDiscountPercent}% Off` : `-₹${cart.discountAmount}`}`
                : 'Discount'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => holdCurrentOrder()}
            disabled={!hasItems}
            className={`px-3 py-2 rounded-2xl border text-xs font-black flex items-center gap-1.5 transition-all ${
              hasItems
                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs'
                : 'bg-[#FAF7F2] border-[#EBE6DD] text-slate-400 cursor-not-allowed opacity-75'
            }`}
            title="Save this order for later"
          >
            <CirclePause className={`w-3.5 h-3.5 ${hasItems ? 'text-amber-600' : 'text-slate-300'}`} />
            <span>Hold Order</span>
          </button>
        </div>

        {/* Authoritative Tax Calculation Summary */}
        <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200/80 pt-2 font-medium">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono font-bold text-[#0B2B39]">₹{cart.subtotal}</span>
          </div>

          {cart.discountAmount > 0 && (
            <div className="flex justify-between items-center text-emerald-600 font-bold bg-emerald-50/70 px-2 py-1 rounded-xl border border-emerald-200/60">
              <div className="flex items-center gap-1">
                <span>Discount ({cart.discountReason || (billDiscountPercent > 0 ? `${billDiscountPercent}%` : `Flat`)})</span>
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="text-emerald-800 hover:text-emerald-950 font-bold ml-1 text-[11px] underline cursor-pointer"
                  title="Edit discount"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono">-₹{cart.discountAmount}</span>
                <button
                  type="button"
                  onClick={() => usePosStore.getState().removeDiscount()}
                  className="w-4 h-4 rounded-full bg-emerald-200/80 hover:bg-rose-100 hover:text-rose-700 text-emerald-800 flex items-center justify-center text-[10px] ml-1 transition-colors cursor-pointer"
                  title="Remove discount"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between text-[11px] text-slate-500">
            <span>GST (CGST 2.5% + SGST 2.5%)</span>
            <span className="font-mono">₹{cart.taxAmount}</span>
          </div>

          {cart.roundOffAmount !== 0 && (
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Round Off</span>
              <span className="font-mono">
                {cart.roundOffAmount > 0 ? `+₹${cart.roundOffAmount}` : `-₹${Math.abs(cart.roundOffAmount)}`}
              </span>
            </div>
          )}

          <div className="flex justify-between items-baseline pt-1 border-t border-slate-200 font-extrabold text-base text-[#0B2B39]">
            <span>Total Payable</span>
            <span className="text-xl text-[#0B2B39] font-mono">₹{cart.totalPayable}</span>
          </div>
        </div>

        {/* KOT Status Badge / Toast */}
        {kotSentState && (
          <div className="p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl font-bold text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>KOT Sent to Kitchen Stations!</span>
          </div>
        )}

        {/* Dual Primary Actions: SEND KOT and Prominent PAY Button with Amount (52px+ height) */}
        <div className="grid grid-cols-2 gap-2 pt-1.5">
          {/* 1. SEND KOT (Kitchen Theme: Navy / Flame) */}
          <button
            type="button"
            onClick={handleSendKot}
            disabled={!hasItems}
            className={`min-h-[52px] px-3 py-2.5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              hasItems
                ? 'bg-[#0B253A] hover:bg-[#133A58] text-white border-2 border-[#0B253A] shadow-md shadow-[#0B253A]/20 active:scale-[0.98] cursor-pointer'
                : 'bg-slate-100/90 border border-slate-300/80 text-slate-500 cursor-not-allowed opacity-80'
            }`}
          >
            <Flame className={`w-5 h-5 shrink-0 ${hasItems ? 'text-[#E66817] fill-[#E66817]' : 'text-slate-400 fill-slate-300'}`} />
            <span className="truncate">{kotSentState ? '✓ KOT SENT' : 'SEND KOT'}</span>
          </button>

          {/* 2. PAY BILL (Payment Theme: Emerald Green / Tender Checkout) */}
          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            disabled={!hasItems}
            className={`min-h-[52px] px-3 py-2.5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              hasItems
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-500 shadow-lg shadow-emerald-600/25 active:scale-[0.98] cursor-pointer'
                : 'bg-emerald-50/70 border border-emerald-200 text-emerald-800/60 cursor-not-allowed opacity-80'
            }`}
          >
            <CreditCard className={`w-5 h-5 shrink-0 ${hasItems ? 'text-white' : 'text-emerald-600/50'}`} />
            <span className="truncate">PAY ₹{cart.totalPayable}</span>
          </button>
        </div>

        {/* 3. ⚡ INSTANT BILL (Counter Fast-Checkout Theme: Electric Orange / Amber Lightning) */}
        {(db.restaurant?.instantBillConfig?.enabled !== false) && (
          <button
            type="button"
            onClick={() => executeInstantBill()}
            disabled={!hasItems || isInstantBillProcessing}
            className={`w-full min-h-[54px] px-3.5 sm:px-4 py-2.5 rounded-2xl flex items-center justify-between transition-all select-none border-2 ${
              hasItems && !isInstantBillProcessing
                ? 'bg-gradient-to-r from-[#E66817] via-[#EA580C] to-[#F59E0B] hover:brightness-105 text-white border-amber-400/50 shadow-lg shadow-[#E66817]/25 active:scale-[0.98] cursor-pointer'
                : 'bg-amber-50/80 border-amber-200/90 text-amber-900/60 cursor-not-allowed opacity-85'
            }`}
          >
            <div className="flex items-center gap-2.5 text-left">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                hasItems ? 'bg-white/20 text-white shadow-xs' : 'bg-amber-100 text-amber-600'
              }`}>
                <Zap className={`w-4.5 h-4.5 ${hasItems ? 'fill-white text-white' : 'fill-amber-500 text-amber-500'}`} />
              </div>
              <div>
                <div className="font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <span className={hasItems ? 'text-white font-black' : 'text-amber-950/70 font-black'}>
                    {isInstantBillProcessing ? 'Processing Bill...' : '⚡ Instant Bill'}
                  </span>
                  {hasItems && (
                    <span className="font-mono text-[11px] bg-black/25 px-1.5 py-0.5 rounded-md font-black text-white">
                      ₹{cart.totalPayable}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-bold block ${hasItems ? 'text-amber-100' : 'text-amber-800/60'}`}>
                  {db.restaurant?.instantBillConfig?.paymentMethod === 'UPI_QR'
                    ? 'UPI / QR'
                    : db.restaurant?.instantBillConfig?.paymentMethod === 'CARD'
                    ? 'Card'
                    : 'Cash'} • {db.restaurant?.instantBillConfig?.autoPrint !== false ? 'Auto Print' : 'Manual Print'}
                </span>
              </div>
            </div>
            <ArrowRight className={`w-4.5 h-4.5 shrink-0 ${hasItems ? 'text-white opacity-90' : 'text-amber-400'}`} />
          </button>
        )}
      </div>

      {/* Modals & Drawers — PosHoldModal now mounts globally in App.tsx so its
          F8 shortcut works from every tab, not just this one. */}
      <PosDiscountModal isOpen={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)} />
      <PosOrderNotesModal isOpen={notesModalOpen} onClose={() => setNotesModalOpen(false)} />
      <PosCustomerSearchDrawer
        isOpen={customerDrawerOpen}
        onClose={() => setCustomerDrawerOpen(false)}
      />
      <PosRepeatOrderModal
        isOpen={repeatModalOpen}
        onClose={() => setRepeatModalOpen(false)}
      />
    </div>
  );
};
