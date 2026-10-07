import { db } from '@jamanvaar/database';
import React, { useState, useMemo } from 'react';
import { useEscapeToClose } from '../useEscapeToClose';
import { useCaptainStore, CartItemEntry, COURSES, type Course } from '../../store/captainStore';
import { DiningTable, MenuItem, SelectedModifier } from '@jamanvaar/types';
import { formatINR, restaurantGstRate, taxLabels } from '@jamanvaar/utils';
import { priceOrderLines } from '@jamanvaar/business';
import { captainDb, isBillWaiting } from '@jamanvaar/database';
import { CachedImg, EmptyState } from '@jamanvaar/ui';
import { CaptainModifierModal } from '../modals/CaptainModifierModal';
import { CaptainCancelDishModal } from '../modals/CaptainCancelDishModal';
import { CaptainCustomerModal } from '../customers/CaptainCustomerModal';
import { matchesCaptainDiet } from '../../captainWorkflow';
import {
  X,
  Plus,
  Trash2,
  Receipt,
  MessageSquare,
  Flame,
  CheckCircle2,
  Search,
  RotateCcw,
  ArrowRight,
  UtensilsCrossed,
  ChevronUp,
  ChevronDown,
  Ban,
  User,
  Star,
  DoorOpen
} from 'lucide-react';

interface CaptainTableWorkspaceModalProps {
  table: DiningTable | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenTransferMerge: () => void;
  onOpenSendMessage: (tableNumber: string) => void;
}

type DishState = 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export const CaptainTableWorkspaceModal: React.FC<CaptainTableWorkspaceModalProps> = ({
  table,
  isOpen,
  onClose,
  onOpenSendMessage,
  onOpenTransferMerge
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
    setCartItemCourse,
    setCartItemSeat,
    guestCount,
    clearCart,
    sendKOT,
    requestBill,
    repeatPreviousOrder,
    markItemServed,
    attachedCustomer,
    setIsCustomerModalOpen,
    closeTable
  } = useCaptainStore();

  // A freshly-opened table with nothing ordered yet should land straight on the menu.
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'ORDER' | 'MENU'>(() => (cartItems.length === 0 ? 'MENU' : 'ORDER'));
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'JAIN' | 'NON_VEG'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [kotSuccessAlert, setKotSuccessAlert] = useState('');
  const [billAlert, setBillAlert] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [repeatOrderError, setRepeatOrderError] = useState('');
  // On a phone the cart is a bar at the bottom of the menu; tap it to see the dishes.
  const [cartOpen, setCartOpen] = useState(false);
  const [cancelling, setCancelling] = useState<{ orderItemId: string; name: string; quantity: number } | null>(null);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) return false;
      if (!matchesCaptainDiet(item, dietaryFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [menuItems, selectedCategory, dietaryFilter, searchQuery]);

  const billable = cartItems.filter((ci) => ci.status !== 'CANCELLED');
  const unFiredCartItems = cartItems.filter((ci) => !ci.isFired);
  const firedCartItems = cartItems.filter((ci) => ci.isFired);
  const unfiredByCourse = COURSES.map((c) => ({ ...c, items: unFiredCartItems.filter((i) => (i.course ?? 'COURSE_1') === c.id) })).filter((g) => g.items.length > 0);
  const multiCourse = unfiredByCourse.length > 1;

  // The same pricing rules as the order itself and POS (CGST + SGST, round-off). A cancelled dish is at no charge.
  const priced = priceOrderLines(billable.map((ci) => ({ unitPrice: ci.unitPrice, quantity: ci.quantity, menuItemId: ci.menuItem.id })), { menuItems: db.menuItems, taxGroups: db.taxGroups });
  const subtotal = priced.subtotal;
  const gst = priced.taxAmount;
  const roundOff = priced.roundOffAmount;
  const total = priced.totalAmount;

  // Seats the waiter can give a dish to: the party size, but never fewer than the seats already used.
  const usedSeats = cartItems.map((ci) => ci.seat ?? 0);
  const seatCount = Math.min(10, Math.max(2, guestCount || 0, ...usedSeats));
  // Bill by seat: what each seat has ordered so far, so the counter can settle each guest on their own.
  const seatTotals = useMemo(() => {
    const totals = new Map<number, number>();
    billable.forEach((ci) => { if (ci.seat) totals.set(ci.seat, (totals.get(ci.seat) ?? 0) + ci.totalPrice); });
    return [...totals.entries()].sort((a, b) => a[0] - b[0]);
  }, [billable]);
  const requestSplitBill = () => requestBill(table!.tableNumber, seatTotals.map(([seat, amount]) => `Seat ${seat} ${formatINR(amount)}`).join(', '));

  // What the kitchen is doing with each dish right now, read from the running order (each dish is its own order line).
  const liveOrder = table?.currentOrderId ? captainDb.orders.find((o) => o.id === table.currentOrderId) : undefined;
  const dishState = (item: CartItemEntry): DishState => {
    if (item.status === 'CANCELLED') return 'CANCELLED';
    const line = item.orderItemId ? liveOrder?.items.find((i) => i.id === item.orderItemId) : undefined;
    if (line?.kitchenStatus === 'CANCELLED' || line?.kitchenStatus === 'SERVED' || line?.kitchenStatus === 'READY') return line.kitchenStatus;
    if (line) return 'PREPARING';
    // Older orders: dishes were tracked by name only.
    const lines = liveOrder?.items.filter((oi) => oi.menuItemId === item.menuItem.id) ?? [];
    if (lines.length > 0 && lines.every((l) => l.kitchenStatus === 'SERVED')) return 'SERVED';
    if (lines.length > 0 && lines.every((l) => l.kitchenStatus === 'READY' || l.kitchenStatus === 'SERVED')) return 'READY';
    return 'PREPARING';
  };

  // The waiter takes ONE finished dish to the table: find its ticket line so only that dish is marked served.
  const foodReadyIdFor = (item: CartItemEntry): string | undefined => {
    if (!liveOrder) return undefined;
    for (const kot of captainDb.kots) {
      if (kot.orderId !== liveOrder.id) continue;
      const ticketLine = item.orderItemId ? kot.items.find((i) => i.orderItemId === item.orderItemId) : kot.items.find((i) => i.menuItemId === item.menuItem.id && i.status !== 'SERVED' && i.status !== 'CANCELLED');
      if (ticketLine) return `${kot.id}:${ticketLine.id}`;
    }
    return undefined;
  };

  const handleFireKot = (courses?: Course[]) => {
    const kots = sendKOT(courses);
    if (kots) {
      const label = courses ? courses.map((c) => COURSES.find((x) => x.id === c)?.label).join(', ') : 'Everything';
      setKotSuccessAlert(`${label} sent to the kitchen.`);
      setTimeout(() => setKotSuccessAlert(''), 3000);
      setActiveWorkspaceTab('ORDER');
    }
  };

  // The bill belongs to the order: it is "sent" while the order is waiting for the counter, whatever the table record says.
  const billWaiting = isBillWaiting(liveOrder);
  // The GST line names the rate the restaurant set in Customisations & Tax, not a fixed one.
  const gstLabels = taxLabels(restaurantGstRate(captainDb.taxGroups));
  const billSentAt = liveOrder?.billRequestedAt ? new Date(liveOrder.billRequestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  const sendBill = (split = false) => {
    const sent = split ? requestSplitBill() : requestBill(table!.tableNumber);
    if (sent) {
      setBillAlert({ tone: 'ok', text: split ? 'Split bill sent to the counter POS.' : 'Bill sent to the counter POS. It is waiting there for payment.' });
    } else {
      setBillAlert({ tone: 'error', text: 'Nothing to bill yet. Send the order to the kitchen first.' });
    }
    setTimeout(() => setBillAlert(null), 4000);
  };

  if (!isOpen || !table) return null;

  const fireButtons = (
    <>
      {multiCourse && (
        <div className="flex flex-wrap gap-1.5" aria-label="Send one course at a time">
          {unfiredByCourse.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => handleFireKot([g.id])}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-jaman-saffron text-jaman-saffron text-[11px] font-black cursor-pointer min-h-[36px]"
            >
              Send {g.label} ({g.items.length})
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => handleFireKot()}
        disabled={unFiredCartItems.length === 0}
        className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-gradient-to-r from-jaman-saffron to-[#EA580C] disabled:opacity-50 hover:brightness-105 text-white font-black text-sm shadow-md shadow-jaman-saffron/25 active:scale-98 transition-all cursor-pointer flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <Flame className="w-4 h-4 fill-white" />
          {multiCourse ? `SEND ALL (${unFiredCartItems.length})` : `SEND KOT (${unFiredCartItems.length})`}
        </span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </>
  );

  const stateChip = (s: DishState) =>
    s === 'SERVED' ? (
      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Served</span>
    ) : s === 'READY' ? (
      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded">Ready to serve</span>
    ) : s === 'CANCELLED' ? (
      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded">Cancelled</span>
    ) : (
      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">In kitchen</span>
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-5xl h-dvh sm:h-[92vh] bg-white sm:rounded-3xl shadow-2xl sm:border border-jaman-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-jaman-navy text-white px-3 py-2.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jaman-saffron text-white flex items-center justify-center font-black text-base sm:text-lg shadow-sm shrink-0">
              {table.tableNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-xl font-black truncate">TABLE {table.tableNumber}</h2>
                <span className="bg-white/10 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">{table.status.replace('_', ' ')}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 font-medium truncate">
                {(table as any).section || table.zone || 'Main Dining'} • {table.currentGuests || 2} guests<span className="hidden sm:inline"> • Captain {currentCaptain?.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {(currentCaptain?.permissions.CAN_TRANSFER_TABLE || currentCaptain?.permissions.CAN_MERGE_TABLE) && <button type="button" onClick={onOpenTransferMerge} aria-label="Transfer or merge this table" title="Transfer or merge this table" className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5"><UtensilsCrossed className="w-4 h-4" /><span className="hidden lg:inline">Transfer / Merge</span></button>}
            <button
              type="button"
              onClick={() => onOpenSendMessage(table.tableNumber)}
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Send note to kitchen or manager for this table"
              aria-label="Send a note to the kitchen"
            >
              <MessageSquare className="w-4 h-4 text-jaman-saffron" />
              <span className="hidden sm:inline">Kitchen Note</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title={attachedCustomer ? `${attachedCustomer.name} · ${attachedCustomer.loyaltyPoints || 0} pts` : 'Attach a guest for CRM & loyalty points'}
              aria-label="Attach guest"
            >
              <User className="w-4 h-4 text-jaman-saffron" />
              <span className="hidden sm:inline">{attachedCustomer ? (attachedCustomer.name || attachedCustomer.phone).split(' ')[0] : 'Guest'}</span>
            </button>
            <button
              type="button"
              onClick={() => sendBill(false)}
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title={billWaiting ? 'Bill already with the counter. Send it again after adding dishes.' : 'Send the bill to the counter POS'}
              aria-label={billWaiting ? 'Re-send the bill' : 'Request the bill'}
            >
              <Receipt className="w-4 h-4" />
              <span className="hidden sm:inline">{billWaiting ? 'Bill sent · re-send' : 'Request Bill'}</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Order status stepper: on a phone the table's status badge above says the same in one word */}
        <div className="hidden md:block bg-jaman-cream border-b border-jaman-border px-4 py-2 overflow-x-auto scrollbar-none shrink-0">
          <div className="flex items-center justify-between min-w-[500px] text-[11px] font-bold text-slate-500">
            {['Order Taken', 'KOT Sent', 'Cooking', 'Food Ready', 'Served', 'Bill Requested'].map((label, i) => {
              const live = firedCartItems.filter(item => dishState(item) !== 'CANCELLED');
              const done = i === 0 ? cartItems.length > 0 : i === 1 ? firedCartItems.length > 0
                : i === 2 ? live.length > 0 : i === 3 ? live.some(item => ['READY', 'SERVED'].includes(dishState(item)))
                : i === 4 ? live.length > 0 && live.every(item => dishState(item) === 'SERVED') : billWaiting;
              return (
                <React.Fragment key={label}>
                  {i > 0 && <span className="text-slate-300">➔</span>}
                  <span className={`flex items-center gap-1 ${done ? (i === 5 ? 'text-purple-700 font-black' : 'text-emerald-700 font-black') : ''}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${done ? (i === 5 ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                    {label}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Order / Menu switch */}
        <div className="px-3 sm:px-4 py-2 border-b border-jaman-border bg-white flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('ORDER')}
            className={`flex-1 sm:flex-none min-h-[44px] px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${activeWorkspaceTab === 'ORDER' ? 'bg-jaman-navy text-white shadow-xs' : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'}`}
          >
            <span className="sm:hidden">Order & Bill ({billable.length})</span>
            <span className="hidden sm:inline">Current Order & Bill ({billable.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('MENU')}
            className={`flex-1 sm:flex-none min-h-[44px] px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeWorkspaceTab === 'MENU' ? 'bg-jaman-saffron text-white shadow-xs' : 'bg-[#FFF4ED] text-jaman-saffron hover:bg-[#FFE8D6]'}`}
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">Menu</span>
            <span className="hidden sm:inline">Take Order / Menu Catalog</span>
          </button>
          {unFiredCartItems.length > 0 && activeWorkspaceTab === 'MENU' && (
            <span className="hidden sm:inline ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg animate-pulse">{unFiredCartItems.length} new dishes ready to send</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {activeWorkspaceTab === 'ORDER' ? (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* Dishes */}
              <div className="flex-1 p-3 sm:p-5 overflow-y-auto space-y-3 min-h-0">
                {billWaiting && (
                  <div role="status" className="p-3 rounded-2xl bg-purple-50 border border-purple-300 text-purple-900 text-xs font-bold flex items-start gap-2">
                    <Receipt className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <span>
                      Bill sent to the counter at {billSentAt}. Total {formatINR(liveOrder!.totalAmount)} waiting for payment at the POS.
                      {' '}Add dishes and re-send if the guest orders more.
                    </span>
                  </div>
                )}
                {billAlert && (
                  <div role="status" className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${billAlert.tone === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                    <span>{billAlert.text}</span>
                  </div>
                )}
                {kotSuccessAlert && (
                  <div role="status" className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{kotSuccessAlert} The kitchen screen is updated.</span>
                  </div>
                )}

                {cartItems.length === 0 ? (
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
                          if (!repeatPreviousOrder(table.tableNumber)) {
                            setRepeatOrderError('No previous completed order found for this table.');
                            setTimeout(() => setRepeatOrderError(''), 3000);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-jaman-navy border border-jaman-border font-black text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Repeat Previous Order</span>
                      </button>
                    </div>
                    {repeatOrderError && <p className="text-[11px] font-bold text-rose-600 text-center">{repeatOrderError}</p>}
                  </div>
                ) : (
                  <>
                    {/* Not sent yet, grouped by course so a course can be held back and sent when the table is ready */}
                    {unFiredCartItems.length > 0 && (
                      <section aria-label="Not sent to the kitchen yet" className="space-y-2">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-700">Not sent yet</h3>
                        {unfiredByCourse.map((g) => (
                          <div key={g.id} className="rounded-2xl border border-[#FDBA74] bg-[#FFFBF7] p-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-jaman-navy">{g.short} course: {g.label}</span>
                              {multiCourse && (
                                <button type="button" onClick={() => handleFireKot([g.id])} className="px-3 py-1.5 rounded-xl bg-jaman-saffron text-white text-[11px] font-black cursor-pointer min-h-[36px]">
                                  Send now
                                </button>
                              )}
                            </div>
                            {g.items.map((item) => (
                              <div key={item.id} className="p-2.5 rounded-xl bg-white border border-jaman-border space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-sm text-jaman-navy break-words">{item.quantity}× {item.menuItem.name}</p>
                                    {item.selectedModifiers.length > 0 && <p className="text-[11px] text-slate-500 font-medium">{item.selectedModifiers.map((m: SelectedModifier) => m.optionName).join(', ')}</p>}
                                    {item.specialNotes && <p className="text-[11px] text-amber-700 italic">Note: {item.specialNotes}</p>}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-black font-mono text-sm text-jaman-navy">{formatINR(item.totalPrice)}</span>
                                    <button type="button" onClick={() => removeCartItem(item.id)} aria-label={`Remove ${item.menuItem.name}`} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => updateCartQuantity(item.id, -1)} aria-label="One less" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-black cursor-pointer">−</button>
                                    <button type="button" onClick={() => updateCartQuantity(item.id, 1)} aria-label="One more" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-black cursor-pointer">+</button>
                                  </div>
                                  <span className="text-[10px] font-black uppercase text-slate-400 ml-1">Seat</span>
                                  {Array.from({ length: seatCount }, (_, n) => n + 1).map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setCartItemSeat(item.id, item.seat === n ? undefined : n)}
                                      aria-pressed={item.seat === n}
                                      aria-label={`Seat ${n}`}
                                      className={`w-9 h-9 rounded-lg text-[11px] font-black cursor-pointer ${item.seat === n ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                  <span className="text-[10px] font-black uppercase text-slate-400 ml-1">Course</span>
                                  {COURSES.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => setCartItemCourse(item.id, c.id)}
                                      aria-pressed={(item.course ?? 'COURSE_1') === c.id}
                                      className={`px-2.5 h-9 rounded-lg text-[11px] font-black cursor-pointer ${(item.course ?? 'COURSE_1') === c.id ? 'bg-jaman-navy text-white' : 'bg-slate-100 text-slate-600'}`}
                                    >
                                      {c.short}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </section>
                    )}

                    {/* In the kitchen or done */}
                    {firedCartItems.length > 0 && (
                      <section aria-label="Sent to the kitchen" className="space-y-2">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Sent to the kitchen</h3>
                        {firedCartItems.map((item) => {
                          const state = dishState(item);
                          const serveId = state === 'READY' ? foodReadyIdFor(item) : undefined;
                          return (
                            <div key={item.id} className={`p-3 rounded-2xl border flex items-start justify-between gap-2 ${state === 'CANCELLED' ? 'bg-rose-50 border-rose-200' : state === 'READY' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-jaman-border'}`}>
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`font-extrabold text-sm break-words ${state === 'CANCELLED' ? 'line-through text-rose-700' : 'text-jaman-navy'}`}>{item.quantity}× {item.menuItem.name}</span>
                                  {stateChip(state)}
                                  {item.course && <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{COURSES.find((c) => c.id === item.course)?.label}</span>}
                                  {item.seat && <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Seat {item.seat}</span>}
                                </div>
                                {item.selectedModifiers && item.selectedModifiers.length > 0 && <p className="text-[11px] text-slate-500 font-medium">{item.selectedModifiers.map((m) => m.optionName).join(', ')}</p>}
                                {item.specialNotes && <p className="text-[11px] text-amber-700 italic">Note: {item.specialNotes}</p>}
                                {state === 'CANCELLED' && item.cancelReason && <p className="text-[11px] font-bold text-rose-700">Cancelled: {item.cancelReason}</p>}
                                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                                  {serveId && (
                                    <button type="button" onClick={() => markItemServed(serveId)} className="min-h-[40px] px-3 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer" title="Mark this dish as delivered to the table">
                                      Mark served
                                    </button>
                                  )}
                                  {state !== 'SERVED' && state !== 'CANCELLED' && item.orderItemId && (
                                    <button
                                      type="button"
                                      onClick={() => setCancelling({ orderItemId: item.orderItemId!, name: item.menuItem.name, quantity: item.quantity })}
                                      className="min-h-[40px] px-3 rounded-xl text-xs font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 cursor-pointer flex items-center gap-1"
                                    >
                                      <Ban className="w-3.5 h-3.5" /> Cancel dish
                                    </button>
                                  )}
                                </div>
                              </div>
                              <span className={`font-black font-mono text-sm shrink-0 ${state === 'CANCELLED' ? 'text-rose-400' : 'text-jaman-navy'}`}>{formatINR(item.totalPrice)}</span>
                            </div>
                          );
                        })}
                      </section>
                    )}
                  </>
                )}
              </div>

              {/* Bill and actions: a compact strip at the bottom on a phone, a side column on a tablet */}
              <div className="w-full md:w-80 bg-jaman-cream border-t md:border-t-0 md:border-l border-jaman-border p-3 md:p-5 flex flex-col gap-2.5 md:gap-4 shrink-0 max-h-[42dvh] md:max-h-none overflow-y-auto">
                <div className="hidden md:block space-y-3">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Table Financial Summary</h3>
                  {attachedCustomer && (
                    <button
                      type="button"
                      onClick={() => setIsCustomerModalOpen(true)}
                      className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-white border border-jaman-border text-left cursor-pointer hover:border-jaman-saffron"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-jaman-navy truncate">{attachedCustomer.name || attachedCustomer.phone}</span>
                        <span className="block text-[10px] font-mono text-slate-400">{attachedCustomer.phone}</span>
                      </span>
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {attachedCustomer.loyaltyPoints || 0} pts
                      </span>
                    </button>
                  )}
                  <div className="space-y-2 text-xs font-semibold text-slate-600 bg-white p-3.5 rounded-2xl border border-jaman-border">
                    <div className="flex justify-between"><span>Subtotal</span><span className="font-mono text-jaman-navy">{formatINR(subtotal)}</span></div>
                    <div className="flex justify-between"><span>{gstLabels.combined}</span><span className="font-mono text-jaman-navy">{formatINR(gst)}</span></div>
                    {roundOff !== 0 && (
                      <div className="flex justify-between"><span>Round Off</span><span className="font-mono text-jaman-navy">{roundOff > 0 ? '+' : ''}{formatINR(roundOff)}</span></div>
                    )}
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-black text-jaman-navy"><span>Total Payable</span><span className="font-mono text-base">{formatINR(total)}</span></div>
                  </div>
                </div>
                <div className="md:hidden flex items-center justify-between text-sm font-black text-jaman-navy">
                  <span>Total (incl. GST)</span>
                  <span className="font-mono text-base">{formatINR(total)}</span>
                </div>

                {unFiredCartItems.length > 0 && <div className="space-y-2">{fireButtons}</div>}

                <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                  <button type="button" onClick={() => setActiveWorkspaceTab('MENU')} className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-jaman-navy hover:bg-[#163E5E] text-white font-black text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span>Add dishes</span>
                  </button>
                  <button type="button" onClick={() => sendBill(false)} className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>{billWaiting ? `Bill sent ${billSentAt} · re-send` : 'Request bill'}</span>
                  </button>
                  {seatTotals.length > 0 && (
                    <button type="button" onClick={() => sendBill(true)} className="col-span-2 md:col-span-1 min-h-[44px] py-2.5 px-3 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Request split bill by seat</span>
                    </button>
                  )}
                </div>

                {/* Only while nothing has been sent: clearing wipes the whole cart. */}
                {firedCartItems.length === 0 && unFiredCartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Discard this unsent order and start over? Nothing has been sent to the kitchen yet.')) clearCart();
                    }}
                    className="min-h-[40px] py-2 px-4 rounded-2xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discard order</span>
                  </button>
                )}

                {/* Manual recovery: a guest walked out, or a self-order (kiosk/QR) left a table occupied with
                    nothing really left to serve. Any order still open on this table is settled as Completed
                    first (see closeTable), so freeing it never silently abandons an unbilled order. */}
                {currentCaptain?.permissions.CAN_TRANSFER_TABLE && (
                  <button
                    type="button"
                    onClick={() => {
                      const warn = total > 0
                        ? `Free Table ${table!.tableNumber}? It still shows ${formatINR(total)} owed — this will mark that bill as paid/completed without collecting it. Only do this if the guest already paid another way or left without paying.`
                        : `Free Table ${table!.tableNumber}? It will show as available for the next guest.`;
                      if (window.confirm(warn)) {
                        closeTable(table!.tableNumber);
                        onClose();
                      }
                    }}
                    className="min-h-[40px] py-2 px-4 rounded-2xl bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <DoorOpen className="w-3.5 h-3.5" />
                    <span>Free table</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Menu: dishes on top, a compact cart at the bottom */
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="p-2.5 sm:p-3 bg-white border-b border-jaman-border flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[150px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search dish or SKU"
                      aria-label="Search dishes"
                      className="w-full pl-9 pr-3 min-h-[44px] bg-jaman-cream border border-jaman-border rounded-xl text-sm text-jaman-navy outline-none focus:bg-white focus:border-jaman-saffron"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(['ALL', 'VEG', 'JAIN', 'NON_VEG'] as const).map((diet) => (
                      <button
                        key={diet}
                        type="button"
                        onClick={() => setDietaryFilter(diet)}
                        aria-pressed={dietaryFilter === diet}
                        className={`px-3 min-h-[40px] rounded-xl text-[11px] font-bold transition-all cursor-pointer ${dietaryFilter === diet ? 'bg-jaman-navy text-white' : 'bg-jaman-cream text-slate-600 hover:bg-slate-100'}`}
                      >
                        {diet === 'ALL' ? 'All' : diet === 'VEG' ? 'Veg' : diet === 'JAIN' ? 'Jain' : 'Non-Veg'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-2.5 sm:px-3 py-2 bg-jaman-cream border-b border-jaman-border flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-3 min-h-[40px] rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${selectedCategory === 'ALL' ? 'bg-jaman-saffron text-white shadow-xs' : 'bg-white text-slate-600 border border-jaman-border'}`}
                  >
                    All Dishes ({menuItems.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${selectedCategory === cat.id ? 'bg-jaman-saffron text-white shadow-xs' : 'bg-white text-slate-600 border border-jaman-border'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="flex-1 p-2.5 sm:p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 content-start min-h-0">
                  {filteredMenuItems.length === 0 && (
                    <div className="col-span-full text-center py-10 text-sm font-bold text-slate-500" data-testid="captain-empty-menu">
                      {menuItems.length === 0
                        ? 'No dishes yet. The menu loads from the cloud within a few seconds; if it stays empty, add dishes in Restaurant Admin.'
                        : 'No dishes match this search or filter.'}
                    </div>
                  )}
                  {filteredMenuItems.map((item) => {
                    const soldOut = item.isAvailable === false;
                    return (
                      <div
                        key={item.id}
                        onClick={() => { if (!soldOut) setCustomizingItem(item); }}
                        aria-disabled={soldOut}
                        className={`bg-white border border-jaman-border rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between gap-1.5 shadow-2xs transition-all ${soldOut ? 'opacity-50 cursor-not-allowed' : 'hover:border-jaman-saffron hover:shadow-md active:scale-98 cursor-pointer'}`}
                      >
                        <div className="w-full h-14 sm:h-24 rounded-xl bg-slate-100 overflow-hidden relative">
                          <CachedImg
                            src={item.imageUrl || '/assets/menu/common/fallback-dish.svg'}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/assets/menu/common/fallback-dish.svg'; }}
                          />
                          <span className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full ${item.dietaryType === 'VEG' ? 'bg-emerald-500 ring-2 ring-white' : 'bg-rose-500 ring-2 ring-white'}`} />
                          {soldOut && <span className="absolute inset-x-0 bottom-0 bg-rose-600 text-white text-[10px] font-black text-center py-0.5 uppercase">Sold out</span>}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-xs sm:text-sm text-jaman-navy line-clamp-2 leading-tight">{item.name}</h4>
                          <span className="text-[10px] text-slate-400 font-bold block mt-0.5 truncate">{item.kitchenStation || 'Kitchen'}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="font-black font-mono text-xs sm:text-sm text-jaman-navy">{formatINR(item.price)}</span>
                          {/* Adds with the default options; tapping the card opens Customize for a real change. */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addItemToCart(item, [], '', 'COURSE_1', 1); }}
                            className="w-10 h-10 rounded-xl bg-[#FFF4ED] text-jaman-saffron flex items-center justify-center font-black text-base hover:bg-jaman-saffron hover:text-white transition-colors cursor-pointer active:scale-90 disabled:opacity-40"
                            title={soldOut ? 'Sold out' : 'Quick Add'}
                            aria-label={soldOut ? `${item.name} is sold out` : `Add ${item.name}`}
                            disabled={soldOut}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cart: a bar at the bottom on a phone (tap to open), a side column on a tablet */}
              <div className="w-full md:w-72 bg-jaman-cream border-t md:border-t-0 md:border-l border-jaman-border flex flex-col shrink-0 md:min-h-0">
                <button
                  type="button"
                  onClick={() => setCartOpen((o) => !o)}
                  aria-expanded={cartOpen}
                  className="md:hidden min-h-[44px] px-3 flex items-center justify-between text-xs font-black text-slate-600 uppercase tracking-wider cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">{cartOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />} Cart ({billable.length})</span>
                  <span className="font-mono text-sm text-jaman-navy normal-case">{formatINR(total)}</span>
                </button>
                <div className="hidden md:flex items-center justify-between px-4 pt-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Live Cart ({billable.length})</span>
                  <button type="button" onClick={() => setActiveWorkspaceTab('ORDER')} className="text-xs font-bold text-jaman-saffron hover:underline cursor-pointer">View Full Order</button>
                </div>
                <div className={`${cartOpen ? 'block' : 'hidden'} md:block px-3 md:px-4 py-2 space-y-2 overflow-y-auto max-h-[38dvh] md:max-h-none md:flex-1 min-h-0`}>
                  {billable.length === 0 && <p className="text-xs text-slate-500 font-medium py-2">Nothing added yet.</p>}
                  {billable.map((ci) => (
                    <div key={ci.id} className="p-2.5 rounded-xl bg-white border border-jaman-border flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-jaman-navy block truncate">{ci.menuItem.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{formatINR(ci.unitPrice)} × {ci.quantity}{ci.isFired ? ' · sent' : ''}</span>
                      </div>
                      {!ci.isFired && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => updateCartQuantity(ci.id, -1)} aria-label="One less" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-jaman-navy font-bold flex items-center justify-center cursor-pointer">−</button>
                          <span className="font-bold font-mono text-xs w-5 text-center">{ci.quantity}</span>
                          <button type="button" onClick={() => updateCartQuantity(ci.id, 1)} aria-label="One more" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-jaman-navy font-bold flex items-center justify-center cursor-pointer">+</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-3 md:p-4 md:border-t border-jaman-border space-y-2">
                  <div className="hidden md:flex justify-between text-xs font-bold text-slate-600">
                    <span>Total:</span>
                    <span className="font-mono text-sm font-black text-jaman-navy">{formatINR(total)}</span>
                  </div>
                  {fireButtons}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CaptainModifierModal
        item={customizingItem}
        isOpen={!!customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={(it, mods, nts, crs, qty) => {
          addItemToCart(it, mods, nts, crs, qty);
          setCustomizingItem(null);
        }}
      />

      <CaptainCancelDishModal dish={cancelling} onClose={() => setCancelling(null)} onCancelled={() => setCancelling(null)} />
      <CaptainCustomerModal />
    </div>
  );
};
