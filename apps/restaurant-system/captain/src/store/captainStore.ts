import { create } from 'zustand';
import {
  CaptainProfile,
  CaptainNotification,
  FoodReadyItem,
  DiningTable,
  MenuItem,
  Category,
  Order,
  KOT,
  SelectedModifier,
  DietaryType
} from '@jamanvaar/types';
import {
  captainDb,
  OrderRepository,
  KOTRepository,
  TableRepository,
  AuditRepository,
  db,
  StaffRepository
} from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';
import { SessionPersistence, AuthStatus } from '@jamanvaar/business';

export interface CartItemEntry {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedModifiers: SelectedModifier[];
  specialNotes?: string;
  course?: 'COURSE_1' | 'COURSE_2' | 'COURSE_3';
  isFired: boolean;
  kotId?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
}

export interface InternalMessage {
  id: string;
  senderName: string;
  senderRole: 'CAPTAIN' | 'KITCHEN' | 'POS' | 'MANAGER';
  recipient: 'CAPTAIN' | 'KITCHEN' | 'POS' | 'MANAGER' | 'ALL';
  tableNumber?: string;
  presetText: string;
  customNote?: string;
  status: 'SENT' | 'DELIVERED' | 'SEEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRequest {
  id: string;
  tableNumber: string;
  type: 'WATER' | 'PLATES' | 'CUTLERY' | 'TISSUE' | 'CLEANING' | 'MANAGER' | 'BILL' | 'OTHER';
  notes?: string;
  createdAt: string;
  isAcknowledged: boolean;
  isResolved: boolean;
}

const DEFAULT_CAPTAIN: CaptainProfile = {
  id: 'cap-1',
  employeeId: 'EMP-CAP-01',
  name: 'Rahul Sharma',
  pin: '1234',
  role: 'CAPTAIN',
  assignedTableIds: ['t-1', 't-2', 't-3', 't-4', 't-5', 't-6', 't-12', 't-14'],
  assignedTableNumbers: ['1', '2', '3', '4', '5', '6', '12', '14'],
  activeShiftId: 'shift-cap-today',
  permissions: {
    CAN_REQUEST_BILL: true,
    CAN_VIEW_BILL: true,
    CAN_PRINT_BILL: false,
    CAN_ACCEPT_CASH: false,
    CAN_ACCEPT_UPI: false,
    CAN_ACCEPT_CARD: false,
    CAN_SETTLE_ORDER: false,
    CAN_APPLY_DISCOUNT: false,
    CAN_VOID_ITEM: false,
    CAN_TRANSFER_TABLE: true,
    CAN_MERGE_TABLE: true
  }
};

export const PRESET_MESSAGES = [
  'Customer waiting for order',
  'Extra water required',
  'Extra plates required',
  'Extra cutlery required',
  'Tissue / Napkins required',
  'Table cleaning required',
  'Food taking too long',
  'Customer complaint regarding food',
  'Manager assistance required at table',
  'Bill clarification required',
  'Item unavailable in kitchen',
  'Special customer allergy / diet request',
  'Kitchen clarification needed',
  'Order modification requested by guest'
];

interface CaptainState {
  // Authentication & Shift
  currentCaptain: CaptainProfile | null;
  /** Formal auth state machine — never use raw boolean for guard logic */
  authStatus: AuthStatus;
  /** Backward-compat shim */
  isLoggedIn: boolean;
  activeShiftStartTime: string | null;

  // Active Floor & Table
  tables: DiningTable[];
  selectedTable: DiningTable | null;
  selectedTableOrder: Order | null;
  tableFilter: 'MY_TABLES' | 'ALL_TABLES' | 'OCCUPIED' | 'FOOD_READY' | 'BILL_REQUESTED';
  selectedZone: string;
  guestCount: number;
  attachedCustomer: { name: string; phone: string; tag?: string; notes?: string } | null;

  // Operational Messages & Customer Requests
  messages: InternalMessage[];
  customerRequests: CustomerRequest[];

  // Menu & Cart
  categories: Category[];
  menuItems: MenuItem[];
  searchQuery: string;
  selectedCategory: string;
  dietaryFilter: 'ALL' | 'VEG' | 'JAIN' | 'NON_VEG';
  quickFilter: 'ALL' | 'POPULAR' | 'FAST_PREP' | 'BREADS';
  cartItems: CartItemEntry[];

  // Navigation & Modals
  activeTab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'CUSTOMERS' | 'SHIFT';
  isTableWorkspaceOpen: boolean;
  tableWorkspaceTab: 'ORDER' | 'CART' | 'KOTS' | 'CUSTOMER' | 'BILL';
  customizingItem: MenuItem | null;
  isTransferModalOpen: boolean;
  isMergeModalOpen: boolean;
  isCustomerModalOpen: boolean;
  isNewMessageModalOpen: boolean;

  // Live Queues
  kots: KOT[];
  foodReadyItems: FoodReadyItem[];
  notifications: CaptainNotification[];
  shiftStats: {
    tablesServed: number;
    ordersTaken: number;
    kotsSent: number;
    foodServed: number;
    billsRequested: number;
  };
  // Actions
  login: (pin: string) => boolean;
  logout: () => void;
  setActiveTab: (tab: 'TABLES' | 'ORDERS' | 'FOOD_READY' | 'KOTS' | 'MESSAGES' | 'CUSTOMERS' | 'SHIFT') => void;
  setTableWorkspaceTab: (tab: 'ORDER' | 'CART' | 'KOTS' | 'CUSTOMER' | 'BILL') => void;
  openTableWorkspace: (table: DiningTable) => void;
  closeTableWorkspace: () => void;
  setTableFilter: (filter: 'MY_TABLES' | 'ALL_TABLES' | 'OCCUPIED' | 'FOOD_READY' | 'BILL_REQUESTED') => void;
  setSelectedZone: (zone: string) => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (catId: string) => void;
  setDietaryFilter: (f: 'ALL' | 'VEG' | 'JAIN' | 'NON_VEG') => void;
  setQuickFilter: (qf: 'ALL' | 'POPULAR' | 'FAST_PREP' | 'BREADS') => void;
  setCustomizingItem: (item: MenuItem | null) => void;
  setAttachedCustomer: (cust: { name: string; phone: string; tag?: string; notes?: string } | null) => void;
  setIsCustomerModalOpen: (open: boolean) => void;
  setIsNewMessageModalOpen: (open: boolean) => void;

  // Table Management
  selectTable: (table: DiningTable | null) => void;
  openTable: (tableNumber: string, guests?: number) => void;
  setGuestCount: (count: number) => void;
  transferTable: (fromTable: string, toTable: string) => boolean;
  mergeTables: (primaryTable: string, secondaryTable: string) => boolean;
  closeTable: (tableNumber: string) => boolean;

  // Ordering & Cart
  addItemToCart: (
    item: MenuItem,
    modifiers?: SelectedModifier[],
    notes?: string,
    course?: 'COURSE_1' | 'COURSE_2' | 'COURSE_3',
    quantity?: number
  ) => void;
  updateCartQuantity: (itemId: string, delta: number) => void;
  removeCartItem: (itemId: string) => void;
  clearCart: () => void;
  repeatPreviousOrder: (tableNumber: string) => boolean;
  sendKOT: () => KOT[] | null;

  // Food Ready & Bill Actions
  markItemServed: (foodReadyId: string) => void;
  markEntireKotServed: (kotId: string) => void;
  requestBill: (tableNumber: string) => boolean;

  // Messaging & Requests
  sendMessage: (
    recipient: 'CAPTAIN' | 'KITCHEN' | 'POS' | 'MANAGER' | 'ALL',
    presetText: string,
    customNote?: string,
    tableNumber?: string
  ) => void;
  acknowledgeMessage: (id: string) => void;
  resolveMessage: (id: string) => void;
  addCustomerRequest: (
    tableNumber: string,
    type: 'WATER' | 'PLATES' | 'CUTLERY' | 'TISSUE' | 'CLEANING' | 'MANAGER' | 'BILL' | 'OTHER',
    notes?: string
  ) => void;
  acknowledgeCustomerRequest: (id: string) => void;
  resolveCustomerRequest: (id: string) => void;

  // Notifications & State Refresh
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  refreshState: () => void;
}

export const useCaptainStore = create<CaptainState>((set, get) => {
  // Restore persisted captain session on store init
  const savedSession = SessionPersistence.load('captain');
  // Captain app uses a fixed profile pool; match by userId
  const restoredCaptain = savedSession ? DEFAULT_CAPTAIN : null; // single captain in demo DB
  const initialAuthStatus: AuthStatus = restoredCaptain && savedSession?.userId === DEFAULT_CAPTAIN.id
    ? 'AUTHENTICATED'
    : 'UNAUTHENTICATED';

  return {
  currentCaptain: restoredCaptain,
  authStatus: initialAuthStatus,
  isLoggedIn: initialAuthStatus === 'AUTHENTICATED',
  activeShiftStartTime: new Date().toISOString(),

  tables: captainDb.tables,
  selectedTable: null,
  selectedTableOrder: null,
  tableFilter: 'MY_TABLES',
  selectedZone: 'ALL',
  guestCount: 2,
  attachedCustomer: null,

  // A fresh captain session starts with an empty inbox/request queue — these
  // used to seed fake in-progress chatter and guest requests that made a
  // brand-new session look like it already had live activity in progress.
  messages: [],

  customerRequests: [],

  // A fresh shift starts at zero — these used to seed non-zero demo values
  // that made a brand-new shift look like it already had activity.
  shiftStats: {
    tablesServed: 0,
    ordersTaken: 0,
    kotsSent: 0,
    foodServed: 0,
    billsRequested: 0
  },

  categories: captainDb.categories,
  menuItems: captainDb.menuItems,
  searchQuery: '',
  selectedCategory: 'ALL',
  dietaryFilter: 'ALL',
  quickFilter: 'ALL',
  cartItems: [],

  activeTab: 'TABLES',
  isTableWorkspaceOpen: false,
  tableWorkspaceTab: 'ORDER',
  customizingItem: null,
  isTransferModalOpen: false,
  isMergeModalOpen: false,
  isCustomerModalOpen: false,
  isNewMessageModalOpen: false,

  kots: captainDb.kots,
  // Real food-ready items and notifications arrive from actual kitchen
  // activity (see markFoodReady/notification-pushing actions below) — a
  // fresh session has none yet, rather than two pre-baked fake tickets.
  foodReadyItems: [],
  notifications: [],

  login: (pin: string) => {
    // Centralised, hashed PIN verification (BUG-005/006/009/011) — same path as POS/KDS/Kiosk.
    const matchedUser = StaffRepository.verifyPin(pin)?.user;

    if (matchedUser) {
      const captainProfile: CaptainProfile = {
        ...DEFAULT_CAPTAIN,
        id: matchedUser.id,
        name: matchedUser.fullName,
        pin
      };
      const startTime = new Date().toISOString();
      SessionPersistence.save('captain', {
        userId: matchedUser.id,
        fullName: matchedUser.fullName,
        roleId: matchedUser.roleId || 'CAPTAIN',
        restaurantId: matchedUser.restaurantId || db.restaurant.id,
        terminalId: 'CAPTAIN-01'
      });
      set({
        currentCaptain: captainProfile,
        authStatus: 'AUTHENTICATED',
        isLoggedIn: true,
        activeShiftStartTime: startTime
      });
      AuditRepository.log({
        action: 'CAPTAIN_LOGIN',
        category: 'AUTH',
        details: `Staff member ${matchedUser.fullName} logged in on Floor Handheld`,
        username: matchedUser.fullName
      });
      return true;
    }
    return false;
  },

  logout: () => {
    SessionPersistence.clear('captain');
    set({
      currentCaptain: null,
      authStatus: 'UNAUTHENTICATED',
      isLoggedIn: false,
      selectedTable: null,
      isTableWorkspaceOpen: false,
      cartItems: []
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setTableWorkspaceTab: (tab) => set({ tableWorkspaceTab: tab }),
  openTableWorkspace: (table) => {
    get().selectTable(table);
    set({ isTableWorkspaceOpen: true, tableWorkspaceTab: 'ORDER' });
  },
  closeTableWorkspace: () => {
    set({ isTableWorkspaceOpen: false });
  },
  setTableFilter: (filter) => set({ tableFilter: filter }),
  setSelectedZone: (zone) => set({ selectedZone: zone }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedCategory: (catId) => set({ selectedCategory: catId }),
  setDietaryFilter: (f) => set({ dietaryFilter: f }),
  setQuickFilter: (qf) => set({ quickFilter: qf }),
  setCustomizingItem: (item) => set({ customizingItem: item }),
  setAttachedCustomer: (cust) => set({ attachedCustomer: cust }),
  setIsCustomerModalOpen: (open) => set({ isCustomerModalOpen: open }),
  setIsNewMessageModalOpen: (open) => set({ isNewMessageModalOpen: open }),

  // Table Selection & Management
  selectTable: (table) => {
    if (!table) {
      set({ selectedTable: null, selectedTableOrder: null, cartItems: [] });
      return;
    }

    // Match active order for this table
    const activeOrder = table.currentOrderId
      ? captainDb.orders.find((o) => o.id === table.currentOrderId) || null
      : captainDb.orders.find(
          (o) =>
            o.tableNumber === table.tableNumber &&
            o.orderStatus !== 'COMPLETED' &&
            o.orderStatus !== 'CANCELLED'
        ) || null;

    let loadedCart: CartItemEntry[] = [];
    if (activeOrder && activeOrder.items) {
      loadedCart = activeOrder.items.map((it, idx) => {
        const foundItem = captainDb.menuItems.find((m) => m.id === it.menuItemId);
        const menuItem: MenuItem = foundItem || {
          id: it.menuItemId,
          categoryId: 'cat-1',
          name: it.name,
          sku: it.sku,
          description: '',
          price: it.unitPrice,
          isAvailable: true,
          isPopular: false,
          isNew: false,
          isFeatured: false,
          dietaryType: 'VEG',
          spiceLevel: 'MILD',
          kitchenStation: 'Main Kitchen',
          prepTimeMinutes: 15,
          allergens: [],
          modifierGroupIds: [],
          sortOrder: 1
        };

        return {
          id: it.id || `ci-${idx}`,
          menuItem,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          selectedModifiers: it.modifiers || [],
          specialNotes: it.specialInstructions,
          isFired: true,
          status: 'PREPARING'
        };
      });
    }

    set({
      selectedTable: table,
      selectedTableOrder: activeOrder,
      guestCount: table.currentGuests || 2,
      cartItems: loadedCart
    });
  },

  openTable: (tableNumber, guests = 2) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (tbl) {
      tbl.status = 'OCCUPIED';
      tbl.currentGuests = guests;
      captainDb.notify();
    }

    get().selectTable(tbl || null);
    set((s) => ({
      guestCount: guests,
      shiftStats: {
        ...s.shiftStats,
        tablesServed: s.shiftStats.tablesServed + 1
      }
    }));

    AuditRepository.log({
      action: 'TABLE_OPENED',
      category: 'ORDER',
      details: `Table #${tableNumber} opened with ${guests} guests by ${get().currentCaptain?.name}`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('TABLE_OPENED', {
      tableNumber,
      guestCount: guests,
      captainName: get().currentCaptain?.name || 'Captain'
    });
  },

  setGuestCount: (count) => {
    const st = get();
    if (st.selectedTable) {
      st.selectedTable.currentGuests = count;
      captainDb.notify();
      lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
        tableNumber: st.selectedTable.tableNumber,
        status: st.selectedTable.status,
        guestCount: count
      });
    }
    set({ guestCount: count });
  },

  transferTable: (fromTable, toTable) => {
    const from = captainDb.tables.find((t) => t.tableNumber === fromTable);
    const to = captainDb.tables.find((t) => t.tableNumber === toTable);

    if (!from || !to) return false;

    const guestCount = from.currentGuests || 2;
    to.status = from.status;
    to.currentGuests = from.currentGuests;
    to.currentOrderId = from.currentOrderId;

    from.status = 'AVAILABLE';
    from.currentGuests = undefined;
    from.currentOrderId = undefined;

    if (to.currentOrderId) {
      const ord = captainDb.orders.find((o) => o.id === to.currentOrderId);
      if (ord) {
        ord.tableNumber = toTable;
        ord.tableId = to.id;
      }
    }

    captainDb.notify();
    get().selectTable(to);

    AuditRepository.log({
      action: 'TABLE_TRANSFERRED',
      category: 'ORDER',
      details: `Table transferred from #${fromTable} to #${toTable} by ${get().currentCaptain?.name}`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('TABLE_TRANSFERRED', {
      fromTable,
      toTable,
      guestCount
    });

    return true;
  },

  mergeTables: (primaryTable, secondaryTable) => {
    const prim = captainDb.tables.find((t) => t.tableNumber === primaryTable);
    const sec = captainDb.tables.find((t) => t.tableNumber === secondaryTable);

    if (!prim || !sec) return false;

    prim.status = 'OCCUPIED';
    prim.currentGuests = (prim.currentGuests || 2) + (sec.currentGuests || 2);
    sec.status = 'OCCUPIED';
    sec.currentOrderId = prim.currentOrderId;

    captainDb.notify();
    get().selectTable(prim);

    AuditRepository.log({
      action: 'TABLE_MERGED',
      category: 'ORDER',
      details: `Table #${secondaryTable} merged into Table #${primaryTable} by ${get().currentCaptain?.name}`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
      tableNumber: primaryTable,
      status: 'OCCUPIED',
      guestCount: prim.currentGuests
    });

    return true;
  },

  closeTable: (tableNumber: string) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (!tbl) return false;

    tbl.status = 'AVAILABLE';
    tbl.currentGuests = undefined;
    tbl.currentOrderId = undefined;
    captainDb.notify();

    if (get().selectedTable?.tableNumber === tableNumber) {
      set({
        selectedTable: null,
        selectedTableOrder: null,
        cartItems: [],
        isTableWorkspaceOpen: false
      });
    }

    AuditRepository.log({
      action: 'TABLE_CLOSED',
      category: 'ORDER',
      details: `Table #${tableNumber} finalized and marked AVAILABLE by ${get().currentCaptain?.name}`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
      tableNumber,
      status: 'AVAILABLE'
    });

    get().refreshState();
    return true;
  },

  // Cart & Ordering
  addItemToCart: (item, modifiers = [], notes = '', course = 'COURSE_1', quantity = 1) => {
    if (item.isAvailable === false) {
      console.warn(`Cannot add unavailable dish "${item.name}" to cart.`);
      return;
    }

    const state = get();
    const modDelta = modifiers.reduce((acc, m) => acc + (m.priceDelta || 0), 0);
    const unitPrice = item.price + modDelta;

    const existingIdx = state.cartItems.findIndex(
      (ci) =>
        ci.menuItem.id === item.id &&
        !ci.isFired &&
        ci.specialNotes === notes &&
        ci.course === course &&
        JSON.stringify(ci.selectedModifiers) === JSON.stringify(modifiers)
    );

    let updatedCart: CartItemEntry[];

    if (existingIdx !== -1) {
      updatedCart = [...state.cartItems];
      const newQty = updatedCart[existingIdx].quantity + quantity;
      updatedCart[existingIdx].quantity = newQty;
      updatedCart[existingIdx].totalPrice = unitPrice * newQty;
    } else {
      const newEntry: CartItemEntry = {
        id: `citem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menuItem: item,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        selectedModifiers: modifiers,
        specialNotes: notes,
        course,
        isFired: false,
        status: 'PENDING'
      };
      updatedCart = [...state.cartItems, newEntry];
    }

    set({ cartItems: updatedCart });
  },

  updateCartQuantity: (itemId, delta) => {
    const state = get();
    const updated = state.cartItems
      .map((ci) => {
        if (ci.id === itemId && !ci.isFired) {
          const nextQty = ci.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...ci,
            quantity: nextQty,
            totalPrice: ci.unitPrice * nextQty
          };
        }
        return ci;
      })
      .filter(Boolean) as CartItemEntry[];

    set({ cartItems: updated });
  },

  removeCartItem: (itemId) => {
    const state = get();
    set({
      cartItems: state.cartItems.filter((ci) => ci.id !== itemId || ci.isFired)
    });
  },

  clearCart: () => {
    set({ cartItems: [] });
  },

  repeatPreviousOrder: (tableNumber) => {
    const pastOrder = captainDb.orders.find(
      (o) => o.tableNumber === tableNumber && o.orderStatus === 'COMPLETED'
    );

    if (!pastOrder || !pastOrder.items || pastOrder.items.length === 0) return false;

    pastOrder.items.forEach((it) => {
      const mi = captainDb.menuItems.find((m) => m.id === it.menuItemId);
      if (mi) {
        get().addItemToCart(mi, it.modifiers || [], it.specialInstructions, 'COURSE_1', it.quantity);
      }
    });

    return true;
  },

  sendKOT: () => {
    const state = get();
    const unFiredItems = state.cartItems.filter((ci) => !ci.isFired);
    if (unFiredItems.length === 0) return null;

    const table = state.selectedTable;
    const tableNumber = table?.tableNumber || '1';

    // 1. Create or Update Order in Database
    let order = state.selectedTableOrder;
    if (!order) {
      const orderItems = state.cartItems.map((ci, idx) => ({
        id: `oi-${Date.now()}-${idx}`,
        orderId: '',
        menuItemId: ci.menuItem.id,
        name: ci.menuItem.name,
        sku: ci.menuItem.sku,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialNotes,
        totalPrice: ci.totalPrice,
        kitchenStatus: 'PREPARING' as const
      }));

      const subtotal = state.cartItems.reduce((sum, ci) => sum + ci.totalPrice, 0);
      const tax = Math.round(subtotal * 0.05 * 100) / 100;

      order = OrderRepository.createOrder({
        orderType: 'DINE_IN',
        tableId: table?.id,
        tableNumber,
        guestCount: state.guestCount,
        items: orderItems,
        subtotal,
        taxAmount: tax,
        totalAmount: subtotal + tax,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        orderStatus: 'PREPARING',
        source_type: 'CAPTAIN',
        syncStatus: 'SAVED_LOCALLY'
      });

      if (table) {
        table.currentOrderId = order.id;
        table.status = 'OCCUPIED';
      }
    } else {
      const newItems = unFiredItems.map((ci, idx) => ({
        id: `oi-${Date.now()}-${idx}`,
        orderId: order!.id,
        menuItemId: ci.menuItem.id,
        name: ci.menuItem.name,
        sku: ci.menuItem.sku,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialNotes,
        totalPrice: ci.totalPrice,
        kitchenStatus: 'PREPARING' as const
      }));

      order.items = [...(order.items || []), ...newItems];
      order.subtotal = order.items.reduce((s, it) => s + it.totalPrice, 0);
      order.taxAmount = Math.round(order.subtotal * 0.05 * 100) / 100;
      order.totalAmount = order.subtotal + order.taxAmount;
      order.orderStatus = 'PREPARING';
      order.updatedAt = new Date().toISOString();
      // Without this, adding items to an already-existing table order from
      // Captain would never reach the cloud sync bridge — only a brand-new
      // order's creation would (BUG-009's Captain-specific gap).
      order.syncStatus = 'SAVED_LOCALLY';
    }

    // 2. Generate KOT strictly for newly fired items
    const kotItems = unFiredItems.map((ci, idx) => ({
      id: `koti-${Date.now()}-${idx}`,
      menuItemId: ci.menuItem.id,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      modifiers: ci.selectedModifiers,
      specialInstructions: ci.specialNotes,
      kitchenStation: ci.menuItem.kitchenStation || 'Main Kitchen',
      status: 'PREPARING' as const
    }));

    const generatedKots = KOTRepository.generateKOT({
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      tableNumber,
      orderType: 'DINE_IN',
      items: kotItems,
      cashierName: state.currentCaptain?.name || 'Captain'
    });

    // 3. Mark cart items as fired
    const updatedCart = state.cartItems.map((ci) => ({
      ...ci,
      isFired: true,
      status: 'PREPARING' as const
    }));

    set({
      selectedTableOrder: order,
      cartItems: updatedCart,
      kots: captainDb.kots,
      shiftStats: {
        ...state.shiftStats,
        ordersTaken: state.shiftStats.ordersTaken + 1,
        kotsSent: state.shiftStats.kotsSent + generatedKots.length
      }
    });

    AuditRepository.log({
      action: 'KOT_FIRED',
      category: 'ORDER',
      details: `KOT fired for Table #${tableNumber} (${unFiredItems.length} items) by ${state.currentCaptain?.name}`,
      username: state.currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('ORDER_CREATED', order);
    lanMeshSync.broadcast('KOT_CREATED', generatedKots);
    lanMeshSync.broadcast('TABLE_STATUS_CHANGED', {
      tableNumber,
      status: 'OCCUPIED',
      guestCount: state.guestCount
    });

    return generatedKots;
  },

  // Food Ready & Bill Actions
  markItemServed: (foodReadyId) => {
    const st = get();
    const targetItem = st.foodReadyItems.find((it) => it.id === foodReadyId);
    const updated = st.foodReadyItems.filter((it) => it.id !== foodReadyId);

    set({
      foodReadyItems: updated,
      shiftStats: {
        ...st.shiftStats,
        foodServed: st.shiftStats.foodServed + (targetItem?.quantity || 1)
      }
    });

    AuditRepository.log({
      action: 'FOOD_SERVED',
      category: 'ORDER',
      details: `Dish "${targetItem?.dishName}" served to Table #${targetItem?.tableNumber} by ${st.currentCaptain?.name}`,
      username: st.currentCaptain?.name || 'Captain'
    });

    if (targetItem) {
      lanMeshSync.broadcast('ORDER_SERVED', {
        tableNumber: targetItem.tableNumber,
        foodReadyId,
        dishName: targetItem.dishName
      });
    }
  },

  markEntireKotServed: (kotId) => {
    const st = get();
    const matchingItems = st.foodReadyItems.filter((it) => it.kotId === kotId);
    const updated = st.foodReadyItems.filter((it) => it.kotId !== kotId);

    set({
      foodReadyItems: updated,
      shiftStats: {
        ...st.shiftStats,
        foodServed: st.shiftStats.foodServed + matchingItems.length
      }
    });

    AuditRepository.log({
      action: 'KOT_SERVED',
      category: 'ORDER',
      details: `Entire KOT #${kotId} marked as served by ${st.currentCaptain?.name}`,
      username: st.currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('ORDER_SERVED', {
      tableNumber: st.selectedTable?.tableNumber,
      kotId
    });
  },

  requestBill: (tableNumber) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (tbl) {
      tbl.status = 'BILL_REQUESTED';
      captainDb.notify();
    }

    set((s) => ({
      shiftStats: {
        ...s.shiftStats,
        billsRequested: s.shiftStats.billsRequested + 1
      }
    }));

    AuditRepository.log({
      action: 'BILL_REQUESTED',
      category: 'ORDER',
      details: `Bill requested for Table #${tableNumber} by ${get().currentCaptain?.name}`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('BILL_REQUESTED', {
      tableNumber,
      captainName: get().currentCaptain?.name || 'Captain'
    });

    return true;
  },

  // Messaging & Operational Requests
  sendMessage: (recipient, presetText, customNote = '', tableNumber) => {
    const newMsg: InternalMessage = {
      id: `msg-${Date.now()}`,
      senderName: `${get().currentCaptain?.name || 'Rahul Sharma'} (Captain)`,
      senderRole: 'CAPTAIN',
      recipient,
      tableNumber,
      presetText,
      customNote,
      status: 'SENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    set((s) => ({
      messages: [newMsg, ...s.messages],
      isNewMessageModalOpen: false
    }));

    AuditRepository.log({
      action: 'MESSAGE_SENT',
      category: 'COMMUNICATION',
      details: `Captain sent message to ${recipient} (Table #${tableNumber || 'Floor'}): "${presetText}"`,
      username: get().currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('INTERNAL_MESSAGE_SENT', newMsg);
  },

  acknowledgeMessage: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: 'ACKNOWLEDGED', updatedAt: new Date().toISOString() } : m
      )
    }));

    lanMeshSync.broadcast('INTERNAL_MESSAGE_UPDATED', { id, status: 'ACKNOWLEDGED' });
  },

  resolveMessage: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: 'RESOLVED', updatedAt: new Date().toISOString() } : m
      )
    }));

    lanMeshSync.broadcast('INTERNAL_MESSAGE_UPDATED', { id, status: 'RESOLVED' });
  },

  addCustomerRequest: (tableNumber, type, notes = '') => {
    const newReq: CustomerRequest = {
      id: `cr-${Date.now()}`,
      tableNumber,
      type,
      notes,
      createdAt: new Date().toISOString(),
      isAcknowledged: false,
      isResolved: false
    };

    set((s) => ({
      customerRequests: [newReq, ...s.customerRequests]
    }));

    lanMeshSync.broadcast('CUSTOMER_REQUEST_CREATED', newReq);
  },

  acknowledgeCustomerRequest: (id) => {
    set((s) => ({
      customerRequests: s.customerRequests.map((cr) =>
        cr.id === id ? { ...cr, isAcknowledged: true } : cr
      )
    }));

    lanMeshSync.broadcast('CUSTOMER_REQUEST_ACKNOWLEDGED', { id });
  },

  resolveCustomerRequest: (id) => {
    set((s) => ({
      customerRequests: s.customerRequests.map((cr) =>
        cr.id === id ? { ...cr, isResolved: true } : cr
      )
    }));

    lanMeshSync.broadcast('CUSTOMER_REQUEST_RESOLVED', { id });
  },

  markNotificationRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    }));
  },

  clearAllNotifications: () => {
    set({ notifications: [] });
  },

  refreshState: () => {
    set({
      tables: [...captainDb.tables],
      categories: [...captainDb.categories],
      menuItems: [...captainDb.menuItems],
      kots: [...captainDb.kots]
    });
  }
  }; // end return
}); // end create

// =========================================================================
// REAL-TIME CLUSTER EVENT LISTENERS (CROSS-APP MESH)
// =========================================================================
if (typeof window !== 'undefined') {
  lanMeshSync.registerDevice('CAPTAIN', 'CAPTAIN-01', 'Captain Mobile App');
  lanMeshSync.setAttachedDatabase(captainDb);

  // 1. Food Ready Notification from KDS
  lanMeshSync.on('FOOD_READY', (event) => {
    const { tableNumber, items, dishName, kotNumber, orderId } = event.payload || {};
    const store = useCaptainStore.getState();

    const newNotification: CaptainNotification = {
      id: `notif-${Date.now()}`,
      type: 'FOOD_READY',
      title: `🔥 Food Ready for Table #${tableNumber || 'Floor'}`,
      message: `${dishName || (items && items[0]?.name) || 'Kitchen items'} prepared and ready for pickup!`,
      tableNumber: tableNumber ? `${tableNumber}` : undefined,
      timestamp: new Date().toISOString(),
      isRead: false
    };

    const newFoodReadyItem: FoodReadyItem = {
      id: `fr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      kotId: event.payload?.kotId || `kot-${Date.now()}`,
      kotNumber: kotNumber || 'KOT',
      orderId: orderId || '',
      orderNumber: event.payload?.orderNumber || '',
      tableNumber: `${tableNumber || 'Floor'}`,
      itemId: event.payload?.itemId || '',
      dishName: dishName || (items && items[0]?.name) || 'Dish',
      quantity: event.payload?.quantity || (items && items[0]?.quantity) || 1,
      modifiers: event.payload?.modifiers || [],
      station: event.payload?.station || 'Kitchen',
      readyAt: new Date().toISOString(),
      elapsedSeconds: 0,
      isServed: false
    };

    useCaptainStore.setState({
      foodReadyItems: [newFoodReadyItem, ...store.foodReadyItems],
      notifications: [newNotification, ...store.notifications]
    });

    store.refreshState();
  });

  // 2. Bill Settled at POS Counter
  lanMeshSync.on('BILL_SETTLED', (event) => {
    const { tableNumber, orderId } = event.payload || {};
    const store = useCaptainStore.getState();

    const newNotification: CaptainNotification = {
      id: `notif-${Date.now()}`,
      type: 'BILL_READY',
      title: `✓ Table #${tableNumber} Settled`,
      message: `Bill has been settled at POS. Table can now be closed.`,
      tableNumber,
      timestamp: new Date().toISOString(),
      isRead: false
    };

    const targetTable = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (targetTable) {
      targetTable.status = 'AVAILABLE';
      targetTable.currentOrderId = undefined;
      targetTable.currentGuests = undefined;
      captainDb.notify();
    }

    useCaptainStore.setState({
      notifications: [newNotification, ...store.notifications]
    });

    store.refreshState();
  });

  // 3. Inbound Internal Messages from Kitchen / POS / Manager
  lanMeshSync.on('INTERNAL_MESSAGE_SENT', (event) => {
    const store = useCaptainStore.getState();
    const msg = event.payload as InternalMessage;
    if (msg) {
      useCaptainStore.setState({
        messages: [msg, ...store.messages.filter((m) => m.id !== msg.id)]
      });
    }
  });

  lanMeshSync.on('INTERNAL_MESSAGE_UPDATED', (event) => {
    const store = useCaptainStore.getState();
    const { id, status } = event.payload || {};
    if (id && status) {
      useCaptainStore.setState({
        messages: store.messages.map((m) => (m.id === id ? { ...m, status, updatedAt: new Date().toISOString() } : m))
      });
    }
  });

  // 4. Menu & Item Availability Updates
  lanMeshSync.on('ITEM_AVAILABILITY_CHANGED', () => {
    useCaptainStore.getState().refreshState();
  });

  lanMeshSync.on('PRICE_UPDATED', () => {
    useCaptainStore.getState().refreshState();
  });

  lanMeshSync.on('MENU_UPDATED', () => {
    useCaptainStore.getState().refreshState();
  });

  // 5. Business Day Rollover
  lanMeshSync.on('BUSINESS_DAY_STARTED', (event) => {
    const { displayDate } = event.payload || {};
    const store = useCaptainStore.getState();
    const newNotification: CaptainNotification = {
      id: `notif-${Date.now()}`,
      type: 'MANAGER_MESSAGE',
      title: `☀️ New Business Day Started`,
      message: `${displayDate || 'New day'} is active. Tables and queues refreshed.`,
      timestamp: new Date().toISOString(),
      isRead: false
    };

    useCaptainStore.setState({
      foodReadyItems: [],
      notifications: [newNotification, ...store.notifications]
    });
    store.refreshState();
  });
}
