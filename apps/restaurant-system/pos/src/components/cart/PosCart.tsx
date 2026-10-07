import { CachedImg } from '@jamanvaar/ui';
import React, { useState, useRef } from 'react';
import { usePosStore } from '../../store/posStore';
import { OrderType } from '@jamanvaar/types';
import { db, InventoryRepository, CustomerRepository } from '@jamanvaar/database';
import { JAMANVAAR_LOGOS, sound } from '@jamanvaar/ui';
import { PosOrderNotesModal } from './PosOrderNotesModal';
import { PosCustomerSearchDrawer } from '../customers/PosCustomerSearchDrawer';
import { PosRepeatOrderModal } from '../orders/PosRepeatOrderModal';

// B2-020: offered 1-12 guests regardless of the table's own seating capacity (BUG-109 was fixed
// for Captain's own guest-count picker only, via this identical helper — captainStore.ts's
// `guestCountOptions`). A 4-seat table showing "12 guests" as a selectable option is the same bug.
function guestCountOptions(capacity: number): number[] {
  const max = Math.max(1, Math.min(Math.floor(capacity) || 1, 12));
  return Array.from({ length: max }, (_, i) => i + 1);
}
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
  Zap,
  Bike,
  Ticket,
  ShoppingBag as TakeawayBag, Gift, X } from 'lucide-react';

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
    applyDiscount,
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

  // Which cart items show their "Less Spicy / No Onion / …" note chips. Collapsed by default so a
  // full cart isn't wall-to-wall buttons — expand only the item you're actually noting.
  const [notesExpandedFor, setNotesExpandedFor] = useState<Set<string>>(new Set());
  const toggleNotesFor = (id: string) =>
    setNotesExpandedFor((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [discountInputOpen, setDiscountInputOpen] = useState(false);
  const [redeemConfirming, setRedeemConfirming] = useState(false);
  const [redeemNeedsManager, setRedeemNeedsManager] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [repeatModalOpen, setRepeatModalOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [kotSentState, setKotSentState] = useState(false);
  const [isSendingKot, setIsSendingKot] = useState(false);
  // Ref, not just state: a rapid double-click can fire the second event
  // before React commits the `disabled` attribute from setState, so the
  // guard that actually blocks re-entry has to be a synchronous flag.
  const sendingKotRef = useRef(false);

  // Redeems the attached customer's own earned points as a flat bill discount — the thing the CRM
  // screen's "Redeemable Value" has promised all along with no way to actually do it at the till.
  // Goes through the normal applyDiscount gate (SEC-013), same as any other bill discount: a balance
  // small enough to apply outright (the overwhelming common case) redeems immediately; one large
  // enough to need a manager's approval is left for a manager, rather than deducting the customer's
  // points before knowing the discount actually landed.
  const handleRedeemPoints = () => {
    if (!selectedCustomer || selectedCustomer.loyaltyPoints <= 0 || cart.items.length === 0) return;
    const points = Math.min(selectedCustomer.loyaltyPoints, Math.floor(cart.subtotal));
    if (points <= 0) return;
    applyDiscount({ scope: 'BILL', type: 'FIXED', value: points, reason: 'Loyalty points redeemed' });
    const applied = usePosStore.getState().cart;
    if (applied.discountType === 'FIXED' && applied.discountValue === points) {
      CustomerRepository.redeemPoints(selectedCustomer.phone, points);
      setRedeemConfirming(false);
      setRedeemNeedsManager(false);
    } else {
      // applyDiscount routed this to manager approval instead of applying it — nothing changed yet,
      // so nothing is deducted. The cashier is told plainly rather than left wondering why it didn't work.
      setRedeemNeedsManager(true);
    }
  };

  const orderTypes: { id: OrderType; label: string; icon: React.ElementType }[] = [
    { id: 'DINE_IN', label: 'Dine-In', icon: Utensils },
    { id: 'TAKEAWAY', label: 'Takeaway', icon: TakeawayBag },
    { id: 'DELIVERY', label: 'Delivery', icon: Bike },
    { id: 'TOKEN_QR', label: 'Token', icon: Ticket }
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
    if (sendingKotRef.current) return;
    sendingKotRef.current = true;
    setIsSendingKot(true);
    try {
      const kots = sendKOT();
      if (kots && kots.length > 0) {
        sound.play('kot');
        setKotSentState(true);
        setTimeout(() => setKotSentState(false), 3000);
      } else {
        sound.play('warning');
      }
    } finally {
      // sendKOT updates sent quantities synchronously. That identity is the duplicate guard; a new cart need not wait on a timer.
      sendingKotRef.current = false;
      setIsSendingKot(false);
    }
  };

  const hasItems = cart.items.length > 0;
  // Running-order state: only items not yet sent to the kitchen can be sent.
  // BUG-045: nothing warned when an ingredient was out, so the POS happily sold dishes the
  // kitchen could not make. Soft warning only - the cashier decides.
  const stockShortages = InventoryRepository.getShortages(cart.items.map((ci) => ({ menuItemId: ci.menuItemId, quantity: ci.quantity })));
  const unsentCount = cart.items.reduce((n, ci) => n + Math.max(0, ci.quantity - (ci.kotSentQty || 0)), 0);
  const hasSentItems = cart.items.some((ci) => (ci.kotSentQty || 0) > 0);
  const canSendKot = hasItems && unsentCount > 0 && !isSendingKot;
  const kotLabel = kotSentState && unsentCount === 0
    ? 'KOT SENT'
    : hasSentItems && unsentCount === 0
      ? 'SENT TO KITCHEN'
      : hasSentItems
        ? `SEND KOT (${unsentCount} NEW)`
        : 'SEND KOT';

  // Quick favorite dishes for 1-click cart start (only available items)
  const quickFavorites = db.menuItems.filter((i) => i.isAvailable !== false).slice(0, 4);

  return (
    <div className="w-96 md:w-[26rem] lg:w-[28rem] min-w-[380px] max-w-[460px] bg-white border border-jaman-border rounded-2xl flex flex-col h-full min-h-0 select-none shrink-0 shadow-xs z-10 overflow-hidden">
      {/* Active Order Header */}
      <div className="px-3 pt-2 pb-2 border-b border-jaman-border bg-white shrink-0 space-y-1.5">
        {/* Order Identifier & Clear Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[13px] text-jaman-deepNavy uppercase tracking-wide">
              New Order — Unsaved
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              • {currentUser?.fullName || 'Cashier'}
            </span>
          </div>

        </div>

        {/* Order Type Switcher: one compact row */}
        <div className="grid grid-cols-4 gap-1.5">
          {orderTypes.map((t) => {
            const active = orderType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOrderType(t.id)}
                className={`h-9 px-1 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                  active
                    ? 'bg-jaman-saffron text-white shadow-sm shadow-jaman-saffron/25'
                    : 'bg-jaman-cream border border-jaman-border text-slate-700 hover:text-jaman-navy hover:border-jaman-saffron/40'
                }`}
              >
                <t.icon className="w-4 h-4 shrink-0" />
                <span className="text-[11px] truncate font-bold tracking-tight uppercase">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Table + Customer + Chef Notes: a single row */}
        <div className={`grid gap-1.5 ${orderType === 'DINE_IN' ? 'grid-cols-[1.15fr_1fr_1fr]' : 'grid-cols-2'}`}>
          {orderType === 'DINE_IN' && (
            <div className="flex items-center justify-between gap-1 bg-white border border-jaman-border pl-2.5 pr-1.5 h-9 rounded-xl text-xs min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('TABLES')}
                className="flex items-center gap-1.5 text-jaman-deepNavy font-bold hover:text-jaman-saffron transition-colors truncate cursor-pointer min-w-0 flex-1 h-full"
              >
                <Utensils className="w-3.5 h-3.5 text-jaman-saffron shrink-0" />
                <span className="truncate text-xs">
                  {selectedTable ? `Table #${selectedTable.tableNumber}` : 'Select Table'}
                </span>
                {!selectedTable && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>

              {selectedTable && (
                <select
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  title="Guests"
                  aria-label="Guests"
                  className="bg-slate-100 border border-slate-200 rounded-md px-1 h-6 font-bold text-xs text-jaman-deepNavy cursor-pointer shrink-0"
                >
                  {guestCountOptions(selectedTable.capacity).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <button
            onClick={() => setCustomerDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-white border border-jaman-border hover:border-slate-400 px-2.5 h-9 rounded-xl text-xs text-left truncate transition-colors cursor-pointer min-w-0"
          >
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate font-semibold text-slate-700 text-xs">
              {selectedCustomer ? selectedCustomer.name : 'Attach Customer'}
            </span>
          </button>

          {selectedCustomer && selectedCustomer.loyaltyPoints > 0 && (
            cart.discountType && cart.discountType !== 'NONE' ? (
              <span
                className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 h-9 rounded-xl text-xs text-slate-400 shrink-0"
                title="Remove the current discount to redeem points instead"
              >
                <Gift className="w-3.5 h-3.5 shrink-0" />
                {selectedCustomer.loyaltyPoints} pts
              </span>
            ) : redeemConfirming ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleRedeemPoints}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 h-9 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Redeem ₹{Math.min(selectedCustomer.loyaltyPoints, Math.floor(cart.subtotal))}
                </button>
                <button
                  onClick={() => { setRedeemConfirming(false); setRedeemNeedsManager(false); }}
                  className="flex items-center justify-center bg-white border border-jaman-border h-9 w-9 rounded-xl text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                  aria-label="Cancel redeeming points"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRedeemConfirming(true)}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 hover:border-emerald-500 text-emerald-700 px-2.5 h-9 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                title="Use this guest's own earned loyalty points as a bill discount"
              >
                <Gift className="w-3.5 h-3.5 shrink-0" />
                Redeem {selectedCustomer.loyaltyPoints} pts
              </button>
            )
          )}
          {redeemNeedsManager && (
            <span className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 px-2.5 h-9 rounded-xl text-[11px] font-bold text-amber-800 shrink-0">
              Ask a manager — this redemption needs approval
            </span>
          )}

          <button
            onClick={() => setNotesModalOpen(true)}
            className={`flex items-center gap-1.5 border px-2.5 h-9 rounded-xl text-xs text-left truncate transition-colors cursor-pointer min-w-0 ${
              orderNotes
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-jaman-border hover:border-slate-400 text-slate-700'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate font-semibold text-xs">
              {orderNotes ? orderNotes : 'Chef Notes'}
            </span>
          </button>
        </div>
      </div>

      {/* Cart Items List or Rich Functional Empty State */}
      <div className="flex-1 min-h-[110px] overflow-y-auto overscroll-contain px-3 py-1 space-y-0 bg-white [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5">
        {hasItems ? (
          <>
            {stockShortages.length > 0 && (
              <div role="alert" className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-900">
                Low stock: {stockShortages.map((sh) => `${sh.itemName} (need ${Math.round(sh.needed * 100) / 100} ${sh.unit}, have ${Math.round(sh.available * 100) / 100})`).join(', ')}
              </div>
            )}
            {cart.items.map((ci) => (
              <div
                key={ci.cartItemId}
                className="py-1 border-b border-[#ECE8E2] last:border-b-0"
              >
                <div className="flex items-start gap-2.5">
                  <CachedImg
                    src={ci.item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover bg-jaman-cream border border-jaman-border shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg';
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    {/* Line 1: dietary mark, name, line total, delete */}
                    <div className="flex items-start gap-2">
                      <div
                        className={`w-4 h-4 mt-0.5 rounded-[4px] border bg-white flex items-center justify-center shrink-0 ${
                          ci.item.dietaryType === 'NON_VEG' ? 'border-rose-600' : 'border-emerald-600'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${ci.item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'}`} />
                      </div>
                      <h4 className="flex-1 min-w-0 font-semibold text-sm text-jaman-deepNavy leading-tight line-clamp-2">
                        {ci.item.name}
                      </h4>
                      <span className="font-bold text-base text-jaman-deepNavy leading-tight shrink-0 tabular-nums">₹{ci.itemTotal}</span>
                      <button
                        type="button"
                        onClick={() => { sound.play('remove'); removeItemFromCart(ci.cartItemId); }}
                        className="w-8 h-8 -mt-1.5 -mr-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="Remove item"
                        aria-label={`Remove ${ci.item.name}`}
                      >
                        <Trash2 className="w-[18px] h-[18px]" />
                      </button>
                    </div>

                    {/* Line 2: secondary info */}
                    <span className="block text-[11px] text-slate-400 leading-tight mt-px">
                      {ci.item.sku ? `${ci.item.sku} • ` : ''}@ ₹{ci.unitPrice}
                    </span>

                    {/* Line 3: quantity stepper + inline Add note */}
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="inline-flex items-center bg-jaman-cream border border-jaman-border rounded-xl shrink-0">
                        <button
                          type="button"
                          onClick={() => { sound.play('remove'); updateItemQuantity(ci.cartItemId, -1); }}
                          className="w-8 h-9 rounded-l-xl hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 cursor-pointer"
                          title="Decrease quantity"
                        >
                          <Minus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <span className="font-bold text-sm text-jaman-deepNavy min-w-[30px] h-9 leading-9 text-center bg-white border-x border-jaman-border">
                          {ci.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => { sound.play('click'); updateItemQuantity(ci.cartItemId, 1); }}
                          className="w-8 h-9 rounded-r-xl hover:bg-orange-100 text-jaman-saffron flex items-center justify-center active:scale-95 cursor-pointer"
                          title="Increase quantity"
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>

                      {/* Quick Note toggle (same state + handlers as before) */}
                      <button
                        type="button"
                        onClick={() => toggleNotesFor(ci.cartItemId)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-jaman-saffron flex items-center gap-1 cursor-pointer min-h-9"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-jaman-saffron" />
                        <span>{notesExpandedFor.has(ci.cartItemId) ? 'Done' : 'Add note'}</span>
                      </button>
                    </div>

                    {notesExpandedFor.has(ci.cartItemId) && (
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1.5">
                        {['Less Spicy', 'No Onion', 'Extra Cheese', 'No Garlic'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const existing = ci.specialInstructions ? `${ci.specialInstructions}, ` : '';
                              usePosStore.getState().updateItemSpecialInstructions(ci.cartItemId, `${existing}${preset}`);
                              toggleNotesFor(ci.cartItemId);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
                          >
                            +{preset}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Modifiers summary */}
                    {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                      <div className="text-[11px] text-slate-500 pt-1 space-y-0.5">
                        {ci.selectedModifiers.map((m, idx) => (
                          <div key={idx}>
                            + {m.optionName} {m.priceDelta > 0 ? `(+₹${m.priceDelta})` : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    {ci.specialInstructions && (
                      <div className="text-[11px] text-amber-700 pt-1 font-medium">
                        Note: {ci.specialInstructions}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Smart Suggestions: Often Ordered Together (compact horizontal strip) */}
            <div className="mt-1.5 pt-2 border-t border-[#ECE8E2]">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Sparkles className="w-3 h-3 text-jaman-saffron" />
                <span>Frequently Paired Together</span>
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                {db.menuItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { sound.play('add'); addItemToCart(item); }}
                    className="h-8 px-2.5 rounded-full bg-jaman-cream hover:bg-[#FFF4ED] border border-jaman-border hover:border-[#FDBA74] text-xs font-bold text-jaman-deepNavy flex items-center gap-1 transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-jaman-saffron" />
                    <span className="max-w-[120px] truncate">{item.name}</span>
                    <span className="text-slate-400 text-[11px]">₹{item.price}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Clean Minimal Empty Cart State */
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-3 text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-center shadow-xs p-2.5">
              <CachedImg
                src={JAMANVAAR_LOGOS.mark}
                alt="JAMANVAAR"
                className="w-full h-full object-contain drop-shadow-xs"
              />
            </div>
            <div>
              <h4 className="font-bold text-sm text-jaman-deepNavy">Billing Counter Ready</h4>
              <p className="text-xs text-slate-400 max-w-[200px] mx-auto mt-1 leading-relaxed">
                Tap any dish from the menu to add it to this order.
              </p>
            </div>

            {/* ↻ Repeat Last Order Fast Action */}
            {db.orders.length > 0 && (
              <button
                type="button"
                onClick={() => setRepeatModalOpen(true)}
                className="w-full py-2.5 px-3 bg-[#FFFDFB] hover:bg-[#FFF4ED] border border-jaman-border hover:border-[#FDBA74] text-jaman-deepNavy hover:text-jaman-saffron rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs mt-2 cursor-pointer active:scale-98"
                title="Repeat previous order"
              >
                <RotateCcw className="w-3.5 h-3.5 text-jaman-saffron" />
                <span>↻ Repeat Last Order</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Financials & Settle Panel */}
      <div className="px-3 pt-1.5 pb-2 bg-white border-t border-jaman-border shrink-0 space-y-1">
        {/* Quick Discounts & Hold Order Button */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setIsDiscountModalOpen(true)}
            disabled={!hasItems}
            className={`px-2 h-8 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              cart.discountAmount > 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
                : hasItems
                ? 'bg-jaman-cream border-jaman-border text-slate-700 hover:border-jaman-saffron/40 hover:text-jaman-navy'
                : 'bg-jaman-cream border-jaman-border text-slate-400 cursor-not-allowed opacity-75'
            }`}
          >
            <Tag className={`w-3.5 h-3.5 ${cart.discountAmount > 0 ? 'text-emerald-600' : 'text-jaman-saffron'}`} />
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
            className={`px-2 h-8 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              hasItems
                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 cursor-pointer shadow-2xs'
                : 'bg-jaman-cream border-jaman-border text-slate-400 cursor-not-allowed opacity-75'
            }`}
            title="Save this order for later"
          >
            <CirclePause className={`w-3.5 h-3.5 ${hasItems ? 'text-amber-600' : 'text-slate-300'}`} />
            <span>Hold Order</span>
          </button>
          {!clearConfirmOpen ? (
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={!hasItems}
              className={`px-2 h-8 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                hasItems
                  ? 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100 cursor-pointer'
                  : 'bg-jaman-cream border-jaman-border text-slate-400 cursor-not-allowed opacity-75'
              }`}
              title="Clear Cart"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1 bg-rose-50 border border-rose-200 px-2 h-8 rounded-lg animate-in fade-in">
              <span className="text-[11px] font-bold text-rose-700">Clear?</span>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setClearConfirmOpen(false);
                }}
                className="text-[11px] font-bold text-rose-700 hover:underline px-1 cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-1 cursor-pointer"
              >
                No
              </button>
            </div>
          )}
        </div>

        {/* Authoritative Tax Calculation Summary: one inline row (same values, same sources) */}
        <div className="text-xs text-slate-600 font-medium leading-tight space-y-1">
          <div className="flex items-center justify-between gap-2 px-0.5 whitespace-nowrap">
            <span>
              Subtotal <strong className="tabular-nums font-bold text-jaman-deepNavy">₹{cart.subtotal}</strong>
            </span>
            <span title="GST (CGST + SGST)">
              GST <span className="tabular-nums text-slate-500">₹{cart.taxAmount}</span>
            </span>
            {cart.roundOffAmount !== 0 && (
              <span className="text-slate-400">
                Round Off{' '}
                <span className="tabular-nums">
                  {cart.roundOffAmount > 0 ? `+₹${cart.roundOffAmount}` : `-₹${Math.abs(cart.roundOffAmount)}`}
                </span>
              </span>
            )}
          </div>

          {cart.discountAmount > 0 && (
            <div className="flex justify-between items-center text-emerald-600 font-bold bg-emerald-50/70 px-2 py-0.5 rounded-lg border border-emerald-200/60">
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
                <span className="tabular-nums">-₹{cart.discountAmount}</span>
                <button
                  type="button"
                  onClick={() => usePosStore.getState().removeDiscount()}
                  className="w-4 h-4 rounded-full bg-emerald-200/80 hover:bg-rose-100 hover:text-rose-700 text-emerald-800 flex items-center justify-center text-[11px] ml-1 transition-colors cursor-pointer"
                  title="Remove discount"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* KOT Status Badge / Toast */}
        {kotSentState && (
          <div className="p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl font-bold text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>KOT Sent to Kitchen Stations!</span>
          </div>
        )}

        {/* Total Payable + PAY side by side */}
        <div className="grid grid-cols-[1fr_1fr] gap-1.5">
          <div className="flex flex-col justify-center px-3 h-11 rounded-xl bg-[#FFF2E8] text-jaman-deepNavy leading-none">
            <span className="text-[11px] font-bold text-slate-500">Total Payable</span>
            <span className="text-xl font-bold mt-0.5">₹{cart.totalPayable}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            disabled={!hasItems}
            className={`h-11 px-3 rounded-xl font-bold text-[13px] uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-150 ${
              hasItems
                ? 'bg-jaman-saffron hover:bg-[#C95A12] text-white shadow-md shadow-jaman-saffron/25 active:scale-[0.98] cursor-pointer'
                : 'bg-orange-50 border border-orange-100 text-orange-800/50 cursor-not-allowed opacity-80'
            }`}
          >
            <CreditCard className={`w-4 h-4 shrink-0 ${hasItems ? 'text-white' : 'text-orange-400/60'}`} />
            <span className="truncate">PAY ₹{cart.totalPayable}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* SEND KOT + INSTANT BILL side by side */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleSendKot}
            disabled={!canSendKot}
            className={`h-11 px-2 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all duration-150 ${
              (db.restaurant?.instantBillConfig?.enabled !== false) ? '' : 'col-span-2'
            } ${
              canSendKot
                ? 'bg-jaman-cream hover:bg-[#F1ECE3] text-jaman-navy border border-jaman-border active:scale-[0.98] cursor-pointer'
                : 'bg-slate-100/90 border border-slate-200 text-slate-400 cursor-not-allowed opacity-80'
            }`}
          >
            {kotSentState || (hasSentItems && unsentCount === 0)
              ? <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              : <Flame className={`w-4 h-4 shrink-0 ${canSendKot ? 'text-jaman-saffron' : 'text-slate-400'}`} />}
            <span className="truncate">{kotLabel}</span>
          </button>

          {/* INSTANT BILL */}
          {(db.restaurant?.instantBillConfig?.enabled !== false) && (
            <button
              type="button"
              onClick={() => executeInstantBill()}
              disabled={!hasItems || isInstantBillProcessing}
              className={`h-11 px-2 rounded-xl flex items-center justify-between gap-1 transition-all duration-150 select-none border min-w-0 ${
                hasItems && !isInstantBillProcessing
                  ? 'bg-[#FFFAEB] hover:bg-[#FFF3D6] text-jaman-navy border-amber-300 active:scale-[0.99] cursor-pointer'
                  : 'bg-amber-50/60 border-amber-200/80 text-amber-900/50 cursor-not-allowed opacity-85'
              }`}
            >
              <div className="flex items-center gap-1.5 text-left min-w-0">
                <Zap className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <div className={`font-bold text-xs uppercase tracking-wide leading-tight truncate ${hasItems ? 'text-jaman-navy' : 'text-amber-950/60'}`}>
                    {isInstantBillProcessing ? 'Processing...' : 'Instant Bill'}
                  </div>
                  <span className={`text-[11px] leading-tight font-semibold block truncate ${hasItems ? 'text-slate-500' : 'text-amber-800/50'}`}>
                    {db.restaurant?.instantBillConfig?.paymentMethod === 'UPI_QR'
                      ? 'UPI / QR'
                      : db.restaurant?.instantBillConfig?.paymentMethod === 'CARD'
                      ? 'Card'
                      : 'Cash'} • {db.restaurant?.instantBillConfig?.autoPrint !== false ? 'Auto Print' : 'Manual Print'}
                  </span>
                </div>
              </div>
              <ArrowRight className={`w-4 h-4 shrink-0 ${hasItems ? 'text-amber-600' : 'text-amber-300'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Modals & Drawers — PosHoldModal and PosDiscountModal now mount globally in App.tsx: PosHoldModal
          so its F8 shortcut works from every tab, PosDiscountModal because this component's own root is
          a flex item with an explicit z-index, which traps a fixed/z-50 descendant inside its local
          stacking layer, letting PosSidebar's z-20 paint over the "dimmed" backdrop (see App.tsx). */}
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
