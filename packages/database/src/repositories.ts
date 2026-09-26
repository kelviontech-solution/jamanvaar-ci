import { PaymentPolicy } from './payment_policy';
import { NumberAllocator } from './number_allocator';
import {
  AppNotification,
  PaymentSplit,
  NotificationRole,
  AuditLog,
  BusinessDay,
  BusinessDaySnapshot,
  CashMovement,
  Category,
  ComboDeal,
  Coupon,
  CustomerAccount,
  CustomerFeedback,
  DeviceHealth,
  DiningTable,
  HeldOrder,
  InventoryItem,
  KioskDevice,
  KOTItem,
  KOTRecord,
  KOTType,
  LicenseInfo,
  PlatformQrControl,
  QrUsageSnapshot,
  LoyaltyTier,
  LoyaltyReward,
  StaffShiftSchedule,
  AttendanceRecord,
  AttendanceStatus,
  MarketingCampaign,
  CustomerSegmentFilter,
  DeliveryRider,
  DeliveryStatus,
  PlanTier,
  PlanEntitlements,
  ManagerOverrideAction,
  ManagerOverrideRequest,
  MenuItem,
  ModifierGroup,
  Offer,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransaction,
  PrinterDevice,
  PrintJob,
  PrintJobStatus,
  Receipt,
  ReceiptConfig,
  ReceiptRecord,
  Recipe,
  Reservation,
  Role,
  ServiceRequest,
  ShiftRecord,
  StockMovement,
  QrOrderingSettings,
  KioskDisplaySettings,
  WelcomeScreenSettings,
  SyncEvent,
  User,
  WaitlistEntry,
  FoodReadyItem
} from '@jamanvaar/types';
import { getOrderTenders, splitsMatchTotal } from './tender';
import { generateOrderNumber, generateTokenNumber, generateUUID, normalizeIndianPhone, formatRestaurantDate, getRestaurantHour, getBusinessDayDisplayDate } from '@jamanvaar/utils';
import { db } from './db';
import { TableSync } from './table_sync';
import { canMoveTable } from './table_state';
import { MenuItemSync, CategorySync, ComboSync, CouponSync, CustomerSync } from './collection_sync';
import { DEFAULT_QR_SETTINGS, DEFAULT_KIOSK_DISPLAY_SETTINGS, DEFAULT_WELCOME_SCREEN_SETTINGS, SEED_ROLES, SEED_RESTAURANT } from './seed';
import { hashPin, verifyPinHash, generateUniquePin, pinFingerprint } from './pin';

export class MenuRepository {
  /**
   * BUG-013: called once, right when a terminal first activates against a real restaurant.
   * Every terminal's local db starts pre-loaded with the demo seed menu (needed for local
   * dev/testing), so a brand-new real restaurant "already had a menu without anyone loading
   * one". Tables, tax groups, coupons and offers are deliberately left alone — the owner only
   * asked for the menu itself; whether those should also start empty is still an open question
   * (see BUG-013's note in BUG_LIST.md). Whatever's cleared here is naturally re-filled by the
   * entity-sync pull once a real menu is uploaded (BUG-014/016).
   */
  public static startFreshMenu(): void {
    db.categories = [];
    db.menuItems = [];
    db.modifierGroups = [];
    // The demo menu is not this restaurant's: forget its sync bookkeeping so the next sync starts from a
    // fresh baseline and nothing is uploaded or deleted on account of it (BUG-149).
    MenuItemSync.reset();
    CategorySync.reset();
    AuditRepository.log({
      action: 'MENU_CLEARED_ON_ACTIVATION',
      category: 'MENU',
      details: 'Demo seed menu cleared on first device activation — this restaurant has no menu until one is uploaded or loaded.',
      username: 'System'
    });
    db.notify();
  }

  public static getAllCategories(): Category[] {
    return db.categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public static getCategoryById(id: string): Category | undefined {
    return db.categories.find((c) => c.id === id);
  }

  public static createCategory(category: Partial<Category>): Category {
    const newCat: Category = {
      id: category.id || `cat-${Date.now().toString(36)}-${globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
      name: category.name || 'New Category',
      slug: category.slug || `cat-${Date.now().toString(36)}`,
      description: category.description || '',
      iconName: category.iconName || 'Utensils',
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder || db.categories.length + 1,
      isActive: category.isActive ?? true,
      ...(category.qrVisible !== undefined ? { qrVisible: category.qrVisible } : {}),
      translations: category.translations
    };
    db.categories.push(newCat);
    db.notify();
    return newCat;
  }

  public static updateCategory(id: string, updates: Partial<Category>): Category | null {
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.categories[idx] = { ...db.categories[idx], ...updates };
    db.notify();
    return db.categories[idx];
  }

  /** Moves a category one place earlier (-1) or later (+1) in the menu and renumbers every category so the order is exact. */
  public static moveCategory(id: string, delta: -1 | 1): boolean {
    const ordered = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const i = ordered.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return false;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    ordered.forEach((c, idx) => { c.sortOrder = idx + 1; });
    db.notify();
    return true;
  }

  public static deleteCategory(id: string): boolean {
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    db.categories.splice(idx, 1);
    CategorySync.recordDeletion(id);
    db.notify();
    return true;
  }

  /**
   * Intelligently merges duplicate categories that share the same semantic name/canonical group,
   * reassigning dishes to the primary category.
   */
  public static consolidateDuplicateCategories(): { mergedCount: number; reassignedItemsCount: number } {
    let mergedCount = 0;
    let reassignedItemsCount = 0;

    const getCanonicalKey = (name: string): string => {
      const upper = (name || '').trim().toUpperCase();
      if (
        upper.includes('MAIN COURSE') ||
        upper.includes('CURR') ||
        upper.includes('GRAV') ||
        upper.includes('SABZI') ||
        upper.includes('DAL') ||
        upper.includes('PANEER SPECIAL')
      ) {
        return 'MAIN_COURSE';
      }
      if (
        upper.includes('NAAN') ||
        upper.includes('ROTI') ||
        upper.includes('BREAD') ||
        upper.includes('PARATHA') ||
        upper.includes('KULCHA')
      ) {
        return 'BREADS';
      }
      if (
        upper.includes('TANDOOR') ||
        upper.includes('KEBAB') ||
        upper.includes('TIKKA') ||
        upper.includes('PLATTER')
      ) {
        return 'TANDOOR';
      }
      if (
        upper.includes('STARTER') ||
        upper.includes('QUICK BITE') ||
        upper.includes('APPETIZER') ||
        upper.includes('SNACK')
      ) {
        return 'STARTERS';
      }
      if (
        upper.includes('BIRYANI') ||
        upper.includes('RICE') ||
        upper.includes('PULAO') ||
        upper.includes('KHICHDI')
      ) {
        return 'BIRYANI_RICE';
      }
      if (
        upper.includes('BEVERAGE') ||
        upper.includes('DRINK') ||
        upper.includes('SHAKE') ||
        upper.includes('JUICE') ||
        upper.includes('TEA') ||
        upper.includes('COFFEE') ||
        upper.includes('LASSI') ||
        upper.includes('CHAAS')
      ) {
        return 'BEVERAGES';
      }
      if (
        upper.includes('DESSERT') ||
        upper.includes('SWEET') ||
        upper.includes('MITHAI') ||
        upper.includes('ICE CREAM') ||
        upper.includes('HALWA') ||
        upper.includes('KHEER')
      ) {
        return 'DESSERTS';
      }
      if (upper.includes('PIZZA') || upper.includes('PASTA') || upper.includes('ITALIAN')) {
        return 'PIZZA_PASTA';
      }
      if (
        upper.includes('BURGER') ||
        upper.includes('SANDWICH') ||
        upper.includes('WRAP') ||
        upper.includes('FRIES')
      ) {
        return 'BURGERS_SNACKS';
      }
      if (upper.includes('GUJARATI') || upper.includes('KATHIYAWADI') || upper.includes('THALI')) {
        return 'GUJARATI';
      }
      if (
        upper.includes('SOUTH INDIAN') ||
        upper.includes('DOSA') ||
        upper.includes('IDLI') ||
        upper.includes('VADA') ||
        upper.includes('UTTAPAM')
      ) {
        return 'SOUTH_INDIAN';
      }
      if (
        upper.includes('CHINESE') ||
        upper.includes('NOODLE') ||
        upper.includes('MOMO') ||
        upper.includes('MANCHURIAN') ||
        upper.includes('FRIED RICE')
      ) {
        return 'CHINESE';
      }
      if (
        upper.includes('CHAAT') ||
        upper.includes('PANI PURI') ||
        upper.includes('SEV PURI') ||
        upper.includes('BHEL') ||
        upper.includes('PAV BHAJI') ||
        upper.includes('SAMOSA')
      ) {
        return 'CHAAT';
      }
      if (upper.includes('SOUP') || upper.includes('SALAD')) {
        return 'SOUPS_SALADS';
      }
      return upper.replace(/[^A-Z0-9]/g, '') || 'GENERAL';
    };

    const groups = new Map<string, Category[]>();

    db.categories.forEach((cat) => {
      const key = getCanonicalKey(cat.name);
      const list = groups.get(key) || [];
      list.push(cat);
      groups.set(key, list);
    });

    groups.forEach((cats) => {
      if (cats.length > 1) {
        // Pick primary category (prefer original seed ids or lowest sortOrder)
        cats.sort((a, b) => {
          if (a.id.startsWith('cat-') && !a.id.includes('-1') && !b.id.startsWith('cat-')) return -1;
          if (b.id.startsWith('cat-') && !b.id.includes('-1') && !a.id.startsWith('cat-')) return 1;
          return a.sortOrder - b.sortOrder;
        });

        const primary = cats[0];
        const duplicates = cats.slice(1);

        duplicates.forEach((dup) => {
          // Reassign all menu items in this duplicate category to primary category
          db.menuItems.forEach((item) => {
            if (item.categoryId === dup.id) {
              item.categoryId = primary.id;
              reassignedItemsCount++;
            }
          });

          // Remove duplicate category from db.categories
          const idx = db.categories.findIndex((c) => c.id === dup.id);
          if (idx !== -1) {
            db.categories.splice(idx, 1);
            CategorySync.recordDeletion(dup.id);
            mergedCount++;
          }
        });
      }
    });

    if (mergedCount > 0) {
      db.notify();
    }

    return { mergedCount, reassignedItemsCount };
  }

  public static getAllMenuItems(): MenuItem[] {
    return db.menuItems.map((item) => ({
      ...item,
      modifierGroups: (item.modifierGroupIds || [])
        .map((gId) => db.modifierGroups.find((g) => g.id === gId))
        .filter(Boolean) as ModifierGroup[]
    }));
  }

  public static getMenuItemById(id: string): MenuItem | undefined {
    const item = db.menuItems.find((i) => i.id === id);
    if (!item) return undefined;
    return {
      ...item,
      modifierGroups: (item.modifierGroupIds || [])
        .map((gId) => db.modifierGroups.find((g) => g.id === gId))
        .filter(Boolean) as ModifierGroup[]
    };
  }

  public static createMenuItem(itemData: Partial<MenuItem>): MenuItem {
    // A dish that is already on the menu is never added a second time; the existing one is returned.
    const already = this.findDuplicateDish(itemData.name || 'New Dish', { sku: itemData.sku, categoryId: itemData.categoryId });
    if (already) return already;
    const newItem: MenuItem = {
      id: itemData.id || `item-${Date.now()}`,
      categoryId: itemData.categoryId || db.categories[0]?.id || '',
      sku: itemData.sku || `SKU-${Math.floor(100 + Math.random() * 900)}`,
      name: itemData.name || 'New Dish',
      description: itemData.description || '',
      translations: itemData.translations,
      price: itemData.price || 100,
      imageUrl: itemData.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
      dietaryType: itemData.dietaryType || 'VEG',
      spiceLevel: itemData.spiceLevel || 'NONE',
      isPopular: !!itemData.isPopular,
      isNew: !!itemData.isNew,
      isFeatured: !!itemData.isFeatured,
      isAvailable: itemData.isAvailable ?? true,
      prepTimeMinutes: itemData.prepTimeMinutes || 15,
      allergens: itemData.allergens || [],
      modifierGroupIds: itemData.modifierGroupIds || [],
      // The restaurant chooses the tax on a dish. When it has exactly one active tax group that is the obvious choice; with several
      // (or none) nothing is guessed and the dish carries no tax group until one is picked.
      taxGroupId: itemData.taxGroupId ?? (db.taxGroups.filter((t) => t.isActive).length === 1 ? db.taxGroups.find((t) => t.isActive)!.id : undefined),
      ...(itemData.isQrOrderingEnabled !== undefined ? { isQrOrderingEnabled: itemData.isQrOrderingEnabled } : {}),
      ...(itemData.salesChannels ? { salesChannels: itemData.salesChannels } : {}),
      ...(itemData.branchIds ? { branchIds: itemData.branchIds } : {}),
      ...(itemData.minQuantity !== undefined ? { minQuantity: itemData.minQuantity } : {}),
      ...(itemData.maxQuantity !== undefined ? { maxQuantity: itemData.maxQuantity } : {}),
      ...(itemData.allowInstructions !== undefined ? { allowInstructions: itemData.allowInstructions } : {}),
      sortOrder: itemData.sortOrder ?? db.menuItems.length + 1,
      kitchenStation: itemData.kitchenStation || 'Main Kitchen'
    };
    db.menuItems.push(newItem);
    db.notify();
    return newItem;
  }

  public static updateMenuItem(id: string, updates: Partial<MenuItem>): MenuItem | null {
    const idx = db.menuItems.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    db.menuItems[idx] = { ...db.menuItems[idx], ...updates };
    db.notify();
    return db.menuItems[idx];
  }

  /** Dish names compare without case, spaces or punctuation, so "Paneer Tikka Angara" and "paneer-tikka  angara!" are one dish. */
  public static normalizeDishName(name: string): string {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** The dish already on the menu with this name (or, when given, the same SKU in the same category), if any. */
  public static findDuplicateDish(name: string, opts: { excludeId?: string; sku?: string; categoryId?: string } = {}): MenuItem | undefined {
    const norm = this.normalizeDishName(name);
    return db.menuItems.find(
      (i) =>
        i.id !== opts.excludeId &&
        ((norm !== '' && this.normalizeDishName(i.name) === norm) || (!!opts.sku && !!i.sku && i.sku === opts.sku && i.categoryId === opts.categoryId))
    );
  }

  /**
   * Removes dishes that are the same dish twice (same name once case and punctuation are ignored, or the same SKU in one category).
   * Of each group the best copy stays: the one with a photo, then the one that is available, then the oldest. Combos that pointed
   * at a removed copy are re-pointed at the one that stays, and every removal is recorded so other devices drop it too.
   */
  public static removeDuplicateDishes(): { removed: number; kept: number } {
    const groups = new Map<string, MenuItem[]>();
    const add = (key: string, item: MenuItem) => groups.set(key, [...(groups.get(key) ?? []), item]);
    for (const item of db.menuItems) {
      const norm = this.normalizeDishName(item.name);
      if (norm) add(`n:${norm}`, item);
      if (item.sku) add(`s:${item.categoryId}:${item.sku}`, item);
    }
    const doomed = new Map<string, string>(); // removed id -> kept id
    const score = (i: MenuItem) => (i.imageUrl && !i.imageUrl.includes('fallback') ? 2 : 0) + (i.isAvailable ? 1 : 0);
    for (const items of groups.values()) {
      const live = items.filter((i) => !doomed.has(i.id));
      if (live.length < 2) continue;
      const keep = [...live].sort((a, b) => score(b) - score(a) || db.menuItems.indexOf(a) - db.menuItems.indexOf(b))[0];
      for (const other of live) if (other.id !== keep.id) doomed.set(other.id, keep.id);
    }
    if (doomed.size === 0) return { removed: 0, kept: db.menuItems.length };
    for (const combo of db.combos ?? []) {
      for (const field of ['mainItemIds', 'sideItemIds', 'drinkItemIds', 'dessertItemIds'] as const) {
        const ids = (combo as unknown as Record<string, string[] | undefined>)[field];
        if (Array.isArray(ids)) (combo as unknown as Record<string, string[]>)[field] = [...new Set(ids.map((id) => doomed.get(id) ?? id))];
      }
    }
    for (const id of doomed.keys()) {
      const idx = db.menuItems.findIndex((i) => i.id === id);
      if (idx !== -1) {
        db.menuItems.splice(idx, 1);
        MenuItemSync.recordDeletion(id);
      }
    }
    db.notify();
    return { removed: doomed.size, kept: db.menuItems.length };
  }

  public static deleteMenuItem(id: string): boolean {
    const idx = db.menuItems.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    db.menuItems.splice(idx, 1);
    MenuItemSync.recordDeletion(id);
    db.notify();
    return true;
  }

  public static toggleItemAvailability(
    id: string,
    isAvailable?: boolean,
    reason?: string,
    username?: string
  ): MenuItem | null {
    const item = db.menuItems.find((i) => i.id === id);
    if (!item) return null;
    item.isAvailable = isAvailable !== undefined ? isAvailable : !item.isAvailable;
    item.soldOutReason = !item.isAvailable ? reason || 'Out of stock' : undefined;

    AuditRepository.log({
      action: 'ITEM_AVAILABILITY_CHANGED',
      category: 'MENU',
      details: `Dish "${item.name}" (SKU: ${item.sku}) marked as ${item.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}${reason ? ` (Reason: ${reason})` : ''}`,
      username: username || 'Cashier'
    });

    db.notify();
    return item;
  }

  public static bulkToggleAvailability(
    ids: string[],
    isAvailable: boolean,
    reason?: string,
    username?: string
  ): number {
    let count = 0;
    ids.forEach((id) => {
      const item = db.menuItems.find((i) => i.id === id);
      if (item) {
        item.isAvailable = isAvailable;
        item.soldOutReason = !isAvailable ? reason || 'Bulk out of stock' : undefined;
        count++;
      }
    });

    if (count > 0) {
      AuditRepository.log({
        action: 'ITEM_AVAILABILITY_CHANGED',
        category: 'MENU',
        details: `Bulk updated ${count} dishes to ${isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}${reason ? ` (Reason: ${reason})` : ''}`,
        username: username || 'Cashier'
      });
      db.notify();
    }
    return count;
  }

  public static getAllModifierGroups(): ModifierGroup[] {
    return db.modifierGroups;
  }
}

/**
 * An order that is still open and has not been paid: sent to the kitchen, bill requested, or a self-order
 * kiosk guest who chose "pay at the counter". It is not a sale and not collected money yet (BUG-151/161), so
 * sales, order counts and payment totals leave it out until the payment is settled.
 */
export function isUnpaidOpenOrder(o: Pick<Order, 'orderStatus' | 'paymentStatus'>): boolean {
  if (o.orderStatus === 'CANCELLED' || o.orderStatus === 'COMPLETED' || o.orderStatus === 'REFUNDED') return false;
  return o.paymentStatus !== 'SUCCESS' && o.paymentStatus !== 'REFUNDED';
}

/**
 * Sends an order to the local relay service on this network (port 5178), if this browser has been let in. The
 * relay needs a one-time pairing that no screen performs yet, so every call was refused with 401 and each order
 * action added another rejection to the log (BUG-156). Once it has refused this browser, calls stop until the
 * connection is re-established; the cloud sync is what carries orders between devices.
 */
function postToLocalService(path: string, method: 'POST' | 'PATCH', body: unknown): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  if (db.isLocalCoreUnauthorized()) return;
  const host = window.location?.hostname || 'localhost';
  fetch(`http://${host}:5178${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then((res) => {
      if (res.status === 401) db.markLocalCoreUnauthorized();
    })
    .catch(() => {});
}

export class OrderRepository {
  public static getAllOrders(): Order[] {
    return [...db.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getOrderById(id: string): Order | undefined {
    return db.orders.find((o) => o.id === id);
  }

  public static getOrderByToken(token: string): Order | undefined {
    return db.orders.find((o) => o.tokenNumber === token);
  }

  /**
   * The next token for a business day: 101, 102 ... A device that numbers on its own passes a prefix
   * ('K' for the self-order kiosk gives K-101), so its tokens can never equal another device's (BUG-160): the
   * kiosk and the counter each used to hand out #101 on the same day, and neither knew about the other.
   *
   * An admin-triggered reset (TokenSequenceRepository.reset) makes orders placed before the reset
   * invisible to this scan for that one prefix, so the sequence can restart at 101 without deleting
   * any order history — see that class's own doc comment for the tradeoff this implies.
   */
  public static nextTokenNumber(prefix: string = '', businessDayId?: string): string {
    const dayId = businessDayId || BusinessDayRepository.getActiveBusinessDay().id;
    const tag = prefix ? `${prefix}-` : '';
    const resetAt = db.tokenSequenceResets[prefix];
    const resetAtMs = resetAt ? Date.parse(resetAt) : null;
    let highest = 100;
    for (const o of db.orders) {
      if (o.businessDayId !== dayId) continue;
      if (resetAtMs !== null && new Date(o.createdAt).getTime() < resetAtMs) continue;
      const t = String(o.tokenNumber ?? '');
      if (!t.startsWith(tag)) continue;
      const rest = t.slice(tag.length);
      if (!/^\d+$/.test(rest)) continue;
      highest = Math.max(highest, parseInt(rest, 10));
    }
    return `${tag}${highest + 1}`;
  }

  public static updateOrder(id: string, updates: Partial<Order>): Order | null {
    const idx = db.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    db.orders[idx] = { ...db.orders[idx], ...updates };
    db.notify();
    return db.orders[idx];
  }

  /**
   * The guest picked how they will pay on the payment screen (BUG-134). The self-order kiosk creates the order
   * before that screen is shown, with the default method, so the choice has to be written onto the order or
   * a cash-at-counter order is recorded (and printed) as paid by UPI. A cash choice leaves the payment PENDING:
   * nothing has been collected until the cashier takes the money.
   */
  public static choosePaymentMethod(id: string, method: PaymentMethod): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;
    const settled = order.paymentStatus === 'SUCCESS';
    if (settled || order.paymentMethod === method) return order;
    return OrderRepository.updateOrder(id, {
      paymentMethod: method,
      paymentStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
      syncStatus: 'SAVED_LOCALLY'
    });
  }

  /**
   * Data-integrity fix: `subtotal` must equal the sum of what the order's own
   * items actually cost (unit price × quantity) — discounts are tracked
   * separately in `discountAmount`/`totalAmount` and never shrink `subtotal`
   * itself (see packages/business/src/pricing.ts's calculateCart, the shared
   * trusted calculator every UI already uses). A `subtotal` far below that sum
   * is either a caller bug or a fabricated total from a caller bypassing the
   * UI's own cart computation — this doesn't replicate every app's full
   * tax/discount/round-off pipeline (each already has its own tested one),
   * it only rejects the one thing no legitimate order can ever produce.
   */
  private static validateOrderSubtotal(orderData: Partial<Order>): number {
    const items = orderData.items || [];
    const expectedSubtotal = items.reduce((sum, it) => {
      const lineTotal = typeof it.totalPrice === 'number' ? it.totalPrice : (it.unitPrice || 0) * (it.quantity || 0);
      return sum + lineTotal;
    }, 0);

    if (items.length === 0) {
      return orderData.subtotal || 0;
    }

    const TOLERANCE = 1; // paise/rupee rounding slack across independently-rounded line items
    if (typeof orderData.subtotal === 'number' && orderData.subtotal < expectedSubtotal - TOLERANCE) {
      throw new Error(
        `Order subtotal (₹${orderData.subtotal}) is lower than the actual cost of its items (₹${expectedSubtotal}) — rejected.`
      );
    }

    return typeof orderData.subtotal === 'number' ? orderData.subtotal : expectedSubtotal;
  }

  /** Atomic: if anything inside fails, no half-created order (or its side effects) is left behind. */
  public static createOrder(orderData: Partial<Order>): Order {
    return db.transaction(() => this.createOrderInner(orderData));
  }

  private static createOrderInner(orderData: Partial<Order>): Order {
    // An order created already-paid by UPI is a UPI payment being recorded: same rule as settleOrder.
    if ((orderData.paymentStatus ?? 'PENDING') === 'SUCCESS') PaymentPolicy.assertAllowed(orderData.paymentMethod ?? '');
    // Idempotency fix: a key was generated and stored on every order, but never
    // looked up before insert — a retried/duplicated submit (network retry, a
    // double-tapped "place order" button re-firing the same request) created a
    // second order with a fresh id, not a no-op. Now genuinely deduplicated.
    if (orderData.idempotencyKey) {
      const existing = db.orders.find((o) => o.idempotencyKey === orderData.idempotencyKey);
      if (existing) return existing;
    }

    const validatedSubtotal = this.validateOrderSubtotal(orderData);
    const businessDayId = orderData.businessDayId || BusinessDayRepository.getActiveBusinessDay().id;

    // Reset daily token counter per business day
    const tokenNumber = orderData.tokenNumber || OrderRepository.nextTokenNumber('', businessDayId);
    // Hard uniqueness guarantee, not just a low-probability random draw.
    let orderNumber = orderData.orderNumber;
    if (!orderNumber) {
      // An activated device numbers from server-leased blocks (collision-free across offline terminals).
      orderNumber = NumberAllocator.next('ORDER') ?? undefined;
    }
    if (!orderNumber) {
      do {
        orderNumber = generateOrderNumber();
      } while (db.orders.some((o) => o.orderNumber === orderNumber));
    }

    const nowIso = new Date().toISOString();
    const resolvedSourceType = orderData.source_type || 'KIOSK';

    const resolvedKioskId: string =
      orderData.kioskId ||
      (resolvedSourceType === 'POS'
        ? 'POS-01'
        : resolvedSourceType === 'CAPTAIN'
        ? 'CAPTAIN-01'
        : 'KIOSK-01');

    const creatorActor =
      resolvedSourceType === 'CAPTAIN'
        ? 'Captain App'
        : resolvedSourceType === 'POS'
        ? 'POS Terminal (POS-01)'
        : (resolvedKioskId || 'Self-Order Kiosk');

    const newOrder: Order = {
      id: orderData.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      orderNumber,
      tokenNumber,
      businessDayId,
      restaurantId: orderData.restaurantId || db.restaurant.id,
      outletId: orderData.outletId || db.outlet.id,
      kioskId: resolvedKioskId,
      sessionId: orderData.sessionId || generateUUID(),
      idempotencyKey: orderData.idempotencyKey || generateUUID(),
      orderType: orderData.orderType || 'DINE_IN',
      tableId: orderData.tableId,
      tableNumber: orderData.tableNumber,
      cashierName: orderData.cashierName,
      captainName: orderData.captainName,
      guestCount: orderData.guestCount,
      customerPhone: orderData.customerPhone,
      customerName: orderData.customerName,
      items: orderData.items || [],
      subtotal: validatedSubtotal,
      discountAmount: orderData.discountAmount || 0,
      discountType: orderData.discountType,
      discountValue: orderData.discountValue,
      discountScope: orderData.discountScope,
      discountReason: orderData.discountReason,
      discountCode: orderData.discountCode,
      discountAppliedBy: orderData.discountAppliedBy,
      discountAppliedAt: orderData.discountAppliedAt,
      discountApprovalStatus: orderData.discountApprovalStatus,
      couponCode: orderData.couponCode,
      cgstAmount: orderData.cgstAmount || 0,
      sgstAmount: orderData.sgstAmount || 0,
      taxAmount: orderData.taxAmount || 0,
      serviceChargeAmount: orderData.serviceChargeAmount || 0,
      tipAmount: orderData.tipAmount || 0,
      roundOffAmount: orderData.roundOffAmount || 0,
      totalAmount: orderData.totalAmount || 0,
      paymentMethod: orderData.paymentMethod || 'UPI_QR',
      paymentStatus: orderData.paymentStatus || 'PENDING',
      paymentTransactionId: orderData.paymentTransactionId,
      orderStatus: orderData.orderStatus || 'CONFIRMED',
      estimatedWaitMinutes: orderData.estimatedWaitMinutes || 15,
      pickupCounter: orderData.pickupCounter || 'Counter 1',
      source_type: resolvedSourceType,
      acknowledgementStage:
        orderData.acknowledgementStage ||
        ((orderData.syncStatus || 'SAVED_LOCALLY') === 'SAVED_LOCALLY' ? 'ORDER_CREATED_LOCALLY' : 'ORDER_SENT_TO_KDS'),
      timeline: orderData.timeline || [
        {
          status: 'NEW',
          title: `Order Created by ${creatorActor}`,
          timestamp: nowIso,
          actor: creatorActor
        },
        {
          status: 'CONFIRMED',
          title: `Payment Confirmed (${orderData.paymentMethod || 'UPI_QR'})`,
          timestamp: nowIso
        }
      ],
      // A locally created order has, by definition, not reached the cloud yet.
      // It used to default to 'SYNCED', which made the outbox (it only pushes
      // SAVED_LOCALLY / FAILED orders) skip every order paid directly from POS.
      // Callers that mirror an already-synced order pass 'SYNCED' explicitly.
      syncStatus: orderData.syncStatus || 'SAVED_LOCALLY',
      isSynced: orderData.isSynced ?? (orderData.syncStatus === 'SYNCED'),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    db.orders.unshift(newOrder);
    BusinessDayRepository.recalculateMetrics(businessDayId);

    // If dine in, update table occupancy
    if (newOrder.tableId) {
      const tbl = db.tables.find((t) => t.id === newOrder.tableId || t.tableNumber === newOrder.tableNumber);
      if (tbl) {
        tbl.status = 'OCCUPIED';
        tbl.currentOrderId = newOrder.id;
      }
    }

    // Auto-deduct stock via recipes (idempotent per order line - see reconcileOrder)
    InventoryRepository.reconcileOrder(newOrder);

    // Update active shift stats if payment is already successful (e.g. Counter instant bill / kiosk order)
    if (newOrder.paymentStatus === 'SUCCESS') {
      // getActiveShift() derives the shift totals from the orders themselves, so
      // refreshing it is enough. Adding the amounts again here double-counted
      // every settlement until the next read.
      ShiftRepository.getActiveShift();
    }

    db.notify();

    postToLocalService(`/api/orders`, 'POST', newOrder);

    return newOrder;
  }

  public static updateOrderStatus(id: string, status: OrderStatus, actor: string = 'Admin'): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;
    const prevStatus = order.orderStatus;
    order.orderStatus = status;
    if (status === 'CANCELLED' && prevStatus !== 'CANCELLED') InventoryRepository.restoreForOrder(order, 'Order cancelled');
    order.updatedAt = new Date().toISOString();
    // A locally-made status change (POS/Restaurant Admin advancing an order)
    // needs to reach the cloud mirror again — without this, only the order's
    // initial creation would ever get pushed and every status change after
    // that would be invisible to other devices relying on the sync bridge's
    // catch-up pull. (This was mistakenly added only to QrOrderingRepository's
    // separate updateOrderStatus below, not here, in an earlier pass.)
    order.syncStatus = 'SAVED_LOCALLY';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status,
      title: status === 'CONFIRMED' ? 'Order Acknowledged by Admin' : `Status advanced to ${status}`,
      timestamp: order.updatedAt,
      actor
    });

    if (status === 'COMPLETED' || status === 'COLLECTED' || status === 'CANCELLED') {
      if (order.tableId) {
        const tbl = db.tables.find((t) => t.id === order.tableId);
        if (tbl && tbl.currentOrderId === id) {
          tbl.status = 'AVAILABLE';
          tbl.currentOrderId = undefined;
        }
      }
    }

    db.notify();

    postToLocalService(`/api/orders/${id}/status`, 'PATCH', { status, actor });

    return order;
  }

  public static settleOrder(
    id: string,
    paymentMethod: PaymentMethod,
    tenderedAmount?: number,
    transactionId?: string,
    actor: string = 'Cashier',
    splits?: PaymentSplit[]
  ): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;

    // Settling is idempotent: the same payment again changes nothing; a different one is refused.
    if (order.paymentStatus === 'SUCCESS' && order.paymentTransactionId) {
      if (transactionId && transactionId !== order.paymentTransactionId) {
        throw new Error(`ORDER_ALREADY_PAID: this order was already paid (${order.paymentTransactionId})`);
      }
      return order;
    }
    // No screen and no sync path may record a UPI payment as taken while the internet is unverified.
    PaymentPolicy.assertAllowed(paymentMethod);

    if (splits && splits.length > 0 && !splitsMatchTotal(splits, order.totalAmount)) {
      throw new Error(`Payment lines do not add up to the bill total (₹${order.totalAmount})`);
    }

    const now = new Date().toISOString();
    order.paymentMethod = paymentMethod;
    if (splits && splits.length > 0) {
      order.paymentSplits = splits.map((l) => ({ ...l }));
    }
    order.paymentStatus = 'SUCCESS';
    order.orderStatus = 'COMPLETED';
    order.paymentTransactionId = transactionId || `TXN-${Date.now()}`;
    if (tenderedAmount !== undefined) {
      order.tenderedAmount = tenderedAmount;
      order.changeAmount = Math.max(0, Number((tenderedAmount - order.totalAmount).toFixed(2)));
    }
    order.updatedAt = now;
    // The paid state must reach the cloud too, not just the KOT-time copy.
    order.syncStatus = 'SAVED_LOCALLY';
    order.isSynced = false;

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'PAID',
      title: `Settled via ${paymentMethod} (₹${order.totalAmount})`,
      timestamp: now,
      actor
    });

    // Release table if dine-in
    if (order.tableId) {
      const tbl = db.tables.find((t) => t.id === order.tableId || t.tableNumber === order.tableNumber);
      if (tbl && tbl.currentOrderId === id) {
        tbl.status = 'AVAILABLE';
        tbl.currentOrderId = undefined;
      }
    }

    // Update Shift stats if active shift exists
    // Shift totals are derived from the orders (see getActiveShift); refresh only.
    ShiftRepository.getActiveShift();

    // Automated loyalty earn — previously nothing credited points or
    // advanced totalSpend/totalVisits on an actual paid order; only a
    // manual addPoints() call existed, never wired to checkout.
    if (order.customerPhone) {
      CustomerRepository.earnPointsForOrder(order.customerPhone, order.totalAmount, order.id);
    }

    db.notify();

    postToLocalService(`/api/orders`, 'POST', order);

    return order;
  }

  public static voidOrder(id: string, reason: string, managerName: string): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;
    // A paid order's revenue is already booked into shift/business-day
    // totals — cancelling its status here without reversing those would
    // silently corrupt cash-drawer reconciliation. refundOrder() below does
    // that reversal; void is only for a bill that was never actually paid.
    if (order.paymentStatus === 'SUCCESS') {
      throw new Error('This order has already been paid — use Refund instead of Void.');
    }
    if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REFUNDED') {
      throw new Error('This order has already been voided or refunded.');
    }

    const now = new Date().toISOString();
    InventoryRepository.restoreForOrder(order, `Void: ${reason}`);
    order.orderStatus = 'CANCELLED';
    order.paymentStatus = 'CANCELLED';
    order.updatedAt = now;
    order.syncStatus = 'SAVED_LOCALLY';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'CANCELLED',
      title: `Order Voided by ${managerName}`,
      note: `Reason: ${reason}`,
      timestamp: now,
      actor: managerName
    });

    if (order.tableId) {
      const tbl = db.tables.find((t) => t.id === order.tableId);
      if (tbl && tbl.currentOrderId === id) {
        tbl.status = 'AVAILABLE';
        tbl.currentOrderId = undefined;
      }
    }

    db.notify();

    postToLocalService(`/api/orders`, 'POST', order);

    AuditRepository.log({
      action: 'ORDER_VOID',
      category: 'ORDER',
      details: `Order #${order.orderNumber} voided by ${managerName}. Reason: ${reason}`,
      username: managerName
    });

    db.notify();
    return order;
  }

  public static refundOrder(id: string, refundAmount: number, reason: string, managerName: string): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;
    if (order.paymentStatus !== 'SUCCESS') {
      throw new Error('Only a paid order can be refunded.');
    }
    if (order.orderStatus === 'REFUNDED') {
      throw new Error('This order has already been refunded.');
    }
    if (refundAmount <= 0 || refundAmount > order.totalAmount) {
      throw new Error(`Refund amount must be between ₹1 and the order total (₹${order.totalAmount}).`);
    }

    const now = new Date().toISOString();
    const isFullRefund = refundAmount === order.totalAmount;
    // A full refund gives the stock back; a partial refund cannot say which items were returned, so it leaves stock alone.
    if (refundAmount >= order.totalAmount) InventoryRepository.restoreForOrder(order, `Refund: ${reason}`);
    order.orderStatus = 'REFUNDED';
    // A partial refund settles a lesser amount back to the guest but the
    // order itself was still genuinely paid — only a full refund reverses
    // paymentStatus itself, matching the same distinction createOrder's own
    // paymentStatus/orderStatus split already makes elsewhere.
    order.paymentStatus = isFullRefund ? 'REFUNDED' : order.paymentStatus;
    order.updatedAt = now;
    order.syncStatus = 'SAVED_LOCALLY';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'REFUNDED',
      title: `Refund Processed ₹${refundAmount} by ${managerName}`,
      note: `Reason: ${reason}`,
      timestamp: now,
      actor: managerName
    });

    // Reverses the same shift counters createOrder/completePayment
    // incremented — without this, a processed refund leaves the cash
    // drawer's expected-vs-actual reconciliation silently wrong for the
    // rest of the shift.
    const activeShift = ShiftRepository.getActiveShift();
    if (activeShift) {
      activeShift.totalSales -= refundAmount;
      const pMethod = order.paymentMethod;
      if (pMethod === 'CASH' || pMethod === 'CASH_AT_COUNTER') {
        activeShift.totalCashSales -= refundAmount;
        activeShift.expectedCash -= refundAmount;
      } else if (pMethod === 'UPI' || pMethod === 'UPI_QR') {
        activeShift.totalUpiSales -= refundAmount;
      } else if (pMethod === 'CARD' || pMethod === 'CARD_TERMINAL') {
        activeShift.totalCardSales -= refundAmount;
      }
    }
    if (order.businessDayId) {
      BusinessDayRepository.recalculateMetrics(order.businessDayId);
    }

    AuditRepository.log({
      action: 'REFUND',
      category: 'PAYMENT',
      details: `Refund ₹${refundAmount} on order #${order.orderNumber} approved by ${managerName}. Reason: ${reason}`,
      username: managerName
    });

    db.notify();
    return order;
  }

  public static transferTable(orderId: string, toTableId: string, toTableNumber: string, reason?: string): Order | null {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const oldTableId = order.tableId;
    const oldTableNumber = order.tableNumber;

    // Free old table
    if (oldTableId) {
      const oldTbl = db.tables.find((t) => t.id === oldTableId || t.tableNumber === oldTableNumber);
      if (oldTbl && oldTbl.currentOrderId === orderId) {
        oldTbl.status = 'AVAILABLE';
        oldTbl.currentOrderId = undefined;
      }
    }

    // Occupy new table
    order.tableId = toTableId;
    order.tableNumber = toTableNumber;
    order.updatedAt = new Date().toISOString();

    const newTbl = db.tables.find((t) => t.id === toTableId || t.tableNumber === toTableNumber);
    if (newTbl) {
      newTbl.status = 'OCCUPIED';
      newTbl.currentOrderId = orderId;
    }

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'TABLE_TRANSFER',
      title: `Transferred from Table ${oldTableNumber || '?'} to Table ${toTableNumber}`,
      note: reason,
      timestamp: order.updatedAt
    });

    db.notify();
    return order;
  }

  public static mergeTables(sourceTableId: string, targetTableId: string): boolean {
    const sourceTable = db.tables.find((t) => t.id === sourceTableId);
    const targetTable = db.tables.find((t) => t.id === targetTableId);
    if (!sourceTable || !targetTable) return false;

    const sourceOrder = db.orders.find((o) => o.id === sourceTable.currentOrderId);
    const targetOrder = db.orders.find((o) => o.id === targetTable.currentOrderId);

    if (sourceOrder && targetOrder) {
      // Merge items from sourceOrder into targetOrder
      targetOrder.items.push(...sourceOrder.items);
      targetOrder.subtotal += sourceOrder.subtotal;
      targetOrder.taxAmount += sourceOrder.taxAmount;
      targetOrder.totalAmount += sourceOrder.totalAmount;
      targetOrder.updatedAt = new Date().toISOString();

      // Cancel source order
      sourceOrder.orderStatus = 'CANCELLED';
      sourceTable.status = 'OCCUPIED';
      sourceTable.currentOrderId = targetOrder.id;

      db.notify();
      return true;
    } else if (sourceOrder && !targetOrder) {
      targetTable.status = 'OCCUPIED';
      targetTable.currentOrderId = sourceOrder.id;
      sourceOrder.tableNumber = `${sourceTable.tableNumber}+${targetTable.tableNumber}`;
      db.notify();
      return true;
    }

    return false;
  }
}

/**
 * Lets an admin restart a device type's token sequence at 101 without deleting order history —
 * see OrderRepository.nextTokenNumber's own comment for how the reset is applied. Deliberately not
 * exposed as "delete today's orders": that would erase real sales data just to renumber tickets.
 *
 * Tradeoff an admin should know before using this: if orders were already placed today with this
 * prefix, a reset can hand out a token number that's already in use today (e.g. two different
 * orders both showing "K-101" on their kitchen tickets) — the UI surfaces this plainly rather than
 * silently allowing it.
 */
export class TokenSequenceRepository {
  public static getLastReset(prefix: string): string | null {
    return db.tokenSequenceResets[prefix] ?? null;
  }

  public static reset(prefix: string, actor: string = 'Kiosk Admin'): void {
    db.tokenSequenceResets = { ...db.tokenSequenceResets, [prefix]: new Date().toISOString() };
    AuditRepository.log({
      action: 'SETTINGS_UPDATE',
      category: 'BUSINESS',
      details: `Reset the token counter for "${prefix || 'default'}" — next order restarts at 101`,
      username: actor
    });
    db.notify();
  }
}

/**
 * Delivery rider roster + dispatch tracking — previously a DELIVERY order
 * had an orderType and nothing else: no address capture beyond whatever was
 * typed as a note, no rider roster, no way to know if an order was ever
 * actually handed to a rider or delivered.
 */
export class RiderRepository {
  public static getAllRiders(): DeliveryRider[] {
    return db.deliveryRiders;
  }

  public static getActiveRiders(): DeliveryRider[] {
    return db.deliveryRiders.filter((r) => r.isActive);
  }

  public static createRider(data: Omit<DeliveryRider, 'id' | 'createdAt'>): DeliveryRider {
    const rider: DeliveryRider = { id: `rider-${Date.now()}`, createdAt: new Date().toISOString(), ...data };
    db.deliveryRiders.push(rider);
    AuditRepository.log({ action: 'RIDER_CREATED', category: 'STAFF', details: `Added rider ${rider.name} (${rider.phone})`, username: 'Manager' });
    db.notify();
    return rider;
  }

  public static updateRider(id: string, updates: Partial<DeliveryRider>): DeliveryRider | null {
    const idx = db.deliveryRiders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.deliveryRiders[idx] = { ...db.deliveryRiders[idx], ...updates };
    db.notify();
    return db.deliveryRiders[idx];
  }

  public static deleteRider(id: string): boolean {
    const idx = db.deliveryRiders.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    db.deliveryRiders.splice(idx, 1);
    db.notify();
    return true;
  }

  public static assignRider(orderId: string, riderId: string): Order | null {
    const order = db.orders.find((o) => o.id === orderId);
    const rider = db.deliveryRiders.find((r) => r.id === riderId);
    if (!order || !rider) return null;

    order.riderId = rider.id;
    order.riderName = rider.name;
    order.deliveryStatus = 'ASSIGNED';
    order.updatedAt = new Date().toISOString();

    AuditRepository.log({ action: 'DELIVERY_RIDER_ASSIGNED', category: 'ORDER', details: `Assigned ${rider.name} to order ${order.orderNumber}`, username: 'Manager' });
    db.notify();
    return order;
  }

  public static updateDeliveryStatus(orderId: string, status: DeliveryStatus): Order | null {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return null;

    order.deliveryStatus = status;
    order.updatedAt = new Date().toISOString();
    if (status === 'OUT_FOR_DELIVERY' && !order.dispatchedAt) order.dispatchedAt = new Date().toISOString();
    if (status === 'DELIVERED') order.deliveredAt = new Date().toISOString();

    AuditRepository.log({ action: 'DELIVERY_STATUS_UPDATED', category: 'ORDER', details: `Order ${order.orderNumber} marked ${status}`, username: 'Manager' });
    db.notify();
    return order;
  }
}

export class TableRepository {
  public static getAllTables(): DiningTable[] {
    return db.tables;
  }

  public static getTableById(id: string): DiningTable | undefined {
    return db.tables.find((t) => t.id === id);
  }

  /** True when another table already has this number (BUG-120: the same number could be created twice). */
  public static isTableNumberTaken(tableNumber: string, exceptTableId?: string): boolean {
    const wanted = tableNumber.trim();
    return db.tables.some((t) => t.tableNumber === wanted && t.id !== exceptTableId);
  }

  /** The dining zones this restaurant's tables use, each once, in floor-plan order (BUG-116). */
  public static getZones(): string[] {
    const zones: string[] = [];
    for (const t of db.tables) {
      const zone = (t.zone || '').trim();
      if (zone && !zones.includes(zone)) zones.push(zone);
    }
    return zones;
  }

  public static createTable(tableData: Partial<DiningTable>): DiningTable {
    const newTable: DiningTable = {
      // Two devices (or two clicks in one millisecond) must never mint the same table id: it keys the table's QR code.
      id: tableData.id || `tbl-${Date.now().toString(36)}-${globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
      outletId: tableData.outletId || db.outlet.id,
      tableNumber: tableData.tableNumber || `${db.tables.length + 1}`,
      capacity: tableData.capacity || 4,
      zone: tableData.zone || TableRepository.getZones()[0] || 'Main Hall',
      floor: tableData.floor || 1,
      status: tableData.status || 'AVAILABLE',
      isActive: tableData.isActive ?? true
    };
    db.tables.push(newTable);
    AuditRepository.log({
      action: 'TABLE_CREATED',
      category: 'SETTINGS',
      details: `Created table T-${newTable.tableNumber} (${newTable.capacity} Pax, Zone: ${newTable.zone})`,
      username: 'Manager'
    });
    db.notify();
    return newTable;
  }

  public static updateTable(id: string, updates: Partial<DiningTable>): DiningTable | null {
    const idx = db.tables.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    db.tables[idx] = { ...db.tables[idx], ...updates };
    AuditRepository.log({
      action: 'TABLE_UPDATED',
      category: 'SETTINGS',
      details: `Updated table T-${db.tables[idx].tableNumber}`,
      username: 'Manager'
    });
    db.notify();
    return db.tables[idx];
  }

  public static updateTableStatus(id: string, status: DiningTable['status']): DiningTable | null {
    const tbl = db.tables.find((t) => t.id === id);
    if (!tbl) return null;
    // A move the table cannot legally make (for example free -> billing, or anything out of BLOCKED but AVAILABLE) is refused.
    if (!canMoveTable(tbl.status, status)) return null;
    tbl.status = status;
    if (status === 'AVAILABLE') {
      tbl.currentOrderId = undefined;
    }
    db.notify();
    return tbl;
  }

  /**
   * Frees every table whose running order has already been completed or cancelled — typically
   * settled at the POS counter, so this device only learns of it through order sync. Without it a
   * waiter's table stayed "bill requested" for ever after the guest had paid (BUG-097). A table
   * whose order has not reached this device yet is left alone.
   */
  public static releaseSettledTables(): number {
    let released = 0;
    for (const table of db.tables) {
      if (!table.currentOrderId) continue;
      const order = db.orders.find((o) => o.id === table.currentOrderId);
      if (!order || (order.orderStatus !== 'COMPLETED' && order.orderStatus !== 'CANCELLED')) continue;
      table.status = 'AVAILABLE';
      table.currentOrderId = undefined;
      table.currentGuests = undefined;
      table.openedById = undefined;
      table.openedByName = undefined;
      released += 1;
    }
    if (released > 0) db.notify();
    return released;
  }

  public static deleteTable(id: string): boolean {
    const idx = db.tables.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const num = db.tables[idx].tableNumber;
    const deletedId = db.tables[idx].id;
    db.tables.splice(idx, 1);
    TableSync.recordDeletion(deletedId);
    AuditRepository.log({
      action: 'TABLE_DELETED',
      category: 'SETTINGS',
      details: `Deleted table T-${num}`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }
}

export class CouponRepository {
  public static getAllCoupons(): Coupon[] {
    return db.coupons.filter((c) => c.isActive);
  }

  /**
   * B2-064: previously returned any active coupon regardless of `usageCount`/`usageLimit` or
   * `validFrom`/`validUntil` — those fields existed on the type and `incrementUsage` wrote to
   * one of them, but nothing ever read them back, so a capped or expired coupon still redeemed
   * forever. Now enforces both.
   */
  public static getByCode(code: string): Coupon | undefined {
    const coupon = db.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
    if (!coupon) return undefined;
    const now = Date.now();
    if (coupon.validFrom && now < new Date(coupon.validFrom).getTime()) return undefined;
    if (coupon.validUntil && now > new Date(coupon.validUntil).getTime()) return undefined;
    if (typeof coupon.usageLimit === 'number' && coupon.usageCount >= coupon.usageLimit) return undefined;
    return coupon;
  }

  public static incrementUsage(code: string): void {
    const cpn = db.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (cpn) {
      cpn.usageCount = (cpn.usageCount || 0) + 1;
      db.notify();
    }
  }

  public static createCoupon(coupon: Coupon): Coupon {
    db.coupons.push(coupon);
    db.notify();
    return coupon;
  }

  public static deleteCoupon(id: string): boolean {
    const idx = db.coupons.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    db.coupons.splice(idx, 1);
    CouponSync.recordDeletion(id); // so the deletion reaches the kiosks instead of the coupon coming back (BUG-133)
    db.notify();
    return true;
  }
}

export class KioskRepository {
  public static getAllKiosks(): KioskDevice[] {
    return db.kiosks;
  }

  public static getKioskById(id: string): KioskDevice | undefined {
    return db.kiosks.find((k) => k.id === id || k.kioskCode === id);
  }

  public static updateKioskStatus(id: string, status: KioskDevice['status'], isLocked: boolean = false): void {
    const k = db.kiosks.find((item) => item.id === id || item.kioskCode === id);
    if (k) {
      k.status = status;
      k.isLocked = isLocked;
      k.updatedAt = new Date().toISOString();
      db.notify();
    }
  }

  /**
   * Upserts a fleet entry from a real, currently-connected Kiosk mesh
   * heartbeat, so the Kiosk Terminal Fleet screen reflects devices that
   * actually activated and joined the mesh, instead of a fabricated
   * fixture list. Fields the browser genuinely cannot know (ipAddress,
   * macAddress) are left unset rather than faked.
   */
  public static upsertFromHeartbeat(peer: { deviceId: string; name: string; appVersion: string; lastHeartbeat: string }): void {
    const existing = db.kiosks.find((k) => k.id === peer.deviceId || k.kioskCode === peer.deviceId);
    if (existing) {
      existing.name = peer.name || existing.name;
      existing.appVersion = peer.appVersion;
      existing.lastHeartbeat = peer.lastHeartbeat;
      if (!existing.isLocked) existing.status = 'ONLINE';
      existing.updatedAt = new Date().toISOString();
    } else {
      db.kiosks.push({
        id: peer.deviceId,
        outletId: db.restaurant.id,
        kioskCode: peer.deviceId,
        name: peer.name || peer.deviceId,
        status: 'ONLINE',
        orderTypesAllowed: ['DINE_IN', 'TAKEAWAY'],
        allowCashAtCounter: true,
        defaultLanguage: 'en',
        idleTimeoutSeconds: 60,
        appVersion: peer.appVersion,
        lastHeartbeat: peer.lastHeartbeat,
        isLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    db.notify();
  }

  /** Marks any kiosk not seen recently as OFFLINE, mirroring the mesh's own staleness window. */
  public static markStaleOffline(activeDeviceIds: Set<string>): void {
    let changed = false;
    db.kiosks.forEach((k) => {
      if (!activeDeviceIds.has(k.id) && k.status !== 'OFFLINE') {
        k.status = 'OFFLINE';
        changed = true;
      }
    });
    if (changed) db.notify();
  }
}

export class ServiceRequestRepository {
  public static getAll(): ServiceRequest[] {
    return [...db.serviceRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static create(req: Partial<ServiceRequest>): ServiceRequest {
    const newReq: ServiceRequest = {
      id: req.id || `srv-${Date.now()}`,
      kioskId: req.kioskId || 'KIOSK-01',
      tableNumber: req.tableNumber,
      sessionId: req.sessionId,
      type: req.type || 'CALL_STAFF',
      notes: req.notes,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    db.serviceRequests.unshift(newReq);
    db.notify();
    return newReq;
  }

  public static resolve(id: string): void {
    const req = db.serviceRequests.find((r) => r.id === id);
    if (req) {
      req.status = 'RESOLVED';
      req.resolvedAt = new Date().toISOString();
      db.notify();
    }
  }
}

export class AuditRepository {
  public static log(entry: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
    const newLog: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    db.auditLogs.unshift(newLog);
    db.notify();
    return newLog;
  }

  public static getAll(): AuditLog[] {
    return db.auditLogs;
  }
}

export class CustomerRepository {
  public static getAll(): CustomerAccount[] {
    return db.customerAccounts;
  }

  public static getAccount(phone: string): CustomerAccount | undefined {
    return db.customerAccounts.find((a) => a.phone === phone);
  }

  // B2-043: matched by exact string, so "+91 92222 22223" (kiosk guest self-signup) and
  // "9222222223" (the same guest, registered by a staff member in the CRM) became two separate
  // accounts with two separate loyalty balances and two separate kiosk logins for one phone
  // number. Normalising here — the shared lookup/creation choke point every caller (kiosk login,
  // POS quick-add, the CRM) ultimately goes through — means every *new* record is keyed
  // consistently, without having to fix every call site individually.
  public static getByPhone(phone: string): CustomerAccount | undefined {
    const normalized = normalizeIndianPhone(phone);
    return db.customerAccounts.find((a) => a.phone === phone || a.phone === normalized);
  }

  public static getOrCreate(phone: string, name?: string): CustomerAccount {
    return this.getOrCreateAccount(phone, name);
  }

  public static getOrCreateAccount(phone: string, name?: string): CustomerAccount {
    const normalized = normalizeIndianPhone(phone);
    let account = db.customerAccounts.find((a) => a.phone === phone || a.phone === normalized);
    if (!account) {
      account = {
        phone: normalized || phone,
        name: name || 'Valued Guest',
        loyaltyPoints: 50, // Welcome 50 points
        favoriteItemIds: [],
        recentOrderIds: []
      };
      db.customerAccounts.push(account);
      db.notify();
    }
    return account;
  }

  public static addPoints(phone: string, points: number): void {
    const account = db.customerAccounts.find((a) => a.phone === phone);
    if (account) {
      account.loyaltyPoints += points;
      db.notify();
    }
  }

  public static addLoyaltyPoints(phone: string, points: number): void {
    this.addPoints(phone, points);
  }

  public static redeemPoints(phone: string, points: number): boolean {
    const account = db.customerAccounts.find((a) => a.phone === phone);
    if (account && account.loyaltyPoints >= points) {
      account.loyaltyPoints -= points;
      db.notify();
      return true;
    }
    return false;
  }

  public static createCustomer(cust: Partial<CustomerAccount> & { phone: string; name: string }): CustomerAccount {
    // B2-043: match a normalized phone too (defense in depth — CustomerModal.tsx already
    // normalizes before calling this, but any other caller passing a raw "+91 …" string must
    // still find the same existing record, not create a duplicate).
    const normalizedPhone = normalizeIndianPhone(cust.phone);
    const existing = db.customerAccounts.find((c) => c.phone === cust.phone || c.phone === normalizedPhone);
    if (existing) {
      existing.name = cust.name || existing.name;
      if (cust.loyaltyPoints !== undefined) existing.loyaltyPoints = cust.loyaltyPoints;
      // Was silently dropping every other field the CRM "Add Customer" form
      // collects (email, address, dob, anniversary, notes, tags) on repeat
      // calls — a staff member re-attaching an existing phone number with
      // updated details would see them vanish.
      if (cust.email !== undefined) existing.email = cust.email;
      if (cust.address !== undefined) existing.address = cust.address;
      if (cust.dob !== undefined) existing.dob = cust.dob;
      if (cust.anniversary !== undefined) existing.anniversary = cust.anniversary;
      if (cust.notes !== undefined) existing.notes = cust.notes;
      if (cust.tags !== undefined) existing.tags = cust.tags;
      db.notify();
      return existing;
    }
    const newCust: CustomerAccount = {
      phone: normalizedPhone || cust.phone,
      name: cust.name,
      email: cust.email,
      address: cust.address,
      dob: cust.dob,
      anniversary: cust.anniversary,
      notes: cust.notes,
      tags: cust.tags || [],
      loyaltyPoints: cust.loyaltyPoints || 50,
      favoriteItemIds: cust.favoriteItemIds || [],
      recentOrderIds: cust.recentOrderIds || [],
      createdAt: cust.createdAt || new Date().toISOString()
    };
    db.customerAccounts.push(newCust);
    AuditRepository.log({
      action: 'CUSTOMER_CREATED',
      category: 'CUSTOMER',
      details: `Created customer record for ${newCust.name} (${newCust.phone})`,
      username: 'Manager'
    });
    db.notify();
    return newCust;
  }

  public static updateCustomer(phone: string, updates: Partial<CustomerAccount>): CustomerAccount | null {
    const idx = db.customerAccounts.findIndex((c) => c.phone === phone);
    if (idx === -1) return null;
    db.customerAccounts[idx] = { ...db.customerAccounts[idx], ...updates };
    AuditRepository.log({
      action: 'CUSTOMER_UPDATED',
      category: 'CUSTOMER',
      details: `Updated customer profile ${db.customerAccounts[idx].name} (${phone})`,
      username: 'Manager'
    });
    db.notify();
    return db.customerAccounts[idx];
  }

  public static deleteCustomer(phone: string): boolean {
    const idx = db.customerAccounts.findIndex((c) => c.phone === phone);
    if (idx === -1) return false;
    const name = db.customerAccounts[idx].name;
    db.customerAccounts.splice(idx, 1);
    CustomerSync.recordDeletion(phone);
    AuditRepository.log({
      action: 'CUSTOMER_DELETED',
      category: 'CUSTOMER',
      details: `Deleted customer record ${name} (${phone})`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }

  public static toggleFavorite(phone: string, itemId: string): boolean {
    const account = this.getOrCreateAccount(phone);
    const idx = account.favoriteItemIds.indexOf(itemId);
    if (idx !== -1) {
      account.favoriteItemIds.splice(idx, 1);
    } else {
      account.favoriteItemIds.push(itemId);
    }
    db.notify();
    return account.favoriteItemIds.includes(itemId);
  }

  // ── Loyalty Tiers ──────────────────────────────────────────────────────

  public static getTiers(): LoyaltyTier[] {
    return [...db.loyaltyTiers].sort((a, b) => a.minLifetimeSpend - b.minLifetimeSpend);
  }

  /** The highest tier whose spend threshold the account's lifetime spend clears. Bronze (0) always matches, so this never returns undefined when at least one tier exists. */
  public static getTierForAccount(account: CustomerAccount): LoyaltyTier | undefined {
    const spend = account.totalSpend || 0;
    return this.getTiers()
      .filter((t) => spend >= t.minLifetimeSpend)
      .pop();
  }

  public static createTier(tier: Omit<LoyaltyTier, 'id'>): LoyaltyTier {
    const newTier: LoyaltyTier = { id: `tier-${Date.now()}`, ...tier };
    db.loyaltyTiers.push(newTier);
    AuditRepository.log({ action: 'LOYALTY_TIER_CREATED', category: 'CUSTOMER', details: `Created loyalty tier "${newTier.name}"`, username: 'Manager' });
    db.notify();
    return newTier;
  }

  public static updateTier(id: string, updates: Partial<LoyaltyTier>): LoyaltyTier | null {
    const idx = db.loyaltyTiers.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    db.loyaltyTiers[idx] = { ...db.loyaltyTiers[idx], ...updates };
    db.notify();
    return db.loyaltyTiers[idx];
  }

  public static deleteTier(id: string): boolean {
    const idx = db.loyaltyTiers.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    db.loyaltyTiers.splice(idx, 1);
    db.notify();
    return true;
  }

  // ── Rewards Catalog ────────────────────────────────────────────────────

  public static getRewards(): LoyaltyReward[] {
    return db.loyaltyRewards;
  }

  public static createReward(reward: Omit<LoyaltyReward, 'id'>): LoyaltyReward {
    const newReward: LoyaltyReward = { id: `reward-${Date.now()}`, ...reward };
    db.loyaltyRewards.push(newReward);
    AuditRepository.log({ action: 'LOYALTY_REWARD_CREATED', category: 'CUSTOMER', details: `Added reward "${newReward.name}" (${newReward.pointsCost} pts)`, username: 'Manager' });
    db.notify();
    return newReward;
  }

  public static updateReward(id: string, updates: Partial<LoyaltyReward>): LoyaltyReward | null {
    const idx = db.loyaltyRewards.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.loyaltyRewards[idx] = { ...db.loyaltyRewards[idx], ...updates };
    db.notify();
    return db.loyaltyRewards[idx];
  }

  public static deleteReward(id: string): boolean {
    const idx = db.loyaltyRewards.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    db.loyaltyRewards.splice(idx, 1);
    db.notify();
    return true;
  }

  /** Redeems a catalog reward against the customer's points balance — replaces the previous flat "any point = ₹1" assumption. */
  public static redeemReward(phone: string, rewardId: string): { ok: boolean; reason?: string } {
    const account = db.customerAccounts.find((a) => a.phone === phone);
    if (!account) return { ok: false, reason: 'Customer not found' };
    const reward = db.loyaltyRewards.find((r) => r.id === rewardId && r.isActive);
    if (!reward) return { ok: false, reason: 'Reward not found or inactive' };
    if (account.loyaltyPoints < reward.pointsCost) return { ok: false, reason: 'Not enough points' };

    account.loyaltyPoints -= reward.pointsCost;
    AuditRepository.log({
      action: 'LOYALTY_REWARD_REDEEMED',
      category: 'CUSTOMER',
      details: `${account.name || phone} redeemed "${reward.name}" for ${reward.pointsCost} pts`,
      username: 'Manager'
    });
    db.notify();
    return { ok: true };
  }

  /**
   * Automated earn rule, called on order settlement: base rate of 1 point
   * per ₹10 spent, multiplied by the customer's current tier. Also advances
   * totalSpend/totalVisits/lastVisitAt, which previously were seed-only
   * fields nothing ever updated — a customer's tier could never actually
   * change from real activity.
   */
  public static earnPointsForOrder(phone: string, orderTotal: number, orderId?: string): number {
    const account = this.getOrCreateAccount(phone);
    const tierBefore = this.getTierForAccount(account);

    account.totalSpend = (account.totalSpend || 0) + orderTotal;
    account.totalVisits = (account.totalVisits || 0) + 1;
    account.lastVisitAt = new Date().toISOString();
    // Was only ever initialized to [] and never appended to — a customer's
    // "360° view" (Restaurant Admin CRM) could never show their actual
    // order history even after totalSpend/totalVisits were wired up.
    if (orderId) {
      if (!account.recentOrderIds) account.recentOrderIds = [];
      account.recentOrderIds = [orderId, ...account.recentOrderIds.filter((id) => id !== orderId)].slice(0, 20);
    }

    const tier = this.getTierForAccount(account) || tierBefore;
    const basePoints = Math.floor(orderTotal / 10);
    const earned = Math.floor(basePoints * (tier?.pointsMultiplier ?? 1));
    account.loyaltyPoints += earned;

    if (tierBefore && tier && tier.id !== tierBefore.id) {
      AuditRepository.log({
        action: 'LOYALTY_TIER_UPGRADED',
        category: 'CUSTOMER',
        details: `${account.name || phone} upgraded from ${tierBefore.name} to ${tier.name}`,
        username: 'System'
      });
    }

    db.notify();
    return earned;
  }
}

/**
 * Marketing campaigns — evolves the previous one-at-a-time, un-saved
 * WhatsApp deep-link button into a real segment + reusable message template
 * + tracked send queue. There is still no WhatsApp Business API/SMS gateway
 * anywhere in this system, so sending is still one wa.me link per recipient
 * — that's a real external constraint, not something faked away here; what
 * changes is that the audience and message are computed and saved once,
 * and the queue tracks who's already been sent to.
 */
export class MarketingRepository {
  public static getCampaigns(): MarketingCampaign[] {
    return [...db.marketingCampaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public static createCampaign(data: { name: string; messageTemplate: string; segmentFilter: CustomerSegmentFilter }): MarketingCampaign {
    const campaign: MarketingCampaign = {
      id: `camp-${Date.now()}`,
      name: data.name,
      messageTemplate: data.messageTemplate,
      segmentFilter: data.segmentFilter,
      status: 'DRAFT',
      sentToPhones: [],
      createdAt: new Date().toISOString()
    };
    db.marketingCampaigns.unshift(campaign);
    AuditRepository.log({ action: 'CAMPAIGN_CREATED', category: 'CUSTOMER', details: `Created campaign "${campaign.name}"`, username: 'Manager' });
    db.notify();
    return campaign;
  }

  public static updateCampaign(id: string, updates: Partial<MarketingCampaign>): MarketingCampaign | null {
    const idx = db.marketingCampaigns.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.marketingCampaigns[idx] = { ...db.marketingCampaigns[idx], ...updates };
    db.notify();
    return db.marketingCampaigns[idx];
  }

  public static deleteCampaign(id: string): boolean {
    const idx = db.marketingCampaigns.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    db.marketingCampaigns.splice(idx, 1);
    db.notify();
    return true;
  }

  /** Real segment matching against actual CustomerAccount data — every filter field is optional and ANDs together. */
  public static getMatchingCustomers(filter: CustomerSegmentFilter): CustomerAccount[] {
    const tiers = CustomerRepository.getTiers();
    const minTierRank = filter.minTierId ? tiers.findIndex((t) => t.id === filter.minTierId) : -1;
    const now = Date.now();
    const thisMonth = new Date().getMonth();

    return db.customerAccounts.filter((cust) => {
      if (filter.tags && filter.tags.length > 0) {
        if (!cust.tags || !filter.tags.some((t) => cust.tags!.includes(t))) return false;
      }
      if (filter.minLifetimeSpend !== undefined && (cust.totalSpend || 0) < filter.minLifetimeSpend) {
        return false;
      }
      if (minTierRank >= 0) {
        const custTier = CustomerRepository.getTierForAccount(cust);
        const custRank = custTier ? tiers.findIndex((t) => t.id === custTier.id) : -1;
        if (custRank < minTierRank) return false;
      }
      if (filter.inactiveForDays !== undefined) {
        const lastVisit = cust.lastVisitAt ? new Date(cust.lastVisitAt).getTime() : 0;
        const daysSince = lastVisit === 0 ? Infinity : (now - lastVisit) / (1000 * 60 * 60 * 24);
        if (daysSince < filter.inactiveForDays) return false;
      }
      if (filter.birthdayThisMonth) {
        if (!cust.dob || new Date(cust.dob).getMonth() !== thisMonth) return false;
      }
      return true;
    });
  }

  /** Renders {{name}} in the message template for one recipient. */
  public static renderMessage(template: string, customer: CustomerAccount): string {
    return template.replace(/\{\{\s*name\s*\}\}/gi, customer.name || 'Valued Guest');
  }

  public static markSent(campaignId: string, phone: string): void {
    const campaign = db.marketingCampaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    if (!campaign.sentToPhones.includes(phone)) {
      campaign.sentToPhones.push(phone);
    }
    if (campaign.status === 'DRAFT') campaign.status = 'ACTIVE';
    db.notify();
  }
}

export class FeedbackRepository {
  public static submit(feedback: Partial<CustomerFeedback>): CustomerFeedback {
    const fb: CustomerFeedback = {
      id: feedback.id || `fb-${Date.now()}`,
      orderId: feedback.orderId,
      kioskId: feedback.kioskId || 'KIOSK-01',
      rating: feedback.rating || 5,
      tags: feedback.tags || [],
      comments: feedback.comments,
      createdAt: new Date().toISOString()
    };
    db.feedbacks.unshift(fb);
    db.notify();
    return fb;
  }

  public static getAll(): CustomerFeedback[] {
    return db.feedbacks;
  }
}

export class LicenseRepository {
  public static getLicense(): LicenseInfo {
    return db.license;
  }

  public static updateLicense(updates: Partial<LicenseInfo>): LicenseInfo {
    db.license = { ...db.license, ...updates };
    db.notify();
    return db.license;
  }

  /**
   * ENT-001 fix: the only license write path a production UI should ever call.
   * Takes data that has ALREADY been cryptographically verified elsewhere
   * (see @jamanvaar/business's applyLicenseCertificate, which verifies an
   * ECDSA-signed certificate issued by cloud/api before ever calling this) —
   * this method itself performs no verification, it only records where the
   * data came from so a support engineer can audit it later.
   */
  public static setVerifiedLicense(
    payload: { tier: PlanTier; entitlements: PlanEntitlements; expiresAt: string },
    meta: { source: 'cloud-sync' | 'offline-certificate' }
  ): LicenseInfo {
    const isPro = payload.tier === 'PRO';
    db.license = {
      ...db.license,
      tier: payload.tier,
      planName: isPro ? 'JAMANVAAR PRO' : 'JAMANVAAR CORE',
      price: isPro ? 7000 : 5000,
      status: 'ACTIVE',
      activatedAt: new Date().toISOString(),
      // security-audit LOW-04: the certificate's verified expiry used to be
      // accepted as a parameter and then silently dropped — the caller
      // cryptographically verified it, but nothing ever recorded it, so the
      // one piece of state that should have made an offline grant actually
      // time-limited never did anything.
      validUntil: payload.expiresAt,
      entitlements: payload.entitlements,
      verifiedAt: new Date().toISOString(),
      verificationSource: meta.source
    };
    db.notify();
    return db.license;
  }

  /**
   * Unverified, direct tier setter. Kept for test setup (exercising
   * EntitlementService logic in isolation needs a fast way to flip tiers) and
   * as the internal primitive `setVerifiedLicense` used to build on — but no
   * production UI should call this directly any more (see SEC-002/ENT-001:
   * this used to be reachable from three unauthenticated button handlers).
   */
  /**
   * Records the platform's (Super Admin's) operational QR controls locally.
   *
   * This is the missing half of the QR entitlement chain: the PLAN decides
   * whether QR ordering was sold to this restaurant, this decides whether the
   * platform is currently allowing it and within what limits. Every guest scan
   * is checked against it in QrOrderingRepository.verifyQrToken, so a Super
   * Admin disabling QR ordering blocks guests here even though the plan tier
   * is untouched.
   *
   * Only a verified cloud sync should call this. There is deliberately no
   * restaurant-facing write path — a restaurant admin cannot widen its own
   * limits, which is the whole point of the control block.
   */
  public static applyPlatformQrControl(
    control: Omit<PlatformQrControl, 'syncedAt'>,
    meta: { source: 'cloud-sync' | 'offline-certificate' }
  ): LicenseInfo {
    if (!Number.isFinite(control.maxActiveTables) || control.maxActiveTables < 0) {
      throw new Error('Platform QR control rejected: maxActiveTables must be a non-negative number.');
    }
    if (
      control.maxOrdersPerDay !== null &&
      (!Number.isFinite(control.maxOrdersPerDay) || control.maxOrdersPerDay < 0)
    ) {
      throw new Error('Platform QR control rejected: maxOrdersPerDay must be null or a non-negative number.');
    }

    db.license = {
      ...db.license,
      platformQrControl: {
        ...control,
        maxActiveTables: Math.floor(control.maxActiveTables),
        maxOrdersPerDay:
          control.maxOrdersPerDay === null ? null : Math.floor(control.maxOrdersPerDay),
        syncedAt: new Date().toISOString()
      },
      verificationSource: meta.source
    };
    db.notify();
    return db.license;
  }

  /** The platform control block currently in force, or undefined if never synced. */
  public static getPlatformQrControl(): PlatformQrControl | undefined {
    return db.license?.platformQrControl;
  }

  public static activatePlan(tier: 'CORE' | 'PRO', licenseKey?: string): LicenseInfo {
    const isPro = tier === 'PRO';
    const key = licenseKey || (isPro ? 'JAMAN-PRO-2026-AHM-8842-X' : 'JAMAN-CORE-2026-AHM-1104-X');

    db.license = {
      ...db.license,
      tier,
      planName: isPro ? 'JAMANVAAR PRO' : 'JAMANVAAR CORE',
      price: isPro ? 7000 : 5000,
      licenseKey: key,
      status: 'ACTIVE',
      activatedAt: new Date().toISOString(),
      entitlements: {
        posTerminal: true,
        offlineBilling: true,
        dineInTakeawayDeliveryToken: true,
        menuManagement: true,
        foodCustomization: true,
        discountsAndGst: true,
        multiPaymentTenders: true,
        tableManagement: true,
        customerManagement: true,
        kotKdsRouting: true,
        receiptPrinting: true,
        shiftAndCashDrawer: true,
        salesAndGstReports: true,
        inventoryManagement: true,
        posAssistant: isPro,
        restaurantAdmin: true,
        captainApp: isPro,
        advancedCaptainReports: isPro,
        advancedServiceWorkflow: isPro,
        qrTableOrdering: isPro,
        selfOrderKiosk: isPro
      }
    };
    db.notify();
    return db.license;
  }
}

export class ComboRepository {
  public static getAllCombos(): ComboDeal[] {
    return db.combos;
  }

  public static getComboById(id: string): ComboDeal | undefined {
    return db.combos.find((c) => c.id === id);
  }

  public static createCombo(combo: Omit<ComboDeal, 'id'>): ComboDeal {
    const newCombo: ComboDeal = {
      id: `combo-${Date.now()}`,
      ...combo
    };
    db.combos.push(newCombo);
    db.notify();
    return newCombo;
  }

  public static updateCombo(id: string, updates: Partial<ComboDeal>): ComboDeal | null {
    const idx = db.combos.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.combos[idx] = { ...db.combos[idx], ...updates };
    db.notify();
    return db.combos[idx];
  }

  public static toggleAvailability(id: string): boolean {
    const combo = db.combos.find((c) => c.id === id);
    if (combo) {
      combo.isAvailable = !combo.isAvailable;
      db.notify();
      return combo.isAvailable;
    }
    return false;
  }

  public static deleteCombo(id: string): boolean {
    const idx = db.combos.findIndex((c) => c.id === id);
    if (idx !== -1) {
      db.combos.splice(idx, 1);
      ComboSync.recordDeletion(id); // so the deletion reaches the kiosks (BUG-130)
      db.notify();
      return true;
    }
    return false;
  }
}

/**
 * BUG-021/028: what a terminal adopts from the cloud when it activates against a real
 * restaurant. It REPLACES the seeded demo identity field by field — a restaurant with no
 * GSTIN ends up with none, rather than silently keeping the seed's fake 24ABCDE1234F1Z5 and
 * printing it on tax invoices.
 */
export class RestaurantIdentityRepository {
  /**
   * A real restaurant starts with none of the demo install's operations data (BUG-115): combos built
   * from dishes it does not have, demo coupon codes that would give real discounts, and a twelve-table
   * floor that is not its own. Called on first activation next to the menu/printer/inventory clears.
   */
  public static startFreshOperations(): void {
    db.combos = [];
    db.coupons = [];
    db.offers = [];
    db.tables = [];
    db.floorPlanStartedEmpty = true;
    // The demo combos and coupons were never this restaurant's: nothing about them is uploaded or deleted.
    ComboSync.reset();
    CouponSync.reset();
    AuditRepository.log({
      action: 'DEMO_OPERATIONS_CLEARED_ON_ACTIVATION',
      category: 'SETTINGS',
      details: 'Demo combos, coupons, offers and tables cleared on first device activation.',
      username: 'System'
    });
    db.notify();
  }

  /**
   * For screens that only learn the restaurant's id and name (Restaurant Admin at sign-in): replaces
   * the demo branch once for this restaurant, and never touches the legal details already saved, or
   * a branch name the owner has since changed (BUG-110).
   */
  public static adoptBranch(restaurantId: string, name: string): void {
    if (db.outlet.restaurantId === restaurantId) return;
    db.outlet = { ...db.outlet, restaurantId, name, code: '', address: '', city: '', phone: '' };
    db.notify();
  }

  /**
   * Restaurant Admin at sign-in (BUG-158): takes the profile the platform holds for this restaurant. A detail is
   * replaced when it is blank or still the demo install's value (or when the restaurant itself changed); a detail
   * the owner has entered by hand is never overwritten. A detail the platform has none of stays blank, so a demo
   * GSTIN, address or phone can never be printed on a tax invoice.
   */
  public static syncProfile(profile: {
    id: string;
    name: string;
    legalName?: string | null;
    gstin?: string | null;
    fssaiNumber?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
  }): void {
    const r = db.restaurant;
    const restaurantChanged = r.id !== profile.id;
    r.id = profile.id;
    if (profile.name) r.name = profile.name;

    const fields: Array<'legalName' | 'gstin' | 'fssaiNumber' | 'address' | 'city' | 'state' | 'phone'> = ['legalName', 'gstin', 'fssaiNumber', 'address', 'city', 'state', 'phone'];
    for (const f of fields) {
      const current = r[f] ?? '';
      const isDemo = current !== '' && current === (SEED_RESTAURANT[f] ?? '');
      if (restaurantChanged || current === '' || isDemo) r[f] = profile[f] ?? '';
    }
    // Demo-only fields that have no platform counterpart: never leave another business's values behind.
    for (const f of ['email', 'website', 'tagline', 'msmeNumber', 'pincode', 'ownerName', 'managerName', 'footerText'] as const) {
      const current = r[f] ?? '';
      if (restaurantChanged ? current !== '' : current !== '' && current === (SEED_RESTAURANT[f] ?? '')) r[f] = '';
    }

    db.outlet = { ...db.outlet, restaurantId: profile.id, address: r.address ?? '', city: r.city ?? '', state: r.state ?? '', phone: r.phone ?? '' };
    db.receiptConfig = {
      ...db.receiptConfig,
      restaurantName: r.name,
      address: r.address ?? '',
      phone: r.phone ?? '',
      gstin: r.gstin ?? '',
      fssaiNumber: r.fssaiNumber ?? ''
    };
    db.notify();
  }

  public static adopt(
    restaurantId: string,
    identity: { name?: string; gstin?: string | null; address?: string | null; phone?: string | null; fssaiNumber?: string | null }
  ): void {
    db.restaurant.id = restaurantId;
    if (identity.name) db.restaurant.name = identity.name;
    db.restaurant.gstin = identity.gstin || '';
    db.restaurant.address = identity.address || '';
    db.restaurant.phone = identity.phone || '';
    db.restaurant.fssaiNumber = identity.fssaiNumber || '';
    // B2-042: the cloud Restaurant record has no email/ownerName/managerName fields at all (checked
    // the schema — nothing to adopt a real value from), but the local seed's demo placeholders
    // ('hello@jamanvaar.com', 'Ramesh Patel', 'Pooja Shah') were surviving activation untouched and
    // ending up as real-looking prepared-by/approved-by signatory names on EOD/Z reports. Same
    // "blank rather than invent" treatment as gstin/address/phone above: there is no real value to
    // adopt, so these go empty until the restaurant's own owner types a real one in Settings.
    db.restaurant.email = '';
    db.restaurant.ownerName = '';
    db.restaurant.managerName = '';
    // The branch is the restaurant's own too: it used to stay the demo "Ahmedabad Flagship Store"
    // (with a demo code, address and phone) in every screen header (BUG-110). The id is kept so
    // tables and orders that point at it stay linked.
    db.outlet = {
      ...db.outlet,
      restaurantId,
      name: db.restaurant.name,
      code: '',
      address: db.restaurant.address,
      city: '',
      phone: db.restaurant.phone
    };
    db.notify();
    // ReceiptRepository.getConfig falls back to receiptConfig, which is seeded with the demo
    // identity too — blank it, or a missing field would resurface the demo value.
    db.receiptConfig = {
      ...db.receiptConfig,
      restaurantName: db.restaurant.name,
      address: db.restaurant.address,
      phone: db.restaurant.phone,
      gstin: db.restaurant.gstin,
      fssaiNumber: db.restaurant.fssaiNumber,
      // The demo install's footer thanked guests on behalf of the demo brand (BUG-125). A footer the
      // restaurant wrote itself is kept.
      thankYouMessage: /JAMANVAAR/i.test(db.receiptConfig.thankYouMessage ?? '')
        ? `Thank you for dining at ${db.restaurant.name}! Please visit again.`
        : db.receiptConfig.thankYouMessage,
      footerMessage: /Heritage|JAMANVAAR/i.test(db.receiptConfig.footerMessage ?? '') ? '' : db.receiptConfig.footerMessage
    };
    db.notify();
  }
}

export class ReceiptRepository {
  public static getConfig(): ReceiptConfig {
    // Restaurant Settings (db.restaurant) is the canonical source for
    // legal/branding fields — overlay them live so a receipt can never
    // print a stale/independently-seeded GSTIN, address or phone that
    // disagrees with what the owner actually saved (the "third
    // independently-hardcoded GSTIN" bug the QA audit found on the Kiosk).
    return {
      ...db.receiptConfig,
      restaurantName: db.restaurant.name || db.receiptConfig.restaurantName,
      address: db.restaurant.address || db.receiptConfig.address,
      phone: db.restaurant.phone || db.receiptConfig.phone,
      gstin: db.restaurant.gstin || db.receiptConfig.gstin,
      fssaiNumber: db.restaurant.fssaiNumber || db.receiptConfig.fssaiNumber
    };
  }

  public static updateConfig(updates: Partial<ReceiptConfig>): ReceiptConfig {
    db.receiptConfig = { ...db.receiptConfig, ...updates };
    db.notify();
    return db.receiptConfig;
  }

  public static getAllRecords(): ReceiptRecord[] {
    return db.receiptRecords;
  }

  public static addRecord(record: ReceiptRecord): ReceiptRecord {
    db.receiptRecords.unshift(record);
    db.notify();
    return record;
  }
}

export class ShiftRepository {
  public static getShiftOrders(shift?: ShiftRecord, orders: Order[] = db.orders): Order[] {
    if (!shift) return [];
    const openTime = new Date(shift.openedAt).getTime();
    const closeTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Infinity;
    const shiftDate = new Date(shift.openedAt).toDateString();

    return orders.filter((o) => {
      // 1. Direct shift ID tagging
      if (o.shiftId && o.shiftId === shift.id) return true;

      // 2. Timestamp within shift window AND matching same calendar day
      const orderTime = new Date(o.createdAt).getTime();
      if (isNaN(orderTime)) return false;

      const inWindow = orderTime >= openTime && orderTime <= closeTime;
      if (!inWindow) return false;

      const orderDate = new Date(o.createdAt).toDateString();
      return shiftDate === orderDate;
    });
  }

  public static getShiftMetrics(shift?: ShiftRecord, orders: Order[] = db.orders) {
    if (!shift) {
      return {
        totalOrders: 0,
        totalSales: 0,
        totalDiscounts: 0,
        totalCashSales: 0,
        totalUpiSales: 0,
        totalCardSales: 0,
        expectedCash: 0,
        completedOrders: [] as Order[]
      };
    }

    const shiftOrders = this.getShiftOrders(shift, orders);
    const completedOrders = shiftOrders.filter((o) => o.orderStatus === 'COMPLETED');

    let totalSales = 0;
    let totalDiscounts = 0;
    let totalCashSales = 0;
    let totalUpiSales = 0;
    let totalCardSales = 0;

    if (completedOrders.length > 0) {
      completedOrders.forEach((o) => {
        totalSales += o.totalAmount;
        totalDiscounts += o.discountAmount || 0;

        const tenders = getOrderTenders(o);
        totalCashSales += tenders.cash;
        totalUpiSales += tenders.upi;
        totalCardSales += tenders.card;
      });
    } else if (shift.totalSales > 0 || shift.totalCashSales > 0 || shift.totalOrders > 0) {
      // Preserve shift's manually assigned / historical totals if order array is empty
      totalSales = shift.totalSales || 0;
      totalDiscounts = shift.totalDiscounts || 0;
      totalCashSales = shift.totalCashSales || 0;
      totalUpiSales = shift.totalUpiSales || 0;
      totalCardSales = shift.totalCardSales || 0;
    }

    const movements = this.getCashMovements(shift.id);
    const totalCashIn = movements.filter((m) => m.type === 'CASH_IN').reduce((sum, m) => sum + m.amount, 0);
    const totalCashOut = movements.filter((m) => m.type === 'CASH_OUT').reduce((sum, m) => sum + m.amount, 0);

    const expectedCash = (shift.openingCash || 0) + totalCashSales + totalCashIn - totalCashOut;

    return {
      totalOrders: completedOrders.length > 0 ? completedOrders.length : shift.totalOrders || 0,
      totalSales,
      totalDiscounts,
      totalCashSales,
      totalUpiSales,
      totalCardSales,
      expectedCash,
      completedOrders
    };
  }

  public static getActiveShift(): ShiftRecord | undefined {
    const shift = db.shifts.find((s) => s.status === 'OPEN');
    if (shift) {
      const metrics = this.getShiftMetrics(shift, db.orders);
      shift.totalOrders = metrics.totalOrders;
      shift.totalSales = metrics.totalSales;
      shift.totalDiscounts = metrics.totalDiscounts;
      shift.totalCashSales = metrics.totalCashSales;
      shift.totalUpiSales = metrics.totalUpiSales;
      shift.totalCardSales = metrics.totalCardSales;
      shift.expectedCash = metrics.expectedCash;
    }
    return shift;
  }

  public static getAllShifts(): ShiftRecord[] {
    return [...db.shifts].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }

  public static openShift(cashierId: string, cashierName: string, openingCash: number, posId: string = 'POS-01', notes?: string): ShiftRecord {
    // Close any previous open shift if active
    const current = this.getActiveShift();
    if (current) {
      this.closeShift(current.id, current.expectedCash, 'Automated closure on new shift start');
    }

    const newShift: ShiftRecord = {
      id: `shift-${Date.now()}`,
      // B2-046: the header/shift views used to display `activeShift.id.slice(-2)` — the last two
      // digits of this millisecond timestamp — as "Active Shift #58", which looks like a
      // sequence number but is really just whatever the clock happened to read. This is a real
      // count: this device's Nth shift ever opened, starting at #1 on a fresh restaurant.
      shiftNumber: db.shifts.length + 1,
      posId,
      cashierId,
      cashierName,
      openedAt: new Date().toISOString(),
      status: 'OPEN',
      openingCash,
      expectedCash: openingCash,
      totalCashSales: 0,
      totalUpiSales: 0,
      totalCardSales: 0,
      totalSales: 0,
      totalDiscounts: 0,
      totalOrders: 0,
      notes: notes || `Shift opened with float ₹${openingCash}`
    };

    db.shifts.unshift(newShift);
    AuditRepository.log({
      action: 'SHIFT_OPEN',
      category: 'AUTH',
      details: `Shift opened by ${cashierName} on ${posId} with opening cash ₹${openingCash}`,
      username: cashierName
    });

    db.notify();
    return newShift;
  }

  public static closeShift(shiftId: string, actualCash: number, notes?: string): ShiftRecord | null {
    const shift = db.shifts.find((s) => s.id === shiftId);
    if (!shift) return null;

    const metrics = this.getShiftMetrics(shift, db.orders);
    shift.status = 'CLOSED';
    shift.closedAt = new Date().toISOString();
    shift.totalOrders = metrics.totalOrders;
    shift.totalSales = metrics.totalSales;
    shift.totalDiscounts = metrics.totalDiscounts;
    shift.totalCashSales = metrics.totalCashSales;
    shift.totalUpiSales = metrics.totalUpiSales;
    shift.totalCardSales = metrics.totalCardSales;
    shift.expectedCash = metrics.expectedCash;
    shift.actualCash = actualCash;
    shift.closingCash = actualCash;
    shift.cashVariance = actualCash - shift.expectedCash;
    if (notes) shift.notes = `${shift.notes || ''} | Closing: ${notes}`;

    AuditRepository.log({
      action: 'SHIFT_CLOSE',
      category: 'AUTH',
      details: `Shift ${shiftId} closed by ${shift.cashierName}. Expected ₹${shift.expectedCash}, Actual ₹${actualCash}, Variance ₹${shift.cashVariance}`,
      username: shift.cashierName
    });

    db.notify();
    return shift;
  }

  /**
   * B2-046: a Cash Out used to be applied unconditionally, with nothing checking it against what
   * was actually in the drawer — a cashier could record taking out ₹9,000 against a ₹6,000
   * drawer with no warning, no manager approval, and no "exceeds drawer" refusal, driving
   * `expectedCash` negative. That negative expected figure then made the Close Shift variance
   * ("counted − expected") look backwards — an empty drawer read as "+₹3,000 OVER" — even though
   * that formula is arithmetically correct; the real bug was letting the input go negative in
   * the first place. Capping Cash Out at the current drawer balance here means `expectedCash`
   * can never go negative, so the variance calculation downstream never produces a nonsensical
   * reading again — one root-cause fix instead of patching the display math separately.
   * Returns null (nothing recorded, nothing mutated) on a rejected movement — never negative,
   * never zero/blank, never CASH_OUT beyond the drawer's current expected cash — so the caller
   * can show a real error instead of a silent no-op.
   */
  public static addCashMovement(shiftId: string, type: 'CASH_IN' | 'CASH_OUT', amount: number, reason: string, cashierName: string, authorizedBy?: string): CashMovement | null {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const shift = db.shifts.find((s) => s.id === shiftId);
    if (!shift || shift.status !== 'OPEN') return null;
    if (type === 'CASH_OUT' && amount > shift.expectedCash) return null;

    const movement: CashMovement = {
      id: `csh-${Date.now()}`,
      shiftId,
      type,
      amount,
      reason,
      cashierName,
      authorizedBy,
      timestamp: new Date().toISOString()
    };

    db.cashMovements.unshift(movement);

    if (type === 'CASH_IN') {
      shift.expectedCash += amount;
    } else {
      shift.expectedCash -= amount;
    }

    AuditRepository.log({
      action: type,
      category: 'PAYMENT',
      details: `${type} ₹${amount} by ${cashierName}. Reason: ${reason} (Authorized: ${authorizedBy || 'Self'})`,
      username: cashierName
    });

    db.notify();
    return movement;
  }

  public static getCashMovements(shiftId?: string): CashMovement[] {
    if (shiftId) {
      return db.cashMovements.filter((m) => m.shiftId === shiftId);
    }
    return db.cashMovements;
  }
}

const KOT_STATUS_RANK: Record<KOTRecord['status'], number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 1, READY: 2, SERVED: 3, CANCELLED: 4 };

const PRE_READY_ORDER_STATUSES: ReadonlyArray<OrderStatus> = ['NEW', 'DRAFT', 'CREATED', 'ACCEPTED', 'CONFIRMED', 'ACKNOWLEDGED', 'KITCHEN_ACCEPTED', 'PREPARING'];

/**
 * The order's own status follows the kitchen (BUG-152): once every dish on an open order is ready (or already
 * served) the order reads READY instead of staying PREPARING until it is paid, and it goes back to PREPARING
 * if a new round of dishes is added. Paid, cancelled and refunded orders are never touched.
 */
function followKitchenStage(order: Order): void {
  const status = order.orderStatus;
  const lines = order.items;
  if (lines.length === 0) return;
  const allReady = lines.every((i) => i.kitchenStatus === 'READY' || i.kitchenStatus === 'SERVED');
  if (allReady && PRE_READY_ORDER_STATUSES.includes(status)) order.orderStatus = 'READY';
  else if (!allReady && status === 'READY') order.orderStatus = 'PREPARING';
}

export class KOTRepository {
  public static getAllKOTs(): KOTRecord[] {
    return [...db.kots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getKOTsForOrder(orderId: string): KOTRecord[] {
    return db.kots.filter((k) => k.orderId === orderId);
  }

  public static generateKOT(params: {
    orderId: string;
    orderNumber: string;
    tokenNumber: string;
    tableNumber?: string;
    orderType: OrderType;
    items: KOTItem[];
    station?: string;
    type?: KOTType;
    cashierName: string;
    serverName?: string;
    orderNotes?: string;
    /** When set, ticket ids and numbers derive from these instead of the clock and local counters (see qrKotIdentity). */
    idBase?: string;
    numberBase?: string;
  }): KOTRecord[] {
    return db.transaction(() => this.generateKOTInner(params));
  }

  private static generateKOTInner(params: {
    orderId: string;
    orderNumber: string;
    tokenNumber: string;
    tableNumber?: string;
    orderType: OrderType;
    items: KOTItem[];
    station?: string;
    type?: KOTType;
    cashierName: string;
    serverName?: string;
    orderNotes?: string;
    /** When set, ticket ids and numbers derive from these instead of the clock and local counters (see qrKotIdentity). */
    idBase?: string;
    numberBase?: string;
  }): KOTRecord[] {
    const existingKots = this.getKOTsForOrder(params.orderId);
    const isFirst = existingKots.length === 0;
    const kotType: KOTType = params.type || (isFirst ? 'FIRST' : 'ADDITIONAL');

    // Group items by Kitchen Station (e.g., 'Main Kitchen', 'Tandoor', 'Bar', 'Dessert')
    const stationMap: Record<string, KOTItem[]> = {};
    params.items.forEach((item) => {
      const st = item.kitchenStation || 'Main Kitchen';
      if (!stationMap[st]) stationMap[st] = [];
      stationMap[st].push(item);
    });

    const generated: KOTRecord[] = [];
    const highestKotNum = db.kots.reduce((max, k) => {
      const num = parseInt(k.kotNumber.replace(/\D/g, ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);

    let nextKotSeq = highestKotNum + 1;

    const stationNames = Object.keys(stationMap).sort();
    Object.entries(stationMap).forEach(([stationName, stationItems]) => {
      const stationSlug = stationName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const fixedId = params.idBase ? (stationNames.length > 1 ? `${params.idBase}-${stationSlug}` : params.idBase) : undefined;
      // Deterministic tickets are idempotent: a device that already has this exact ticket does not make another.
      if (fixedId && db.kots.some((k) => k.id === fixedId)) return;
      const kotRecord: KOTRecord = {
        id: fixedId ?? `kot-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        kotNumber: (() => {
          if (params.numberBase) return stationNames.length > 1 ? `${params.numberBase}-${stationNames.indexOf(stationName) + 1}` : params.numberBase;
          const allocated = NumberAllocator.next('KOT');
          if (allocated) return allocated;
          return `KOT-${String(nextKotSeq).padStart(2, '0')}`;
        })(),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        tokenNumber: params.tokenNumber,
        tableNumber: params.tableNumber,
        orderType: params.orderType,
        station: stationName,
        type: kotType,
        items: stationItems,
        cashierName: params.cashierName,
        serverName: params.serverName,
        createdAt: new Date().toISOString(),
        printed: true,
        status: 'PREPARING',
        orderNotes: params.orderNotes
      };

      nextKotSeq++;
      db.kots.unshift(kotRecord);
      generated.push(kotRecord);
    });

    AuditRepository.log({
      action: 'KOT_GENERATED',
      category: 'ORDER',
      details: `Generated ${generated.length} KOTs for Order #${params.orderNumber} (Table ${params.tableNumber || 'Token #' + params.tokenNumber})`,
      username: params.cashierName
    });

    db.notify();
    return generated;
  }

  public static updateKOTStatus(kotId: string, status: KOTRecord['status']): KOTRecord | null {
    const kot = db.kots.find((k) => k.id === kotId);
    if (!kot) return null;
    kot.status = status;
    // Stamp real completion timestamps so kitchen-performance reports can
    // compute an actual average prep time instead of guessing one.
    if (status === 'READY' && !kot.readyAt) {
      kot.readyAt = new Date().toISOString();
    }
    if (status === 'SERVED' && !kot.servedAt) {
      kot.servedAt = new Date().toISOString();
    }

    // Mirror onto the parent Order so the cloud sync bridge — which reads
    // Order.items[].kitchenStatus, not db.kots — actually sees a kitchen-side
    // status change. KOT items and Order items are separate id spaces (see
    // posStore.ts's sendKOT, which mints them independently), so the match
    // has to go through menuItemId rather than id.
    const order = db.orders.find((o) => o.id === kot.orderId);
    if (order) {
      const kotMenuItemIds = new Set(kot.items.map((i) => i.menuItemId));
      order.items.forEach((oi) => {
        if (kotMenuItemIds.has(oi.menuItemId)) {
          oi.kitchenStatus = status as OrderItem['kitchenStatus'];
        }
      });
      followKitchenStage(order);
      order.updatedAt = new Date().toISOString();
      order.syncStatus = 'SAVED_LOCALLY';
    }

    db.notify();
    return kot;
  }

  /**
   * Kitchen tickets are kept per device, but the order they belong to is synced. When an order
   * arrives with its dishes marked ready or served — or the whole order was completed or cancelled
   * at another terminal — this brings this device's tickets in line (BUG-098/113). Tickets only ever
   * move forward, so an older copy of an order cannot un-cook a dish. Returns how many changed.
   */
  public static reconcileWithOrders(): number {
    let changed = 0;
    const now = new Date().toISOString();
    for (const kot of db.kots) {
      if (kot.status === 'SERVED' || kot.status === 'CANCELLED') continue;
      const order = db.orders.find((o) => o.id === kot.orderId);
      if (!order) continue;

      let next: KOTRecord['status'] | null = null;
      if (order.orderStatus === 'CANCELLED') next = 'CANCELLED';
      else if (order.orderStatus === 'COMPLETED' || order.orderStatus === 'REFUNDED') next = 'SERVED';
      else {
        const menuItemIds = new Set(kot.items.map((i) => i.menuItemId));
        const lines = order.items.filter((oi) => menuItemIds.has(oi.menuItemId));
        if (lines.length > 0) {
          if (lines.every((l) => l.kitchenStatus === 'SERVED')) next = 'SERVED';
          else if (lines.every((l) => l.kitchenStatus === 'READY' || l.kitchenStatus === 'SERVED')) next = 'READY';
        }
      }

      if (!next || KOT_STATUS_RANK[next] <= KOT_STATUS_RANK[kot.status]) continue;
      kot.status = next;
      if (next === 'READY' && !kot.readyAt) kot.readyAt = now;
      if (next === 'SERVED') {
        if (!kot.readyAt) kot.readyAt = now;
        if (!kot.servedAt) kot.servedAt = now;
        kot.items.forEach((i) => { i.status = 'SERVED'; });
      }
      changed += 1;
    }
    if (changed > 0) db.notify();
    return changed;
  }

  /** Dishes the kitchen has finished and nobody has taken to the table yet, one entry per dish. */
  public static getFoodReadyItems(): FoodReadyItem[] {
    const nowMs = Date.now();
    const ready: FoodReadyItem[] = [];
    for (const kot of db.kots) {
      if (kot.status !== 'READY' || !kot.tableNumber) continue;
      for (const item of kot.items) {
        if (item.status === 'SERVED') continue;
        const readyAt = kot.readyAt || kot.createdAt;
        ready.push({
          id: `${kot.id}:${item.id}`,
          kotId: kot.id,
          kotNumber: kot.kotNumber,
          orderId: kot.orderId,
          orderNumber: kot.orderNumber,
          tableNumber: kot.tableNumber,
          itemId: item.id,
          dishName: item.name,
          quantity: item.quantity,
          modifiers: (item.modifiers || []).map((m) => m.optionName),
          specialInstructions: item.specialInstructions,
          station: kot.station,
          readyAt,
          elapsedSeconds: Math.max(0, Math.round((nowMs - new Date(readyAt).getTime()) / 1000)),
          isServed: false
        });
      }
    }
    return ready;
  }

  /** The waiter took one dish to the table. When it was the last dish the whole ticket is served. */
  public static markItemServed(kotId: string, kotItemId: string): boolean {
    const kot = db.kots.find((k) => k.id === kotId);
    const item = kot?.items.find((i) => i.id === kotItemId);
    if (!kot || !item) return false;
    item.status = 'SERVED';

    const order = db.orders.find((o) => o.id === kot.orderId);
    if (order) {
      order.items.forEach((oi) => {
        if (oi.menuItemId === item.menuItemId) oi.kitchenStatus = 'SERVED';
      });
      followKitchenStage(order);
      order.updatedAt = new Date().toISOString();
      order.syncStatus = 'SAVED_LOCALLY';
    }

    if (kot.items.every((i) => i.status === 'SERVED')) KOTRepository.updateKOTStatus(kot.id, 'SERVED');
    else db.notify();
    return true;
  }

  public static markKotServed(kotId: string): boolean {
    const kot = db.kots.find((k) => k.id === kotId);
    if (!kot) return false;
    kot.items.forEach((i) => { i.status = 'SERVED'; });
    KOTRepository.updateKOTStatus(kot.id, 'SERVED');
    return true;
  }
}

export class HeldOrderRepository {
  public static getAllHeld(): HeldOrder[] {
    return [...db.heldOrders].sort((a, b) => new Date(b.heldAt).getTime() - new Date(a.heldAt).getTime());
  }

  public static holdOrder(order: Partial<HeldOrder>): HeldOrder {
    const held: HeldOrder = {
      id: `held-${Date.now()}`,
      label: order.label || `Held Cart #${db.heldOrders.length + 1}`,
      orderType: order.orderType || 'DINE_IN',
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      cart: order.cart!,
      totalAmount: order.totalAmount || order.cart?.totalPayable || 0,
      itemCount: order.itemCount || order.cart?.items?.length || 0,
      heldAt: new Date().toISOString(),
      cashierName: order.cashierName || 'Cashier',
      notes: order.notes
    };

    db.heldOrders.unshift(held);
    AuditRepository.log({
      action: 'ORDER_HOLD',
      category: 'ORDER',
      details: `Order held (${held.label}) with ${held.itemCount} items amounting to ₹${held.totalAmount}`,
      username: held.cashierName
    });

    db.notify();
    return held;
  }

  public static recallOrder(id: string): HeldOrder | null {
    const idx = db.heldOrders.findIndex((h) => h.id === id);
    if (idx === -1) return null;
    const [recalled] = db.heldOrders.splice(idx, 1);
    AuditRepository.log({
      action: 'ORDER_RECALL',
      category: 'ORDER',
      details: `Recalled held order ${recalled.label}`,
      username: recalled.cashierName
    });
    db.notify();
    return recalled;
  }

  public static deleteHeldOrder(id: string): boolean {
    const idx = db.heldOrders.findIndex((h) => h.id === id);
    if (idx === -1) return false;
    db.heldOrders.splice(idx, 1);
    db.notify();
    return true;
  }
}

export class ManagerOverrideRepository {
  public static async verifyPin(pin: string): Promise<{ success: boolean; user?: User; isManager: boolean }> {
    const result = await StaffRepository.verifyPin(pin);
    if (!result) return { success: false, isManager: false };
    return { success: true, user: result.user, isManager: result.isManager };
  }

  public static requestOverride(params: {
    action: ManagerOverrideAction;
    reason: string;
    requestedBy: string;
    approvedBy: string;
    details?: Record<string, any>;
  }): ManagerOverrideRequest {
    const req: ManagerOverrideRequest = {
      id: `ovr-${Date.now()}`,
      action: params.action,
      reason: params.reason,
      requestedBy: params.requestedBy,
      approvedBy: params.approvedBy,
      approved: true,
      details: params.details,
      timestamp: new Date().toISOString()
    };

    db.managerOverrides.unshift(req);
    AuditRepository.log({
      action: `OVERRIDE_${params.action}`,
      category: 'STAFF_OVERRIDE',
      details: `Manager override for ${params.action} approved by ${params.approvedBy} for ${params.requestedBy}. Reason: ${params.reason}`,
      username: params.approvedBy
    });

    db.notify();
    return req;
  }
}

export class ReservationRepository {
  public static getAll(): Reservation[] {
    return [...db.reservations].sort((a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime());
  }

  public static create(res: Partial<Reservation>): Reservation {
    const newRes: Reservation = {
      id: `res-${Date.now()}`,
      customerName: res.customerName || 'Guest',
      customerPhone: res.customerPhone || '',
      guestCount: res.guestCount || 2,
      tableNumber: res.tableNumber,
      tableId: res.tableId,
      reservationTime: res.reservationTime || new Date().toISOString(),
      status: res.status || 'CONFIRMED',
      specialRequests: res.specialRequests,
      depositAmount: res.depositAmount || 0,
      createdAt: new Date().toISOString()
    };

    db.reservations.unshift(newRes);
    db.notify();
    return newRes;
  }

  public static updateStatus(id: string, status: Reservation['status']): Reservation | null {
    const r = db.reservations.find((res) => res.id === id);
    if (!r) return null;
    r.status = status;
    db.notify();
    return r;
  }
}

export class PrintQueueRepository {
  public static getAllJobs(): PrintJob[] {
    return [...db.printJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getJobById(id: string): PrintJob | undefined {
    return db.printJobs.find((j) => j.id === id);
  }

  public static addJob(params: {
    type: PrintJob['type'];
    printerId?: string;
    printerName?: string;
    targetStation?: string;
    orderId?: string;
    orderNumber?: string;
    tokenNumber?: string;
    kotId?: string;
    kotNumber?: string;
    rawPayload: string;
    paperSize?: PrintJob['paperSize'];
  }): PrintJob {
    const defaultPrinter = db.configuredPrinters.find((p) => p.isDefault) || db.configuredPrinters[0];
    const job: PrintJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: params.type,
      printerId: params.printerId || defaultPrinter?.id || 'prn-kiosk-01',
      printerName: params.printerName || defaultPrinter?.name || 'JAMANVAAR Thermal 80mm',
      targetStation: params.targetStation,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      tokenNumber: params.tokenNumber,
      kotId: params.kotId,
      kotNumber: params.kotNumber,
      rawPayload: params.rawPayload,
      paperSize: params.paperSize || defaultPrinter?.paperSize || '80mm',
      // BUG-024: this used to be created as SUCCESS before any hardware was ever contacted,
      // so a printer that never actually printed still looked like it had. A job is PENDING
      // until whatever dispatches it (PosPrinterService / PrinterService) confirms a real
      // transport delivered the bytes, via updateJobStatus.
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      lastAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    db.printJobs.unshift(job);
    AuditRepository.log({
      action: params.type === 'KOT_TICKET' ? 'KOT_PRINT' : 'RECEIPT_PRINT',
      category: 'HARDWARE',
      details: `Dispatched ${job.type} print job (${job.id}) to ${job.printerName}`,
      username: 'POS Terminal'
    });

    db.notify();
    return job;
  }

  public static updateJobStatus(id: string, status: PrintJobStatus, errorMessage?: string): PrintJob | null {
    const job = db.printJobs.find((j) => j.id === id);
    if (!job) return null;
    job.status = status;
    if (errorMessage) job.errorMessage = errorMessage;
    if (status === 'SUCCESS' || status === 'PRINTED') job.completedAt = new Date().toISOString();
    job.lastAttemptAt = new Date().toISOString();
    db.notify();
    return job;
  }

  public static retryJob(id: string): PrintJob | null {
    const job = db.printJobs.find((j) => j.id === id);
    if (!job) return null;
    // BUG-024: this used to flip the job straight to SUCCESS without sending anything, so
    // "Retry" on a failed print told the cashier it had printed. It now only re-queues the job
    // (PENDING); whatever dispatches it (PosPrinterService.retryJob) decides the real outcome.
    job.status = 'PENDING';
    job.lastAttemptAt = new Date().toISOString();
    job.completedAt = undefined;
    job.errorMessage = undefined;
    AuditRepository.log({
      action: 'PRINT_RETRY',
      category: 'HARDWARE',
      details: `Retried print job ${job.id} on ${job.printerName}`,
      username: 'POS Terminal'
    });
    db.notify();
    return job;
  }

  public static clearCompleted(): void {
    db.printJobs = db.printJobs.filter((j) => j.status !== 'SUCCESS');
    db.notify();
  }
}

let stockIdCounter = 0;
/** Unique even for many records created in the same millisecond (BUG-045: they used to share `Date.now()`). */
function uniqueStockId(prefix: string): string {
  stockIdCounter = (stockIdCounter + 1) % 1_000_000;
  return `${prefix}-${Date.now()}-${stockIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Convertible unit families. Returns null when the two units cannot be converted (e.g. pcs to kg). */
const UNIT_FACTORS: Record<string, { family: 'mass' | 'volume' | 'count'; toBase: number }> = {
  kg: { family: 'mass', toBase: 1000 }, kgs: { family: 'mass', toBase: 1000 },
  g: { family: 'mass', toBase: 1 }, gm: { family: 'mass', toBase: 1 }, gms: { family: 'mass', toBase: 1 }, gram: { family: 'mass', toBase: 1 }, grams: { family: 'mass', toBase: 1 },
  l: { family: 'volume', toBase: 1000 }, ltr: { family: 'volume', toBase: 1000 }, litre: { family: 'volume', toBase: 1000 }, liter: { family: 'volume', toBase: 1000 }, litres: { family: 'volume', toBase: 1000 },
  ml: { family: 'volume', toBase: 1 },
  pcs: { family: 'count', toBase: 1 }, pc: { family: 'count', toBase: 1 }, piece: { family: 'count', toBase: 1 }, pieces: { family: 'count', toBase: 1 }, nos: { family: 'count', toBase: 1 }
};
export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) return quantity;
  const a = UNIT_FACTORS[from];
  const b = UNIT_FACTORS[to];
  if (!a || !b || a.family !== b.family) return null;
  return (quantity * a.toBase) / b.toBase;
}

export class InventoryRepository {
  public static getAllItems(): InventoryItem[] {
    return [...db.inventoryItems];
  }

  public static getItemById(id: string): InventoryItem | undefined {
    return db.inventoryItems.find((i) => i.id === id);
  }

  /** A sane ceiling on a single stock item's quantity — anything past this is a data-entry mistake, not a real pantry. */
  private static readonly MAX_STOCK_QUANTITY = 1_000_000;

  /**
   * B2-044: this used to accept anything — negative stock, negative or zero cost, a
   * 1,000,000,000,000-unit quantity, and a duplicate SKU — with no check at all, either here or
   * in the UI. Defense in depth: even if a future caller skips `InventoryModal.tsx`'s own
   * pre-submit validation, corrupt data can't reach the database through this choke point.
   * Returns null (nothing changed) on a rejected item rather than silently clamping the value,
   * so the caller can show a real error instead of guessing what got changed.
   *
   * `currentStock < 0` is only rejected on **create** (`requireNonNegativeStock`): a brand-new
   * item starting negative is always a data-entry mistake, but an *existing* item legitimately
   * goes negative once it's been oversold — `InventoryRepository.recordMovement` (the real
   * sale-deduction path, bypasses this method entirely) and `InventoryControl.getStockValuation`
   * both treat a negative balance as a real, reportable state, not an error — confirmed by two
   * existing tests in `tests/inventory_control.test.ts` that call `updateItem` with a negative
   * `currentStock` on purpose to simulate exactly that. Blocking it here would have silently
   * broken that intentional design instead of fixing a bug — caught by running the existing
   * suite before, not after, calling this fix done.
   */
  private static validateItemInput(data: { currentStock: number; minStockLevel: number; costPerUnit: number; sku: string; excludeId?: string }, requireNonNegativeStock: boolean): boolean {
    if (!Number.isFinite(data.currentStock) || data.currentStock > this.MAX_STOCK_QUANTITY) return false;
    if (requireNonNegativeStock && data.currentStock < 0) return false;
    if (!Number.isFinite(data.minStockLevel) || data.minStockLevel < 0) return false;
    if (!Number.isFinite(data.costPerUnit) || data.costPerUnit < 0) return false;
    if (data.sku && db.inventoryItems.some((i) => i.sku === data.sku && i.id !== data.excludeId)) return false;
    return true;
  }

  public static createItem(data: Omit<InventoryItem, 'id' | 'updatedAt' | 'status'> & { id?: string }): InventoryItem | null {
    if (!this.validateItemInput(data, true)) return null;
    const newItem: InventoryItem = {
      id: data.id || uniqueStockId('inv'),
      name: data.name,
      sku: data.sku,
      category: data.category || 'General',
      unit: data.unit || 'kg',
      currentStock: data.currentStock,
      minStockLevel: data.minStockLevel,
      reorderLevel: data.reorderLevel,
      costPerUnit: data.costPerUnit,
      supplierName: data.supplierName,
      status: data.currentStock <= 0 ? 'OUT_OF_STOCK' : data.currentStock <= data.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK',
      updatedAt: new Date().toISOString()
    };

    db.inventoryItems.unshift(newItem);
    AuditRepository.log({
      action: 'INVENTORY_CREATED',
      category: 'INVENTORY',
      details: `Created stock item ${newItem.name} (${newItem.currentStock} ${newItem.unit})`,
      username: 'Manager'
    });
    db.notify();
    return newItem;
  }

  public static updateItem(id: string, updates: Partial<InventoryItem>): InventoryItem | null {
    const item = db.inventoryItems.find((i) => i.id === id);
    if (!item) return null;
    // B2-044: validate the resulting merged state, not just whichever fields this particular
    // call happens to touch — editing only the supplier name must not be a backdoor around the
    // stock/cost/SKU checks a full edit would have gone through.
    const merged = { ...item, ...updates };
    if (!this.validateItemInput({ currentStock: merged.currentStock, minStockLevel: merged.minStockLevel, costPerUnit: merged.costPerUnit, sku: merged.sku, excludeId: id }, false)) {
      return null;
    }
    Object.assign(item, updates);
    if (typeof updates.currentStock === 'number') {
      item.status = item.currentStock <= 0 ? 'OUT_OF_STOCK' : item.currentStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
    }
    item.updatedAt = new Date().toISOString();
    AuditRepository.log({
      action: 'INVENTORY_UPDATED',
      category: 'INVENTORY',
      details: `Updated stock item ${item.name}`,
      username: 'Manager'
    });
    db.notify();
    return item;
  }

  public static deleteItem(id: string): boolean {
    const idx = db.inventoryItems.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const name = db.inventoryItems[idx].name;
    db.inventoryItems.splice(idx, 1);
    AuditRepository.log({
      action: 'INVENTORY_DELETED',
      category: 'INVENTORY',
      details: `Deleted stock item ${name}`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }

  public static recordMovement(data: Omit<StockMovement, 'id' | 'timestamp'> & { id?: string }): StockMovement {
    // A movement with a caller-chosen id that this device already holds (booked locally, or received from the ledger as
    // `remote:<id>`) is the same movement: it is not booked twice.
    if (data.id) {
      const held = db.stockMovements.find((m) => m.id === data.id || m.id === `remote:${data.id}`);
      if (held) return held;
    }
    const movement: StockMovement = {
      id: data.id ?? uniqueStockId('sm'),
      itemId: data.itemId,
      itemName: data.itemName,
      type: data.type,
      quantityDelta: data.quantityDelta,
      unit: data.unit,
      costImpact: data.costImpact,
      orderId: data.orderId,
      reason: data.reason,
      wastageReasonCode: data.wastageReasonCode,
      photoUrl: data.photoUrl,
      performedBy: data.performedBy,
      timestamp: new Date().toISOString()
    };

    db.stockMovements.unshift(movement);

    const item = db.inventoryItems.find((i) => i.id === data.itemId);
    const statusBefore = item?.status;
    if (item) {
      // BUG-045: no Math.max(0, ...) - overselling shows up as a NEGATIVE balance (the real
      // shortfall) instead of silently vanishing.
      item.currentStock = item.currentStock + data.quantityDelta;
      item.status = item.currentStock <= 0 ? 'OUT_OF_STOCK' : item.currentStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
      if (data.type === 'RESTOCK' || data.type === 'PURCHASE') {
        item.lastRestockedAt = movement.timestamp;
      }
      item.updatedAt = movement.timestamp;
      if (data.quantityDelta < 0) this.consumeBatches(item.id, -data.quantityDelta);
      this.syncDishAvailability(item.id);
      this.alertIfLow(item, statusBefore);
    }

    AuditRepository.log({
      action: `STOCK_${data.type}`,
      category: 'INVENTORY',
      details: `${data.type} ${data.quantityDelta > 0 ? '+' : ''}${data.quantityDelta} ${data.unit} of ${data.itemName} (${data.reason})`,
      username: data.performedBy
    });

    db.notify();
    return movement;
  }

  /** Sells from the batch that expires first (BUG-046); batches without a date go in the order they arrived. */
  private static consumeBatches(itemId: string, quantity: number): void {
    let remaining = quantity;
    const batches = db.inventoryBatches
      .filter((b) => b.itemId === itemId && b.quantityRemaining > 1e-9)
      .sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return a.receivedAt.localeCompare(b.receivedAt);
      });
    for (const batch of batches) {
      if (remaining <= 1e-9) break;
      const taken = Math.min(batch.quantityRemaining, remaining);
      batch.quantityRemaining = Math.round((batch.quantityRemaining - taken) * 1e6) / 1e6;
      remaining -= taken;
    }
  }

  /** Tells the manager when an item drops to low stock, and again when it runs out, but not on every sale after that. */
  private static alertIfLow(item: InventoryItem, before: InventoryItem['status'] | undefined): void {
    if (item.status === before) return;
    const out = item.status === 'OUT_OF_STOCK';
    if (!out && !(item.status === 'LOW_STOCK' && before === 'IN_STOCK')) return;
    NotificationRepository.createNotification({
      type: 'LOW_STOCK',
      title: out ? `Out of stock: ${item.name}` : `Low stock: ${item.name}`,
      message: `${item.name} is down to ${Math.round(item.currentStock * 100) / 100} ${item.unit}${out ? '' : ` (reorder level ${item.reorderLevel} ${item.unit})`}.`,
      priority: out ? 'HIGH' : 'NORMAL',
      targetRoles: ['POS_ADMIN'],
      meta: { itemId: item.id }
    });
  }

  /**
   * BUG-043: POS showed dishes as available even when an ingredient had run out, because the two
   * kinds of "stock" (ingredients vs dishes) were unrelated. A dish now switches itself off when
   * any ingredient of its recipe is at or below zero, and back on when restocked - but only
   * ever undoes its own switch-off, never one the owner made by hand.
   */
  private static syncDishAvailability(inventoryItemId: string): void {
    db.recipes
      .filter((r) => r.isActive && r.ingredients.some((ing) => ing.inventoryItemId === inventoryItemId))
      .forEach((recipe) => {
        const dish = db.menuItems.find((m) => m.id === recipe.menuItemId);
        if (!dish) return;
        const empty = recipe.ingredients
          .map((ing) => db.inventoryItems.find((i) => i.id === ing.inventoryItemId))
          .find((i) => i && i.currentStock <= 0);
        this.applyAutoAvailability(dish, empty ? `Out of stock: ${empty.name}` : null);
      });
  }

  private static applyAutoAvailability(dish: MenuItem, blockReason: string | null): void {
    const AUTO = 'Out of stock';
    if (blockReason) {
      if (dish.isAvailable) {
        dish.isAvailable = false;
        dish.soldOutReason = blockReason;
      }
    } else if (!dish.isAvailable && dish.soldOutReason?.startsWith(AUTO)) {
      dish.isAvailable = true;
      dish.soldOutReason = undefined;
    }
  }

  /** A dish that has its own counted stock (MenuItem.stockQuantity) goes down when sold, up on reversal, and switches off at zero. */
  private static applyDishStockChange(menuItemId: string, delta: number): void {
    const dish = db.menuItems.find((m) => m.id === menuItemId);
    if (!dish || typeof dish.stockQuantity !== 'number') return;
    dish.stockQuantity = dish.stockQuantity + delta;
    this.applyAutoAvailability(dish, dish.stockQuantity <= 0 ? 'Out of stock' : null);
  }

  /**
   * Brings an order's consumed stock in line with what the order contains right now: consumes
   * only what has not been consumed yet (so calling it again, or after an add-on round, never
   * double-deducts) and gives back anything that was reduced. BUG-044: this used to deduct the
   * whole order every time it was created and never again.
   */
  public static reconcileOrder(order: Order): void {
    if (!order.items) return;
    const consumed = (order.stockConsumedQty = order.stockConsumedQty || {});
    const actor = order.cashierName || order.captainName || 'System';

    order.items.forEach((it) => {
      const already = consumed[it.id] || 0;
      const delta = it.quantity - already;
      if (delta === 0) return;
      const recipe = db.recipes.find((r) => r.menuItemId === it.menuItemId && r.isActive);
      if (recipe) {
        recipe.ingredients.forEach((ing) => {
          const stockItem = db.inventoryItems.find((i) => i.id === ing.inventoryItemId);
          const perPortion = stockItem ? convertQuantity(ing.quantityPerPortion, ing.unit, stockItem.unit) : null;
          if (!stockItem || perPortion === null) {
            AuditRepository.log({
              action: 'STOCK_UNIT_MISMATCH',
              category: 'INVENTORY',
              details: `Could not deduct ${ing.inventoryItemName} for ${it.name}: recipe unit "${ing.unit}" cannot be converted to stock unit "${stockItem?.unit ?? 'n/a'}" (Order #${order.orderNumber}). Stock was NOT changed.`,
              username: actor
            });
            return;
          }
          const qty = perPortion * Math.abs(delta);
          this.recordMovement({
            // Derived from the order, the line, the ingredient and the step (already -> now), so two consoles reconciling the
            // same order produce the same movement and the ledger counts it once.
            id: `sale:${order.id}:${it.id}:${ing.inventoryItemId}:${already}>${it.quantity}`,
            itemId: ing.inventoryItemId,
            itemName: ing.inventoryItemName,
            type: delta > 0 ? 'SALE' : 'SALE_REVERSAL',
            quantityDelta: delta > 0 ? -qty : qty,
            unit: stockItem.unit,
            orderId: order.id,
            reason: `${delta > 0 ? 'Recipe deduct' : 'Recipe give-back'} for ${Math.abs(delta)}x ${it.name} (Order #${order.orderNumber})`,
            performedBy: actor
          });
        });
      }
      this.applyDishStockChange(it.menuItemId, -delta);
      consumed[it.id] = it.quantity;
    });
  }

  /** Puts back everything this order consumed (void, cancel, full refund). Safe to call twice. */
  public static restoreForOrder(order: Order, reason: string = 'Order reversed'): void {
    const consumed = order.stockConsumedQty;
    if (!consumed) return;
    const actor = order.cashierName || order.captainName || 'System';
    order.items.forEach((it) => {
      const qtyConsumed = consumed[it.id] || 0;
      if (qtyConsumed <= 0) return;
      const recipe = db.recipes.find((r) => r.menuItemId === it.menuItemId && r.isActive);
      if (recipe) {
        recipe.ingredients.forEach((ing) => {
          const stockItem = db.inventoryItems.find((i) => i.id === ing.inventoryItemId);
          const perPortion = stockItem ? convertQuantity(ing.quantityPerPortion, ing.unit, stockItem.unit) : null;
          if (!stockItem || perPortion === null) return;
          this.recordMovement({
            itemId: ing.inventoryItemId,
            itemName: ing.inventoryItemName,
            type: 'SALE_REVERSAL',
            quantityDelta: perPortion * qtyConsumed,
            unit: stockItem.unit,
            orderId: order.id,
            reason: `${reason}: ${qtyConsumed}x ${it.name} (Order #${order.orderNumber})`,
            performedBy: actor
          });
        });
      }
      this.applyDishStockChange(it.menuItemId, qtyConsumed);
      consumed[it.id] = 0;
    });
  }

  /** Kept for callers that deduct a fresh order: same as reconcileOrder. */
  public static deductForOrder(order: Order): void {
    this.reconcileOrder(order);
  }

  /** Which ingredients would run short if these dishes were sold - lets a screen warn BEFORE selling out of stock. */
  public static getShortages(lines: Array<{ menuItemId: string; quantity: number }>): Array<{ itemName: string; needed: number; available: number; unit: string }> {
    const needed = new Map<string, { itemName: string; needed: number; unit: string }>();
    lines.forEach((line) => {
      const recipe = db.recipes.find((r) => r.menuItemId === line.menuItemId && r.isActive);
      if (!recipe) return;
      recipe.ingredients.forEach((ing) => {
        const stockItem = db.inventoryItems.find((i) => i.id === ing.inventoryItemId);
        if (!stockItem) return;
        const perPortion = convertQuantity(ing.quantityPerPortion, ing.unit, stockItem.unit);
        if (perPortion === null) return;
        const prev = needed.get(stockItem.id) || { itemName: stockItem.name, needed: 0, unit: stockItem.unit };
        prev.needed += perPortion * line.quantity;
        needed.set(stockItem.id, prev);
      });
    });
    const shortages: Array<{ itemName: string; needed: number; available: number; unit: string }> = [];
    needed.forEach((n, id) => {
      const available = db.inventoryItems.find((i) => i.id === id)!.currentStock;
      if (n.needed > available + 1e-9) shortages.push({ itemName: n.itemName, needed: n.needed, available, unit: n.unit });
    });
    return shortages;
  }

  /**
   * BUG-045: a fresh install shipped with seeded ingredients, prices and stock (e.g. Malai Paneer
   * 18.5 kg at Rs 340). A real restaurant starts with none and enters its own.
   */
  public static startFresh(): void {
    db.inventoryItems = [];
    db.recipes = [];
    db.stockMovements = [];
    db.suppliers = [];
    db.goodsReceipts = [];
    db.inventoryBatches = [];
    db.stockCounts = [];
    AuditRepository.log({
      action: 'INVENTORY_CLEARED_ON_ACTIVATION',
      category: 'INVENTORY',
      details: 'Demo seed ingredients, recipes and stock history cleared on first device activation.',
      username: 'System'
    });
    db.notify();
  }
}

export class RecipeRepository {
  public static getAllRecipes(): Recipe[] {
    return db.recipes;
  }

  public static getRecipeById(id: string): Recipe | undefined {
    return db.recipes.find((r) => r.id === id);
  }

  public static getRecipeByMenuItemId(itemId: string): Recipe | undefined {
    return db.recipes.find((r) => r.menuItemId === itemId);
  }

  public static createRecipe(recipe: Partial<Recipe> & { menuItemId: string; menuItemName: string; ingredients: Recipe['ingredients'] }): Recipe {
    const existing = db.recipes.findIndex((r) => r.menuItemId === recipe.menuItemId);
    const newRecipe: Recipe = {
      id: recipe.id || `rec-${Date.now()}`,
      menuItemId: recipe.menuItemId,
      menuItemName: recipe.menuItemName,
      ingredients: recipe.ingredients,
      isActive: recipe.isActive ?? true
    };
    if (existing !== -1) {
      db.recipes[existing] = newRecipe;
    } else {
      db.recipes.push(newRecipe);
    }
    AuditRepository.log({
      action: 'RECIPE_SAVED',
      category: 'INVENTORY',
      details: `Saved recipe for ${newRecipe.menuItemName} with ${newRecipe.ingredients.length} ingredients`,
      username: 'Manager'
    });
    db.notify();
    return newRecipe;
  }

  public static deleteRecipe(id: string): boolean {
    const idx = db.recipes.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const name = db.recipes[idx].menuItemName;
    db.recipes.splice(idx, 1);
    AuditRepository.log({
      action: 'RECIPE_DELETED',
      category: 'INVENTORY',
      details: `Deleted recipe for ${name}`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }
}

// security-audit MED-07: verifyPin() used to have no attempt limit at all —
// every terminal (POS login/unlock, manager override, Captain, KDS, Kiosk
// discount override) let a walk-up attacker try all 10,000 PINs with no
// slowdown. A PIN doesn't identify who's guessing (verifyPin searches every
// active user for a hash match), so the lockout is per-terminal-process, not
// per-account — same shape as the LAN-pairing-PIN lockout (MED-09).
const PIN_LOCKOUT_AFTER_FAILURES = 5;
const PIN_LOCKOUT_MS = 30_000;
let pinFailureCount = 0;
let pinLockedUntil = 0;

export class StaffRepository {
  /** How long the caller must still wait, in ms, or 0 if verifyPin isn't currently locked out. */
  public static pinLockoutRemainingMs(): number {
    return Math.max(0, pinLockedUntil - Date.now());
  }

  public static getAllUsers(): User[] {
    return db.users;
  }

  public static getUserById(id: string): User | undefined {
    return db.users.find((u) => u.id === id);
  }

  /**
   * Creates a staff member and issues them a real, working PIN (BUG-006: "assign PIN to
   * staff from Restaurant Admin"). The PIN is generated here — never chosen by the caller —
   * stored only as a hash (see pin.ts), and returned once on `issuedPin` so the screen that
   * created the account can show/print it. It is not persisted anywhere in plaintext.
   */
  public static async createUser(
    userData: Partial<User> & { username: string; fullName: string; roleId: string; email?: string }
  ): Promise<User & { issuedPin?: string }> {
    const restaurantId = userData.restaurantId || db.restaurant.id;
    const existingFingerprints = db.users
      .map((u) => (u as User & { pinFingerprint?: string }).pinFingerprint)
      .filter((f): f is string => !!f);
    const pin = generateUniquePin(restaurantId, existingFingerprints);
    const newUser: User & { pinHash: string; pinFingerprint: string } = {
      id: userData.id || `usr-${Date.now()}`,
      restaurantId,
      username: userData.username.toLowerCase().replace(/\s+/g, ''),
      fullName: userData.fullName,
      // No fake "@jamanvaar.local"/"@jamanvaar.com" default (BUG-009) — empty until the owner enters a real one.
      email: userData.email ?? '',
      phone: userData.phone || '',
      roleId: userData.roleId,
      isActive: userData.isActive ?? true,
      pinHash: await hashPin(pin, restaurantId),
      pinFingerprint: pinFingerprint(pin, restaurantId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(newUser);
    AuditRepository.log({
      action: 'STAFF_CREATED',
      category: 'STAFF',
      details: `Created staff member ${newUser.fullName} (@${newUser.username}, Role: ${newUser.roleId})`,
      username: 'Manager'
    });
    db.notify();
    return { ...newUser, issuedPin: pin };
  }

  /** Issues a fresh PIN for an existing staff member and invalidates the old one, once. */
  public static async resetPin(id: string): Promise<(User & { issuedPin: string }) | null> {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    const restaurantId = db.users[idx].restaurantId || db.restaurant.id;
    const existingFingerprints = db.users
      .map((u) => (u as User & { pinFingerprint?: string }).pinFingerprint)
      .filter((f): f is string => !!f);
    const pin = generateUniquePin(restaurantId, existingFingerprints);
    db.users[idx] = {
      ...db.users[idx],
      pinHash: await hashPin(pin, restaurantId),
      pinFingerprint: pinFingerprint(pin, restaurantId),
      updatedAt: new Date().toISOString()
    } as User;
    AuditRepository.log({
      action: 'STAFF_PIN_RESET',
      category: 'STAFF',
      details: `PIN reset for @${db.users[idx].username}`,
      username: 'Manager'
    });
    db.notify();
    return { ...(db.users[idx] as User), issuedPin: pin };
  }

  /**
   * The one place every login surface (POS, Captain, KDS, Kiosk, manager override) verifies a
   * PIN. Centralised so none of them compare a PIN to `User.pinHash` directly. Checks every
   * active user's hash concurrently (PBKDF2 is deliberately slow per B2-014 — sequential
   * `await`s here would multiply that cost by staff count) and returns whichever one matches.
   * The lockout below is MED-07 (see the constants' own comment above this class).
   */
  public static async verifyPin(pin: string, restaurantId?: string): Promise<{ user: User; isManager: boolean } | null> {
    if (Date.now() < pinLockedUntil) return null;
    pinLockedUntil = 0;

    const scopedRestaurantId = restaurantId || db.restaurant.id;
    const activeUsers = (db.users as (User & { pinHash?: string })[]).filter((u) => u.isActive);
    const matches = await Promise.all(
      activeUsers.map((u) => verifyPinHash(pin, u.restaurantId || scopedRestaurantId, u.pinHash))
    );
    const user = activeUsers[matches.findIndex(Boolean)];

    if (!user) {
      pinFailureCount += 1;
      if (pinFailureCount >= PIN_LOCKOUT_AFTER_FAILURES) {
        pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
        pinFailureCount = 0;
      }
      return null;
    }

    pinFailureCount = 0;
    const isManager = user.roleId === 'role-manager' || user.roleId === 'role-super-admin';
    return { user, isManager };
  }

  /**
   * Which terminals a role works on (BUG-118). Owners and managers work everywhere; the floor roles
   * only where they do their job. A custom role the restaurant created is never locked out.
   */
  private static readonly TERMINAL_ROLES: Record<string, ReadonlyArray<'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK'>> = {
    'role-super-admin': ['POS', 'KDS', 'CAPTAIN', 'KIOSK'],
    'role-manager': ['POS', 'KDS', 'CAPTAIN', 'KIOSK'],
    'role-cashier': ['POS', 'KIOSK'],
    'role-captain': ['CAPTAIN'],
    'role-chef': ['KDS']
  };

  public static canUseTerminal(roleId: string | undefined, terminal: 'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK'): boolean {
    const allowed = roleId ? StaffRepository.TERMINAL_ROLES[roleId] : undefined;
    return allowed ? allowed.includes(terminal) : true;
  }

  public static terminalDeniedMessage(roleId: string | undefined, terminal: 'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK'): string {
    const where = { POS: 'the POS counter', KDS: 'the kitchen screen', CAPTAIN: 'the Captain app', KIOSK: 'the kiosk' }[terminal];
    return `This PIN belongs to a ${StaffRepository.getRoleName(roleId)} and can't open ${where}.`;
  }

  /** A role's display name for a raw id like `role-cashier` (BUG-010/011: chips showed the raw id). */
  public static getRoleName(roleId: string | undefined): string {
    if (!roleId) return 'Staff';
    return db.roles.find((r) => r.id === roleId)?.name || SEED_ROLES.find((r) => r.id === roleId)?.name || 'Staff';
  }

  public static updateUser(id: string, updates: Partial<User>): User | null {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    db.users[idx] = { ...db.users[idx], ...updates, updatedAt: new Date().toISOString() };
    AuditRepository.log({
      action: 'STAFF_UPDATED',
      category: 'STAFF',
      details: `Updated staff profile @${db.users[idx].username}`,
      username: 'Manager'
    });
    db.notify();
    return db.users[idx];
  }

  /**
   * security-audit MED-12: this used to `splice` the user out of the local array —
   * which is invisible to entity-sync (STAFF_USER has no delete/tombstone semantics,
   * only create/update, see `applyRemoteUser` below), so a terminated employee's PIN
   * kept working on every OTHER terminal that had already synced their record, forever.
   * "Remove" now deactivates instead (`isActive: false`), the one STAFF_USER field that
   * *does* propagate through the normal sync path — every terminal that pulls this
   * update correctly refuses that PIN from then on (see StaffRepository.verifyPin's
   * `isActive` check). The row is kept, not deleted, so it can still sync at all.
   */
  public static deleteUser(id: string): boolean {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    const name = db.users[idx].fullName;
    db.users[idx] = { ...db.users[idx], isActive: false, updatedAt: new Date().toISOString() };
    AuditRepository.log({
      action: 'STAFF_DELETED',
      category: 'STAFF',
      details: `Deactivated (removed) staff member ${name}`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }

  /**
   * The record shape pushed to the cloud entity-sync bridge as a STAFF_USER (BUG-019/034/035): a PIN
   * issued here previously worked only on this one device, because staff records were never synced —
   * unlike the menu and CRM, which already have a real cloud copy every terminal pulls. Carries the
   * restaurant-keyed PIN hash (see pin.ts), never the plaintext PIN.
   */
  public static toSyncPayload(user: User): Record<string, unknown> {
    const { id, username, fullName, email, phone, roleId, isActive, createdAt, updatedAt } = user;
    return { id, username, fullName, email, phone, roleId, isActive, createdAt, updatedAt, pinHash: (user as User & { pinHash?: string }).pinHash };
  }

  /** Applies one STAFF_USER record pulled from the cloud: creates it locally, or updates it in place by id. */
  public static applyRemoteUser(remote: Record<string, unknown>): void {
    const id = remote.id;
    const pinHash = remote.pinHash;
    if (typeof id !== 'string' || !id || typeof pinHash !== 'string' || !pinHash) return;
    const incoming = {
      id,
      restaurantId: db.restaurant.id,
      username: typeof remote.username === 'string' ? remote.username : id,
      fullName: typeof remote.fullName === 'string' ? remote.fullName : 'Staff',
      email: typeof remote.email === 'string' ? remote.email : '',
      phone: typeof remote.phone === 'string' ? remote.phone : '',
      roleId: typeof remote.roleId === 'string' ? remote.roleId : 'role-cashier',
      isActive: remote.isActive !== false,
      pinHash,
      createdAt: typeof remote.createdAt === 'string' ? remote.createdAt : new Date().toISOString(),
      updatedAt: typeof remote.updatedAt === 'string' ? remote.updatedAt : new Date().toISOString()
    } as User & { pinHash: string };

    const idx = db.users.findIndex((u) => u.id === id);
    if (idx >= 0) db.users[idx] = { ...db.users[idx], ...incoming };
    else db.users.push(incoming);
    db.notify();
  }

  public static getAllRoles(): Role[] {
    return db.roles;
  }

  public static updateRole(id: string, updates: Partial<Role>): Role | null {
    const idx = db.roles.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.roles[idx] = { ...db.roles[idx], ...updates };
    db.notify();
    return db.roles[idx];
  }
}

/**
 * Staff work rosters and daily attendance — previously nonexistent.
 * StaffRepository only ever managed login accounts (username/role/PIN), not
 * who is scheduled to work when, or whether they actually clocked in.
 */
export class StaffScheduleRepository {
  public static getSchedules(): StaffShiftSchedule[] {
    return [...db.staffSchedules].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }

  public static getSchedulesForRange(startDate: string, endDate: string): StaffShiftSchedule[] {
    return this.getSchedules().filter((s) => s.date >= startDate && s.date <= endDate);
  }

  public static createSchedule(data: Omit<StaffShiftSchedule, 'id' | 'createdAt'>): StaffShiftSchedule {
    const shift: StaffShiftSchedule = { id: `sched-${Date.now()}`, createdAt: new Date().toISOString(), ...data };
    db.staffSchedules.push(shift);
    AuditRepository.log({
      action: 'STAFF_SHIFT_SCHEDULED',
      category: 'STAFF',
      details: `Scheduled ${shift.userName} for ${shift.date} ${shift.startTime}-${shift.endTime}`,
      username: 'Manager'
    });
    db.notify();
    return shift;
  }

  public static updateSchedule(id: string, updates: Partial<StaffShiftSchedule>): StaffShiftSchedule | null {
    const idx = db.staffSchedules.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    db.staffSchedules[idx] = { ...db.staffSchedules[idx], ...updates };
    db.notify();
    return db.staffSchedules[idx];
  }

  public static deleteSchedule(id: string): boolean {
    const idx = db.staffSchedules.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    db.staffSchedules.splice(idx, 1);
    db.notify();
    return true;
  }

  // ── Attendance ─────────────────────────────────────────────────────────

  public static getAttendanceForDate(date: string): AttendanceRecord[] {
    return db.attendanceRecords.filter((a) => a.date === date);
  }

  public static getAttendanceForUser(userId: string, days = 30): AttendanceRecord[] {
    return db.attendanceRecords
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);
  }

  private static findOrCreateToday(userId: string, userName: string): AttendanceRecord {
    const today = new Date().toISOString().slice(0, 10);
    let record = db.attendanceRecords.find((a) => a.userId === userId && a.date === today);
    if (!record) {
      record = { id: `att-${Date.now()}`, userId, userName, date: today, status: 'PRESENT' };
      db.attendanceRecords.push(record);
    }
    return record;
  }

  public static clockIn(userId: string, userName: string): AttendanceRecord {
    const record = this.findOrCreateToday(userId, userName);
    record.clockInAt = new Date().toISOString();
    record.status = 'PRESENT';
    AuditRepository.log({ action: 'STAFF_CLOCK_IN', category: 'STAFF', details: `${userName} clocked in`, username: userName });
    db.notify();
    return record;
  }

  public static clockOut(userId: string, userName: string): AttendanceRecord | null {
    const today = new Date().toISOString().slice(0, 10);
    const record = db.attendanceRecords.find((a) => a.userId === userId && a.date === today);
    if (!record) return null;
    record.clockOutAt = new Date().toISOString();
    AuditRepository.log({ action: 'STAFF_CLOCK_OUT', category: 'STAFF', details: `${userName} clocked out`, username: userName });
    db.notify();
    return record;
  }

  public static markAttendance(userId: string, userName: string, date: string, status: AttendanceStatus, notes?: string): AttendanceRecord {
    let record = db.attendanceRecords.find((a) => a.userId === userId && a.date === date);
    if (!record) {
      record = { id: `att-${Date.now()}`, userId, userName, date, status };
      db.attendanceRecords.push(record);
    } else {
      record.status = status;
    }
    if (notes !== undefined) record.notes = notes;
    AuditRepository.log({ action: 'STAFF_ATTENDANCE_MARKED', category: 'STAFF', details: `${userName} marked ${status} on ${date}`, username: 'Manager' });
    db.notify();
    return record;
  }
}

export class PrinterRepository {
  /**
   * BUG-025: called once when a terminal first activates against a real restaurant. The local
   * db ships with fixed demo printers (a "counter" USB printer and kitchen printers at made-up
   * LAN addresses) that are all permanently READY - a real restaurant starts with none and adds
   * its own, so nothing claims to be a working printer that does not exist.
   */
  public static startFresh(): void {
    db.configuredPrinters = [];
    AuditRepository.log({
      action: 'PRINTERS_CLEARED_ON_ACTIVATION',
      category: 'HARDWARE',
      details: 'Demo seed printers cleared on first device activation - add the real printers for this restaurant.',
      username: 'System'
    });
    db.notify();
  }

  public static getAllPrinters(): PrinterDevice[] {
    return db.configuredPrinters;
  }

  public static getPrinterById(id: string): PrinterDevice | undefined {
    return db.configuredPrinters.find((p) => p.id === id);
  }

  public static createPrinter(data: Partial<PrinterDevice> & { name: string; paperSize: PrinterDevice['paperSize'] }): PrinterDevice {
    const newPrn: PrinterDevice = {
      id: data.id || `prn-${Date.now()}`,
      name: data.name,
      driverName: data.driverName || 'Generic / ESC-POS',
      interfaceType: data.interfaceType || 'USB',
      port: data.port || 'USB001',
      paperSize: data.paperSize || '80mm',
      status: data.status || 'READY',
      isDefault: data.isDefault || false,
      isKioskBuiltIn: data.isKioskBuiltIn || false,
      modelName: data.modelName || 'ESC/POS Thermal Line 80mm',
      manufacturer: data.manufacturer || 'JAMANVAAR Hardware Integration HAL',
      lastTestAt: new Date().toISOString()
    };
    if (newPrn.isDefault) {
      db.configuredPrinters.forEach((p) => (p.isDefault = false));
    }
    db.configuredPrinters.push(newPrn);
    AuditRepository.log({
      action: 'PRINTER_CREATED',
      category: 'HARDWARE',
      details: `Configured new printer ${newPrn.name} (${newPrn.paperSize}, ${newPrn.interfaceType})`,
      username: 'Manager'
    });
    db.notify();
    return newPrn;
  }

  public static updatePrinter(id: string, updates: Partial<PrinterDevice>): PrinterDevice | null {
    const idx = db.configuredPrinters.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    if (updates.isDefault) {
      db.configuredPrinters.forEach((p) => (p.isDefault = false));
    }
    db.configuredPrinters[idx] = { ...db.configuredPrinters[idx], ...updates };
    AuditRepository.log({
      action: 'PRINTER_UPDATED',
      category: 'HARDWARE',
      details: `Updated printer configuration ${db.configuredPrinters[idx].name}`,
      username: 'Manager'
    });
    db.notify();
    return db.configuredPrinters[idx];
  }

  public static deletePrinter(id: string): boolean {
    const idx = db.configuredPrinters.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const name = db.configuredPrinters[idx].name;
    db.configuredPrinters.splice(idx, 1);
    AuditRepository.log({
      action: 'PRINTER_DELETED',
      category: 'HARDWARE',
      details: `Removed printer configuration ${name}`,
      username: 'Manager'
    });
    db.notify();
    return true;
  }
}

export class BusinessDayRepository {
  /**
   * Calculates the canonical restaurant business date with 5:00 AM cutoff
   */
  /**
   * B2-017: this used to read `date.getHours()`/`getDate()`/`getMonth()`/`getFullYear()` — the
   * *device's own* system clock/timezone, not the restaurant's. Two devices with different OS
   * timezone settings (or a server running in UTC) computed different business-day ids for the
   * exact same real-world moment, so one screen's "today" excluded an order another screen's
   * "today" included. Every other business-date computation in this codebase already goes through
   * `formatRestaurantDate`/`Intl.DateTimeFormat` pinned to Asia/Kolkata (see B2-013) — this is now
   * the same, so every device agrees on which business day a given instant belongs to.
   */
  public static getCanonicalBusinessDate(date: Date = new Date()): { dateKey: string; dayId: string; displayDate: string } {
    // A record with a missing/malformed createdAt must not crash a business-day computation —
    // `Intl.DateTimeFormat` throws on an invalid date where the old raw `Date` getters just
    // produced NaN/"Invalid Date" harmlessly; keep that same lenient, non-throwing behavior.
    if (isNaN(date.getTime())) {
      return { dateKey: 'Invalid Date', dayId: 'BD-InvalidDate', displayDate: 'Invalid Date' };
    }
    // Restaurant shifts before 5:00 AM (the restaurant's own local time) belong to yesterday's
    // business day. Going back a fixed 24h in absolute time — rather than mutating a local Date's
    // day-of-month — keeps this correct regardless of the device's own timezone or DST rules.
    const effective = getRestaurantHour(date) < 5 ? new Date(date.getTime() - 24 * 60 * 60 * 1000) : date;
    const dateKey = formatRestaurantDate(effective, 'ISO_DATE');
    return {
      dateKey,
      dayId: `BD-${dateKey.replace(/-/g, '')}`,
      displayDate: getBusinessDayDisplayDate(effective)
    };
  }

  public static getActiveBusinessDay(): BusinessDay {
    const currentCanonical = this.getCanonicalBusinessDate();

    let active = db.businessDays.find(
      (d) => d.status === 'OPEN' || d.status === 'CLOSING' || d.status === 'REOPENED'
    );

    // If active day exists but belongs to a previous calendar/business day (past 5:00 AM cutoff),
    // automatically close the previous day and roll over to today's new business day!
    // Compare as dates (not just inequality) — an active day dated today-or-later must never
    // be auto-closed just because it doesn't lexically equal the canonical key.
    if (active && active.businessDate < currentCanonical.dateKey) {
      console.log(`[Auto-Close] Business day ${active.id} (${active.businessDate}) is past 5:00 AM cutoff. Auto-closing day...`);
      active.status = 'CLOSED';
      active.closedAt = new Date().toISOString();
      active.closedBy = 'System Auto-Close (5:00 AM)';
      this.recalculateMetrics(active.id);
      active = undefined; // Force creation of new day
    }

    if (!active) {
      const now = new Date();
      const previousDay = db.businessDays.find((d) => d.status === 'CLOSED');
      const openingCash = previousDay ? (previousDay.closingCash || 2000) : 2000;

      active = {
        id: currentCanonical.dayId,
        businessDate: currentCanonical.dateKey,
        displayDate: currentCanonical.displayDate,
        openedAt: now.toISOString(),
        openedBy: 'System (5:00 AM Auto-Open)',
        status: 'OPEN',
        openingCash: openingCash,
        cashIn: 0,
        cashOut: 0,
        grossSales: 0,
        discounts: 0,
        netSales: 0,
        tax: 0,
        totalCollected: 0,
        cashSales: 0,
        upiSales: 0,
        cardSales: 0,
        otherPayments: 0,
        orderCount: 0,
        completedOrderCount: 0,
        cancelledOrderCount: 0,
        refundedOrderCount: 0,
        dineInCount: 0,
        takeawayCount: 0,
        deliveryCount: 0,
        tokenCount: 0,
        terminalId: 'POS-01',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      db.businessDays.unshift(active);
      db.notify();
    }
    return active;
  }

  public static getAllBusinessDays(): BusinessDay[] {
    return [...db.businessDays].sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
    );
  }

  public static getBusinessDayById(id: string): BusinessDay | undefined {
    return db.businessDays.find((d) => d.id === id);
  }

  public static getOrdersForBusinessDay(businessDayId: string): Order[] {
    const day = this.getBusinessDayById(businessDayId);
    return db.orders.filter((o) => {
      if (o.businessDayId) {
        return o.businessDayId === businessDayId;
      }
      if (day) {
        // Match using the same local-time, 5:00 AM-cutoff canonical date the
        // rest of this class uses — comparing raw UTC calendar dates here
        // (the previous toISOString().slice(0,10)) silently misclassified
        // any order created in the small hours local time, since UTC and a
        // 5 AM cutoff disagree about which calendar day "now" is on.
        const oDate = this.getCanonicalBusinessDate(new Date(o.createdAt)).dateKey;
        return oDate === day.businessDate;
      }
      return false;
    });
  }

  public static recalculateMetrics(businessDayId: string): BusinessDay | null {
    const idx = db.businessDays.findIndex((d) => d.id === businessDayId);
    if (idx === -1) return null;
    const day = db.businessDays[idx];

    const orders = this.getOrdersForBusinessDay(businessDayId);

    let grossSales = 0;
    let discounts = 0;
    let tax = 0;
    let netSales = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let otherPayments = 0;

    let completedOrderCount = 0;
    let cancelledOrderCount = 0;
    let refundedOrderCount = 0;
    let dineInCount = 0;
    let takeawayCount = 0;
    let deliveryCount = 0;
    let tokenCount = 0;

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') {
        cancelledOrderCount++;
        return;
      }
      // Sent to the kitchen but not paid yet: not a sale, not collected money (BUG-151/161).
      if (isUnpaidOpenOrder(o)) return;
      if (o.orderStatus === 'REFUNDED') {
        refundedOrderCount++;
      }
      if (o.orderStatus === 'COMPLETED') {
        completedOrderCount++;
      }

      grossSales += o.subtotal || o.totalAmount;
      discounts += o.discountAmount || 0;
      tax += o.taxAmount || 0;
      netSales += o.totalAmount;

      const tenders = getOrderTenders(o);
      cashSales += tenders.cash;
      upiSales += tenders.upi;
      cardSales += tenders.card;
      otherPayments += tenders.wallet + tenders.houseAccount + tenders.other;

      if (o.orderType === 'DINE_IN') dineInCount++;
      else if (o.orderType === 'TAKEAWAY') takeawayCount++;
      else if (o.orderType === 'DELIVERY') deliveryCount++;
      else tokenCount++;
    });

    day.grossSales = grossSales;
    day.discounts = discounts;
    day.tax = tax;
    day.netSales = netSales;
    day.totalCollected = netSales;
    day.cashSales = cashSales;
    day.upiSales = upiSales;
    day.cardSales = cardSales;
    day.otherPayments = otherPayments;
    day.orderCount = orders.length;
    day.completedOrderCount = completedOrderCount;
    day.cancelledOrderCount = cancelledOrderCount;
    day.refundedOrderCount = refundedOrderCount;
    day.dineInCount = dineInCount;
    day.takeawayCount = takeawayCount;
    day.deliveryCount = deliveryCount;
    day.tokenCount = tokenCount;
    day.updatedAt = new Date().toISOString();

    db.notify();
    return day;
  }

  public static startDayClosing(businessDayId: string): {
    day: BusinessDay;
    activeOrdersCount: number;
    pendingKotCount: number;
    unpaidOrdersCount: number;
  } {
    const day = this.recalculateMetrics(businessDayId) || this.getActiveBusinessDay();
    const orders = this.getOrdersForBusinessDay(day.id);

    const activeOrdersCount = orders.filter(
      (o) => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED'
    ).length;

    const unpaidOrdersCount = orders.filter(
      (o) => o.paymentStatus !== 'SUCCESS' && o.orderStatus !== 'CANCELLED'
    ).length;

    const pendingKotCount = db.kots.filter(
      (k) => k.status !== 'SERVED' && k.status !== 'CANCELLED'
    ).length;

    day.status = 'CLOSING';
    db.notify();

    return {
      day,
      activeOrdersCount,
      pendingKotCount,
      unpaidOrdersCount
    };
  }

  public static closeBusinessDay(
    businessDayId: string,
    actualCash: number,
    closedBy: string,
    varianceReason?: string
  ): BusinessDay {
    const day = this.recalculateMetrics(businessDayId) || this.getActiveBusinessDay();
    const expectedCash = (day.openingCash || 0) + day.cashSales + (day.cashIn || 0) - (day.cashOut || 0);
    const variance = actualCash - expectedCash;

    // Snapshot top items
    const orders = this.getOrdersForBusinessDay(day.id);
    orders.forEach((o) => {
      if (!o.businessDayId) o.businessDayId = day.id;
    });

    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      o.items.forEach((it) => {
        if (!itemMap[it.name]) itemMap[it.name] = { name: it.name, qty: 0, revenue: 0 };
        itemMap[it.name].qty += it.quantity;
        itemMap[it.name].revenue += it.totalPrice;
      });
    });
    const topItemsSnapshot = Object.values(itemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((it) => ({ name: it.name, quantity: it.qty, revenue: it.revenue }));

    const snapshot: BusinessDaySnapshot = {
      grossSalesSnapshot: day.grossSales,
      discountSnapshot: day.discounts,
      taxSnapshot: day.tax,
      netSalesSnapshot: day.netSales,
      paymentSnapshot: {
        cash: day.cashSales,
        upi: day.upiSales,
        card: day.cardSales,
        split: day.otherPayments,
        other: 0
      },
      orderCountSnapshot: day.orderCount,
      completedOrderCountSnapshot: day.completedOrderCount,
      cancelledOrderCountSnapshot: day.cancelledOrderCount,
      refundedOrderCountSnapshot: day.refundedOrderCount,
      cashDrawerSnapshot: {
        openingCash: day.openingCash,
        cashSales: day.cashSales,
        cashIn: day.cashIn || 0,
        cashOut: day.cashOut || 0,
        expectedCash,
        actualCash,
        variance,
        varianceReason
      },
      topItemsSnapshot
    };

    day.status = 'CLOSED';
    day.closedAt = new Date().toISOString();
    day.closedBy = closedBy;
    day.closingCash = actualCash;
    day.expectedCash = expectedCash;
    day.cashVariance = variance;
    day.varianceReason = varianceReason || (variance === 0 ? 'Balanced' : undefined);
    day.snapshot = snapshot;
    day.updatedAt = new Date().toISOString();

    AuditRepository.log({
      action: 'DAY_CLOSED',
      category: 'SHIFT',
      details: `Business Day ${day.displayDate} (${day.id}) closed by ${closedBy}. Net Sales: ₹${day.netSales}, Closing Cash: ₹${actualCash}, Variance: ₹${variance}`,
      username: closedBy
    });

    db.notify();
    return day;
  }

  public static openNewBusinessDay(openedBy: string, initialCash?: number, targetDateKey?: string): BusinessDay {
    // Idempotency: If there is already an OPEN/REOPENED business day, return it
    const existingOpen = db.businessDays.find((d) => d.status === 'OPEN' || d.status === 'REOPENED');
    if (existingOpen) {
      return existingOpen;
    }

    // Determine target business date
    let dateKey = targetDateKey;
    let displayDateStr = '';

    if (!dateKey) {
      // Find the most recently closed business day by businessDate — the
      // array is not guaranteed to be in chronological order (older seed
      // days can sit ahead of a day closed just now), so a plain .find()
      // here previously grabbed whichever CLOSED day happened to appear
      // first, silently reusing a stale historical date instead of
      // yesterday's real close and corrupting which orders the new day's
      // date-fallback matching (getOrdersForBusinessDay) picks up.
      const lastClosed = [...db.businessDays]
        .filter((d) => d.status === 'CLOSED' && d.businessDate)
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate))[0];
      if (lastClosed && lastClosed.businessDate) {
        const [y, m, d] = lastClosed.businessDate.split('-').map(Number);
        const nextDt = new Date(y, m - 1, d + 1, 8, 0, 0);
        const ny = nextDt.getFullYear();
        const nm = String(nextDt.getMonth() + 1).padStart(2, '0');
        const nd = String(nextDt.getDate()).padStart(2, '0');
        dateKey = `${ny}-${nm}-${nd}`;
        displayDateStr = nextDt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      } else {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        dateKey = `${yyyy}-${mm}-${dd}`;
        displayDateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    } else {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d, 8, 0, 0);
      displayDateStr = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    const dayId = `BD-${dateKey.replace(/-/g, '')}`;
    const openedAtIso = new Date().toISOString();

    const newDay: BusinessDay = {
      id: dayId,
      businessDate: dateKey,
      displayDate: displayDateStr,
      openedAt: openedAtIso,
      openedBy,
      status: 'OPEN',
      openingCash: initialCash ?? 2000,
      cashIn: 0,
      cashOut: 0,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      tax: 0,
      totalCollected: 0,
      cashSales: 0,
      upiSales: 0,
      cardSales: 0,
      otherPayments: 0,
      orderCount: 0,
      completedOrderCount: 0,
      cancelledOrderCount: 0,
      refundedOrderCount: 0,
      dineInCount: 0,
      takeawayCount: 0,
      deliveryCount: 0,
      tokenCount: 0,
      terminalId: 'POS-01',
      createdAt: openedAtIso,
      updatedAt: openedAtIso
    };

    db.businessDays.unshift(newDay);

    AuditRepository.log({
      action: 'DAY_OPENED',
      category: 'SHIFT',
      details: `Opened new Business Day ${newDay.displayDate} (${newDay.id}) with float ₹${newDay.openingCash}`,
      username: openedBy
    });

    db.notify();
    return newDay;
  }

  public static reopenBusinessDay(businessDayId: string, adminUser: string, reason: string): BusinessDay | null {
    const idx = db.businessDays.findIndex((d) => d.id === businessDayId);
    if (idx === -1) return null;
    const day = db.businessDays[idx];

    day.status = 'REOPENED';
    day.reopenedAt = new Date().toISOString();
    day.reopenedBy = adminUser;
    day.reopenReason = reason;
    day.updatedAt = new Date().toISOString();

    AuditRepository.log({
      action: 'DAY_REOPENED',
      category: 'SECURITY',
      details: `Reopened Business Day ${day.displayDate} (${day.id}) by Admin ${adminUser}. Reason: ${reason}`,
      username: adminUser
    });

    db.notify();
    return day;
  }
}

export class NotificationRepository {
  public static createNotification(notif: Partial<AppNotification>): AppNotification {
    const newNotif: AppNotification = {
      id: notif.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: notif.type || 'MANAGER_ALERT',
      title: notif.title || 'System Notification',
      message: notif.message || '',
      timestamp: notif.timestamp || new Date().toISOString(),
      isRead: notif.isRead ?? false,
      priority: notif.priority || 'NORMAL',
      targetRoles: notif.targetRoles || ['ALL'],
      tableNumber: notif.tableNumber,
      meta: notif.meta || {}
    };

    db.notifications.unshift(newNotif);
    if (db.notifications.length > 200) {
      db.notifications = db.notifications.slice(0, 200);
    }
    db.notify();
    return newNotif;
  }

  public static getNotifications(role?: NotificationRole, unreadOnly?: boolean): AppNotification[] {
    return db.notifications.filter((n) => {
      if (unreadOnly && n.isRead) return false;
      if (!role || role === 'ALL') return true;
      if (!n.targetRoles || n.targetRoles.includes('ALL') || n.targetRoles.includes(role)) return true;
      return false;
    });
  }

  public static getUnreadCount(role?: NotificationRole): number {
    return this.getNotifications(role, true).length;
  }

  public static markAsRead(id: string): void {
    const notif = db.notifications.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
      db.notify();
    }
  }

  public static markAllAsRead(role?: NotificationRole): void {
    db.notifications.forEach((n) => {
      if (!role || role === 'ALL' || !n.targetRoles || n.targetRoles.includes('ALL') || n.targetRoles.includes(role)) {
        n.isRead = true;
      }
    });
    db.notify();
  }

  public static clearAll(): void {
    db.notifications = [];
    db.notify();
  }
}

/**
 * SEC-010 fix: table QR tokens used to be `jv_qr_{restaurantId}_{branchId}_tbl_{tableNumber}`
 * — fully derivable from public IDs, so anyone who knew (or guessed) a table
 * number could construct a "valid" token without ever scanning the physical
 * QR code. This generates a high-entropy random suffix instead; the table
 * number stays in the string only for human debuggability, not as the secret.
 */
/**
 * Kiosk Admin/Super Admin-configurable customer-kiosk behavior — which
 * languages the kiosk offers, the idle-timeout thresholds, and the welcome
 * screen's tagline/logo size. These previously lived as literal constants
 * inside the kiosk app itself; this is the real config surface those
 * constants now read from, mirroring QrOrderingRepository's own
 * get/update-with-audit-log shape below.
 */
export class KioskDisplaySettingsRepository {
  public static getSettings(): KioskDisplaySettings {
    if (!db.kioskDisplaySettings) {
      db.kioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS };
    }
    return db.kioskDisplaySettings;
  }

  public static updateSettings(partial: Partial<KioskDisplaySettings>, actor: string = 'Kiosk Admin'): KioskDisplaySettings {
    const current = this.getSettings();

    // A restaurant with no enabled languages, or a default that isn't in
    // the enabled list, would leave the kiosk unable to render a language
    // screen at all — reject rather than silently produce that state.
    const nextEnabled = partial.enabledLanguages ?? current.enabledLanguages;
    if (nextEnabled.length === 0) {
      throw new Error('At least one language must remain enabled.');
    }
    const nextDefault = partial.defaultLanguage ?? current.defaultLanguage;
    if (!nextEnabled.includes(nextDefault)) {
      throw new Error(`Default language "${nextDefault}" must be one of the enabled languages.`);
    }

    db.kioskDisplaySettings = { ...current, ...partial };
    AuditRepository.log({
      action: 'SETTINGS_UPDATE',
      category: 'BUSINESS',
      details: `Updated kiosk display settings: ${Object.keys(partial).join(', ')}`,
      username: actor
    });
    db.notify();
    return db.kioskDisplaySettings;
  }
}

export class WelcomeScreenSettingsRepository {
  public static getSettings(): WelcomeScreenSettings {
    if (!db.welcomeScreenSettings) {
      db.welcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
    }
    return db.welcomeScreenSettings;
  }

  public static updateSettings(partial: Partial<WelcomeScreenSettings>, actor: string = 'Kiosk Admin'): WelcomeScreenSettings {
    const current = this.getSettings();
    db.welcomeScreenSettings = { ...current, ...partial };
    AuditRepository.log({
      action: 'SETTINGS_UPDATE',
      category: 'BUSINESS',
      details: `Updated welcome screen settings: ${Object.keys(partial).join(', ')}`,
      username: actor
    });
    db.notify();
    return db.welcomeScreenSettings;
  }
}







