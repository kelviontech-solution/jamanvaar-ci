import { create } from 'zustand';
import {
  Cart,
  CartItem,
  Category,
  CustomerAccount,
  DiningTable,
  DraftCartSession,
  HeldOrder,
  InstantBillConfig,
  KOTRecord,
  ManagerOverrideAction,
  MenuItem,
  Order,
  OrderType,
  PaymentMethod,
  PrintJob,
  ReceiptPaperSize,
  SelectedModifier,
  ShiftRecord,
  User,
  PaymentSplit
} from '@jamanvaar/types';
import {
  AuditRepository,
  db,
  HeldOrderRepository,
  KOTRepository,
  OrderRepository,
  PrintQueueRepository,
  ReceiptRepository,
  ShiftRepository,
  StaffRepository,
  InventoryRepository
} from '@jamanvaar/database';
import { PosPrinterService } from '../services/printerService';
import { Platform } from '@jamanvaar/api';
import { PosRecoveryService } from '../services/recoveryService';
import { lanMeshSync, SyncOutboxEngine, StaffSession, verifyPinWithSync, type RefundApprovalScope } from '@jamanvaar/sync';
import { deviceFetch as posDeviceFetch } from '../cloud/cloudClient';
import { SessionPersistence, AuthStatus, calculateCart } from '@jamanvaar/business';
import { generateUUID } from '@jamanvaar/utils';

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
  setDeliveryDetails: (details: Partial<DeliveryDetails>) => void;
  setGuestCount: (count: number) => void;
  setOrderNotes: (notes: string) => void;

  addItemToCart: (
    item: MenuItem,
    selectedModifiers?: SelectedModifier[],
    specialInstructions?: string,
    quantity?: number
  ) => void;
  updateItemQuantity: (cartItemId: string, delta: number) => void;
  updateItemCustomization: (
    cartItemId: string,
    modifiers: SelectedModifier[],
    instructions: string
  ) => void;
  updateItemSpecialInstructions: (cartItemId: string, instructions: string) => void;
  removeItemFromCart: (cartItemId: string) => void;
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
  recallHeldOrder: (heldId: string) => boolean;

  repeatOrder: (order: Order) => Cart;
  repeatLastOrder: () => Cart | null;

  sendKOT: () => KOTRecord[] | null;
  completePayment: (
    method: PaymentMethod,
    tenderedAmount?: number,
    transactionId?: string,
    splits?: PaymentSplit[]
  ) => Order | null;

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

  loadOrderFromTable: (table: DiningTable) => void;
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
  if (found.paymentStatus === 'SUCCESS' || found.orderStatus === 'CANCELLED' || found.orderStatus === 'COMPLETED') return null;
  return found;
}

/** Brings an open order's lines and totals in line with the cart, and flags it for cloud sync. */
function syncOrderToCart(order: Order, cart: Cart): void {
  order.items = cartLinesToOrderItems(cart.items, order.items).map((it) => ({ ...it, orderId: order.id }));
  order.subtotal = cart.subtotal;
  order.discountAmount = cart.discountAmount;
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
  order.syncStatus = 'SAVED_LOCALLY';
  order.isSynced = false;
  // BUG-044: items added to a running order after the first KOT were never deducted from
  // stock (only order creation deducted). Reconcile consumes just the new/increased quantity.
  InventoryRepository.reconcileOrder(order);
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
    posTerminalId: savedSession?.terminalId || 'POS-01',
    isOnline: true,
    hardwareStatus: {
      localDb: true,
      internet: true,
      printer: true,
      kds: true,
      cashDrawer: true
    },

    activeTab: (savedSession?.activeTab as PosTab) || 'MENU',
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
          posTerminalId: session.terminalId || get().posTerminalId,
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
        billDiscountFlat: get().billDiscountFlat
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
        billDiscountFlat: get().billDiscountFlat
      });
    },

    setSelectedCustomer: (customer) => {
      set({ selectedCustomer: customer });
      PosRecoveryService.saveDraft({
        terminalId: get().posTerminalId,
        orderType: get().orderType,
        selectedTable: get().selectedTable,
        selectedCustomer: customer,
        guestCount: get().guestCount,
        cart: get().cart,
        billDiscountPercent: get().billDiscountPercent,
        billDiscountFlat: get().billDiscountFlat
      });
    },

    setDeliveryDetails: (details) =>
      set((s) => ({ deliveryDetails: { ...s.deliveryDetails, ...details } })),

    setGuestCount: (count) => set({ guestCount: count }),
    setOrderNotes: (notes) => set({ orderNotes: notes }),

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
      // 1. Central Item Availability Protection: never add unavailable dishes
      if (item.isAvailable === false) {
        console.warn(`Cannot add unavailable dish "${item.name}" to cart.`);
        return;
      }

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
        const newQty = existing.quantity + quantity;
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

      set({ cart: updatedCart });

      // Auto-save draft
      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat
      });
    },

    updateItemQuantity: (cartItemId: string, delta: number) => {
      const state = get();
      const itemIdx = state.cart.items.findIndex((ci) => ci.cartItemId === cartItemId);
      if (itemIdx === -1) return;

      const newItems = [...state.cart.items];
      const target = newItems[itemIdx];
      const newQty = target.quantity + delta;

      if (newQty <= 0) {
        newItems.splice(itemIdx, 1);
      } else {
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

      set({ cart: updatedCart });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat
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

      set({ cart: updatedCart });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat
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

      set({ cart: updatedCart });
      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat
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

      set({ cart: updatedCart });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: state.orderType,
        selectedTable: state.selectedTable,
        selectedCustomer: state.selectedCustomer,
        guestCount: state.guestCount,
        cart: updatedCart,
        billDiscountPercent: state.billDiscountPercent,
        billDiscountFlat: state.billDiscountFlat
      });
    },

    applyBillDiscountPercent: (percent: number) => {
      const state = get();
      const updatedCart = recomputeCart(state.cart.items, 'PERCENTAGE', percent, 'BILL', 'Bill Discount');
      set({
        discountType: 'PERCENTAGE',
        discountValue: percent,
        discountScope: 'BILL',
        discountReason: 'Bill Discount',
        billDiscountPercent: percent,
        billDiscountFlat: 0,
        cart: updatedCart
      });

      AuditRepository.log({
        action: 'DISCOUNT_APPLIED',
        category: 'FINANCIAL',
        details: `Applied ${percent}% bill discount (-₹${updatedCart.discountAmount})`,
        username: state.currentUser?.fullName || 'Cashier'
      });
    },

    applyBillDiscountFlat: (amount: number) => {
      const state = get();
      const updatedCart = recomputeCart(state.cart.items, 'FIXED', amount, 'BILL', 'Flat Bill Discount');
      set({
        discountType: 'FIXED',
        discountValue: amount,
        discountScope: 'BILL',
        discountReason: 'Flat Bill Discount',
        billDiscountPercent: 0,
        billDiscountFlat: amount,
        cart: updatedCart
      });

      AuditRepository.log({
        action: 'DISCOUNT_APPLIED',
        category: 'FINANCIAL',
        details: `Applied flat discount of ₹${amount}`,
        username: state.currentUser?.fullName || 'Cashier'
      });
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
        runningOrderId: null
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
      const recalled = HeldOrderRepository.recallOrder(heldId);
      if (!recalled) return false;

      let foundTable: DiningTable | null = null;
      if (recalled.tableNumber) {
        foundTable = db.tables.find((t) => t.tableNumber === recalled.tableNumber) || null;
      }

      set({
        cart: recalled.cart,
        orderType: recalled.orderType,
        selectedTable: foundTable,
        orderNotes: recalled.notes || '',
        activeTab: 'MENU'
      });
      return true;
    },

    sendKOT: () => {
      const state = get();
      if (state.cart.items.length === 0) return null;

      // Only what has not been sent yet goes to the kitchen. Once everything is
      // sent there is nothing to do - this used to create a duplicate order and
      // a duplicate kitchen ticket on every press.
      const linkedItems = linkCartItems(state.cart.items);
      const unsent = linkedItems
        .map((ci) => ({ ci, qty: ci.quantity - (ci.kotSentQty || 0) }))
        .filter((x) => x.qty > 0);
      if (unsent.length === 0) return null;

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
          items: cartLinesToOrderItems(linkedItems),
          subtotal: state.cart.subtotal,
          discountAmount: state.cart.discountAmount,
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
          state.selectedTable.currentOrderId = order.id;
          state.selectedTable.status = 'OCCUPIED';
        }
      } else {
        syncOrderToCart(order, linkedCart);
        db.notify();
      }

      // 2. Generate KOT record(s) for the NEW items only, routed by kitchen station
      const kotItems = unsent.map(({ ci, qty }, idx) => ({
        id: `koti-${Date.now()}-${idx}`,
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
        cart: { ...linkedCart, items: linkedItems.map((ci) => ({ ...ci, kotSentQty: ci.quantity })) }
      });
      // The earlier auto-saved draft still holds these dishes as unsent; the order is saved now, so a reload must not
      // offer to restore them (and send them to the kitchen a second time) (BUG-154).
      PosRecoveryService.clearDraft();

      // Push to the cloud right away so KDS / Restaurant Admin see it in seconds.
      SyncOutboxEngine.flush();

      return kots;
    },

    completePayment: (method: PaymentMethod, tenderedAmount?: number, transactionId?: string, splits?: PaymentSplit[]) => {
      const state = get();
      if (state.cart.items.length === 0) return null;

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
        syncOrderToCart(order, afterSend.cart);
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
          paymentStatus: 'SUCCESS',
          orderStatus: 'COMPLETED',
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
        ReceiptRepository.addRecord({
          id: `rec-${Date.now()}`,
          orderId: settled.id,
          orderNumber: settled.orderNumber,
          tokenNumber: settled.tokenNumber,
          deliveryMethod: 'PRINT',
          deliveryStatus: 'SENT',
          recipient: settled.customerPhone || 'Counter Guest',
          paperSize: '80mm',
          content: PosPrinterService.generateReceiptText(settled, '80mm'),
          createdAt: new Date().toISOString()
        });

        // Add real print job to Hardware Print Queue
        PosPrinterService.printOrderReceipt(settled, '80mm');

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
        return;
      }

      const order = OrderRepository.getOrderById(table.currentOrderId);
      if (!order) return;

      const cartItems: CartItem[] = order.items.map((oi) => {
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
          item: itemObj as MenuItem,
          quantity: oi.quantity,
          unitPrice: oi.unitPrice,
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
        cart: updatedCart,
        activeTab: 'MENU'
      });
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
      const newCartItems: CartItem[] = order.items.map((oi, idx) => {
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
        activeTab: 'MENU'
      });

      PosRecoveryService.saveDraft({
        terminalId: state.posTerminalId,
        orderType: order.orderType || 'DINE_IN',
        selectedTable: table || null,
        selectedCustomer: customer || null,
        guestCount: state.guestCount,
        cart: updatedCart,
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
        const running = findRunningOrder(state);
        const linked = linkCartItems(state.cart.items);
        const orderItems = cartLinesToOrderItems(linked, running?.items);
        if (running) syncOrderToCart(running, { ...state.cart, items: linked });

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
          ReceiptRepository.addRecord({
            id: `rec-${Date.now()}`,
            orderId: settled.id,
            orderNumber: settled.orderNumber,
            tokenNumber: settled.tokenNumber,
            deliveryMethod: 'PRINT',
            deliveryStatus: 'SENT',
            recipient: settled.customerPhone || 'Counter Guest',
            paperSize: '80mm',
            content: receiptContent,
            createdAt: new Date().toISOString()
          });

          if (cfg.autoPrint) {
            PosPrinterService.printOrderReceipt(settled, '80mm');
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
