import { PosLoyaltyRewards } from '../customers/PosLoyaltyRewards';
import { CachedImg, useConfirm } from '@jamanvaar/ui';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PosTablePickerModal } from '../tables/PosTablePickerModal';
import { usePosStore } from '../../store/posStore';
import { OrderType } from '@jamanvaar/types';
import { db, InventoryRepository } from '@jamanvaar/database';
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
import { Plus, Minus, Trash2, Tag, CirclePause, CreditCard, User, Utensils, ChevronRight, MessageSquare, Check, Flame, Sparkles, ArrowRight, RotateCcw, Zap, Bike, Ticket, ShoppingBag as TakeawayBag, X } from 'lucide-react';

export const PosCart: React.FC = () => {
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
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
    cancelSentItemDurably,
    checkConcurrentEdit,
    loadOrderForSettlement,
    cartOrderBaseline,
    runningOrderId,
    billDiscountPercent,
    clearCart,
    holdCurrentOrder,
    sendKOTDurably,
    setIsPaymentOpen,
    setActiveTab,
    addItemToCart,
    currentUser,
    isDiscountModalOpen,
    setIsDiscountModalOpen,
    executeInstantBill,
    isInstantBillProcessing
  } = usePosStore();
  const { prompt, notify, confirmDialog } = useConfirm();
  const cancellingSentRef = useRef(false);
  const [isCancellingSent, setIsCancellingSent] = useState(false);

  // F-kitchen-amendments: a line already in the kitchen (kotSentQty > 0) can't be shrunk or
  // removed by the plain quantity/trash buttons — cancelling it is a distinct action that needs a
  // reason, updates the live kitchen ticket, and (unlike a silent cart edit) can never just vanish
  // from the bill. Adding a replacement is a separate, deliberate menu action.
  const handleCancelSentItem = async (cartItemId: string) => {
    if (cancellingSentRef.current) return;
    cancellingSentRef.current = true;
    try {
      const reason = await prompt({
        title: 'Cancel this dish',
        message: 'This dish has already been sent to the kitchen. Tell the kitchen why it\'s being cancelled — this clears it from the bill and from the ticket.',
        inputLabel: 'Reason',
        placeholder: 'e.g. Guest changed their mind, kitchen out of stock…',
        confirmLabel: 'Cancel dish',
        tone: 'danger',
        required: true
      });
      if (reason === null) return;
      setIsCancellingSent(true);
      const ok = await cancelSentItemDurably(cartItemId, reason);
      if (!ok) { sound.play('warning'); return; }
      sound.play('remove');
    } catch (error) {
      setIsCancellingSent(false);
      await notify({ title: 'Dish cancellation not confirmed', message: error instanceof Error ? error.message : 'Keep this bill and retry the same cancellation.' });
    } finally { cancellingSentRef.current = false; setIsCancellingSent(false); }
  };

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

  const orderTypes: { id: OrderType; label: string; icon: React.ElementType }[] = [
    { id: 'DINE_IN', label: 'Dine-In', icon: Utensils },
    { id: 'TAKEAWAY', label: 'Takeaway', icon: TakeawayBag },
    { id: 'DELIVERY', label: 'Delivery', icon: Bike },
    { id: 'TOKEN_QR', label: 'Token', icon: Ticket }
  ];

  const handleSendKot = async () => {
    if (sendingKotRef.current) return;
    // Simultaneous-edit protection: a second device may have changed this exact bill since it was
    // opened here. Catching that before the KOT prints is the whole point — after printing, the
    // kitchen has already acted on whichever version won.
    const conflict = checkConcurrentEdit();
    if (!conflict.ok) {
      await notify({ title: 'Bill changed elsewhere', message: `${conflict.reason}`, confirmLabel: 'Refresh now' });
      if (cartOrderBaseline) {
        const result = loadOrderForSettlement(cartOrderBaseline.orderId);
        if (!result.ok) await notify({ title: 'Could not refresh', message: result.reason });
      }
      return;
    }
    sendingKotRef.current = true;
    setIsSendingKot(true);
    try {
      const kots = await sendKOTDurably();
      if (kots && kots.length > 0) {
        sound.play('kot');
        setKotSentState(true);
        setTimeout(() => setKotSentState(false), 3000);
      } else {
        sound.play('warning');
      }
    } catch (err) {
      sound.play('warning');
      await notify({ title: 'Cannot send to kitchen', message: err instanceof Error ? err.message : 'This order could not be sent.' });
    } finally {
      // The acknowledged action updates sent quantities; retain the re-entry guard until it finishes.
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
  const activeOrderId = runningOrderId ?? cartOrderBaseline?.orderId ?? selectedTable?.currentOrderId;
  const activeOrder = activeOrderId ? db.orders.find(order => order.id === activeOrderId) : undefined;
  const canSendKot = hasItems && unsentCount > 0 && !isSendingKot;
  const kotLabel = kotSentState && unsentCount === 0
    ? 'SAVED · WAITING TO SYNC'
    : hasSentItems && unsentCount === 0
      ? 'SAVED ON THIS DEVICE'
      : hasSentItems
        ? `SEND KOT (${unsentCount} NEW)`
        : 'SEND KOT';

  const itemCount = cart.items.reduce((n, ci) => n + ci.quantity, 0);
  const paymentHint = db.restaurant?.instantBillConfig?.paymentMethod === 'UPI_QR'
    ? 'UPI / QR'
    : db.restaurant?.instantBillConfig?.paymentMethod === 'CARD'
      ? 'Card'
      : 'Cash';
  const instantBillOn = db.restaurant?.instantBillConfig?.enabled !== false;
  const quiet = 'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer';

  return (
    <fieldset disabled={isCancellingSent} aria-busy={isCancellingSent} className="pos-cart bg-white border border-jaman-border rounded-2xl flex flex-col h-full min-h-0 min-w-0 select-none shadow-xs">
      {isCancellingSent && <p role="status" className="px-4 py-2 text-sm text-jaman-navy">Saving cancellation on this device…</p>}

      {/* Header: what this order is, how it is served, and who it is for. */}
      <div className="px-4 pt-2.5 pb-2.5 border-b border-jaman-border shrink-0 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-jaman-navy">Order{hasItems && <span className="ml-2 text-xs font-semibold text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>}</h2>
          <span className="text-xs text-slate-500 truncate">
            {activeOrder ? `${activeOrder.orderNumber} · ${unsentCount > 0 ? 'New dishes not sent' : 'Saved on this device'}` : 'New Order — Unsaved'}
            {currentUser?.fullName ? ` · ${currentUser.fullName}` : ''}
          </span>
        </div>

        <div role="group" aria-label="Order type" className="grid grid-cols-4 gap-0.5 p-0.5 rounded-xl bg-jaman-cream border border-jaman-border">
          {orderTypes.map((t) => {
            const active = orderType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setOrderType(t.id)}
                className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-w-0 ${
                  active ? 'bg-white text-jaman-saffronText shadow-sm ring-1 ring-jaman-border' : 'text-slate-600 hover:text-jaman-navy'
                }`}
              >
                <t.icon className="w-4 h-4 shrink-0 hidden xl:block" aria-hidden="true" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {orderType === 'DINE_IN' && (
            <div className="flex items-center gap-1 h-9 rounded-lg border border-jaman-border pl-2.5 pr-1.5 text-xs min-w-0">
              <button type="button" onClick={() => setTablePickerOpen(true)} className="flex items-center gap-1.5 font-semibold text-jaman-navy hover:text-jaman-saffronText cursor-pointer min-w-0 h-full">
                <Utensils className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedTable ? `Table #${selectedTable.tableNumber}` : 'Select Table'}</span>
              </button>
              {selectedTable && (
                <select
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                  title="Guests"
                  aria-label="Guests"
                  className="bg-jaman-cream rounded-md px-1 h-6 font-semibold text-xs text-jaman-navy cursor-pointer shrink-0"
                >
                  {guestCountOptions(selectedTable.capacity).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <button type="button" onClick={() => setCustomerDrawerOpen(true)} className={`${quiet} border border-jaman-border text-slate-700 hover:border-slate-300 min-w-0`}>
            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[130px]">{selectedCustomer ? selectedCustomer.name : 'Attach Customer'}</span>
          </button>
          <PosLoyaltyRewards />
          <button
            type="button"
            onClick={() => setNotesModalOpen(true)}
            className={`${quiet} border min-w-0 ${orderNotes ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-jaman-border text-slate-700 hover:border-slate-300'}`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[130px]">{orderNotes ? orderNotes : 'Chef Notes'}</span>
          </button>
        </div>
      </div>

      {/* Dishes: name and quantity only. Prices live in the single total below. */}
      <div className="flex-1 min-h-[110px] overflow-y-auto overscroll-contain px-4 bg-white [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5">
        {hasItems ? (
          <>
            {stockShortages.length > 0 && (
              <div role="alert" className="mt-3 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs font-semibold text-amber-900">
                Low stock: {stockShortages.map((sh) => `${sh.itemName} (need ${Math.round(sh.needed * 100) / 100} ${sh.unit}, have ${Math.round(sh.available * 100) / 100})`).join(', ')}
              </div>
            )}
            <ul className="divide-y divide-[#F0ECE5] -my-px">
              {cart.items.map((ci) => {
                const sentQty = ci.kotSentQty || 0;
                const isSent = sentQty > 0;
                // Any decrement/removal that would cut into the sent portion must go through the
                // cancel-reason flow instead of silently shrinking a ticket already at the kitchen.
                const atSentFloor = ci.quantity <= sentQty;
                const detail = [
                  ...(ci.selectedModifiers || []).map((m) => m.optionName),
                  ci.specialInstructions ? `Note: ${ci.specialInstructions}` : ''
                ].filter(Boolean).join(' · ');
                return (
                  <li key={ci.cartItemId} className="py-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-4 h-4 rounded-[4px] border bg-white flex items-center justify-center shrink-0 ${ci.item.dietaryType === 'NON_VEG' ? 'border-rose-600' : 'border-emerald-600'}`}
                        aria-hidden="true"
                      >
                        <span className={`w-2 h-2 rounded-full ${ci.item.dietaryType === 'NON_VEG' ? 'bg-rose-600' : 'bg-emerald-600'}`} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 title={detail ? `${ci.item.name} · ${detail}` : ci.item.name} className="font-semibold text-sm text-jaman-navy leading-tight line-clamp-2">
                          {ci.item.name}
                          {detail && <span className="ml-1.5 text-xs font-normal text-slate-500">{detail}</span>}
                        </h3>
                        {isSent && (
                          <p className="text-[11px] font-semibold text-slate-500 leading-tight">
                            {sentQty < ci.quantity ? `${sentQty} sent to kitchen · ${ci.quantity - sentQty} new` : 'Sent to kitchen'}
                          </p>
                        )}
                      </div>

                      <div className="inline-flex items-center rounded-xl border border-jaman-border bg-white shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (atSentFloor) { void handleCancelSentItem(ci.cartItemId); return; }
                            sound.play('remove'); updateItemQuantity(ci.cartItemId, -1);
                          }}
                          className="w-8 h-8 rounded-l-xl hover:bg-jaman-cream text-slate-700 flex items-center justify-center active:scale-95 cursor-pointer"
                          title={atSentFloor ? 'Cancel this dish (already sent to kitchen)' : 'Decrease quantity'}
                          aria-label={`Decrease ${ci.item.name}`}
                        >
                          <Minus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <span className="min-w-[28px] text-center text-sm font-bold text-jaman-navy tabular-nums" aria-label={`${ci.quantity} of ${ci.item.name}`}>{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => { sound.play('click'); updateItemQuantity(ci.cartItemId, 1); }}
                          className="w-8 h-8 rounded-r-xl hover:bg-orange-50 text-jaman-saffronText flex items-center justify-center active:scale-95 cursor-pointer"
                          title="Increase quantity"
                          aria-label={`Increase ${ci.item.name}`}
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleNotesFor(ci.cartItemId)}
                        aria-expanded={notesExpandedFor.has(ci.cartItemId)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0 ${notesExpandedFor.has(ci.cartItemId) || ci.specialInstructions ? 'text-jaman-saffronText bg-orange-50' : 'text-slate-500 hover:text-jaman-saffronText hover:bg-jaman-cream'}`}
                        title={notesExpandedFor.has(ci.cartItemId) ? 'Close note' : 'Add note'}
                        aria-label={`${notesExpandedFor.has(ci.cartItemId) ? 'Close note for' : 'Add note to'} ${ci.item.name}`}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isSent) { void handleCancelSentItem(ci.cartItemId); return; }
                          sound.play('remove'); removeItemFromCart(ci.cartItemId);
                        }}
                        className="w-9 h-9 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title={isSent ? 'Cancel this dish (already sent to kitchen)' : 'Remove item'}
                        aria-label={isSent ? `Cancel ${ci.item.name} (sent to kitchen)` : `Remove ${ci.item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {notesExpandedFor.has(ci.cartItemId) && (
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2 pl-[26px]">
                        {['Less Spicy', 'No Onion', 'Extra Cheese', 'No Garlic'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const existing = ci.specialInstructions ? `${ci.specialInstructions}, ` : '';
                              usePosStore.getState().updateItemSpecialInstructions(ci.cartItemId, `${existing}${preset}`);
                              toggleNotesFor(ci.cartItemId);
                            }}
                            className="h-8 px-2.5 rounded-lg bg-jaman-cream hover:bg-amber-100 hover:text-amber-900 text-slate-600 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                          >
                            +{preset}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-3 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center p-2.5">
              <CachedImg src={JAMANVAAR_LOGOS.mark} alt="JAMANVAAR" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-jaman-navy">Billing Counter Ready</h3>
              <p className="text-xs text-slate-500 mt-1">Tap a dish to start the order.</p>
            </div>
            {db.orders.length > 0 && (
              <button
                type="button"
                onClick={() => setRepeatModalOpen(true)}
                className="h-10 px-4 rounded-xl border border-jaman-border text-jaman-navy hover:text-jaman-saffronText hover:border-[#FDBA74] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Repeat previous order"
              >
                <RotateCcw className="w-3.5 h-3.5 text-jaman-saffronText" aria-hidden="true" />
                <span>↻ Repeat Last Order</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer: one total, one dominant action. */}
      <div className="px-4 pt-2.5 pb-2 border-t border-jaman-border shrink-0 space-y-2 bg-white rounded-b-2xl">
        {cart.discountAmount > 0 && (
          <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
            {(
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 pl-2.5 pr-1 py-0.5 font-semibold text-emerald-800">
                <span>{cart.discountReason || (billDiscountPercent > 0 ? `${billDiscountPercent}% off` : 'Discount')} · −₹{cart.discountAmount}</span>
                <button type="button" onClick={() => setIsDiscountModalOpen(true)} className="underline px-1 cursor-pointer" title="Edit discount">Edit</button>
                <button
                  type="button"
                  onClick={() => usePosStore.getState().removeDiscount()}
                  className="w-5 h-5 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center cursor-pointer"
                  title="Remove discount"
                  aria-label="Remove discount"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {kotSentState && (
          <div role="status" className="p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl font-bold text-center flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>KOT Sent to Kitchen Stations!</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsPaymentOpen(true)}
          disabled={!hasItems}
          className={`w-full h-12 rounded-xl font-bold text-base tracking-wide flex items-center justify-center gap-2.5 transition-all duration-150 ${
            hasItems
              ? 'bg-jaman-saffron hover:bg-[#C95A12] text-white shadow-md shadow-jaman-saffron/25 active:scale-[0.99] cursor-pointer'
              : 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          <CreditCard className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span className="tabular-nums">PAY ₹{cart.totalPayable}</span>
          <ArrowRight className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
        </button>

        <div className={`grid gap-2 ${instantBillOn ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={handleSendKot}
            disabled={!canSendKot}
            className={`h-10 px-2 rounded-xl font-bold text-xs tracking-wide flex items-center justify-center gap-1.5 transition-colors ${
              canSendKot ? 'bg-jaman-cream hover:bg-[#F1ECE3] text-jaman-navy border border-jaman-border cursor-pointer active:scale-[0.99]' : 'bg-slate-50 border border-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {kotSentState || (hasSentItems && unsentCount === 0)
              ? <Check className="w-4 h-4 shrink-0 text-emerald-700" aria-hidden="true" />
              : <Flame className={`w-4 h-4 shrink-0 ${canSendKot ? 'text-jaman-saffronText' : 'text-slate-300'}`} aria-hidden="true" />}
            <span className="truncate">{kotLabel}</span>
          </button>

          {instantBillOn && (
            <button
              type="button"
              onClick={() => executeInstantBill()}
              disabled={!hasItems || isInstantBillProcessing}
              title={`${paymentHint} • ${db.restaurant?.instantBillConfig?.autoPrint !== false ? 'Auto Print' : 'Manual Print'}`}
              className={`h-10 px-2 rounded-xl font-bold text-xs tracking-wide flex items-center justify-center gap-1.5 border transition-colors min-w-0 ${
                hasItems && !isInstantBillProcessing ? 'bg-white hover:bg-amber-50 text-jaman-navy border-jaman-border cursor-pointer active:scale-[0.99]' : 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Zap className={`w-4 h-4 shrink-0 ${hasItems && !isInstantBillProcessing ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} aria-hidden="true" />
              <span className="truncate">{isInstantBillProcessing ? 'Processing...' : 'Instant Bill'}</span>
            </button>
          )}
        </div>

        {/* Quiet secondary actions */}
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setIsDiscountModalOpen(true)}
            disabled={!hasItems}
            className={`${quiet} ${hasItems ? 'text-slate-600 hover:bg-jaman-cream hover:text-jaman-navy' : 'text-slate-300 cursor-not-allowed'}`}
          >
            <Tag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Discount</span>
          </button>
          <button
            type="button"
            onClick={() => holdCurrentOrder()}
            disabled={!hasItems}
            title="Save this order for later"
            className={`${quiet} ${hasItems ? 'text-slate-600 hover:bg-jaman-cream hover:text-jaman-navy' : 'text-slate-300 cursor-not-allowed'}`}
          >
            <CirclePause className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hold Order</span>
          </button>
          {!clearConfirmOpen ? (
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={!hasItems}
              title="Clear Cart"
              className={`${quiet} ${hasItems ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear All</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 bg-rose-50 border border-rose-200 px-2 h-9 rounded-lg">
              <span className="text-xs font-bold text-rose-700">Clear?</span>
              <button type="button" onClick={() => { clearCart(); setClearConfirmOpen(false); }} className="text-xs font-bold text-rose-700 hover:underline px-1.5 cursor-pointer">Yes</button>
              <button type="button" onClick={() => setClearConfirmOpen(false)} className="text-xs font-bold text-slate-500 hover:text-slate-700 px-1.5 cursor-pointer">No</button>
            </span>
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
      {/* Portalled to <body>: the cart root is its own stacking context, which would paint the sidebar over the picker. */}
      {createPortal(<PosTablePickerModal isOpen={tablePickerOpen} onClose={() => setTablePickerOpen(false)} />, document.body)}
      {confirmDialog}
    </fieldset>
  );
};
