import { create } from 'zustand';
import { Cart, CartItem, CustomerAccount, DiningTable, DraftCartSession, InstantBillConfig, KOTRecord, ManagerOverrideAction, MenuItem, Order, OrderType, PaymentMethod, SelectedModifier, User, PaymentSplit } from '@jamanvaar/types';
import { CustomerRepository, AuditRepository, db, HeldOrderRepository, KOTRepository, OrderRepository, ReceiptRepository, StaffRepository, InventoryRepository, ShiftRepository, TableRepository, financialRequestFingerprint } from '@jamanvaar/database';
import { getTerminalId } from '@jamanvaar/database';
import { PosPrinterService } from '../services/printerService';
import { Platform } from '@jamanvaar/api';
import { PosRecoveryService } from '../services/recoveryService';
import { lanMeshSync, SyncOutboxEngine, StaffSession, verifyPinWithSync, type RefundApprovalScope } from '@jamanvaar/sync';
import { deviceFetch as posDeviceFetch } from '../cloud/cloudClient';
import { SessionPersistence, AuthStatus, calculateCart, resolveModifierGroups, dishNeedsChoiceBeforeAdd, clampItemQuantity, validateModifiers, priceSavedUnpaidOrder } from '@jamanvaar/business';
import { generateUUID } from '@jamanvaar/utils';
import { outstandingBillAmount } from '@jamanvaar/utils';

export type PosTab =
  | 'MENU'
  | 'TABLES'
  | 'ORDERS'
  | 'BILLS'
  | 'KOT'
  | 'CUSTOMERS'
  | 'SHIFTS'
  | 'DAYS'
  | 'REPORTS'
  | 'INVENTORY'
  | 'SETTINGS';

export interface DeliveryDetails {
  name: string;
  phone: string;
  address: string;
  landmark?: string;
  deliveryCharge: number;
  instructions?: string;
}

const EMPTY_CART: Cart = {
  items: [],
  subtotal: 0,
  discountAmount: 0,
  discountType: 'NONE',
  discountValue: 0,
  discountScope: 'BILL',
  discountReason: '',
  cgstAmount: 0,
  sgstAmount: 0,
  taxAmount: 0,
  serviceChargeAmount: 0,
  tipAmount: 0,
  roundOffAmount: 0,
  totalPayable: 0
};

/** The result of any action that may replace the active cart: `ok` when it proceeded, or a reason the cashier can act on when the active cart's unsent work blocked it. */
export type CartSwitchResult = { ok: true } | { ok: false; reason: string };

interface PosState {
  // Authentication & Session
  currentUser: (User & { pinCode?: string }) | null;
  /** Formal auth state machine — never use raw boolean for guard logic */
  authStatus: AuthStatus;
  /** Backward-compat shim: true only when authStatus === AUTHENTICATED */
  isAuthenticated: boolean;
  isLocked: boolean;
  posTerminalId: string;
  isOnline: boolean;
  hardwareStatus: {
    localDb: boolean;
    internet: boolean;
    printer: boolean;
    kds: boolean;
    cashDrawer: boolean;
  };

  // Navigation & Filtering
  activeTab: PosTab;
  orderInboxMode: 'ALL' | 'COLLECTIONS';
  setOrderInboxMode: (mode: 'ALL' | 'COLLECTIONS') => void;
  selectedCategory: string; // 'ALL' or category id
  dietaryFilter: 'ALL' | 'VEG' | 'JAIN' | 'NON_VEG';
  searchQuery: string;

  // Active Order State
  orderType: OrderType;
  selectedTable: DiningTable | null;
  selectedCustomer: CustomerAccount | null;
  deliveryDetails: DeliveryDetails;
  guestCount: number;
  cart: Cart;
  billDiscountPercent: number;
  billDiscountFlat: number;
  discountScope: 'BILL' | 'ITEMS';
  discountType: 'PERCENTAGE' | 'FIXED' | 'NONE';
  discountValue: number;
  discountReason: string;
  discountCode: string;
  orderNotes: string;
  /** Id of the running (sent to kitchen, not yet paid) order this cart belongs to, for counter/takeaway orders. */
  runningOrderId: string | null;
  /**
   * The running order's own updatedAt the moment it was loaded into this cart — simultaneous-edit
   * protection. If the live order's updatedAt has since moved on from a DIFFERENT terminal, this
   * cashier is about to send KOT or collect payment against a bill someone else already changed.
   */
  cartOrderBaseline: { orderId: string; updatedAt: string } | null;
  recoverableDraft: DraftCartSession | null;

  // Active Modals & Dialogs
  customizingItem: MenuItem | null;
  isDiscountModalOpen: boolean;
  isPaymentOpen: boolean;
  isReceiptOpen: boolean;
  isPrintQueueOpen: boolean;
  isShiftModalOpen: boolean;
  isCashDrawerModalOpen: boolean;
  isGlobalSearchOpen: boolean;
  isShortcutsOpen: boolean;
  isChatbotOpen: boolean;
  isHoldOrdersOpen: boolean;
  lastCompletedOrder: Order | null;

  // Manager Override
  pendingOverride: {
    action: ManagerOverrideAction;
    title: string;
    details?: string;
    onApprove: (managerName: string) => void | Promise<void>;
    approvalScope?: RefundApprovalScope;
  } | null;

  // Data Actions
  loginWithPin: (pin: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  /** Called once on app start to restore persisted session (no PIN required) */
  restoreSession: () => void;
  lockTerminal: () => void;
  unlockTerminal: (pin: string) => Promise<boolean>;
  toggleNetworkStatus: () => void;

  setActiveTab: (tab: PosTab) => void;
  setSelectedCategory: (catId: string) => void;
  setDietaryFilter: (filter: 'ALL' | 'VEG' | 'JAIN' | 'NON_VEG') => void;
  setSearchQuery: (query: string) => void;

  setOrderType: (type: OrderType) => void;
  setSelectedTable: (table: DiningTable | null) => void;
  setSelectedCustomer: (customer: CustomerAccount | null) => void;
  selectLoyaltyReward: (rewardId: string) => void;
  setDeliveryDetails: (details: Partial<DeliveryDetails>) => void;
  setGuestCount: (count: number) => void;
  setOrderNotes: (notes: string) => void;

  addItemToCart: (
    item: MenuItem,
    selectedModifiers?: SelectedModifier[],
    specialInstructions?: string,
    quantity?: number
  ) => void;
  /** The one add-to-cart decision every entry point (card tap, quick-add chip, search result, speed bar) must call: opens the customization sheet when the dish has a required choice or a minimum quantity above one, otherwise adds it directly with its defaults. */
  quickAddOrCustomize: (item: MenuItem) => void;
  updateItemQuantity: (cartItemId: string, delta: number) => void;
  updateItemCustomization: (
    cartItemId: string,
    modifiers: SelectedModifier[],
    instructions: string
  ) => void;
  updateItemSpecialInstructions: (cartItemId: string, instructions: string) => void;
  removeItemFromCart: (cartItemId: string) => void;
  /**
   * Cancelling a line that has already reached the kitchen (kotSentQty > 0) is a different action
   * from removing an un-sent one: it needs a reason, it must tell the kitchen ticket to stop, and it
   * must never silently vanish from the bill. Returns false for a missing/unsent line; rejects a
   * closed, collected or changed bill. The cart adopts cancellation only after acknowledgement.
   */
  cancelSentItemDurably: (cartItemId: string, reason: string) => Promise<boolean>;
  applyBillDiscountPercent: (percent: number) => void;
  applyBillDiscountFlat: (amount: number) => void;
  applyDiscount: (params: {
    scope: 'BILL' | 'ITEMS';
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    reason: string;
    code?: string;
    itemIds?: string[];
  }) => void;
  /** Internal — applies a discount without the SEC-013 manager-approval gate. Only call directly from within applyDiscount's own override-approved callback. */
  applyDiscountUnchecked: (params: {
    scope: 'BILL' | 'ITEMS';
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    reason: string;
    code?: string;
    itemIds?: string[];
  }) => void;
  removeDiscount: () => void;
  setIsDiscountModalOpen: (open: boolean) => void;
  clearCart: () => void;

  holdCurrentOrder: (label?: string) => boolean;
  recallHeldOrder: (heldId: string) => CartSwitchResult;

  repeatOrder: (order: Order) => Cart;
  repeatLastOrder: () => Cart | null;

  sendKOT: () => KOTRecord[] | null;
  sendKOTDurably: () => Promise<KOTRecord[] | null>;
  completePayment: (
    method: PaymentMethod,
    tenderedAmount?: number,
    transactionId?: string,
    splits?: PaymentSplit[]
  ) => Order | null;
  completePaymentDurably: (
    method: PaymentMethod,
    tenderedAmount?: number,
    transactionId?: string,
    splits?: PaymentSplit[],
    confirmation?: Order['paymentConfirmation'],
    options?: { autoPrint?: boolean; sendKotBeforeBill?: boolean; orderType?: OrderType; instant?: boolean }
  ) => Promise<Order | null>;

  setCustomizingItem: (item: MenuItem | null) => void;
  setIsPaymentOpen: (open: boolean) => void;
  setIsReceiptOpen: (open: boolean) => void;
  setIsPrintQueueOpen: (open: boolean) => void;
  setIsShiftModalOpen: (open: boolean) => void;
  setIsCashDrawerModalOpen: (open: boolean) => void;
  setIsGlobalSearchOpen: (open: boolean) => void;
  setIsShortcutsOpen: (open: boolean) => void;
  setIsChatbotOpen: (open: boolean) => void;
  setIsHoldOrdersOpen: (open: boolean) => void;
  setLastCompletedOrder: (order: Order | null) => void;

  isInstantBillProcessing: boolean;
  isInstantBillConfirmationOpen: boolean;
  setIsInstantBillConfirmationOpen: (open: boolean) => void;
  executeInstantBill: (overridePaymentMethod?: PaymentMethod) => Promise<Order | null>;
  updateInstantBillConfig: (config: Partial<InstantBillConfig>) => void;

  requestManagerOverride: (
    action: ManagerOverrideAction,
    title: string,
    details?: string,
    onApprove?: (managerName: string) => void | Promise<void>,
    approvalScope?: RefundApprovalScope
  ) => void;
  closeOverrideModal: () => void;

  loadOrderFromTable: (table: DiningTable) => CartSwitchResult;
  /** Same cart-loading behaviour as loadOrderFromTable, but by order id directly — for settling a
   * bill from Live Orders or a bill-request notification, where a table may not even apply
   * (takeaway/delivery orders can also sit in Live Orders awaiting settlement). */
  loadOrderForSettlement: (orderId: string) => CartSwitchResult;
  /**
   * Simultaneous-edit protection: call right before sending KOT or opening payment on a cart bound
   * to a running order. Compares the live order's updatedAt against this cart's own baseline (taken
   * when the order was loaded) — if it moved on and the change came from a DIFFERENT terminal, this
   * cart is stale and must not send/bill against it until refreshed.
   */
  checkConcurrentEdit: () => CartSwitchResult;
  openCashDrawer: () => void;
  recoverDraftSession: () => void;
  discardDraftSession: () => void;
}

/**
 * SEC-013 fix: the >25% / >₹500 manager-approval threshold used to be checked
 * only inside PosDiscountModal.tsx — a UI component, not the store action that
 * actually mutates the cart. Any other caller of `applyDiscount` (or the same
 * function called directly via devtools, since this is a fully client-side
 * app with no server round-trip) could skip that dialog entirely and apply an
 * unlimited discount. Exported so the modal and the store enforce the exact
 * same rule instead of two copies that could drift.
 */
export function isManagerOrAboveRole(user: { roleId?: string } | null | undefined): boolean {
  return user?.roleId === 'role-manager' || user?.roleId === 'role-owner' || user?.roleId === 'role-super-admin';
}

/**
 * security-audit MED-08: the old check compared only the per-application
 * parameter (e.g. "is this single ₹499 discount over ₹500?") against the
 * threshold, so a cashier could select every item in the bill and apply a
 * ₹499 FIXED discount to each in one ITEMS-scope call — no single value ever
 * crosses ₹500, but the bill's actual cash impact could be near-total. This
 * computes the real rupee impact of the specific application (summed across
 * every affected item for ITEMS scope) so the threshold reflects what the
 * bill actually loses, not the shape of the parameter that produced it.
 */
export function computeDiscountImpactRupees(
  params: { scope: 'BILL' | 'ITEMS'; type: 'PERCENTAGE' | 'FIXED'; value: number; itemIds?: string[] },
  cartItems: CartItem[]
): number {
  if (params.scope === 'BILL') {
    if (params.type === 'FIXED') return params.value;
    const subtotal = cartItems.reduce((s, it) => s + it.itemTotal, 0);
    return Math.round((subtotal * params.value) / 100);
  }
  const targets =
    params.itemIds && params.itemIds.length > 0
      ? cartItems.filter((it) => params.itemIds!.includes(it.cartItemId))
      : cartItems;
  if (params.type === 'FIXED') {
    return targets.reduce((s, it) => s + Math.min(it.itemTotal, params.value), 0);
  }
  return targets.reduce((s, it) => s + Math.round((it.itemTotal * params.value) / 100), 0);
}

export function isHighDiscount(
  params: { scope: 'BILL' | 'ITEMS'; type: 'PERCENTAGE' | 'FIXED'; value: number; itemIds?: string[] },
  cartItems: CartItem[]
): boolean {
  if (params.type === 'PERCENTAGE' && params.value > 25) return true;
  return computeDiscountImpactRupees(params, cartItems) > 500;
}

// Robust Indian Restaurant Tax, Discount & Round-off Calculation
function recomputeCart(
  items: CartItem[],
  discountType: 'PERCENTAGE' | 'FIXED' | 'COUPON' | 'NONE' = 'NONE',
  discountValue: number = 0,
  discountScope: 'BILL' | 'ITEMS' = 'BILL',
  discountReason?: string,
  discountCode?: string
): Cart {
  return calculateCart({
    items,
    taxGroups: db.taxGroups,
    discountType,
    discountValue,
    discountScope,
    discountReason,
    discountCode
  });
}

function preserveAcceptedCartLines(cart: Cart, order: Order): Cart {
  return { ...cart, items: cart.items.map(line => {
    const saved = order.items.find(saved => saved.id === line.orderItemId && saved.kitchenStatus !== 'CANCELLED');
    if (!saved || saved.quantity !== line.quantity || (line.kotSentQty ?? 0) < line.quantity) return line;
    return { ...line, unitPrice: saved.unitPrice, itemTotal: saved.totalPrice, taxSnapshot: saved.snapshot,
      itemDiscountPercent: saved.itemDiscountPercent, itemDiscountAmount: saved.itemDiscountAmount, discountReason: saved.discountReason,
      item: { ...line.item, price: saved.unitPrice - (saved.modifiers ?? []).reduce((sum, modifier) => sum + (modifier.priceDelta ?? 0), 0) } };
  }) };
}

function restoreSavedCart(cart: Cart, order: Order): Cart {
  return { ...preserveAcceptedCartLines(cart, order), subtotal: order.subtotal, discountAmount: order.discountAmount,
    discountType: order.discountType || (order.discountAmount ? 'FIXED' : 'NONE'), discountValue: order.discountValue ?? order.discountAmount ?? 0,
    discountScope: order.discountScope ?? 'BILL', discountReason: order.discountReason, discountCode: order.discountCode,
    cgstAmount: order.cgstAmount, sgstAmount: order.sgstAmount, taxAmount: order.taxAmount, totalPayable: order.totalAmount,
    roundOffAmount: order.roundOffAmount, serviceChargeAmount: order.serviceChargeAmount, tipAmount: order.tipAmount,
    loyaltyRedemption: order.loyaltyRedemption };
}

function savedDiscountState(order: Order) {
  // The editor supports manual discounts. Keep an accepted coupon's amount
  // here; reopening a bill must not run today's coupon rules again.
  const type = order.discountType === 'COUPON' ? 'FIXED' : order.discountType || (order.discountAmount ? 'FIXED' : 'NONE');
  const value = order.discountType === 'COUPON' ? order.discountAmount : order.discountValue ?? order.discountAmount ?? 0;
  return { discountType: type, discountValue: value, discountScope: order.discountScope ?? 'BILL',
    discountReason: order.discountReason ?? '', discountCode: order.discountCode ?? '',
    billDiscountPercent: type === 'PERCENTAGE' ? value : 0, billDiscountFlat: type === 'FIXED' ? value : 0 };
}


// ---- running-order helpers (BUG-032) -------------------------------------
function newOrderItemId(idx: number): string {
  return `oi-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Gives every cart line a stable link to its order line. */
function linkCartItems(items: CartItem[]): CartItem[] {
  return items.map((ci, idx) => (ci.orderItemId ? ci : { ...ci, orderItemId: newOrderItemId(idx) }));
}

function cartLinesToOrderItems(items: CartItem[], existing?: Order['items']): Order['items'] {
  return items.map((ci) => {
    const prior = existing?.find((o) => o.id === ci.orderItemId);
    return {
      id: ci.orderItemId as string,
      orderId: prior?.orderId || '',
      menuItemId: ci.menuItemId,
      name: ci.item.name,
      sku: ci.item.sku,
      quantity: ci.quantity,
      unitPrice: ci.unitPrice,
      modifiers: ci.selectedModifiers,
      specialInstructions: ci.specialInstructions,
      totalPrice: ci.itemTotal,
      snapshot: ci.taxSnapshot ?? prior?.snapshot,
      itemDiscountPercent: ci.itemDiscountPercent,
      itemDiscountAmount: ci.itemDiscountAmount,
      discountReason: ci.discountReason,
      kitchenStatus: prior?.kitchenStatus || ('PREPARING' as const),
      // What the kitchen, the Captain and a cancellation recorded on this line survives the counter re-saving the order.
      ...(prior?.statusRev ? { statusRev: prior.statusRev } : {}),
      ...(prior?.course ? { course: prior.course } : {}),
      ...(prior?.sentAt ? { sentAt: prior.sentAt } : {}),
      ...(prior?.readyAt ? { readyAt: prior.readyAt } : {}),
      ...(prior?.cancelReason ? { cancelReason: prior.cancelReason } : {}),
      ...(prior?.cancelledAmount !== undefined ? { cancelledAmount: prior.cancelledAmount, cancelledBy: prior.cancelledBy, cancelledAt: prior.cancelledAt } : {}),
      ...((ci.seat ?? prior?.seat) ? { seat: (ci.seat ?? prior?.seat) as number } : {})
    };
  });
}

/** The order this cart is already attached to (table order or counter running order), if it is still open. */
function findRunningOrder(state: { selectedTable: DiningTable | null; runningOrderId: string | null }): Order | null {
  const byTable = state.selectedTable?.currentOrderId ? OrderRepository.getOrderById(state.selectedTable.currentOrderId) : null;
  const byRunning = state.runningOrderId ? OrderRepository.getOrderById(state.runningOrderId) : null;
  const found = byTable || byRunning || null;
  if (!found) return null;
  if (found.paymentStatus === 'SUCCESS' || found.orderStatus === 'CANCELLED' || found.orderStatus === 'REFUNDED') return null;
  return found;
}

/**
 * Called right before an action is about to REPLACE the active cart with a different cart (recalling
 * a held order, opening a table's existing order, settling an order from Live Orders/a bill request).
 * An empty cart has nothing to protect. A cart bound to a running kitchen order is already safe in
 * that order's own record, UNLESS it has unsent line edits — those are refused rather than silently
 * dropped, so the cashier sends the KOT or finishes editing before switching away. A cart that is NOT
 * bound to any running order is unsaved local work: it is parked as a new held order automatically so
 * opening someone else's bill can never erase it, matching holdCurrentOrder's own hold shape.
 */
function protectActiveCartBeforeSwitch(state: PosState): { ok: true } | { ok: false; reason: string } {
  if (state.cart.items.length === 0) return { ok: true };
  if (findRunningOrder(state)) {
    const hasUnsent = state.cart.items.some((ci) => ci.quantity > (ci.kotSentQty || 0));
    if (hasUnsent) {
      return { ok: false, reason: 'This order has items not yet sent to the kitchen. Send KOT or finish editing it before opening another order.' };
    }
    return { ok: true };
  }
  HeldOrderRepository.holdOrder({
    label: state.selectedTable ? `Table #${state.selectedTable.tableNumber}` : `Takeaway #${Date.now().toString().slice(-4)}`,
    orderType: state.orderType,
    tableNumber: state.selectedTable?.tableNumber,
    customerName: state.selectedCustomer?.name || state.deliveryDetails.name || undefined,
    customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone || undefined,
    cart: state.cart,
    cashierName: state.currentUser?.fullName || 'Cashier',
    notes: state.orderNotes
  });
  return { ok: true };
}

/** Brings an open order's lines and totals in line with the cart, and flags it for cloud sync. */
function syncOrderToCart(order: Order, cart: Cart, actorName?: string, terminalId?: string): void {
  if (order.orderStatus === 'COMPLETED' || order.tableReleasedAt) return;
  // A partially collected QR bill keeps its canonical prices and reward reservation.
  if (order.paymentAllocationSummary?.collectedPaise || (order.source_type === "QR_TABLE" && order.discountAmount > 0)) return;
  const cancelled = order.items.filter(line => line.kitchenStatus === 'CANCELLED');
  if (cart.items.some(line => cancelled.some(old => old.id === line.orderItemId))) throw new Error('A cancelled dish cannot be restored to this bill. Add it as a new line after review.');
  order.items = [...cancelled, ...cartLinesToOrderItems(cart.items, order.items).map((it) => ({ ...it, orderId: order.id }))];
  order.subtotal = cart.subtotal;
  order.discountAmount = cart.discountAmount;
  order.loyaltyRedemption = cart.loyaltyRedemption;
  order.discountType = cart.discountType;
  order.discountValue = cart.discountValue;
  order.discountScope = cart.discountScope;
  order.discountReason = cart.discountReason;
  order.discountCode = cart.discountCode;
  order.cgstAmount = cart.cgstAmount;
  order.sgstAmount = cart.sgstAmount;
  order.taxAmount = cart.taxAmount;
  // B2-019: this copied every other cart total onto the order except roundOffAmount, so a
  // running order's total (correctly rounded, e.g. 409.50 -> 410) stopped agreeing with its own
  // subtotal+tax the moment it was sent to the kitchen and paid for later — the normal POS flow —
  // while the receipt's own "Round Off" line stayed hidden (gated on `roundOffAmount !== 0`,
  // which a stale/never-set 0 always satisfies as "nothing to show").
  order.roundOffAmount = cart.roundOffAmount;
  order.totalAmount = cart.totalPayable;
  order.updatedAt = new Date().toISOString();
  // Simultaneous-edit protection: whoever/whichever terminal last wrote the live order, so a
  // second device that loaded it earlier can tell its own baseline is now stale before it bills.
  if (actorName) order.lastEditedBy = actorName;
  if (terminalId) order.lastEditedByTerminalId = terminalId;
  order.syncStatus = 'SAVED_LOCALLY';
  order.isSynced = false;
  // BUG-044: items added to a running order after the first KOT were never deducted from
  // stock (only order creation deducted). Reconcile consumes just the new/increased quantity.
  InventoryRepository.reconcileOrder(order);
}

function saveDiscountDraft(state: PosState): void {
  PosRecoveryService.saveDraft({
    terminalId: state.posTerminalId, orderType: state.orderType,
    selectedTable: state.selectedTable, selectedCustomer: state.selectedCustomer,
    guestCount: state.guestCount, cart: state.cart,
    billDiscountPercent: state.billDiscountPercent, billDiscountFlat: state.billDiscountFlat,
    notes: state.orderNotes
  });
}

function preparePosTickets(state: PosState) {
      if (state.cart.items.length === 0) return null;

      const boundId = state.runningOrderId ?? state.selectedTable?.currentOrderId;
      const boundOrder = boundId ? OrderRepository.getOrderById(boundId) : undefined;
      if (boundId && !boundOrder) throw new Error('The original table bill is unavailable. Refresh before sending more dishes.');
      if (boundOrder && (boundOrder.paymentStatus === 'SUCCESS' || ['CANCELLED','REFUNDED'].includes(boundOrder.orderStatus))) throw new Error('This bill is already paid or closed. Refresh the order and open its receipt; do not collect payment again.');

      // Only what has not been sent yet goes to the kitchen. Once everything is
      // sent there is nothing to do - this used to create a duplicate order and
      // a duplicate kitchen ticket on every press.
      const linkedItems = linkCartItems(state.cart.items);
      const unsent = linkedItems
        .map((ci) => ({ ci, qty: ci.quantity - (ci.kotSentQty || 0) }))
        .filter((x) => x.qty > 0);
      if (unsent.length === 0) return null;

      // A choice the guest/cashier picked earlier (e.g. a bread or topping) can go out of stock
      // before the dish is actually sent — the cart only holds a copy of what was selected, so it
      // never finds out on its own. Catch that here, before the kitchen gets a ticket for a choice
      // that no longer exists, and name the exact dish/choice so it's obvious what to reopen.
      for (const { ci } of unsent) {
        const currentDish = db.menuItems.find(item => item.id === ci.menuItemId);
        if (!currentDish || !currentDish.isAvailable || !Number.isInteger(ci.quantity) || clampItemQuantity(currentDish, ci.quantity) !== ci.quantity) throw new Error(`Review availability and quantity for ${ci.item.name}.`);
        const choices = validateModifiers(resolveModifierGroups(currentDish, db.modifierGroups), ci.selectedModifiers);
        if (!choices.isValid) throw new Error(`${ci.item.name}: ${choices.errors.join(' ')}`);
      }

      const linkedCart: Cart = { ...state.cart, items: linkedItems };

      // 1. Create the running order, or add the new items to the existing one
      let order = findRunningOrder(state);

      if (!order) {
        order = OrderRepository.createOrder({
          orderType: state.orderType,
          cashierName: state.currentUser?.fullName || 'Cashier',
          tableId: state.selectedTable?.id,
          tableNumber: state.selectedTable?.tableNumber,
          guestCount: state.guestCount,
          customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone,
          customerName: state.selectedCustomer?.name || state.deliveryDetails.name,
          loyaltyRedemption: state.cart.loyaltyRedemption,
          items: cartLinesToOrderItems(linkedItems),
          subtotal: state.cart.subtotal,
          discountAmount: state.cart.discountAmount,
          discountType: state.cart.discountType, discountValue: state.cart.discountValue, discountScope: state.cart.discountScope,
          discountReason: state.cart.discountReason, discountCode: state.cart.discountCode,
          cgstAmount: state.cart.cgstAmount,
          sgstAmount: state.cart.sgstAmount,
          taxAmount: state.cart.taxAmount,
          totalAmount: state.cart.totalPayable,
          // B2-019: this order-creation call (like the other two in this file, and
          // syncOrderToCart above) copied every other cart total but not roundOffAmount, so the
          // stored order kept totalAmount correctly rounded (e.g. 409.50 -> 410) while
          // roundOffAmount silently stayed 0 — the receipt's own "Round Off" line is gated on
          // `roundOffAmount !== 0`, so it never printed, and subtotal+CGST+SGST visibly didn't
          // add up to the total with nothing on the document explaining the ₹0.50 gap.
          roundOffAmount: state.cart.roundOffAmount,
          paymentMethod: 'CASH',
          paymentStatus: 'PENDING',
          orderStatus: 'PREPARING',
          source_type: 'POS',
          syncStatus: 'SAVED_LOCALLY'
        });

        if (state.selectedTable) {
          const liveTable = db.tables.find(table => table.id === state.selectedTable!.id);
          if (liveTable) { liveTable.currentOrderId = order.id; liveTable.status = 'OCCUPIED'; }
        }
      } else {
        syncOrderToCart(order, linkedCart, state.currentUser?.fullName, state.posTerminalId);
        db.notify();
      }

      // 2. Generate KOT record(s) for the NEW items only, routed by kitchen station
      const kotItems = unsent.map(({ ci, qty }, idx) => ({
        id: `koti-${generateUUID()}`,
        orderItemId: ci.orderItemId,
        menuItemId: ci.menuItemId,
        name: ci.item.name,
        quantity: qty,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialInstructions,
        kitchenStation: ci.item.kitchenStation || 'Main Kitchen',
        status: 'PREPARING' as const
      }));

      const kots = KOTRepository.generateKOT({
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        tableNumber: state.selectedTable?.tableNumber,
        orderType: state.orderType,
        items: kotItems,
        cashierName: state.currentUser?.fullName || 'Cashier',
        orderNotes: state.orderNotes || undefined
      });

      return { order, kots, linkedCart, linkedItems };
}

export const usePosStore = create<PosState>((set, get) => {
  // Check for auto-saved crash recovery draft on store initialization
  const initialDraft = PosRecoveryService.loadDraft();

  // ──────────────────────────────────────────────────────
  // Attempt to restore a persisted session synchronously.
  // This runs BEFORE the store is exposed to React, so the
  // very first render will already have the correct state.
  // ──────────────────────────────────────────────────────
  const savedSession = SessionPersistence.load('pos');
  const restoredUser = savedSession
    ? (db.users as (User & { pinCode?: string })[]).find((u) => u.id === savedSession.userId && u.isActive)
    : null;
  const initialAuthStatus: AuthStatus = restoredUser ? 'AUTHENTICATED' : 'UNAUTHENTICATED';

  return {
    currentUser: restoredUser ?? null,
    authStatus: initialAuthStatus,
    isAuthenticated: initialAuthStatus === 'AUTHENTICATED',
    // security-audit LOW-05: a reload used to always come back unlocked,
    // regardless of whether the terminal was locked before the reload —
    // restore the persisted lock state instead of hardcoding false.
    isLocked: initialAuthStatus === 'AUTHENTICATED' && Boolean(savedSession?.locked),
    posTerminalId: getTerminalId('POS'),
    isOnline: true,
    hardwareStatus: {
      localDb: true,
      internet: true,
      printer: true,
      kds: true,
      cashDrawer: true
    },

    activeTab: (savedSession?.activeTab as PosTab) || 'MENU',
    orderInboxMode: 'ALL',
    setOrderInboxMode: (mode) => set({ orderInboxMode: mode }),
    selectedCategory: 'ALL',
    dietaryFilter: 'ALL',
    searchQuery: '',

    orderType: 'DINE_IN',
    selectedTable: null,
    selectedCustomer: null,
    deliveryDetails: {
      name: '',
      phone: '',
      address: '',
      deliveryCharge: 0
    },
    guestCount: 2,
    cart: EMPTY_CART,
    billDiscountPercent: 0,
    billDiscountFlat: 0,
    discountScope: 'BILL',
    discountType: 'NONE',
    discountValue: 0,
    discountReason: '',
    discountCode: '',
    orderNotes: '',
    runningOrderId: null,
    cartOrderBaseline: null,
    recoverableDraft: initialDraft,

    customizingItem: null,
    isDiscountModalOpen: false,
    isPaymentOpen: false,
    isReceiptOpen: false,
    isPrintQueueOpen: false,
    isShiftModalOpen: false,
    isCashDrawerModalOpen: false,
    isGlobalSearchOpen: false,
    isShortcutsOpen: false,
    isChatbotOpen: false,
    isHoldOrdersOpen: false,
    lastCompletedOrder: null,

    pendingOverride: null,

    restoreSession: () => {
      // This is a no-op if the store was already initialized synchronously above.
      // It exists as an explicit hook for components that want to trigger a re-check.
      const session = SessionPersistence.load('pos');
      if (!session) {
        set({ authStatus: 'UNAUTHENTICATED', isAuthenticated: false, currentUser: null });
        return;
      }
      const user = (db.users as (User & { pinCode?: string })[]).find(
        (u) => u.id === session.userId && u.isActive
      );
      if (user) {
        set({
          currentUser: user,
          authStatus: 'AUTHENTICATED',
          isAuthenticated: true,
          // security-audit LOW-05: restore the persisted lock state, not a
          // hardcoded unlocked — see lockTerminal/unlockTerminal below.
          isLocked: Boolean(session.locked),
          posTerminalId: getTerminalId('POS'),
          activeTab: (session.activeTab as PosTab) || get().activeTab
        });
      } else {
        SessionPersistence.clear('pos');
        set({ authStatus: 'UNAUTHENTICATED', isAuthenticated: false, currentUser: null });
      }
    },

    loginWithPin: async (pin: string, userId: string) => {
      // The PIN opens only the staff member who was selected on the screen, never whoever else shares it.
      const result = await verifyPinWithSync(pin, undefined, userId);
      const user = result?.user;

      if (user && !StaffRepository.canUseTerminal(user.roleId, 'POS')) {
        return { success: false, error: StaffRepository.terminalDeniedMessage(user.roleId, 'POS') };
      }

      if (user) {
        // Persist session to localStorage (no PIN stored)
        SessionPersistence.save('pos', {
          userId: user.id,
          fullName: user.fullName,
          roleId: user.roleId,
          restaurantId: user.restaurantId || db.restaurant.id,
          terminalId: get().posTerminalId,
          activeTab: get().activeTab
        });
        set({
          currentUser: user,
          authStatus: 'AUTHENTICATED',
          isAuthenticated: true,
          isLocked: false
        });
        // The server signs this person in so what they do can be attributed to a named, role-checked staff member (best effort offline).
        void StaffSession.signIn(pin, posDeviceFetch);
        AuditRepository.log({
          action: 'LOGIN_SUCCESS',
          category: 'AUTH',
          details: `Staff member ${user.fullName} unlocked POS Terminal session`,
          username: user.fullName
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid 4-digit PIN' };
    },

    logout: () => {
      AuditRepository.log({
        action: 'LOGOUT',
        category: 'AUTH',
        details: `Cashier logged out of terminal`,
        username: get().currentUser?.fullName || 'Cashier'
      });
      // Clear persisted session — next reload will show login
      SessionPersistence.clear('pos');
      StaffSession.clear();
      set({
        currentUser: null,
        authStatus: 'UNAUTHENTICATED',
        isAuthenticated: false,
        isLocked: false
      });
    },

    lockTerminal: () => {
      AuditRepository.log({
        action: 'TERMINAL_LOCKED',
        category: 'AUTH',
        details: `Terminal locked by cashier`,
        username: get().currentUser?.fullName || 'Cashier'
      });
      // security-audit LOW-05: lock state used to live only in this in-memory
      // store — a webview reload (Ctrl+R, the crash-recovery "Restore
      // Workspace" button) re-initialized the store from the still-valid
      // persisted session with no lock recorded, dropping straight back into
      // the previous user's unlocked session with no PIN prompt.
      SessionPersistence.update('pos', { locked: true });
      set({ isLocked: true });
    },

    unlockTerminal: async (pin: string) => {
      const result = await verifyPinWithSync(pin);
      if (result) {
        SessionPersistence.update('pos', { locked: false });
        set({ isLocked: false });
        void StaffSession.signIn(pin, posDeviceFetch); // whoever unlocks is who is now at the counter
        return true;
      }
      return false;
    },

    toggleNetworkStatus: () => {
      const nextOnline = !get().isOnline;
      set((s) => ({
        isOnline: nextOnline,
        hardwareStatus: {
          ...s.hardwareStatus,
          internet: nextOnline
        }
      }));
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
      // Keep session activeTab in sync for deep-link restoration on refresh
      SessionPersistence.update('pos', { activeTab: tab });
    },
    setSelectedCategory: (catId) => set({ selectedCategory: catId }),
    setDietaryFilter: (filter) => set({ dietaryFilter: filter }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    setOrderType: (type) => {
      set({ orderType: type });
      PosRecoveryService.saveDraft({
        terminalId: get().posTerminalId,
        orderType: type,
        selectedTable: get().selectedTable,
        selectedCustomer: get().selectedCustomer,
        guestCount: get().guestCount,
        cart: get().cart,
        billDiscountPercent: get().billDiscountPercent,
        billDiscountFlat: get().billDiscountFlat,
        notes: get().orderNotes
      });
    },

    setSelectedTable: (table) => {
      set({ selectedTable: table });
      if (table) {
        set({ orderType: 'DINE_IN' });
      }
      PosRecoveryService.saveDraft({
        terminalId: get().posTerminalId,
        orderType: get().orderType,
        selectedTable: table,
        selectedCustomer: get().selectedCustomer,
        guestCount: get().guestCount,
        cart: get().cart,
        billDiscountPercent: get().billDiscountPercent,
        billDiscountFlat: get().billDiscountFlat,
        notes: get().orderNotes
      });
    },

    setSelectedCustomer: (customer) => {
      if (get().cart.loyaltyRedemption && customer?.phone !== get().selectedCustomer?.phone) get().removeDiscount();
      set({ selectedCustomer: customer });
      PosRecoveryService.saveDraft({
        terminalId: get().posTerminalId,
        orderType: get().orderType,
        selectedTable: get().selectedTable,
        selectedCustomer: customer,
        guestCount: get().guestCount,
        cart: get().cart,
        billDiscountPercent: get().billDiscountPercent,
        billDiscountFlat: get().billDiscountFlat,
        notes: get().orderNotes
      });
    },

    selectLoyaltyReward: (rewardId) => {
      const state = get();
      const customer = CustomerRepository.getByPhone(state.selectedCustomer?.phone ?? '');
      const reward = CustomerRepository.getRewards().find(r => r.id === rewardId && r.isActive);
      if (!customer || !reward || !state.cart.items.length || CustomerRepository.getProgramSettings().enabled === false) throw new Error('Select a customer and an active loyalty reward');
      if (!Number.isSafeInteger(reward.pointsCost) || reward.pointsCost <= 0 || customer.loyaltyPoints < reward.pointsCost) throw new Error('Not enough points for this reward');
      const discountAmount = CustomerRepository.rewardDiscount(reward, state.cart.items, state.cart.subtotal);
      if (discountAmount <= 0) throw new Error('This reward needs an eligible item or a configured discount value');
      // The owner explicitly authorizes catalog rewards; arbitrary manual discounts retain their PIN gate.
      get().removeDiscount();
      get().applyDiscountUnchecked({ scope: 'BILL', type: 'FIXED', value: discountAmount, reason: `Loyalty reward: ${reward.name}` });
      const cart = { ...get().cart, loyaltyRedemption: { rewardId, name: reward.name, pointsCost: reward.pointsCost, discountAmount, customerPhone: customer.phone } };
      set({ cart, selectedCustomer: customer });
      PosRecoveryService.saveDraft({ terminalId: state.posTerminalId, orderType: state.orderType, selectedTable: state.selectedTable, selectedCustomer: customer, guestCount: state.guestCount, cart, billDiscountPercent: 0, billDiscountFlat: discountAmount, notes: state.orderNotes });
    },

    setDeliveryDetails: (details) =>
      set((s) => ({ deliveryDetails: { ...s.deliveryDetails, ...details } })),

    setGuestCount: (count) => set({ guestCount: count }),
    setOrderNotes: (notes) => {
      set({ orderNotes: notes });
      // Chef notes are order-wide, not a per-item field, so they must be part of the same
      // recovery draft as the cart itself — otherwise a reload after typing a note loses it
      // even though the dishes survive.
      saveDiscountDraft(get());
    },

    setCustomizingItem: (item) => set({ customizingItem: item }),
    setIsPaymentOpen: (open) => set({ isPaymentOpen: open }),
    setIsReceiptOpen: (open) => set({ isReceiptOpen: open }),
    setIsPrintQueueOpen: (open) => set({ isPrintQueueOpen: open }),
    setIsShiftModalOpen: (open) => set({ isShiftModalOpen: open }),
    setIsCashDrawerModalOpen: (open) => set({ isCashDrawerModalOpen: open }),
    setIsGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
    setIsShortcutsOpen: (open) => set({ isShortcutsOpen: open }),
    setIsChatbotOpen: (open) => set({ isChatbotOpen: open }),
    setIsHoldOrdersOpen: (open) => set({ isHoldOrdersOpen: open }),
    setLastCompletedOrder: (order) => set({ lastCompletedOrder: order }),

    addItemToCart: (
      item: MenuItem,
      selectedModifiers: SelectedModifier[] = [],
      specialInstructions: string = '',
      quantity: number = 1
    ) => {
      if (item.allergens?.length && !specialInstructions.includes('Declared allergens:')) specialInstructions = [specialInstructions, 'Declared allergens: ' + item.allergens.join(', ')].filter(Boolean).join(' | ');
      // 1. Central Item Availability Protection: never add unavailable dishes
      if (item.isAvailable === false) {
        console.warn(`Cannot add unavailable dish "${item.name}" to cart.`);
        return;
      }
      // 2. Configured quantity rules apply no matter which screen added the dish.
      quantity = clampItemQuantity(item, quantity);

      const state = get();
      const modifierDelta = selectedModifiers.reduce((acc, m) => acc + (m.priceDelta || 0), 0);
      const unitPrice = item.price + modifierDelta;
      const itemTotal = unitPrice * quantity;

      // Check if identical item with identical modifiers and instructions already exists
      const existingIdx = state.cart.items.findIndex(
        (ci) =>
          ci.menuItemId === item.id &&
          ci.specialInstructions === specialInstructions &&
          JSON.stringify(ci.selectedModifiers) === JSON.stringify(selectedModifiers)
      );

      let newItems: CartItem[];

      if (existingIdx !== -1) {
        newItems = [...state.cart.items];
        const existing = newItems[existingIdx];
        const newQty = clampItemQuantity(item, existing.quantity + quantity);
        newItems[existingIdx] = {
          ...existing,
          quantity: newQty,
          itemTotal: existing.unitPrice * newQty
        };
      } else {
        const newCartItem: CartItem = {
          cartItemId: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          menuItemId: item.id,
          item,
          quantity,
          unitPrice,
          selectedModifiers,
          specialInstructions,
          itemTotal
        };
        newItems = [...state.cart.items, newCartItem];
      }

      const updatedCart = recomputeCart(
        newItems,
        state.discountType,
        state.discountValue,
        state.discountScope,
        state.discountReason,
        state.discountCode
      );

      set({ cart: { ...updatedCart, loyaltyRedemption: state.cart.loyaltyRedemption ? { ...state.cart.loyaltyRedemption, discountAmount: updatedCart.discountAmount } : undefined } });

      // Auto-save draft
      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat,
        notes: state.orderNotes
      });
    },

    quickAddOrCustomize: (item: MenuItem) => {
      if (item.isAvailable === false) {
        console.warn(`Cannot add unavailable dish "${item.name}" to cart.`);
        return;
      }
      const groups = resolveModifierGroups(item, db.modifierGroups);
      if (dishNeedsChoiceBeforeAdd(item, groups)) {
        get().setCustomizingItem(item);
      } else {
        get().addItemToCart(item);
      }
    },

    updateItemQuantity: (cartItemId: string, delta: number) => {
      const state = get();
      const itemIdx = state.cart.items.findIndex((ci) => ci.cartItemId === cartItemId);
      if (itemIdx === -1) return;

      const newItems = [...state.cart.items];
      const target = newItems[itemIdx];
      const rawQty = target.quantity + delta;

      // Below the dish's configured minimum (default 1) means "remove it", not an invalid partial quantity.
      if (rawQty < (target.item.minQuantity ?? 1)) {
        newItems.splice(itemIdx, 1);
      } else {
        const newQty = clampItemQuantity(target.item, rawQty);
        newItems[itemIdx] = {
          ...target,
          quantity: newQty,
          itemTotal: target.unitPrice * newQty
        };
      }

      const updatedCart = recomputeCart(
        newItems,
        state.discountType,
        state.discountValue,
        state.discountScope,
        state.discountReason,
        state.discountCode
      );

      set({ cart: { ...updatedCart, loyaltyRedemption: state.cart.loyaltyRedemption ? { ...state.cart.loyaltyRedemption, discountAmount: updatedCart.discountAmount } : undefined } });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat,
        notes: state.orderNotes
      });
    },

    updateItemCustomization: (
      cartItemId: string,
      modifiers: SelectedModifier[],
      instructions: string
    ) => {
      const state = get();
      const itemIdx = state.cart.items.findIndex((ci) => ci.cartItemId === cartItemId);
      if (itemIdx === -1) return;

      const newItems = [...state.cart.items];
      const target = newItems[itemIdx];
      const modDelta = modifiers.reduce((acc, m) => acc + (m.priceDelta || 0), 0);
      const unitPrice = target.item.price + modDelta;

      newItems[itemIdx] = {
        ...target,
        selectedModifiers: modifiers,
        specialInstructions: instructions,
        unitPrice,
        itemTotal: unitPrice * target.quantity
      };

      const updatedCart = recomputeCart(
        newItems,
        state.discountType,
        state.discountValue,
        state.discountScope,
        state.discountReason,
        state.discountCode
      );

      set({ cart: { ...updatedCart, loyaltyRedemption: state.cart.loyaltyRedemption ? { ...state.cart.loyaltyRedemption, discountAmount: updatedCart.discountAmount } : undefined } });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat,
        notes: state.orderNotes
      });
    },

    updateItemSpecialInstructions: (cartItemId: string, instructions: string) => {
      const state = get();
      const itemIdx = state.cart.items.findIndex((ci) => ci.cartItemId === cartItemId);
      if (itemIdx === -1) return;

      const newItems = [...state.cart.items];
      newItems[itemIdx] = {
        ...newItems[itemIdx],
        specialInstructions: instructions
      };

      const updatedCart = recomputeCart(
        newItems,
        state.discountType,
        state.discountValue,
        state.discountScope,
        state.discountReason,
        state.discountCode
      );

      set({ cart: { ...updatedCart, loyaltyRedemption: state.cart.loyaltyRedemption ? { ...state.cart.loyaltyRedemption, discountAmount: updatedCart.discountAmount } : undefined } });
      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat,
        notes: state.orderNotes
      });
    },

    removeItemFromCart: (cartItemId: string) => {
      const state = get();
      const newItems = state.cart.items.filter((ci) => ci.cartItemId !== cartItemId);
      const updatedCart = recomputeCart(
        newItems,
        state.discountType,
        state.discountValue,
        state.discountScope,
        state.discountReason,
        state.discountCode
      );

      set({ cart: { ...updatedCart, loyaltyRedemption: state.cart.loyaltyRedemption ? { ...state.cart.loyaltyRedemption, discountAmount: updatedCart.discountAmount } : undefined } });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat,
        notes: state.orderNotes
      });
    },

    cancelSentItemDurably: async (cartItemId, reason) => {
      const current = get();
      const target = current.cart.items.find(line => line.cartItemId === cartItemId);
      if (!target?.orderItemId || !(target.kotSentQty || 0)) return false;
      const state = { ...current, cart: structuredClone(current.cart), selectedTable: current.selectedTable ? { ...current.selectedTable } : null };
      const orderId = current.runningOrderId ?? current.selectedTable?.currentOrderId;
      const cleanReason = reason.trim();
      if (!orderId || cleanReason.length < 3) throw new Error('Keep this bill open and enter a cancellation reason.');
      const saved = await db.commitFinancialMutation(await financialRequestFingerprint(JSON.stringify({ operation: 'POS_CANCEL_SENT_LINE_V1',
        restaurant: db.restaurant.id, branch: db.outlet.id, orderId, lineId: target.orderItemId, reason: cleanReason,
        actor: current.currentUser?.id, terminal: current.posTerminalId })), () => {
        const conflict = get().checkConcurrentEdit();
        if (!conflict.ok) throw new Error(conflict.reason);
        const original = OrderRepository.getOrderById(orderId);
        if (!original || original.tableReleasedAt || ['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(original.orderStatus)) throw new Error('This bill is closed. Ask the cashier to review its original reference.');
        if (original.source_type === 'QR_TABLE') throw new Error('Review this QR order in the order desk before cancelling a submitted line.');
        // Check collection before changing a ticket or its line price.
        priceSavedUnpaidOrder(original, db.menuItems, db.taxGroups);
        const updated = KOTRepository.cancelOrderLine(orderId, target.orderItemId!, cleanReason, current.currentUser?.fullName || 'Cashier');
        if (!updated) throw new Error('This dish can no longer be cancelled. Review its kitchen status.');
        Object.assign(updated, priceSavedUnpaidOrder(updated, db.menuItems, db.taxGroups));
        if (updated.orderStatus === 'CANCELLED') {
          const table = db.tables.find(table => table.currentOrderId === updated.id);
          if (table) TableRepository.updateTableStatus(table.id, 'AVAILABLE');
        }
        db.notify();
        return { orderId };
      });
      const updated = OrderRepository.getOrderById(saved.result.orderId)!;
      const view = get();
      if ((view.runningOrderId ?? view.cartOrderBaseline?.orderId ?? view.selectedTable?.currentOrderId) === updated.id) {
        const remaining = view.cart.items.filter(line => line.cartItemId !== cartItemId);
        const cart = preserveAcceptedCartLines(recomputeCart(remaining, view.discountType, view.discountValue, view.discountScope, view.discountReason, view.discountCode), updated);
        const allSent = remaining.every(line => line.quantity <= (line.kotSentQty ?? 0)) && view.discountType === state.discountType && view.discountValue === state.discountValue;
        const closed = updated.orderStatus === 'CANCELLED';
        set({ runningOrderId: closed ? null : updated.id, cartOrderBaseline: closed ? null : { orderId: updated.id, updatedAt: updated.updatedAt },
          selectedTable: closed && view.selectedTable ? { ...view.selectedTable, currentOrderId: undefined, status: 'AVAILABLE' } : view.selectedTable,
          cart: { ...cart,
          ...(allSent ? { subtotal: updated.subtotal, discountAmount: updated.discountAmount, cgstAmount: updated.cgstAmount,
            sgstAmount: updated.sgstAmount, taxAmount: updated.taxAmount, roundOffAmount: updated.roundOffAmount,
            serviceChargeAmount: updated.serviceChargeAmount, tipAmount: updated.tipAmount, totalPayable: updated.totalAmount } : {}),
          loyaltyRedemption: view.cart.loyaltyRedemption ? { ...view.cart.loyaltyRedemption, discountAmount: cart.discountAmount } : undefined } });
        saveDiscountDraft(get());
      }
      await db.acknowledgeFinancialMutation(saved.operationId);
      void SyncOutboxEngine.flush();
      return true;
    },

    applyBillDiscountPercent: (percent: number) => {
      get().applyDiscount({ scope: 'BILL', type: 'PERCENTAGE', value: percent, reason: 'Bill Discount' });
    },

    applyBillDiscountFlat: (amount: number) => {
      get().applyDiscount({ scope: 'BILL', type: 'FIXED', value: amount, reason: 'Flat Bill Discount' });
    },

    applyDiscount: (params: {
      scope: 'BILL' | 'ITEMS';
      type: 'PERCENTAGE' | 'FIXED';
      value: number;
      reason: string;
      code?: string;
      itemIds?: string[];
    }) => {
      const state = get();

      // SEC-013 fix: enforced here, at the actual mutation boundary, not only
      // in PosDiscountModal.tsx — a discount above the threshold can no longer
      // be applied by any caller (UI, future code, or a direct store call)
      // without a manager PIN, even if a caller skips the dialog that used to
      // be the only place this was checked.
      if (isHighDiscount(params, state.cart.items) && !isManagerOrAboveRole(state.currentUser)) {
        get().requestManagerOverride(
          'HIGH_DISCOUNT',
          `High Discount Approval (${params.type === 'PERCENTAGE' ? `${params.value}%` : `₹${params.value}`})`,
          `Cashier ${state.currentUser?.fullName || ''} is applying ${params.type === 'PERCENTAGE' ? `${params.value}%` : `₹${params.value}`} discount for "${params.reason}".`,
          (managerName) => {
            get().applyDiscountUnchecked({ ...params, reason: `${params.reason} (Approved by ${managerName})` });
          }
        );
        return;
      }

      get().applyDiscountUnchecked(params);
    },

    applyDiscountUnchecked: (params: {
      scope: 'BILL' | 'ITEMS';
      type: 'PERCENTAGE' | 'FIXED';
      value: number;
      reason: string;
      code?: string;
      itemIds?: string[];
    }) => {
      const state = get();
      let itemsToProcess = [...state.cart.items];

      if (params.scope === 'ITEMS' && params.itemIds && params.itemIds.length > 0) {
        itemsToProcess = itemsToProcess.map((it) => {
          if (params.itemIds!.includes(it.cartItemId)) {
            if (params.type === 'PERCENTAGE') {
              return {
                ...it,
                itemDiscountPercent: params.value,
                itemDiscountAmount: 0,
                discountReason: params.reason
              };
            } else {
              return {
                ...it,
                itemDiscountPercent: 0,
                itemDiscountAmount: params.value,
                discountReason: params.reason
              };
            }
          }
          return it;
        });
      }

      const updatedCart = recomputeCart(
        itemsToProcess,
        params.type,
        params.value,
        params.scope,
        params.reason,
        params.code
      );

      set({
        discountScope: params.scope,
        discountType: params.type,
        discountValue: params.value,
        discountReason: params.reason,
        discountCode: params.code || '',
        billDiscountPercent: params.scope === 'BILL' && params.type === 'PERCENTAGE' ? params.value : 0,
        billDiscountFlat: params.scope === 'BILL' && params.type === 'FIXED' ? params.value : 0,
        cart: updatedCart
      });
      saveDiscountDraft(get());

      AuditRepository.log({
        action: 'DISCOUNT_APPLIED',
        category: 'FINANCIAL',
        details: `Applied ${params.scope} discount (${params.type === 'PERCENTAGE' ? `${params.value}%` : `₹${params.value}`}) for "${params.reason}" (-₹${updatedCart.discountAmount})`,
        username: state.currentUser?.fullName || 'Cashier'
      });
    },

    removeDiscount: () => {
      const state = get();
      const cleanItems = state.cart.items.map((it) => ({
        ...it,
        itemDiscountPercent: 0,
        itemDiscountAmount: 0,
        discountReason: undefined
      }));

      const updatedCart = recomputeCart(cleanItems, 'NONE', 0, 'BILL', '', '');
      set({
        discountScope: 'BILL',
        discountType: 'NONE',
        discountValue: 0,
        discountReason: '',
        discountCode: '',
        billDiscountPercent: 0,
        billDiscountFlat: 0,
        cart: updatedCart
      });
      saveDiscountDraft(get());

      AuditRepository.log({
        action: 'DISCOUNT_REMOVED',
        category: 'FINANCIAL',
        details: 'Removed applied order discount',
        username: state.currentUser?.fullName || 'Cashier'
      });
    },

    setIsDiscountModalOpen: (open: boolean) => set({ isDiscountModalOpen: open }),

    clearCart: () => {
      set({
        cart: EMPTY_CART,
        billDiscountPercent: 0,
        billDiscountFlat: 0,
        discountScope: 'BILL',
        discountType: 'NONE',
        discountValue: 0,
        discountReason: '',
        discountCode: '',
        orderNotes: '',
        runningOrderId: null,
        cartOrderBaseline: null
      });
      PosRecoveryService.clearDraft();
    },

    holdCurrentOrder: (label?: string) => {
      const state = get();
      if (state.cart.items.length === 0) return false;
      // A cart that is already running in the kitchen cannot be parked - it would
      // lose its link to the order and be sent (and billed) a second time.
      if (findRunningOrder(state)) return false;

      HeldOrderRepository.holdOrder({
        label: label || (state.selectedTable ? `Table #${state.selectedTable.tableNumber}` : `Takeaway #${Date.now().toString().slice(-4)}`),
        orderType: state.orderType,
        tableNumber: state.selectedTable?.tableNumber,
        customerName: state.selectedCustomer?.name || state.deliveryDetails.name || undefined,
        customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone || undefined,
        cart: state.cart,
        cashierName: state.currentUser?.fullName || 'Cashier',
        notes: state.orderNotes
      });

      get().clearCart();
      return true;
    },

    recallHeldOrder: (heldId: string) => {
      const state = get();
      const guard = protectActiveCartBeforeSwitch(state);
      if (!guard.ok) return guard;

      const recalled = HeldOrderRepository.recallOrder(heldId);
      if (!recalled) return { ok: false, reason: 'This held order is no longer available.' };

      let foundTable: DiningTable | null = null;
      if (recalled.tableNumber) {
        foundTable = db.tables.find((t) => t.tableNumber === recalled.tableNumber) || null;
      }

      set({
        cart: recalled.cart,
        selectedCustomer: recalled.customerPhone ? CustomerRepository.getByPhone(recalled.customerPhone) ?? null : null,
        discountType: recalled.cart.discountType === 'COUPON' ? 'FIXED' : recalled.cart.discountType ?? 'NONE',
        discountValue: recalled.cart.discountValue ?? 0,
        discountScope: recalled.cart.discountScope ?? 'BILL',
        discountReason: recalled.cart.discountReason ?? '',
        billDiscountPercent: recalled.cart.discountType === 'PERCENTAGE' ? recalled.cart.discountValue ?? 0 : 0,
        billDiscountFlat: recalled.cart.discountType === 'FIXED' ? recalled.cart.discountValue ?? 0 : 0,
        orderType: recalled.orderType,
        selectedTable: foundTable,
        orderNotes: recalled.notes || '',
        // The held cart was, by construction, never bound to a running order (holdCurrentOrder
        // refuses to hold one that is) — any running-order binding from the cart just replaced
        // must not leak onto this one, or its next KOT/payment would attach to the wrong order.
        runningOrderId: null,
        cartOrderBaseline: null,
        activeTab: 'MENU'
      });

      const next = get();
      PosRecoveryService.saveDraft({
        terminalId: next.posTerminalId,
        orderType: next.orderType,
        selectedTable: next.selectedTable,
        selectedCustomer: next.selectedCustomer,
        guestCount: next.guestCount,
        cart: next.cart,
        billDiscountPercent: next.billDiscountPercent,
        billDiscountFlat: next.billDiscountFlat,
        notes: next.orderNotes
      });
      return { ok: true };
    },

    checkConcurrentEdit: () => {
      const state = get();
      const baseline = state.cartOrderBaseline;
      if (!baseline) return { ok: true };
      const live = OrderRepository.getOrderById(baseline.orderId);
      if (!live) return { ok: true };
      // Same timestamp: nothing has written to this order since the baseline was taken, by anyone.
      if (live.updatedAt === baseline.updatedAt) return { ok: true };
      // The order moved on, but the last write was THIS terminal's own (e.g. a previous sendKOT in
      // this same editing session already advanced it) — not a conflict with someone else.
      if (live.lastEditedByTerminalId && live.lastEditedByTerminalId === state.posTerminalId) return { ok: true };
      const who = live.lastEditedBy || 'another device';
      const when = new Date(live.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { ok: false, reason: `This bill was changed by ${who} at ${when}, after you opened it here. Refresh to load the latest before sending to the kitchen or collecting payment.` };
    },

    sendKOTDurably: async () => {
      const current = get();
      if (!current.cart.items.some(line => line.quantity > (line.kotSentQty || 0))) return null;
      const state = { ...current, cart: structuredClone(current.cart), selectedTable: current.selectedTable ? { ...current.selectedTable } : null };
      const fingerprint = await financialRequestFingerprint(JSON.stringify({ operation: 'POS_KOT_V1', restaurant: db.restaurant.id,
        branch: db.outlet.id, terminal: state.posTerminalId, table: state.selectedTable?.id, running: state.runningOrderId,
        cart: state.cart, actor: state.currentUser?.id, notes: state.orderNotes }));
      const committed = await db.commitFinancialMutation(fingerprint, () => {
        const conflict = get().checkConcurrentEdit();
        if (!conflict.ok) throw new Error(conflict.reason);
        const prepared = preparePosTickets(state);
        if (!prepared) throw new Error('No new dishes are ready for kitchen submission.');
        return { orderId: prepared.order.id, kotIds: prepared.kots.map(kot => kot.id),
          linkedItems: prepared.linkedItems.map(line => ({ cartItemId: line.cartItemId, orderItemId: line.orderItemId, quantity: line.quantity })) };
      });
      const order = db.orders.find(order => order.id === committed.result.orderId);
      if (!order) throw new Error('Kitchen submission saved; the order needs recovery. Do not send it again.');
      const kots = committed.result.kotIds.map(id => db.kots.find(kot => kot.id === id)).filter((kot): kot is NonNullable<typeof kot> => !!kot);
      if (JSON.stringify(get().cart) === JSON.stringify(state.cart)) {
        const links = new Map(committed.result.linkedItems.map(line => [line.cartItemId, line]));
        set({ runningOrderId: order.id, cartOrderBaseline: { orderId: order.id, updatedAt: order.updatedAt },
          cart: { ...get().cart, items: get().cart.items.map(line => links.has(line.cartItemId)
            ? { ...line, orderItemId: links.get(line.cartItemId)!.orderItemId, kotSentQty: links.get(line.cartItemId)!.quantity } : line) } });
        PosRecoveryService.clearDraft();
      }
      try { await db.acknowledgeFinancialMutation(committed.operationId); }
      catch { console.warn('Kitchen submission saved; local acknowledgement needs recovery.'); }
      if (committed.outcome === 'COMMITTED') {
        for (const kot of kots) void Promise.resolve().then(() => PosPrinterService.printKOT(kot)).catch(() => console.warn('Saved ticket needs a print retry.'));
        try { lanMeshSync.broadcast('ORDER_CREATED', order); lanMeshSync.broadcast('KOT_CREATED', kots); }
        catch { console.warn('Saved ticket is waiting for live notification.'); }
      }
      void SyncOutboxEngine.flush();
      return kots;
    },

    sendKOT: () => {
      const state = get();
      if (db.supportsFinancialCommands()) throw new Error('Use acknowledged kitchen submission before marking dishes as sent.');
      const prepared = preparePosTickets(state);
      if (!prepared) return null;
      const { order, kots, linkedCart, linkedItems } = prepared;
      // 3. Dispatch Print Jobs to Print Queue for each KOT Station
      kots.forEach((kot) => {
        PosPrinterService.printKOT(kot);
      });

      // Real-time broadcast to Captain, Admin and KDS
      lanMeshSync.broadcast('ORDER_CREATED', order);
      lanMeshSync.broadcast('KOT_CREATED', kots);
      lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
        tableNumber: state.selectedTable?.tableNumber,
        status: 'OCCUPIED',
        guestCount: state.guestCount
      });

      // 4. The cart is now a running order: everything in it counts as sent
      set({
        runningOrderId: order.id,
        cartOrderBaseline: { orderId: order.id, updatedAt: order.updatedAt },
        cart: { ...linkedCart, items: linkedItems.map((ci) => ({ ...ci, kotSentQty: ci.quantity })) }
      });
      // The earlier auto-saved draft still holds these dishes as unsent; the order is saved now, so a reload must not
      // offer to restore them (and send them to the kitchen a second time) (BUG-154).
      PosRecoveryService.clearDraft();

      // Push to the cloud right away so KDS / Restaurant Admin see it in seconds.
      SyncOutboxEngine.flush();

      return kots;
    },

    completePaymentDurably: async (method, tenderedAmount, transactionId, splits, confirmation, options) => {
      const current = get();
      if (!current.cart.items.length) return null;
      const state = { ...current, cart: structuredClone(current.cart), selectedTable: current.selectedTable ? { ...current.selectedTable } : null };
      const cartText = JSON.stringify(state.cart);
      // Generated attempt references change on a UI retry. They are saved in the
      // command, but are not the identity of the original customer request.
      const request = JSON.stringify({
        restaurant: db.restaurant.id, branch: db.outlet.id, terminal: state.posTerminalId,
        user: state.currentUser?.id, runningOrderId: state.runningOrderId, table: state.selectedTable?.id,
        cart: state.cart, phone: state.selectedCustomer?.phone || state.deliveryDetails.phone,
        name: state.selectedCustomer?.name || state.deliveryDetails.name,
        method, tenderedAmount, splits, options,
        confirmation: confirmation ? { kind: confirmation.kind, reference: confirmation.reference === transactionId ? null : confirmation.reference } : null
      });
      if (!globalThis.crypto?.subtle) throw new Error('Secure checkout storage is unavailable. Your cart is preserved.');
      const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(request));
      const fingerprint = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const committed = await db.commitFinancialMutation(fingerprint, () => {
        if (state.cart.totalPayable > 0 && (method === 'CASH' || method === 'CASH_AT_COUNTER' || splits?.some(split => split.method === 'CASH' && split.amount > 0)) && !ShiftRepository.getActiveShift()) throw new Error('Open a cash shift before collecting cash. Your cart is preserved.');
        const boundId = state.runningOrderId ?? state.selectedTable?.currentOrderId;
        const boundOrder = boundId ? OrderRepository.getOrderById(boundId) : undefined;
        if (boundId && !boundOrder) throw new Error('This saved bill is no longer available. Refresh before collecting payment.');
        if (boundOrder && (boundOrder.paymentStatus === 'SUCCESS' || ['CANCELLED', 'REFUNDED'].includes(boundOrder.orderStatus))) throw new Error('This bill is already paid or closed. Open its receipt; do not collect again.');
        const conflict = get().checkConcurrentEdit();
        if (!conflict.ok) throw new Error(conflict.reason);
        CustomerRepository.validateOrderRedemption({ loyaltyRedemption: state.cart.loyaltyRedemption, customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone, discountAmount: state.cart.discountAmount });
        const linked = linkCartItems(state.cart.items);
        const unsent = linked.filter(line => line.quantity > (line.kotSentQty ?? 0));
        for (const line of unsent) {
          const dish = db.menuItems.find(item => item.id === line.menuItemId);
          if (!dish || !dish.isAvailable) throw new Error(`${line.item.name} is unavailable. Review this dish before collecting payment.`);
          if (!Number.isInteger(line.quantity) || line.quantity !== clampItemQuantity(dish, line.quantity)) throw new Error(`Review the quantity for ${dish.name}.`);
          const choices = validateModifiers(resolveModifierGroups(dish, db.modifierGroups), line.selectedModifiers);
          if (!choices.isValid) throw new Error(`${dish.name}: ${choices.errors.join(' ')}`);
        }
        let order = boundOrder;
        if (order) {
          syncOrderToCart(order, { ...state.cart, items: linked }, state.currentUser?.fullName, state.posTerminalId);
          order.customerPhone = state.selectedCustomer?.phone || state.deliveryDetails.phone;
          order.customerName = state.selectedCustomer?.name || state.deliveryDetails.name;
        } else {
          order = OrderRepository.createOrder({
            source_type: 'POS', kioskId: state.posTerminalId, orderType: options?.orderType ?? state.orderType,
            cashierName: state.currentUser?.fullName || 'Cashier', tableId: state.selectedTable?.id,
            tableNumber: state.selectedTable?.tableNumber, guestCount: state.guestCount,
            customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone,
            customerName: state.selectedCustomer?.name || state.deliveryDetails.name,
            loyaltyRedemption: state.cart.loyaltyRedemption, items: cartLinesToOrderItems(linked),
            subtotal: state.cart.subtotal, discountAmount: state.cart.discountAmount,
            discountType: state.discountType, discountValue: state.discountValue, discountScope: state.discountScope,
            discountReason: state.discountReason, discountCode: state.discountCode,
            discountAppliedBy: state.currentUser?.fullName || 'Cashier',
            discountAppliedAt: state.cart.discountAmount > 0 ? new Date().toISOString() : undefined,
            cgstAmount: state.cart.cgstAmount, sgstAmount: state.cart.sgstAmount, taxAmount: state.cart.taxAmount,
            totalAmount: state.cart.totalPayable, roundOffAmount: state.cart.roundOffAmount,
            paymentMethod: method, paymentStatus: 'PENDING', orderStatus: 'CONFIRMED'
          });
        }
        // A running bill may have additions which have not reached the kitchen.
        // Save their ticket intent together with settlement; dispatch follows ACK.
        const kots = (boundOrder || options?.sendKotBeforeBill) && unsent.length ? KOTRepository.generateKOT({
          orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber,
          tableNumber: order.tableNumber, orderType: order.orderType,
          cashierName: state.currentUser?.fullName || 'Cashier', orderNotes: state.orderNotes || undefined,
          items: unsent.map(line => ({
            id: `koti-${generateUUID()}`, orderItemId: line.orderItemId,
            menuItemId: line.menuItemId, name: line.item.name, quantity: line.quantity - (line.kotSentQty ?? 0),
            modifiers: line.selectedModifiers, specialInstructions: line.specialInstructions,
            kitchenStation: line.item.kitchenStation || 'Main Kitchen', status: 'PREPARING' as const
          }))
        }) : [];
        const settled = OrderRepository.settleOrder(order.id, method, tenderedAmount, transactionId, state.currentUser?.fullName || 'Cashier', splits);
        if (!settled) throw new Error('The saved bill could not be settled. Your cart is preserved.');
        if (confirmation) {
          settled.paymentConfirmation = confirmation;
          AuditRepository.log({ action: 'MANUAL_PAYMENT_CONFIRMED', category: 'PAYMENT', username: confirmation.actor, details: `${settled.orderNumber}: cashier acknowledged collection; reference ${confirmation.reference || transactionId || 'not supplied'}.` });
        }
        if (options?.instant) AuditRepository.log({ action: 'INSTANT_BILL_CREATED', category: 'FINANCIAL',
          username: state.currentUser?.fullName || 'Cashier', details: `Instant Bill #${settled.orderNumber} settled via ${method} for ${settled.totalAmount}` });
        const receiptRecordId = `rec-${generateUUID()}`;
        ReceiptRepository.addRecord({ id: receiptRecordId, orderId: settled.id, orderNumber: settled.orderNumber,
          tokenNumber: settled.tokenNumber, deliveryMethod: 'PRINT', deliveryStatus: 'QUEUED',
          recipient: settled.customerPhone || 'Counter Guest', paperSize: '80mm',
          content: PosPrinterService.generateReceiptText(settled, '80mm'), createdAt: new Date().toISOString() });
        db.notify();
        return { orderId: settled.id, receiptRecordId, kotIds: kots.map(kot => kot.id) };
      });
      const saved = OrderRepository.getOrderById(committed.result.orderId);
      if (!saved) throw new Error('Checkout was saved but its receipt needs recovery. Do not collect payment again.');
      if (committed.outcome === 'COMMITTED') {
        for (const id of committed.result.kotIds) {
          const kot = db.kots.find(ticket => ticket.id === id);
          if (kot) void Promise.resolve().then(() => PosPrinterService.printKOT(kot)).catch(() => console.warn('Kitchen ticket saved; print dispatch needs a retry.'));
        }
        if (options?.autoPrint !== false) void Promise.resolve().then(() => PosPrinterService.printOrderReceipt(saved, '80mm')).then(job => {
          ReceiptRepository.updateRecordStatus(committed.result.receiptRecordId, job.status === 'PRINTED' ? 'SENT' : 'FAILED', job.status !== 'PRINTED' ? job.lastError : undefined);
        }).catch(() => ReceiptRepository.updateRecordStatus(committed.result.receiptRecordId, 'FAILED', 'Print dispatch failed; reprint from the saved receipt.'));
        try {
          if (method === 'CASH' || method === 'CASH_AT_COUNTER' || splits?.some(split => split.method === 'CASH' && split.amount > 0)) get().openCashDrawer();
          lanMeshSync.broadcast('ORDER_CREATED', saved);
          lanMeshSync.broadcast('BILL_SETTLED', { orderId: saved.id, tableNumber: saved.tableNumber, paymentMethod: saved.paymentMethod, totalAmount: saved.totalAmount });
        } catch { console.warn('Bill saved; a hardware or live notification needs recovery.'); }
      }
      // Preserve any new work entered while awaiting the worker response.
      if (JSON.stringify(get().cart) === cartText) get().clearCart();
      set({ lastCompletedOrder: saved, isPaymentOpen: false, isReceiptOpen: true });
      try { await db.acknowledgeFinancialMutation(committed.operationId); }
      catch { console.warn('Receipt recovered; checkout acknowledgement will be retried before another collection.'); }
      void SyncOutboxEngine.flush();
      return saved;
    },

    completePayment: (method: PaymentMethod, tenderedAmount?: number, transactionId?: string, splits?: PaymentSplit[]) => {
      if (db.supportsFinancialCommands()) throw new Error('Use the acknowledged checkout flow before collecting payment.');
      const state = get();
      if (state.cart.items.length === 0) return null;
      if (state.cart.totalPayable > 0 && (method === 'CASH' || method === 'CASH_AT_COUNTER' || splits?.some(split => split.method === 'CASH' && split.amount > 0)) && !ShiftRepository.getActiveShift()) throw new Error('Open a cash shift in Shift & Cash before collecting cash. Your order is preserved.');
      const boundId = state.runningOrderId ?? state.selectedTable?.currentOrderId;
      const boundOrder = boundId ? OrderRepository.getOrderById(boundId) : undefined;
      if (boundOrder && (boundOrder.paymentStatus === 'SUCCESS' || ['CANCELLED','REFUNDED'].includes(boundOrder.orderStatus))) throw new Error('This bill is already paid or closed. Refresh the order and open its receipt; do not collect payment again.');

      CustomerRepository.validateOrderRedemption({ loyaltyRedemption: state.cart.loyaltyRedemption, customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone, discountAmount: state.cart.discountAmount });
      // 1. Settle the running order if there is one (items added after the KOT
      // are sent to the kitchen first, so nothing that is paid for is missed).
      const running = findRunningOrder(state);
      if (running) {
        const hasUnsent = state.cart.items.some((ci) => ci.quantity - (ci.kotSentQty || 0) > 0);
        if (hasUnsent) get().sendKOT();
      }
      const afterSend = get();
      let order = findRunningOrder(afterSend);
      if (order) {
        syncOrderToCart(order, afterSend.cart, afterSend.currentUser?.fullName, afterSend.posTerminalId);
        order.customerPhone = afterSend.selectedCustomer?.phone || afterSend.deliveryDetails.phone;
        order.customerName = afterSend.selectedCustomer?.name || afterSend.deliveryDetails.name;
      }

      if (!order) {
        const orderItems = state.cart.items.map((ci, idx) => ({
          id: `oi-${Date.now()}-${idx}`,
          orderId: '',
          menuItemId: ci.menuItemId,
          name: ci.item.name,
          sku: ci.item.sku,
          quantity: ci.quantity,
          unitPrice: ci.unitPrice,
          modifiers: ci.selectedModifiers,
          specialInstructions: ci.specialInstructions,
          totalPrice: ci.itemTotal,
          itemDiscountPercent: ci.itemDiscountPercent,
          itemDiscountAmount: ci.itemDiscountAmount,
          discountReason: ci.discountReason,
          kitchenStatus: 'PREPARING' as const
        }));

        order = OrderRepository.createOrder({
          orderType: state.orderType,
          cashierName: state.currentUser?.fullName || 'Cashier',
          tableId: state.selectedTable?.id,
          tableNumber: state.selectedTable?.tableNumber,
          guestCount: state.guestCount,
          customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone,
          customerName: state.selectedCustomer?.name || state.deliveryDetails.name,
          loyaltyRedemption: state.cart.loyaltyRedemption,
          items: orderItems,
          subtotal: state.cart.subtotal,
          discountAmount: state.cart.discountAmount,
          discountType: state.discountType,
          discountValue: state.discountValue,
          discountScope: state.discountScope,
          discountReason: state.discountReason,
          discountCode: state.discountCode,
          discountAppliedBy: state.currentUser?.fullName || 'Cashier',
          discountAppliedAt: state.cart.discountAmount > 0 ? new Date().toISOString() : undefined,
          cgstAmount: state.cart.cgstAmount,
          sgstAmount: state.cart.sgstAmount,
          taxAmount: state.cart.taxAmount,
          totalAmount: state.cart.totalPayable,
          roundOffAmount: state.cart.roundOffAmount,
          paymentMethod: method,
          paymentStatus: 'PENDING',
          orderStatus: 'CONFIRMED',
          source_type: 'POS'
        });
      }

      // 2. Settle the order atomically
      const settled = OrderRepository.settleOrder(
        order.id,
        method,
        tenderedAmount,
        transactionId,
        state.currentUser?.fullName || 'Cashier',
        splits
      );

      // 3. Save receipt record & dispatch thermal print job to Print Queue
      if (settled) {
        const receiptRecordId = `rec-${Date.now()}`;
        // F21: queued, not sent — the print job below is what actually determines whether the
        // printer accepted it; a queue dispatch is not hardware success.
        ReceiptRepository.addRecord({
          id: receiptRecordId,
          orderId: settled.id,
          orderNumber: settled.orderNumber,
          tokenNumber: settled.tokenNumber,
          deliveryMethod: 'PRINT',
          deliveryStatus: 'QUEUED',
          recipient: settled.customerPhone || 'Counter Guest',
          paperSize: '80mm',
          content: PosPrinterService.generateReceiptText(settled, '80mm'),
          createdAt: new Date().toISOString()
        });

        // Add real print job to Hardware Print Queue; reconcile the receipt record with its real outcome.
        void PosPrinterService.printOrderReceipt(settled, '80mm').then((job) => {
          ReceiptRepository.updateRecordStatus(receiptRecordId, job.status === 'PRINTED' ? 'SENT' : 'FAILED', job.status !== 'PRINTED' ? job.lastError : undefined);
        });

        // If Cash payment, trigger cash drawer kick pulse
        if (method === 'CASH' || method === 'SPLIT') {
          get().openCashDrawer();
        }

        // Real-time broadcast to Captain and Admin: Order created & Bill has been paid
        lanMeshSync.broadcast('ORDER_CREATED', settled);
        lanMeshSync.broadcast('BILL_SETTLED', {
          orderId: settled.id,
          tableNumber: settled.tableNumber,
          paymentMethod: method,
          totalAmount: settled.totalAmount
        });

        set({
          lastCompletedOrder: settled,
          isPaymentOpen: false,
          isReceiptOpen: true
        });

        get().clearCart();
        SyncOutboxEngine.flush();
      }

      return settled;
    },

    openCashDrawer: () => {
      const username = get().currentUser?.fullName || 'Cashier';
      // Goes through the cash-drawer port (local hardware, no internet). A drawer that did not open is
      // recorded as such rather than as a success, and never blocks the sale.
      void Platform.cashDrawer.open().then(
        () => AuditRepository.log({ action: 'CASH_DRAWER_OPENED', category: 'HARDWARE', details: `Cash drawer opened by ${username}`, username }),
        (err: Error) => AuditRepository.log({ action: 'CASH_DRAWER_OPEN_FAILED', category: 'HARDWARE', details: `Cash drawer did not open (${err?.message || 'unknown reason'}); requested by ${username}`, username })
      );
    },

    requestManagerOverride: (action, title, details, onApprove, approvalScope) => {
      set({
        pendingOverride: {
          action,
          title,
          details,
          approvalScope,
          onApprove: onApprove || (() => {})
        }
      });
    },

    closeOverrideModal: () => set({ pendingOverride: null }),

    loadOrderFromTable: (table: DiningTable) => {
      if (!table.currentOrderId) {
        set({
          selectedTable: table,
          orderType: 'DINE_IN',
          activeTab: 'MENU'
        });
        return { ok: true };
      }

      const guard = protectActiveCartBeforeSwitch(get());
      if (!guard.ok) return guard;

      const order = OrderRepository.getOrderById(table.currentOrderId);
      if (!order) {
        // The table's order has not reached this counter yet (table status can arrive before the order). Fetch it; the
        // table can then be opened from the floor plan again.
        void SyncOutboxEngine.catchUpFromCloud();
        return { ok: false, reason: "This table's order has not fully synced to this terminal yet. Try again in a moment." };
      }

      const cartItems: CartItem[] = order.items.filter(line => line.kitchenStatus !== 'CANCELLED').map((oi) => {
        const itemObj = db.menuItems.find((m) => m.id === oi.menuItemId) || {
          id: oi.menuItemId,
          categoryId: 'cat-starters',
          sku: oi.sku,
          name: oi.name,
          description: '',
          price: oi.unitPrice,
          dietaryType: 'VEG',
          spiceLevel: 'NONE',
          isPopular: false,
          isNew: false,
          isFeatured: false,
          isAvailable: true,
          prepTimeMinutes: 15,
          allergens: [],
          modifierGroupIds: [],
          sortOrder: 0
        };

        return {
          cartItemId: `ci-loaded-${oi.id}`,
          menuItemId: oi.menuItemId,
          item: { ...itemObj, price: oi.unitPrice - (oi.modifiers ?? []).reduce((sum, modifier) => sum + (modifier.priceDelta ?? 0), 0) } as MenuItem,
          quantity: oi.quantity,
          unitPrice: oi.unitPrice,
          taxSnapshot: oi.snapshot,
          selectedModifiers: oi.modifiers || [],
          specialInstructions: oi.specialInstructions,
          itemTotal: oi.totalPrice,
          orderItemId: oi.id,
          kotSentQty: oi.quantity,
          ...(oi.seat ? { seat: oi.seat } : {})
        };
      });

      const updatedCart = recomputeCart(
        cartItems,
        order.discountType || (order.discountAmount ? 'FIXED' : 'NONE'),
        order.discountAmount || 0,
        order.discountScope || 'BILL',
        order.discountReason,
        order.discountCode
      );

      set({
        selectedTable: table,
        orderType: 'DINE_IN',
        runningOrderId: order.id,
        ...savedDiscountState(order),
        cartOrderBaseline: { orderId: order.id, updatedAt: order.updatedAt },
        cart: restoreSavedCart(updatedCart, order),
        selectedCustomer: order.customerPhone ? CustomerRepository.getByPhone(order.customerPhone) ?? null : null,
        activeTab: 'MENU'
      });

      const next = get();
      PosRecoveryService.saveDraft({
        terminalId: next.posTerminalId,
        orderType: next.orderType,
        selectedTable: next.selectedTable,
        selectedCustomer: next.selectedCustomer,
        guestCount: next.guestCount,
        cart: next.cart,
        billDiscountPercent: next.billDiscountPercent,
        billDiscountFlat: next.billDiscountFlat,
        notes: next.orderNotes
      });
      return { ok: true };
    },

    // Same cart-loading logic as loadOrderFromTable above, but reachable by order id alone -- used
    // by Live Orders' "Settle" button and the persistent bill-request indicator on the Billing/Menu
    // screen, neither of which necessarily has a DiningTable handy (a takeaway/delivery order sitting
    // in Live Orders has none at all).
    loadOrderForSettlement: (orderId: string) => {
      const order = OrderRepository.getOrderById(orderId);
      if (!order || outstandingBillAmount(order) === 0) return { ok: false, reason: 'This order has not fully synced to this terminal yet. Try again in a moment.' };

      const guard = protectActiveCartBeforeSwitch(get());
      if (!guard.ok) return guard;

      const table = db.tables.find((t) => t.currentOrderId === orderId) ?? null;

      const cartItems: CartItem[] = order.items.filter(line => line.kitchenStatus !== 'CANCELLED').map((oi) => {
        const itemObj = db.menuItems.find((m) => m.id === oi.menuItemId) || {
          id: oi.menuItemId,
          categoryId: 'cat-starters',
          sku: oi.sku,
          name: oi.name,
          description: '',
          price: oi.unitPrice,
          dietaryType: 'VEG',
          spiceLevel: 'NONE',
          isPopular: false,
          isNew: false,
          isFeatured: false,
          isAvailable: true,
          prepTimeMinutes: 15,
          allergens: [],
          modifierGroupIds: [],
          sortOrder: 0
        };

        return {
          cartItemId: `ci-loaded-${oi.id}`,
          menuItemId: oi.menuItemId,
          item: { ...itemObj, price: oi.unitPrice - (oi.modifiers ?? []).reduce((sum, modifier) => sum + (modifier.priceDelta ?? 0), 0) } as MenuItem,
          quantity: oi.quantity,
          unitPrice: oi.unitPrice,
          taxSnapshot: oi.snapshot,
          selectedModifiers: oi.modifiers || [],
          specialInstructions: oi.specialInstructions,
          itemTotal: oi.totalPrice,
          orderItemId: oi.id,
          kotSentQty: oi.quantity,
          ...(oi.seat ? { seat: oi.seat } : {})
        };
      });

      const updatedCart = recomputeCart(
        cartItems,
        order.discountType || (order.discountAmount ? 'FIXED' : 'NONE'),
        order.discountAmount || 0,
        order.discountScope || 'BILL',
        order.discountReason,
        order.discountCode
      );

      set({
        selectedTable: table,
        orderType: table ? 'DINE_IN' : order.orderType,
        runningOrderId: order.id,
        ...savedDiscountState(order),
        cartOrderBaseline: { orderId: order.id, updatedAt: order.updatedAt },
        cart: restoreSavedCart(updatedCart, order),
        selectedCustomer: order.customerPhone ? CustomerRepository.getByPhone(order.customerPhone) ?? null : null,
        activeTab: 'MENU'
      });

      const next = get();
      PosRecoveryService.saveDraft({
        terminalId: next.posTerminalId,
        orderType: next.orderType,
        selectedTable: next.selectedTable,
        selectedCustomer: next.selectedCustomer,
        guestCount: next.guestCount,
        cart: next.cart,
        billDiscountPercent: next.billDiscountPercent,
        billDiscountFlat: next.billDiscountFlat,
        notes: next.orderNotes
      });
      return { ok: true };
    },

    recoverDraftSession: () => {
      const draft = get().recoverableDraft;
      if (!draft) return;

      let foundTable: DiningTable | null = null;
      if (draft.selectedTableNumber) {
        foundTable = db.tables.find((t) => t.tableNumber === draft.selectedTableNumber) || null;
      }

      let foundCustomer: CustomerAccount | null = null;
      if (draft.customerPhone) {
        foundCustomer = db.customerAccounts.find((c) => c.phone === draft.customerPhone) || null;
      }

      set({
        cart: draft.cart,
        orderType: draft.orderType,
        selectedTable: foundTable,
        selectedCustomer: foundCustomer,
        guestCount: draft.guestCount || 2,
        billDiscountPercent: draft.billDiscountPercent || 0,
        billDiscountFlat: draft.billDiscountFlat || 0,
        discountType: draft.cart.discountType === 'COUPON' ? 'FIXED' : draft.cart.discountType ?? 'NONE',
        discountValue: draft.cart.discountValue ?? 0,
        discountScope: draft.cart.discountScope ?? 'BILL',
        discountReason: draft.cart.discountReason ?? '',
        orderNotes: draft.notes || '',
        recoverableDraft: null,
        activeTab: 'MENU'
      });

      AuditRepository.log({
        action: 'DRAFT_RESTORED',
        category: 'SYSTEM',
        details: `Restored unfinished draft with ${draft.cart.items.length} items amounting to ₹${draft.cart.totalPayable}`,
        username: get().currentUser?.fullName || 'Cashier'
      });
    },

    discardDraftSession: () => {
      PosRecoveryService.clearDraft();
      set({ recoverableDraft: null });
    },

    repeatOrder: (order: Order) => {
      const state = get();
      const newCartItems: CartItem[] = order.items.filter(line => line.kitchenStatus !== 'CANCELLED').map((oi, idx) => {
        const menuItem = db.menuItems.find((mi) => mi.id === oi.menuItemId) || {
          id: oi.menuItemId,
          categoryId: 'cat-main',
          sku: `SKU-${oi.menuItemId.slice(-3)}`,
          name: oi.name,
          description: '',
          price: oi.unitPrice,
          dietaryType: 'VEG' as const,
          spiceLevel: 'NONE' as const,
          isPopular: false,
          isNew: false,
          isFeatured: false,
          isAvailable: true,
          prepTimeMinutes: 12,
          kitchenStation: 'Main Kitchen'
        };

        const modsTotal = (oi.modifiers || []).reduce((s, m) => s + (m.priceDelta || 0), 0);
        const unitPrice = menuItem.price + modsTotal;

        return {
          cartItemId: `ci-repeat-${Date.now()}-${idx}`,
          menuItemId: menuItem.id,
          item: menuItem as MenuItem,
          quantity: oi.quantity,
          unitPrice,
          selectedModifiers: oi.modifiers || [],
          specialInstructions: oi.specialInstructions || '',
          itemTotal: oi.totalPrice
        };
      });

      const updatedCart = recomputeCart(newCartItems, 'NONE', 0, 'BILL');

      const table = order.tableId ? db.tables.find((t) => t.id === order.tableId) : null;
      const customer = order.customerPhone
        ? db.customerAccounts.find((c) => c.phone === order.customerPhone) || {
            phone: order.customerPhone,
            name: order.customerName || 'Customer',
            loyaltyPoints: 0,
            favoriteItemIds: [],
            recentOrderIds: []
          }
        : order.customerName
        ? {
            phone: '',
            name: order.customerName,
            loyaltyPoints: 0,
            favoriteItemIds: [],
            recentOrderIds: []
          }
        : null;

      set({
        cart: updatedCart,
        orderType: order.orderType || 'DINE_IN',
        selectedTable: table || null,
        selectedCustomer: customer || null,
        billDiscountPercent: 0,
        billDiscountFlat: 0,
        // This is a freshly-built cart from a past order's items, not a continuation of whatever
        // was being typed before "Repeat Order" was pressed — it must not inherit that old note.
        orderNotes: '',
        activeTab: 'MENU'
      });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: order.orderType || 'DINE_IN',
        selectedTable: table || null,
        selectedCustomer: customer || null,
        guestCount: state.guestCount,
        cart: updatedCart,
        notes: '',
        billDiscountPercent: 0,
        billDiscountFlat: 0
      });

      AuditRepository.log({
        action: 'ORDER_REPEATED',
        category: 'BILLING',
        details: `Repeated previous order #${order.orderNumber} with ${order.items.length} items into fresh cart (Order ID: ${order.id})`,
        username: state.currentUser?.fullName || 'Cashier'
      });

      return updatedCart;
    },

    repeatLastOrder: () => {
      const completedOrders = [...db.orders]
        .filter((o) => o.orderStatus === 'COMPLETED' || o.paymentStatus === 'SUCCESS')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const lastOrder = completedOrders[0];
      if (!lastOrder) return null;
      return get().repeatOrder(lastOrder);
    },

    isInstantBillProcessing: false,
    isInstantBillConfirmationOpen: false,
    setIsInstantBillConfirmationOpen: (open: boolean) => set({ isInstantBillConfirmationOpen: open }),

    updateInstantBillConfig: (config: Partial<InstantBillConfig>) => {
      if (!db.restaurant) return;
      db.restaurant.instantBillConfig = {
        ...(db.restaurant.instantBillConfig || {
          enabled: true,
          paymentMethod: 'CASH',
          autoPrint: true,
          askConfirmation: false,
          defaultOrderType: 'TAKEAWAY',
          sendKotBeforeBill: false,
          allowedRoles: ['role-super-admin', 'role-manager', 'role-cashier']
        }),
        ...config
      };
      db.notify();
      lanMeshSync.broadcast('RESTAURANT_CONFIG_UPDATED', db.restaurant);
    },

    executeInstantBill: async (overridePaymentMethod?: PaymentMethod) => {
      const state = get();
      CustomerRepository.validateOrderRedemption({ loyaltyRedemption: state.cart.loyaltyRedemption, customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone, discountAmount: state.cart.discountAmount });
      if (state.cart.items.length === 0 || state.isInstantBillProcessing) return null;

      const cfg: InstantBillConfig = db.restaurant?.instantBillConfig || {
        enabled: true,
        paymentMethod: 'CASH',
        autoPrint: true,
        askConfirmation: false,
        defaultOrderType: 'TAKEAWAY',
        sendKotBeforeBill: false,
        allowedRoles: ['role-super-admin', 'role-manager', 'role-cashier']
      };

      const rawMethod = overridePaymentMethod || cfg.paymentMethod || 'CASH';
      // B2-062: the Instant Bill settings screen stores the literal string 'HOUSE_ACCOUNT' as
      // this config's paymentMethod (PosSettingsView.tsx, `paymentMethod: m.id as any` — an
      // `as any` cast around the fact that 'HOUSE_ACCOUNT' isn't a real PaymentMethod value).
      // Normalize it to the real value ('CREDIT', already defined for exactly this) the same way
      // the full payment modal does, instead of saving an untyped, unrecognized string on the order.
      const isHouseAccount = (rawMethod as string) === 'HOUSE_ACCOUNT';
      const method: PaymentMethod = isHouseAccount ? 'CREDIT' : rawMethod;
      if (state.cart.totalPayable > 0 && (method === 'CASH' || method === 'CASH_AT_COUNTER') && !ShiftRepository.getActiveShift()) { set({activeTab: 'SHIFTS', isInstantBillConfirmationOpen: false}); return null; }

      // B2-062: House Account defers real payment to a customer's own ledger. Instant Bill is a
      // single-tap, no-review checkout — settling a House Account sale through it with no
      // customer attached and no oversight would be an even easier version of the same fraud
      // vector the full payment modal now closes (settle a "sale" nobody can ever trace or
      // reconcile). Rather than silently completing it or silently failing, route the cashier to
      // the full Pay screen, which already requires a customer and a manager PIN for this method.
      if (isHouseAccount && (!state.selectedCustomer || !isManagerOrAboveRole(state.currentUser))) {
        set({ isPaymentOpen: true, isInstantBillConfirmationOpen: false });
        return null;
      }

      // If confirmation required and no override was passed from modal
      if (cfg.askConfirmation && !overridePaymentMethod) {
        set({ isInstantBillConfirmationOpen: true });
        return null;
      }

      set({ isInstantBillProcessing: true });

      try {
        if (db.supportsFinancialCommands()) {
          const resolvedType = state.selectedTable ? 'DINE_IN' : state.orderType && state.orderType !== 'DINE_IN' ? state.orderType : cfg.defaultOrderType || 'TAKEAWAY';
          return await get().completePaymentDurably(method, state.cart.totalPayable, `IB-${generateUUID()}`, undefined, undefined,
            { autoPrint: cfg.autoPrint, sendKotBeforeBill: cfg.sendKotBeforeBill, orderType: resolvedType, instant: true });
        }
        const running = findRunningOrder(state);
        const linked = linkCartItems(state.cart.items);
        const orderItems = cartLinesToOrderItems(linked, running?.items);
        if (running) syncOrderToCart(running, { ...state.cart, items: linked }, state.currentUser?.fullName, state.posTerminalId);

        // A quick counter sale with no table is takeaway (the setting's default), not a dine-in with no table
        // (BUG-153): the cart's order type is DINE_IN by default, so only a type the cashier deliberately
        // chose (takeaway, delivery ...) overrides the setting.
        const cashierChoseType = state.orderType && state.orderType !== 'DINE_IN';
        const resolvedOrderType = state.selectedTable
          ? 'DINE_IN'
          : cashierChoseType
          ? state.orderType
          : (cfg.defaultOrderType || 'TAKEAWAY');

        // 1. Create order in Database
        const order = running ?? OrderRepository.createOrder({
          orderType: resolvedOrderType,
          tableId: state.selectedTable?.id,
          tableNumber: state.selectedTable?.tableNumber,
          guestCount: state.guestCount,
          customerPhone: state.selectedCustomer?.phone || state.deliveryDetails.phone,
          cashierName: state.currentUser?.fullName,
          customerName: state.selectedCustomer?.name || state.deliveryDetails.name,
          loyaltyRedemption: state.cart.loyaltyRedemption,
          items: orderItems,
          subtotal: state.cart.subtotal,
          discountAmount: state.cart.discountAmount,
          cgstAmount: state.cart.cgstAmount,
          sgstAmount: state.cart.sgstAmount,
          taxAmount: state.cart.taxAmount,
          totalAmount: state.cart.totalPayable,
          roundOffAmount: state.cart.roundOffAmount,
          paymentMethod: method,
          paymentStatus: 'PENDING',
          orderStatus: 'CONFIRMED',
          source_type: 'POS'
        });

        // 2. If sendKotBeforeBill is enabled, create KOT & dispatch to kitchen
        if (cfg.sendKotBeforeBill) {
          const kotItems = linked.map((ci, idx) => ({
            id: `koti-${Date.now()}-${idx}`,
            menuItemId: ci.menuItemId,
            name: ci.item.name,
            quantity: Math.max(0, ci.quantity - (ci.kotSentQty ?? 0)),
            modifiers: ci.selectedModifiers,
            specialInstructions: ci.specialInstructions,
            kitchenStation: ci.item.kitchenStation || 'Main Kitchen',
            status: 'PREPARING' as const,
            orderItemId: ci.orderItemId
          })).filter(it => it.quantity > 0);
          for (const item of order.items) if (kotItems.some(k => k.orderItemId === item.id)) item.sentAt = new Date().toISOString();

          const kots = KOTRepository.generateKOT({
            orderId: order.id,
            orderNumber: order.orderNumber,
            tokenNumber: order.tokenNumber,
            tableNumber: state.selectedTable?.tableNumber,
            orderType: resolvedOrderType,
            items: kotItems,
            cashierName: state.currentUser?.fullName || 'Cashier'
          });

          kots.forEach((kot) => PosPrinterService.printKOT(kot));
          lanMeshSync.broadcast('KOT_CREATED', kots);
        }

        // 3. Settle order atomically — a real random reference, not a
        // clock-derived value, since this is persisted for reconciliation.
        const transactionId = `IB-${generateUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
        const settled = OrderRepository.settleOrder(
          order.id,
          method,
          state.cart.totalPayable,
          transactionId,
          state.currentUser?.fullName || 'Cashier'
        );

        if (settled) {
          // 4. Create print job & receipt record
          const receiptContent = PosPrinterService.generateReceiptText(settled, '80mm');
          const receiptRecordId = `rec-${Date.now()}`;
          // F21: queued, not sent — reconciled below with the print job's real outcome, and left
          // QUEUED (never claimed SENT) when auto-print is off and nothing was actually dispatched.
          ReceiptRepository.addRecord({
            id: receiptRecordId,
            orderId: settled.id,
            orderNumber: settled.orderNumber,
            tokenNumber: settled.tokenNumber,
            deliveryMethod: 'PRINT',
            deliveryStatus: 'QUEUED',
            recipient: settled.customerPhone || 'Counter Guest',
            paperSize: '80mm',
            content: receiptContent,
            createdAt: new Date().toISOString()
          });

          if (cfg.autoPrint) {
            void PosPrinterService.printOrderReceipt(settled, '80mm').then((job) => {
              ReceiptRepository.updateRecordStatus(receiptRecordId, job.status === 'PRINTED' ? 'SENT' : 'FAILED', job.status !== 'PRINTED' ? job.lastError : undefined);
            });
          }

          // If Cash, open cash drawer
          if (method === 'CASH') {
            get().openCashDrawer();
          }

          // 5. Audit log
          AuditRepository.log({
            action: 'INSTANT_BILL_CREATED',
            category: 'FINANCIAL',
            details: `Instant Bill #${settled.orderNumber} settled via ${method} for ₹${settled.totalAmount} by ${state.currentUser?.fullName || 'Cashier'}`,
            username: state.currentUser?.fullName || 'Cashier'
          });

          // 6. Broadcast Real-Time Sync event
          lanMeshSync.broadcast('ORDER_CREATED', settled);
          lanMeshSync.broadcast('BILL_SETTLED', {
            orderId: settled.id,
            tableNumber: settled.tableNumber,
            paymentMethod: method,
            totalAmount: settled.totalAmount
          });

          // 7. Clear cart & set last completed order
          set({
            lastCompletedOrder: settled,
            isInstantBillProcessing: false,
            isInstantBillConfirmationOpen: false
          });
          get().clearCart();

          return settled;
        }
      } catch (err) {
        console.error('Instant bill error:', err);
      } finally {
        set({ isInstantBillProcessing: false });
      }
      return null;
    }
  };
});

// BUG-033: sending a KOT or settling a bill notifies the database around ten times (order, receipt,
// print job, audit log, cash drawer...). Each action runs as one batch, so the local database is saved,
// pushed and announced once per action instead of once per step.
{
  const actions = usePosStore.getState();
  usePosStore.setState({
    sendKOT: () => db.batch(() => actions.sendKOT()),
    completePayment: (...args: Parameters<typeof actions.completePayment>) => db.batch(() => actions.completePayment(...args)),
    executeInstantBill: (...args: Parameters<typeof actions.executeInstantBill>) => db.batch(() => actions.executeInstantBill(...args))
  });
}
