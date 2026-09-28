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
  StaffRepository,
  ServiceMessages,
  type ServiceMessage
} from '@jamanvaar/database';
import type { User } from '@jamanvaar/types';
import { lanMeshSync, StaffSession, SyncOutboxEngine, syncDiningTables, pushServiceMessages } from '@jamanvaar/sync';

/** Sends what this tablet just changed to the cloud now, not at the next 4 s timer tick, so the kitchen and counter see it within a second. */
function pushNow(): void {
  SyncOutboxEngine.flush();
  void syncDiningTables();
  void pushServiceMessages();
}
import { deviceFetch as captainDeviceFetch } from '../cloud/cloudClient';
import { SessionPersistence, AuthStatus, priceOrderLines } from '@jamanvaar/business';

export type Course = 'COURSE_1' | 'COURSE_2' | 'COURSE_3';
export const COURSES: ReadonlyArray<{ id: Course; label: string; short: string }> = [
  { id: 'COURSE_1', label: 'Starters', short: '1st' },
  { id: 'COURSE_2', label: 'Mains', short: '2nd' },
  { id: 'COURSE_3', label: 'Dessert', short: '3rd' }
];

export interface CartItemEntry {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedModifiers: SelectedModifier[];
  specialNotes?: string;
  course?: Course;
  isFired: boolean;
  kotId?: string;
  /** The order line this dish became when it was fired; needed to cancel it. */
  orderItemId?: string;
  cancelReason?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
}

/**
 * Dishes taken but not yet sent to the kitchen (a course held back, or a table opened and closed again) belong to the table,
 * not to the open screen: they are kept per table so closing the workspace, or a reload, does not lose them.
 */
const HELD_KEY = 'jamanvaar_captain_held_v1';
function readHeld(): Record<string, CartItemEntry[]> {
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? '{}') as Record<string, CartItemEntry[]>;
  } catch {
    return {};
  }
}
function writeHeld(all: Record<string, CartItemEntry[]>): void {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: held dishes last until the screen is closed.
  }
}
export function heldForTable(tableNumber: string): CartItemEntry[] {
  return (readHeld()[tableNumber] ?? []).filter((ci) => !ci.isFired);
}
function saveHeld(tableNumber: string, items: CartItemEntry[]): void {
  const all = readHeld();
  if (items.length === 0) delete all[tableNumber];
  else all[tableNumber] = items;
  writeHeld(all);
}
function moveHeld(from: string, to: string): void {
  const all = readHeld();
  if (!all[from]?.length) return;
  all[to] = [...(all[to] ?? []), ...all[from]];
  delete all[from];
  writeHeld(all);
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
  /** HELP: a guest tapped "Call Staff" at a self-order kiosk — no table-service type fits, and it needs its own icon. */
  type: 'WATER' | 'PLATES' | 'CUTLERY' | 'TISSUE' | 'CLEANING' | 'MANAGER' | 'BILL' | 'HELP' | 'OTHER';
  notes?: string;
  createdAt: string;
  isAcknowledged: boolean;
  isResolved: boolean;
}

const CAPTAIN_PERMISSIONS: CaptainProfile['permissions'] = {
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
};

/** The signed-in waiter, built from their real staff record (never a made-up profile). */
function profileFromUser(user: User): CaptainProfile {
  return {
    id: user.id,
    employeeId: user.username,
    name: user.fullName,
    pin: '',
    role: 'CAPTAIN',
    // Tables are not pre-assigned to a waiter: every table is open to everyone, and "my tables"
    // means the tables this waiter seated.
    assignedTableIds: [],
    assignedTableNumbers: [],
    activeShiftId: '',
    permissions: CAPTAIN_PERMISSIONS
  };
}

/** Guest counts a table can actually seat. */
export function guestCountOptions(capacity: number): number[] {
  const max = Math.max(1, Math.min(Math.floor(capacity) || 1, 12));
  return Array.from({ length: max }, (_, i) => i + 1);
}

/** Tables this waiter seated. */
export function selectMyTables(tables: DiningTable[], captain: CaptainProfile | null): DiningTable[] {
  if (!captain) return [];
  // A table freed at the counter can still carry the waiter's name; it is only "mine" while it is in use.
  return tables.filter((t) => !!t.openedById && t.openedById === captain.id && (t.status !== 'AVAILABLE' || !!t.currentOrderId));
}

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
  /** Why the last sign-in was refused, in words for the person at the keypad (BUG-147). Null when there is nothing to say. */
  loginError: string | null;
  login: (pin: string) => Promise<boolean>;
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
  /** Moves a dish that has not been sent yet to another course (1st starters, 2nd mains, 3rd dessert). */
  setCartItemCourse: (itemId: string, course: Course) => void;
  clearCart: () => void;
  repeatPreviousOrder: (tableNumber: string) => boolean;
  /** Sends the dishes not yet sent to the kitchen: all of them, or only those of the given courses (the rest stay held). */
  sendKOT: (courses?: Course[]) => KOT[] | null;
  /**
   * Cancels a dish that was already sent. Needs a manager: pass the manager's PIN unless the signed-in person is one.
   * The dish stays on the bill at no charge and the kitchen screen shows it cancelled.
   */
  cancelDish: (orderItemId: string, reason: string, managerPin?: string) => Promise<{ ok: true } | { ok: false; error: string }>;

  // Food Ready & Bill Actions
  markItemServed: (foodReadyId: string) => void;
  /** The waiter delivered everything the kitchen finished for one table (BUG-148). Returns how many dishes were marked served. */
  serveReadyForTable: (tableNumber: string) => number;
  markEntireKotServed: (kotId: string) => void;
  requestBill: (tableNumber: string) => boolean;

  // Messaging & Requests
  sendMessage: (
    recipient: 'CAPTAIN' | 'KITCHEN' | 'POS' | 'MANAGER' | 'ALL',
    presetText: string,
    customNote?: string,
    tableNumber?: string
  ) => void;
  /** Messages delivered from other devices (manager, counter...) — shown in the inbox once. */
  receiveMessages: (incoming: ServiceMessage[]) => void;
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

/** The first refresh after opening the app only loads what is already ready, without announcing it. */
let readyListPrimed = false;

export const useCaptainStore = create<CaptainState>((set, get) => {
  // Restore persisted captain session on store init
  const savedSession = SessionPersistence.load('captain');
  // A reload keeps the same real staff member signed in (BUG-106) — as long as that person still exists and is active.
  const savedUser = savedSession ? db.users.find((u) => u.id === savedSession.userId && u.isActive !== false) : undefined;
  const restoredCaptain = savedUser ? profileFromUser(savedUser) : null;
  const initialAuthStatus: AuthStatus = restoredCaptain ? 'AUTHENTICATED' : 'UNAUTHENTICATED';

  return {
  currentCaptain: restoredCaptain,
  authStatus: initialAuthStatus,
  isLoggedIn: initialAuthStatus === 'AUTHENTICATED',
  activeShiftStartTime: new Date().toISOString(),

  tables: captainDb.tables,
  selectedTable: null,
  selectedTableOrder: null,
  tableFilter: 'ALL_TABLES',
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

  loginError: null,

  login: async (pin: string) => {
    // Centralised, hashed PIN verification (BUG-005/006/009/011) — same path as POS/KDS/Kiosk.
    const candidate = (await StaffRepository.verifyPin(pin))?.user;
    // A PIN for a role that does not work the floor is refused (BUG-118).
    const matchedUser = candidate && StaffRepository.canUseTerminal(candidate.roleId, 'CAPTAIN') ? candidate : undefined;
    // A correct PIN on the wrong screen is not a typo: say so, the way POS does (BUG-147).
    const deniedMessage = candidate && !matchedUser ? StaffRepository.terminalDeniedMessage(candidate.roleId, 'CAPTAIN') : null;
    set({ loginError: deniedMessage });

    if (matchedUser) {
      const captainProfile = profileFromUser(matchedUser);
      const startTime = new Date().toISOString();
      void StaffSession.signIn(pin, captainDeviceFetch); // the server names who is on the floor (best effort offline)
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
    StaffSession.clear();
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
          course: (it.course as Course | undefined),
          isFired: true,
          orderItemId: it.id,
          cancelReason: it.cancelReason,
          status: it.kitchenStatus === 'CANCELLED' ? 'CANCELLED' : 'PREPARING'
        };
      });
    }

    // A free table has nothing waiting for it; an occupied one gets back the dishes taken but not yet sent.
    let held: CartItemEntry[] = [];
    if (table.status === 'AVAILABLE' && !table.currentOrderId) saveHeld(table.tableNumber, []);
    else held = heldForTable(table.tableNumber);

    set({
      selectedTable: table,
      selectedTableOrder: activeOrder,
      guestCount: table.currentGuests || 2,
      cartItems: [...loadedCart, ...held]
    });
  },

  openTable: (tableNumber, guests = 2) => {
    saveHeld(tableNumber, []); // a new party never inherits the last one's unsent dishes
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (tbl) {
      const captain = get().currentCaptain;
      tbl.status = 'OCCUPIED';
      tbl.currentGuests = Math.max(1, Math.min(guests, tbl.capacity || guests));
      if (!tbl.openedById) {
        tbl.openedById = captain?.id;
        tbl.openedByName = captain?.name;
      }
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
    pushNow();
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

    if (!from || !to || from.id === to.id) return false;
    // Nothing to move from an empty table, and never onto a table that is already in use (BUG-111).
    if (from.status === 'AVAILABLE' && !from.currentOrderId) return false;
    if (to.status !== 'AVAILABLE' || to.currentOrderId) return false;

    const guestCount = from.currentGuests || 2;
    to.status = from.status;
    to.currentGuests = from.currentGuests;
    to.currentOrderId = from.currentOrderId;
    to.openedById = from.openedById || get().currentCaptain?.id;
    to.openedByName = from.openedByName || get().currentCaptain?.name;

    from.status = 'AVAILABLE';
    from.currentGuests = undefined;
    from.currentOrderId = undefined;
    from.openedById = undefined;
    from.openedByName = undefined;

    if (to.currentOrderId) {
      const ord = captainDb.orders.find((o) => o.id === to.currentOrderId);
      if (ord) {
        ord.tableNumber = toTable;
        ord.tableId = to.id;
        ord.updatedAt = new Date().toISOString();
        ord.syncStatus = 'SAVED_LOCALLY';
        captainDb.kots.filter((k) => k.orderId === ord.id).forEach((k) => { k.tableNumber = toTable; });
      }
    }

    captainDb.notify();
    moveHeld(fromTable, toTable);
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

    pushNow();
    return true;
  },

  mergeTables: (primaryTable, secondaryTable) => {
    const prim = captainDb.tables.find((t) => t.tableNumber === primaryTable);
    const sec = captainDb.tables.find((t) => t.tableNumber === secondaryTable);

    if (!prim || !sec || prim.id === sec.id) return false;
    // Both tables must be in use, and the one being kept must have an order to add to (BUG-111).
    const primaryOrder = prim.currentOrderId ? captainDb.orders.find((o) => o.id === prim.currentOrderId) : undefined;
    if (!primaryOrder) return false;
    if (sec.status === 'AVAILABLE' && !sec.currentOrderId) return false;

    const secondaryOrder = sec.currentOrderId && sec.currentOrderId !== primaryOrder.id
      ? captainDb.orders.find((o) => o.id === sec.currentOrderId)
      : undefined;

    if (secondaryOrder) {
      primaryOrder.items = [...primaryOrder.items, ...secondaryOrder.items.map((it) => ({ ...it, orderId: primaryOrder.id }))];
      const priced = priceOrderLines(primaryOrder.items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity })));
      Object.assign(primaryOrder, priced, { updatedAt: new Date().toISOString(), syncStatus: 'SAVED_LOCALLY' as const });

      // The second table's dishes are still being cooked: their tickets now belong to the merged order.
      captainDb.kots.filter((k) => k.orderId === secondaryOrder.id).forEach((k) => {
        k.orderId = primaryOrder.id;
        k.orderNumber = primaryOrder.orderNumber;
      });
      secondaryOrder.orderStatus = 'CANCELLED';
      secondaryOrder.updatedAt = new Date().toISOString();
      secondaryOrder.syncStatus = 'SAVED_LOCALLY';
    }

    prim.status = 'OCCUPIED';
    prim.currentGuests = (prim.currentGuests || 2) + (sec.currentGuests || 2);
    sec.status = 'OCCUPIED';
    sec.currentOrderId = primaryOrder.id;

    captainDb.notify();
    moveHeld(secondaryTable, primaryTable);
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

    pushNow();
    return true;
  },

  closeTable: (tableNumber: string) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    if (!tbl) return false;
    saveHeld(tableNumber, []);

    tbl.status = 'AVAILABLE';
    tbl.currentGuests = undefined;
    tbl.currentOrderId = undefined;
    tbl.openedById = undefined;
    tbl.openedByName = undefined;
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
    pushNow();
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

  setCartItemCourse: (itemId, course) => {
    set({ cartItems: get().cartItems.map((ci) => (ci.id === itemId && !ci.isFired ? { ...ci, course } : ci)) });
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

  sendKOT: (courses) => {
    const state = get();
    const heldBack = (ci: CartItemEntry) => !!courses && !courses.includes(ci.course ?? 'COURSE_1');
    const unFiredItems = state.cartItems.filter((ci) => !ci.isFired && !heldBack(ci));
    if (unFiredItems.length === 0) return null;
    // Each fired dish becomes exactly one order line; the ticket line and the cart entry keep that line's id.
    const stamp = Date.now();
    const lineIdOf = new Map(unFiredItems.map((ci, idx) => [ci.id, `oi-${stamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`] as const));

    // A ticket must say which table it is for: never guess one (used to default to table 1).
    const table = state.selectedTable;
    if (!table) return null;
    const tableNumber = table.tableNumber;
    const captain = state.currentCaptain;

    // 1. Create or Update Order in Database
    let order = state.selectedTableOrder;
    if (!order) {
      const orderItems = unFiredItems.map((ci) => ({
        id: lineIdOf.get(ci.id)!,
        orderId: '',
        menuItemId: ci.menuItem.id,
        name: ci.menuItem.name,
        sku: ci.menuItem.sku,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialNotes,
        course: ci.course ?? 'COURSE_1',
        totalPrice: ci.totalPrice,
        kitchenStatus: 'PREPARING' as const
      }));

      // Same pricing rules as POS (CGST + SGST, round-off), so both show the same bill (BUG-102).
      const priced = priceOrderLines(orderItems.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity })));

      order = OrderRepository.createOrder({
        orderType: 'DINE_IN',
        tableId: table.id,
        tableNumber,
        guestCount: state.guestCount,
        captainName: captain?.name,
        items: orderItems,
        ...priced,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        orderStatus: 'PREPARING',
        source_type: 'CAPTAIN',
        syncStatus: 'SAVED_LOCALLY'
      });

      table.currentOrderId = order.id;
      table.status = 'OCCUPIED';
      if (!table.openedById) {
        table.openedById = captain?.id;
        table.openedByName = captain?.name;
      }
    } else {
      const newItems = unFiredItems.map((ci) => ({
        id: lineIdOf.get(ci.id)!,
        orderId: order!.id,
        menuItemId: ci.menuItem.id,
        name: ci.menuItem.name,
        sku: ci.menuItem.sku,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        modifiers: ci.selectedModifiers,
        specialInstructions: ci.specialNotes,
        course: ci.course ?? 'COURSE_1',
        totalPrice: ci.totalPrice,
        kitchenStatus: 'PREPARING' as const
      }));

      order.items = [...(order.items || []), ...newItems];
      // Cancelled dishes are at no charge, so they add nothing to the bill.
      Object.assign(order, priceOrderLines(order.items.filter((i) => i.kitchenStatus !== 'CANCELLED').map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity }))));
      order.captainName = order.captainName || captain?.name;
      order.orderStatus = 'PREPARING';
      order.updatedAt = new Date().toISOString();
      // Without this, adding items to an already-existing table order from
      // Captain would never reach the cloud sync bridge — only a brand-new
      // order's creation would (BUG-009's Captain-specific gap).
      order.syncStatus = 'SAVED_LOCALLY';
    }

    // 2. Generate KOT strictly for newly fired items
    const kotItems = unFiredItems.map((ci, idx) => ({
      id: `koti-${stamp}-${idx}`,
      menuItemId: ci.menuItem.id,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      modifiers: ci.selectedModifiers,
      specialInstructions: ci.specialNotes,
      kitchenStation: ci.menuItem.kitchenStation || 'Main Kitchen',
      status: 'PREPARING' as const,
      orderItemId: lineIdOf.get(ci.id)!,
      course: ci.course ?? 'COURSE_1'
    }));

    const generatedKots = KOTRepository.generateKOT({
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      tableNumber,
      orderType: 'DINE_IN',
      items: kotItems,
      cashierName: captain?.name || '',
      serverName: captain?.name
    });

    // 3. Mark cart items as fired
    const updatedCart = state.cartItems.map((ci) =>
      lineIdOf.has(ci.id) ? { ...ci, isFired: true, orderItemId: lineIdOf.get(ci.id), status: 'PREPARING' as const } : ci
    );

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

    pushNow();
    return generatedKots;
  },

  cancelDish: async (orderItemId, reason, managerPin) => {
    const state = get();
    const order = state.selectedTableOrder;
    if (!order) return { ok: false, error: 'There is no running order on this table.' };
    const line = order.items.find((i) => i.id === orderItemId);
    if (!line) return { ok: false, error: 'That dish is not on this order.' };
    if (line.kitchenStatus === 'SERVED') return { ok: false, error: 'This dish was already served and cannot be cancelled.' };
    if (line.kitchenStatus === 'CANCELLED') return { ok: false, error: 'This dish is already cancelled.' };
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return { ok: false, error: 'Choose or type a reason.' };

    // Taking a dish off a bill needs a manager: either the person signed in is one, or a manager keys in their PIN.
    const me = state.currentCaptain ? db.users.find((u) => u.id === state.currentCaptain!.id) : undefined;
    const signedInIsManager = me?.roleId === 'role-manager' || me?.roleId === 'role-super-admin';
    let approver = state.currentCaptain?.name;
    if (!signedInIsManager) {
      if (!managerPin) return { ok: false, error: 'A manager must approve cancelling a dish that was already sent.' };
      const verified = await StaffRepository.verifyPin(managerPin);
      if (!verified?.isManager) return { ok: false, error: 'That is not a manager PIN.' };
      approver = verified.user.fullName;
      await StaffSession.approve(managerPin, captainDeviceFetch); // best effort: gives the server proof of who approved
    }

    const updated = KOTRepository.cancelOrderLine(order.id, orderItemId, cleanReason, `${approver ?? 'Manager'} (for ${state.currentCaptain?.name ?? 'Captain'})`);
    if (!updated) return { ok: false, error: 'This dish can no longer be cancelled.' };
    Object.assign(updated, priceOrderLines(updated.items.filter((i) => i.kitchenStatus !== 'CANCELLED').map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity }))));

    set({
      selectedTableOrder: updated,
      cartItems: get().cartItems.map((ci) => (ci.orderItemId === orderItemId ? { ...ci, status: 'CANCELLED' as const, totalPrice: 0, cancelReason: cleanReason } : ci)),
      kots: captainDb.kots
    });
    if (updated.orderStatus === 'CANCELLED' && state.selectedTable) {
      // Nothing is left to cook or bill: the table is free again.
      get().closeTable(state.selectedTable.tableNumber);
    } else {
      get().refreshState();
      pushNow();
    }
    return { ok: true };
  },

  // Food Ready & Bill Actions
  markItemServed: (foodReadyId) => {
    const st = get();
    const targetItem = st.foodReadyItems.find((it) => it.id === foodReadyId);
    if (!targetItem) return;

    // The waiter took the dish to the table: record it on the order so POS and KDS see it too.
    KOTRepository.markItemServed(targetItem.kotId, targetItem.itemId);
    get().refreshState();
    set((s2) => ({
      shiftStats: {
        ...s2.shiftStats,
        foodServed: s2.shiftStats.foodServed + (targetItem.quantity || 1)
      }
    }));

    AuditRepository.log({
      action: 'FOOD_SERVED',
      category: 'ORDER',
      details: `Dish "${targetItem.dishName}" served to Table #${targetItem.tableNumber} by ${st.currentCaptain?.name}`,
      username: st.currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('ORDER_SERVED', {
      tableNumber: targetItem.tableNumber,
      foodReadyId,
      dishName: targetItem.dishName
    });
    pushNow();
  },

  serveReadyForTable: (tableNumber) => {
    const waiting = get().foodReadyItems.filter((it) => it.tableNumber === tableNumber && !it.isServed);
    waiting.forEach((it) => get().markItemServed(it.id));
    return waiting.reduce((n, it) => n + (it.quantity || 1), 0);
  },

  markEntireKotServed: (kotId) => {
    const st = get();
    const matchingItems = st.foodReadyItems.filter((it) => it.kotId === kotId);

    KOTRepository.markKotServed(kotId);
    get().refreshState();
    set((s2) => ({
      shiftStats: {
        ...s2.shiftStats,
        foodServed: s2.shiftStats.foodServed + matchingItems.reduce((n, it) => n + (it.quantity || 1), 0)
      }
    }));

    AuditRepository.log({
      action: 'KOT_SERVED',
      category: 'ORDER',
      details: `Entire KOT #${kotId} marked as served by ${st.currentCaptain?.name}`,
      username: st.currentCaptain?.name || 'Captain'
    });

    lanMeshSync.broadcast('ORDER_SERVED', {
      tableNumber: matchingItems[0]?.tableNumber,
      kotId
    });
    pushNow();
  },

  requestBill: (tableNumber) => {
    const tbl = captainDb.tables.find((t) => t.tableNumber === tableNumber);
    // There must be an order to bill. The table state travels to POS with the table sync, where the
    // counter sees it as "Billing" (BUG-099).
    if (!tbl || !tbl.currentOrderId || !captainDb.orders.some((o) => o.id === tbl.currentOrderId)) return false;
    tbl.status = 'BILL_REQUESTED';
    captainDb.notify();

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

    ServiceMessages.enqueue({
      kind: 'BILL_REQUEST',
      recipient: 'POS',
      senderName: get().currentCaptain?.name || 'Staff',
      presetText: 'Bill requested',
      tableNumber
    });
    lanMeshSync.broadcast('BILL_REQUESTED', {
      tableNumber,
      captainName: get().currentCaptain?.name || 'Captain'
    });

    pushNow();
    return true;
  },

  // Messaging & Operational Requests
  sendMessage: (recipient, presetText, customNote = '', tableNumber) => {
    const newMsg: InternalMessage = {
      id: `msg-${Date.now()}`,
      senderName: `${get().currentCaptain?.name || 'Staff'} (Captain)`,
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

    // Deliver to the other devices through the cloud (BUG-100); the LAN broadcast below only ever
    // reached tabs of the same browser.
    if (recipient !== 'CAPTAIN') {
      ServiceMessages.enqueue({
        kind: 'MESSAGE',
        recipient,
        senderName: get().currentCaptain?.name || 'Staff',
        presetText,
        customNote: customNote || undefined,
        tableNumber
      });
    }
    lanMeshSync.broadcast('INTERNAL_MESSAGE_SENT', newMsg);
    pushNow();
  },

  receiveMessages: (incoming) => {
    // A kiosk guest's "Call Staff" arrives here as a ServiceMessage the same as any staff-to-staff
    // message, but it belongs in the Guest Requests list with the other table-service requests
    // (its own accept/resolve workflow), not buried in the general staff inbox mislabeled as a
    // manager message from nobody in particular.
    const staffCalls = incoming.filter((m) => m.kind === 'CALL_STAFF');
    const otherMessages = incoming.filter((m) => m.kind !== 'CALL_STAFF');

    const knownMessageIds = new Set(get().messages.map((m) => m.id));
    const freshMessages = otherMessages.filter((m) => !knownMessageIds.has(m.id));

    const knownRequestIds = new Set(get().customerRequests.map((r) => r.id));
    const freshCalls = staffCalls.filter((m) => !knownRequestIds.has(`svc-${m.id}`));

    if (freshMessages.length === 0 && freshCalls.length === 0) return;

    set((s) => ({
      messages: [
        ...freshMessages.map((m): InternalMessage => ({
          id: m.id,
          senderName: m.senderName,
          senderRole: 'MANAGER',
          recipient: 'CAPTAIN',
          tableNumber: m.tableNumber,
          presetText: m.presetText,
          customNote: m.customNote,
          status: 'DELIVERED',
          createdAt: m.createdAt,
          updatedAt: m.createdAt
        })),
        ...s.messages
      ],
      customerRequests: [
        ...freshCalls.map((m): CustomerRequest => ({
          id: `svc-${m.id}`,
          tableNumber: m.tableNumber || 'Kiosk',
          type: 'HELP',
          notes: m.customNote || m.presetText,
          createdAt: m.createdAt,
          isAcknowledged: false,
          isResolved: false
        })),
        ...s.customerRequests
      ],
      notifications: [
        ...freshMessages.map((m): CaptainNotification => ({
          id: `notif-${m.id}`,
          type: 'MANAGER_MESSAGE',
          title: `💬 ${m.senderName}${m.tableNumber ? ` — Table ${m.tableNumber}` : ''}`,
          message: m.customNote || m.presetText,
          tableNumber: m.tableNumber,
          timestamp: m.createdAt,
          isRead: false
        })),
        ...freshCalls.map((m): CaptainNotification => ({
          id: `notif-${m.id}`,
          type: 'GUEST_HELP',
          title: `🙋 Guest needs help${m.tableNumber ? ` — Table ${m.tableNumber}` : ''}`,
          message: m.customNote || m.presetText,
          tableNumber: m.tableNumber,
          timestamp: m.createdAt,
          isRead: false
        })),
        ...s.notifications
      ]
    }));
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
    // Bring this device's view in line with the orders it holds: tickets follow their order, and a
    // table whose order was settled at the counter is freed (BUG-097/098).
    TableRepository.releaseSettledTables();
    KOTRepository.reconcileWithOrders();

    const foodReady = KOTRepository.getFoodReadyItems();
    const previous = new Set(get().foodReadyItems.map((f) => f.id));
    const fresh = readyListPrimed ? foodReady.filter((f) => !previous.has(f.id)) : [];
    readyListPrimed = true;

    set((s) => ({
      tables: [...captainDb.tables],
      categories: [...captainDb.categories],
      menuItems: [...captainDb.menuItems],
      kots: [...captainDb.kots],
      foodReadyItems: foodReady,
      notifications: fresh.length === 0
        ? s.notifications
        : [
            ...fresh.map((f): CaptainNotification => ({
              id: `notif-${f.id}`,
              type: 'FOOD_READY',
              title: `🔥 Food Ready for Table #${f.tableNumber}`,
              message: `${f.dishName} prepared and ready for pickup!`,
              tableNumber: f.tableNumber,
              timestamp: new Date().toISOString(),
              isRead: false
            })),
            ...s.notifications
          ]
    }));
  }
  }; // end return
}); // end create

// Whatever is in the open table's cart and not yet sent is remembered for that table (see heldForTable).
useCaptainStore.subscribe((state, prev) => {
  if (state.cartItems === prev.cartItems || !state.selectedTable) return;
  saveHeld(state.selectedTable.tableNumber, state.cartItems.filter((ci) => !ci.isFired));
});

// =========================================================================
// REAL-TIME CLUSTER EVENT LISTENERS (CROSS-APP MESH)
// =========================================================================
if (typeof window !== 'undefined') {
  lanMeshSync.registerDevice('CAPTAIN', 'CAPTAIN-01', 'Captain Mobile App');
  lanMeshSync.setAttachedDatabase(captainDb);

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
