import {
  AppNotification,
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
  SyncEvent,
  User,
  WaitlistEntry
} from '@jamanvaar/types';
import { generateOrderNumber, generateTokenNumber, generateUUID } from '@jamanvaar/utils';
import { db } from './db';
import { DEFAULT_QR_SETTINGS } from './seed';

export class MenuRepository {
  public static getAllCategories(): Category[] {
    return db.categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public static getCategoryById(id: string): Category | undefined {
    return db.categories.find((c) => c.id === id);
  }

  public static createCategory(category: Partial<Category>): Category {
    const newCat: Category = {
      id: category.id || `cat-${Date.now()}`,
      name: category.name || 'New Category',
      slug: category.slug || `cat-${Date.now()}`,
      description: category.description || '',
      iconName: category.iconName || 'Utensils',
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder || db.categories.length + 1,
      isActive: true,
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

  public static deleteCategory(id: string): boolean {
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    db.categories.splice(idx, 1);
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
    const newItem: MenuItem = {
      id: itemData.id || `item-${Date.now()}`,
      categoryId: itemData.categoryId || db.categories[0]?.id || 'cat-starters',
      sku: itemData.sku || `SKU-${Math.floor(100 + Math.random() * 900)}`,
      name: itemData.name || 'New Dish',
      description: itemData.description || '',
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
      taxGroupId: itemData.taxGroupId || 'tax-gst-5',
      sortOrder: itemData.sortOrder || db.menuItems.length + 1,
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

  public static deleteMenuItem(id: string): boolean {
    const idx = db.menuItems.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    db.menuItems.splice(idx, 1);
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

  public static createOrder(orderData: Partial<Order>): Order {
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
    const activeDayOrders = db.orders.filter((o) => o.businessDayId === businessDayId);
    let tokenNumber = orderData.tokenNumber;
    if (!tokenNumber) {
      if (activeDayOrders.length === 0) {
        tokenNumber = '101';
      } else {
        const highestToken = activeDayOrders.reduce((max, o) => {
          const num = parseInt(o.tokenNumber, 10);
          return !isNaN(num) && num > max ? num : max;
        }, 100);
        tokenNumber = (highestToken + 1).toString();
      }
    }
    // Hard uniqueness guarantee, not just a low-probability random draw.
    let orderNumber = orderData.orderNumber;
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
      id: orderData.id || `ord-${Date.now()}`,
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
      paymentStatus: orderData.paymentStatus || 'SUCCESS',
      paymentTransactionId: orderData.paymentTransactionId,
      orderStatus: orderData.orderStatus || 'CONFIRMED',
      estimatedWaitMinutes: orderData.estimatedWaitMinutes || 15,
      pickupCounter: orderData.pickupCounter || 'Counter 1',
      source_type: resolvedSourceType,
      acknowledgementStage:
        orderData.acknowledgementStage ||
        (orderData.syncStatus === 'SAVED_LOCALLY' ? 'ORDER_CREATED_LOCALLY' : 'ORDER_SENT_TO_KDS'),
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
      syncStatus: orderData.syncStatus || 'SYNCED',
      isSynced: orderData.isSynced ?? true,
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

    // Auto-deduct stock via recipes
    InventoryRepository.deductForOrder(newOrder);

    // Update active shift stats if payment is already successful (e.g. Counter instant bill / kiosk order)
    if (newOrder.paymentStatus === 'SUCCESS') {
      const activeShift = ShiftRepository.getActiveShift();
      if (activeShift) {
        activeShift.totalOrders += 1;
        activeShift.totalSales += newOrder.totalAmount;
        activeShift.totalDiscounts += newOrder.discountAmount || 0;
        const pMethod = newOrder.paymentMethod;
        if (pMethod === 'CASH' || pMethod === 'CASH_AT_COUNTER') {
          activeShift.totalCashSales += newOrder.totalAmount;
          activeShift.expectedCash += newOrder.totalAmount;
        } else if (pMethod === 'UPI' || pMethod === 'UPI_QR') {
          activeShift.totalUpiSales += newOrder.totalAmount;
        } else if (pMethod === 'CARD' || pMethod === 'CARD_TERMINAL') {
          activeShift.totalCardSales += newOrder.totalAmount;
        } else if (pMethod === 'SPLIT') {
          activeShift.totalCashSales += Math.round(newOrder.totalAmount / 2);
          activeShift.totalUpiSales += newOrder.totalAmount - Math.round(newOrder.totalAmount / 2);
          activeShift.expectedCash += Math.round(newOrder.totalAmount / 2);
        }
      }
    }

    db.notify();

    // Directly post to authoritative Local Service
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const host = window.location?.hostname || 'localhost';
      fetch(`http://${host}:5178/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      }).catch(() => {});
    }

    return newOrder;
  }

  public static updateOrderStatus(id: string, status: OrderStatus, actor: string = 'Admin'): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;
    const prevStatus = order.orderStatus;
    order.orderStatus = status;
    order.updatedAt = new Date().toISOString();

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

    // Update on Local Service
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const host = window.location?.hostname || 'localhost';
      fetch(`http://${host}:5178/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actor })
      }).catch(() => {});
    }

    return order;
  }

  public static settleOrder(
    id: string,
    paymentMethod: PaymentMethod,
    tenderedAmount?: number,
    transactionId?: string,
    actor: string = 'Cashier'
  ): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;

    const now = new Date().toISOString();
    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'SUCCESS';
    order.orderStatus = 'COMPLETED';
    order.paymentTransactionId = transactionId || `TXN-${Date.now()}`;
    if (tenderedAmount !== undefined) {
      order.tenderedAmount = tenderedAmount;
      order.changeAmount = Math.max(0, Number((tenderedAmount - order.totalAmount).toFixed(2)));
    }
    order.updatedAt = now;

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
    const activeShift = ShiftRepository.getActiveShift();
    if (activeShift) {
      activeShift.totalOrders += 1;
      activeShift.totalSales += order.totalAmount;
      activeShift.totalDiscounts += order.discountAmount || 0;
      if (paymentMethod === 'CASH' || paymentMethod === 'CASH_AT_COUNTER') {
        activeShift.totalCashSales += order.totalAmount;
        activeShift.expectedCash += order.totalAmount;
      } else if (paymentMethod === 'UPI' || paymentMethod === 'UPI_QR') {
        activeShift.totalUpiSales += order.totalAmount;
      } else if (paymentMethod === 'CARD' || paymentMethod === 'CARD_TERMINAL') {
        activeShift.totalCardSales += order.totalAmount;
      } else if (paymentMethod === 'SPLIT') {
        // Assume half cash, half UPI if split
        activeShift.totalCashSales += Math.round(order.totalAmount / 2);
        activeShift.totalUpiSales += order.totalAmount - Math.round(order.totalAmount / 2);
        activeShift.expectedCash += Math.round(order.totalAmount / 2);
      }
    }

    // Automated loyalty earn — previously nothing credited points or
    // advanced totalSpend/totalVisits on an actual paid order; only a
    // manual addPoints() call existed, never wired to checkout.
    if (order.customerPhone) {
      CustomerRepository.earnPointsForOrder(order.customerPhone, order.totalAmount);
    }

    db.notify();

    // Directly post settled order to authoritative Local Service for cross-port sync
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const host = window.location?.hostname || 'localhost';
      fetch(`http://${host}:5178/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).catch(() => {});
    }

    return order;
  }

  public static voidOrder(id: string, reason: string, managerName: string): Order | null {
    const order = db.orders.find((o) => o.id === id);
    if (!order) return null;

    const now = new Date().toISOString();
    order.orderStatus = 'CANCELLED';
    order.paymentStatus = 'CANCELLED';
    order.updatedAt = now;

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

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const host = window.location?.hostname || 'localhost';
      fetch(`http://${host}:5178/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).catch(() => {});
    }

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

    const now = new Date().toISOString();
    order.orderStatus = 'REFUNDED';
    order.paymentStatus = 'REFUNDED';
    order.updatedAt = now;

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'REFUNDED',
      title: `Refund Processed ₹${refundAmount} by ${managerName}`,
      note: `Reason: ${reason}`,
      timestamp: now,
      actor: managerName
    });

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

  public static createTable(tableData: Partial<DiningTable>): DiningTable {
    const newTable: DiningTable = {
      id: tableData.id || `tbl-${Date.now()}`,
      outletId: tableData.outletId || db.outlet.id,
      tableNumber: tableData.tableNumber || `${db.tables.length + 1}`,
      capacity: tableData.capacity || 4,
      zone: tableData.zone || 'Main Dining Hall',
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
    tbl.status = status;
    if (status === 'AVAILABLE') {
      tbl.currentOrderId = undefined;
    }
    db.notify();
    return tbl;
  }

  public static deleteTable(id: string): boolean {
    const idx = db.tables.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const num = db.tables[idx].tableNumber;
    db.tables.splice(idx, 1);
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

  public static getByCode(code: string): Coupon | undefined {
    return db.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
  }

  public static incrementUsage(code: string): void {
    const cpn = db.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (cpn) {
      cpn.usageCount = (cpn.usageCount || 0) + 1;
      db.notify();
    }
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

  public static getByPhone(phone: string): CustomerAccount | undefined {
    return db.customerAccounts.find((a) => a.phone === phone);
  }

  public static getOrCreate(phone: string, name?: string): CustomerAccount {
    return this.getOrCreateAccount(phone, name);
  }

  public static getOrCreateAccount(phone: string, name?: string): CustomerAccount {
    let account = db.customerAccounts.find((a) => a.phone === phone);
    if (!account) {
      account = {
        phone,
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
    const existing = db.customerAccounts.find((c) => c.phone === cust.phone);
    if (existing) {
      existing.name = cust.name || existing.name;
      if (cust.loyaltyPoints !== undefined) existing.loyaltyPoints = cust.loyaltyPoints;
      db.notify();
      return existing;
    }
    const newCust: CustomerAccount = {
      phone: cust.phone,
      name: cust.name,
      loyaltyPoints: cust.loyaltyPoints || 50,
      favoriteItemIds: cust.favoriteItemIds || [],
      recentOrderIds: cust.recentOrderIds || []
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
  public static earnPointsForOrder(phone: string, orderTotal: number): number {
    const account = this.getOrCreateAccount(phone);
    const tierBefore = this.getTierForAccount(account);

    account.totalSpend = (account.totalSpend || 0) + orderTotal;
    account.totalVisits = (account.totalVisits || 0) + 1;
    account.lastVisitAt = new Date().toISOString();

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
        qrTableOrdering: isPro
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
      db.notify();
      return true;
    }
    return false;
  }
}

export class ReceiptRepository {
  public static getConfig(): ReceiptConfig {
    return db.receiptConfig;
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

        const pm = (o.paymentMethod || '').toUpperCase();
        if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') {
          totalCashSales += o.totalAmount;
        } else if (pm === 'UPI' || pm === 'UPI_QR') {
          totalUpiSales += o.totalAmount;
        } else if (pm === 'CARD' || pm === 'CARD_TERMINAL') {
          totalCardSales += o.totalAmount;
        } else if (pm === 'SPLIT') {
          const cashPortion = Math.round(o.totalAmount / 2);
          totalCashSales += cashPortion;
          totalUpiSales += o.totalAmount - cashPortion;
        } else {
          totalCashSales += o.totalAmount;
        }
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

  public static addCashMovement(shiftId: string, type: 'CASH_IN' | 'CASH_OUT', amount: number, reason: string, cashierName: string, authorizedBy?: string): CashMovement {
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

    const shift = db.shifts.find((s) => s.id === shiftId);
    if (shift) {
      if (type === 'CASH_IN') {
        shift.expectedCash += amount;
      } else {
        shift.expectedCash -= amount;
      }
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

    Object.entries(stationMap).forEach(([stationName, stationItems]) => {
      const kotRecord: KOTRecord = {
        id: `kot-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        kotNumber: `KOT-${String(nextKotSeq).padStart(2, '0')}`,
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
        status: 'PREPARING'
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
    db.notify();
    return kot;
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
  public static verifyPin(pin: string): { success: boolean; user?: (typeof db.users)[0]; isManager: boolean } {
    const user = (db.users as any[]).find((u) => u.pinCode === pin && u.isActive);
    if (!user) return { success: false, isManager: false };
    const isManager = user.roleId === 'role-manager' || user.roleId === 'role-super-admin';
    return { success: true, user, isManager };
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
      status: 'SUCCESS', // Virtual/browser driver marks as SUCCESS
      attempts: 1,
      maxAttempts: 3,
      lastAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
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
    if (status === 'SUCCESS') job.completedAt = new Date().toISOString();
    job.lastAttemptAt = new Date().toISOString();
    db.notify();
    return job;
  }

  public static retryJob(id: string): PrintJob | null {
    const job = db.printJobs.find((j) => j.id === id);
    if (!job) return null;
    job.status = 'SUCCESS';
    job.attempts += 1;
    job.lastAttemptAt = new Date().toISOString();
    job.completedAt = new Date().toISOString();
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

export class InventoryRepository {
  public static getAllItems(): InventoryItem[] {
    return [...db.inventoryItems];
  }

  public static getItemById(id: string): InventoryItem | undefined {
    return db.inventoryItems.find((i) => i.id === id);
  }

  public static createItem(data: Omit<InventoryItem, 'id' | 'updatedAt' | 'status'> & { id?: string }): InventoryItem {
    const newItem: InventoryItem = {
      id: data.id || `inv-${Date.now()}`,
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

  public static recordMovement(data: Omit<StockMovement, 'id' | 'timestamp'>): StockMovement {
    const movement: StockMovement = {
      id: `sm-${Date.now()}`,
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
    if (item) {
      item.currentStock = Math.max(0, item.currentStock + data.quantityDelta);
      item.status = item.currentStock <= 0 ? 'OUT_OF_STOCK' : item.currentStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
      if (data.type === 'RESTOCK' || data.type === 'PURCHASE') {
        item.lastRestockedAt = movement.timestamp;
      }
      item.updatedAt = movement.timestamp;
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

  public static deductForOrder(order: Order): void {
    if (!order.items || order.items.length === 0) return;

    order.items.forEach((it) => {
      const recipe = db.recipes.find((r) => r.menuItemId === it.menuItemId && r.isActive);
      if (recipe) {
        recipe.ingredients.forEach((ing) => {
          const totalQty = ing.quantityPerPortion * it.quantity;
          this.recordMovement({
            itemId: ing.inventoryItemId,
            itemName: ing.inventoryItemName,
            type: 'SALE',
            quantityDelta: -totalQty,
            unit: ing.unit,
            orderId: order.id,
            reason: `Recipe auto-deduct for ${it.quantity}x ${it.name} (Order #${order.orderNumber})`,
            performedBy: 'POS Terminal'
          });
        });
      }
    });
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

export class StaffRepository {
  public static getAllUsers(): User[] {
    return db.users;
  }

  public static getUserById(id: string): User | undefined {
    return db.users.find((u) => u.id === id);
  }

  public static createUser(userData: Partial<User> & { username: string; fullName: string; roleId: string; email?: string }): User {
    const newUser: User = {
      id: userData.id || `usr-${Date.now()}`,
      restaurantId: userData.restaurantId || db.restaurant.id,
      username: userData.username.toLowerCase().replace(/\s+/g, ''),
      fullName: userData.fullName,
      email: userData.email || `${userData.username.toLowerCase()}@jamanvaar.local`,
      phone: userData.phone || '+91 9800000000',
      roleId: userData.roleId,
      isActive: userData.isActive ?? true,
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
    return newUser;
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

  public static deleteUser(id: string): boolean {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    const name = db.users[idx].fullName;
    db.users.splice(idx, 1);
    AuditRepository.log({
      action: 'STAFF_DELETED',
      category: 'STAFF',
      details: `Deleted staff member ${name}`,
      username: 'Manager'
    });
    db.notify();
    return true;
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
  public static getCanonicalBusinessDate(date: Date = new Date()): { dateKey: string; dayId: string; displayDate: string } {
    const adjusted = new Date(date);
    // Restaurant shifts before 5:00 AM belong to yesterday's business day
    if (adjusted.getHours() < 5) {
      adjusted.setDate(adjusted.getDate() - 1);
    }
    const yyyy = adjusted.getFullYear();
    const mm = String(adjusted.getMonth() + 1).padStart(2, '0');
    const dd = String(adjusted.getDate()).padStart(2, '0');
    return {
      dateKey: `${yyyy}-${mm}-${dd}`,
      dayId: `BD-${yyyy}${mm}${dd}`,
      displayDate: adjusted.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
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

      const m = (o.paymentMethod || '').toUpperCase();
      if (m === 'CASH' || m === 'CASH_AT_COUNTER') {
        cashSales += o.totalAmount;
      } else if (m === 'UPI' || m === 'UPI_QR') {
        upiSales += o.totalAmount;
      } else if (m === 'CARD' || m === 'CARD_TERMINAL') {
        cardSales += o.totalAmount;
      } else if (m === 'SPLIT') {
        const cashHalf = Math.round(o.totalAmount / 2);
        cashSales += cashHalf;
        upiSales += o.totalAmount - cashHalf;
      } else {
        otherPayments += o.totalAmount;
      }

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
function generateSecureQrTokenSuffix(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class QrOrderingRepository {
  public static getSettings(): QrOrderingSettings {
    if (!db.qrSettings) {
      db.qrSettings = { ...DEFAULT_QR_SETTINGS };
    }
    return db.qrSettings;
  }

  public static updateSettings(partial: Partial<QrOrderingSettings>): QrOrderingSettings {
    db.qrSettings = {
      ...this.getSettings(),
      ...partial
    };
    AuditRepository.log({
      action: 'SETTINGS_UPDATE',
      category: 'BUSINESS',
      details: `Updated QR table ordering configuration settings`,
      username: 'POS Admin'
    });
    db.notify();
    return db.qrSettings;
  }

  public static getTables(): DiningTable[] {
    return db.tables;
  }

  public static updateTable(tableId: string, updates: Partial<DiningTable>): DiningTable | null {
    const table = db.tables.find((t) => t.id === tableId || t.tableNumber === tableId);
    if (!table) return null;

    Object.assign(table, updates);
    db.notify();
    return table;
  }

  /**
   * restaurantId/branchId are accepted for call-site compatibility but no
   * longer embedded in the token (SEC-010 — embedding public IDs is what
   * made the old token guessable). They may still be used by callers that
   * pass a fullUrl through a multi-tenant router.
   */
  public static generateTableQr(
    tableNumber: string,
    _restaurantId?: string,
    _branchId?: string
  ): { qrShortCode: string; fullUrl: string; tableNumber: string; qrToken: string } {
    const table = db.tables.find((t) => t.tableNumber === tableNumber || t.id === tableNumber);
    const tblNum = table ? table.tableNumber : tableNumber;
    const qrShortCode = `QR-TABLE-${tblNum.padStart(3, '0')}`;
    const qrToken = `jv_qr_tbl_${tblNum}_${generateSecureQrTokenSuffix()}`;
    const hostUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://jamanvaar.menu';
    const fullUrl = `${hostUrl}/?qrTable=${tblNum}&token=${qrToken}`;

    if (table) {
      table.qrShortCode = qrShortCode;
      table.qrToken = qrToken;
      table.qrStatus = table.qrStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      table.qrCodeUrl = fullUrl;
      db.notify();
    }

    return { qrShortCode, fullUrl, tableNumber: tblNum, qrToken };
  }

  public static regenerateTableQr(tableNumber: string): { qrShortCode: string; fullUrl: string; tableNumber: string; qrToken: string } {
    const table = db.tables.find((t) => t.tableNumber === tableNumber || t.id === tableNumber);
    const tblNum = table ? table.tableNumber : tableNumber;
    const qrShortCode = `QR-TABLE-${tblNum.padStart(3, '0')}`;
    const qrToken = `jv_qr_tbl_${tblNum}_${generateSecureQrTokenSuffix()}`;
    const hostUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://jamanvaar.menu';
    const fullUrl = `${hostUrl}/?qrTable=${tblNum}&token=${qrToken}`;

    if (table) {
      table.qrShortCode = qrShortCode;
      table.qrToken = qrToken;
      table.qrStatus = 'ACTIVE';
      table.qrCodeUrl = fullUrl;
      AuditRepository.log({
        action: 'QR_REGENERATED',
        category: 'BUSINESS',
        details: `Regenerated QR token for Table ${tblNum}`,
        username: 'Manager'
      });
      db.notify();
    }

    return { qrShortCode, fullUrl, tableNumber: tblNum, qrToken };
  }

  public static bulkGenerateQr(tableNumbers?: string[]): number {
    const targets = tableNumbers && tableNumbers.length > 0
      ? db.tables.filter((t) => tableNumbers.includes(t.tableNumber) || tableNumbers.includes(t.id))
      : db.tables;

    targets.forEach((t) => {
      this.generateTableQr(t.tableNumber);
    });
    return targets.length;
  }

  public static bulkUpdateQrStatus(tableNumbers: string[], status: 'ACTIVE' | 'DISABLED'): number {
    let count = 0;
    db.tables.forEach((t) => {
      if (tableNumbers.includes(t.tableNumber) || tableNumbers.includes(t.id)) {
        t.qrStatus = status;
        count++;
      }
    });
    AuditRepository.log({
      action: 'QR_BULK_STATUS_UPDATE',
      category: 'BUSINESS',
      details: `Updated QR status to ${status} for ${count} tables`,
      username: 'Manager'
    });
    db.notify();
    return count;
  }

  public static verifyQrToken(
    tableNumber: string,
    token?: string
  ): { isValid: boolean; reason?: string; table?: DiningTable } {
    // 1. Verify Plan Entitlement (Requires ₹7,000 PRO plan allotted by Super Admin)
    const license = db.license;
    const isPro = license?.tier === 'PRO' && license?.entitlements?.qrTableOrdering !== false;
    if (!isPro) {
      return {
        isValid: false,
        reason: 'QR Table Ordering is not allotted to this restaurant. Restaurant must be on JAMANVAAR PRO (₹7,000) plan.'
      };
    }

    const table = db.tables.find((t) => t.tableNumber === tableNumber || t.id === tableNumber);
    if (!table) {
      return { isValid: false, reason: `Table ${tableNumber} was not found in restaurant layout.` };
    }

    if (table.qrStatus === 'DISABLED') {
      return { isValid: false, reason: `QR Ordering for Table ${tableNumber} is currently disabled by restaurant management.` };
    }

    const settings = this.getSettings();
    if (settings.isQrOrderingActive === false || settings.allowCustomerOrdering === false) {
      return { isValid: false, reason: 'Digital QR Table Ordering is currently paused across this restaurant.' };
    }

    if (!table.qrToken) {
      table.qrToken = `jv_qr_tbl_${table.tableNumber}_${generateSecureQrTokenSuffix()}`;
    }

    // SEC-010 fix: exact match against the table's actual (random, unguessable)
    // token, not a substring/prefix check — the old `.includes('tbl_N')` check
    // passed for ANY string containing that substring, since the token format
    // itself was fully derivable from public restaurant/branch/table IDs.
    // A caller that omits `token` entirely (internal/staff-side status checks
    // that don't route through a customer's scanned link) is unaffected —
    // only an explicitly-supplied, wrong token is rejected here.
    if (token !== undefined && token !== table.qrToken) {
      return { isValid: false, reason: 'Security verification failed: QR token does not match this table.' };
    }

    return { isValid: true, table };
  }

  public static getQrOrders(options?: { status?: string; tableNumber?: string; limit?: number }): Order[] {
    let list = db.orders.filter((o) => o.source_type === 'QR_TABLE' || o.orderType === 'QR_TABLE');

    if (options?.status && options.status !== 'ALL') {
      list = list.filter((o) => o.orderStatus === options.status);
    }
    if (options?.tableNumber && options.tableNumber !== 'ALL') {
      list = list.filter((o) => o.tableNumber === options.tableNumber);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  public static getStationRouting(items: import('@jamanvaar/types').OrderItem[]): {
    stationBreakdown: Record<string, number>;
    summaryText: string;
  } {
    const breakdown: Record<string, number> = {
      Tandoor: 0,
      'Curry Station': 0,
      'Biryani Station': 0,
      Beverages: 0,
      'Dessert Station': 0
    };

    items.forEach((it) => {
      const name = it.name.toLowerCase();
      if (name.includes('tikka') || name.includes('naan') || name.includes('roti') || name.includes('kebab')) {
        breakdown['Tandoor'] = (breakdown['Tandoor'] || 0) + it.quantity;
      } else if (name.includes('dal') || name.includes('thali') || name.includes('paneer') || name.includes('curry')) {
        breakdown['Curry Station'] = (breakdown['Curry Station'] || 0) + it.quantity;
      } else if (name.includes('biryani') || name.includes('rice')) {
        breakdown['Biryani Station'] = (breakdown['Biryani Station'] || 0) + it.quantity;
      } else if (name.includes('coffee') || name.includes('shake') || name.includes('soda') || name.includes('chhas')) {
        breakdown['Beverages'] = (breakdown['Beverages'] || 0) + it.quantity;
      } else if (name.includes('gulab') || name.includes('jamun') || name.includes('sweet') || name.includes('ice cream')) {
        breakdown['Dessert Station'] = (breakdown['Dessert Station'] || 0) + it.quantity;
      } else {
        breakdown['Tandoor'] = (breakdown['Tandoor'] || 0) + it.quantity;
      }
    });

    const activeStations = Object.entries(breakdown).filter(([, count]) => count > 0);
    const summaryText = activeStations.map(([st, c]) => `${st}: ${c} ${c === 1 ? 'item' : 'items'}`).join(' • ');

    return {
      stationBreakdown: breakdown,
      summaryText: summaryText || `${items.length} items routed`
    };
  }

  public static createCustomerQrOrder(params: {
    tableNumber: string;
    /** SEC-010 fix: previously accepted but never actually forwarded to verifyQrToken — an
     *  order could be placed for any table number with no token at all. Now required whenever
     *  the caller has one (the guest ordering page always does, extracted from its scanned URL). */
    token?: string;
    items: Array<{
      menuItemId: string;
      quantity: number;
      selectedModifiers?: import('@jamanvaar/types').SelectedModifier[];
      specialInstructions?: string;
    }>;
    customerNotes?: string;
    customerName?: string;
    customerPhone?: string;
    paymentMethod?: import('@jamanvaar/types').PaymentMethod;
  }): Order {
    // 1. Validate Table + QR token
    const tableVerification = this.verifyQrToken(params.tableNumber, params.token);
    if (!tableVerification.isValid) {
      throw new Error(tableVerification.reason || 'This table QR is currently unavailable.');
    }

    const table = tableVerification.table || db.tables.find((t) => t.tableNumber === params.tableNumber) || {
      id: `tbl-${params.tableNumber}`,
      tableNumber: params.tableNumber,
      zone: 'Main Hall'
    };

    // 2. Validate Items & Availability
    if (!params.items || params.items.length === 0) {
      throw new Error('Your cart is empty. Please select at least one dish.');
    }

    params.items.forEach((it) => {
      const menuItem = db.menuItems.find((m) => m.id === it.menuItemId);
      if (!menuItem) {
        throw new Error(`Item ${it.menuItemId} is not on the active restaurant menu.`);
      }
      if (menuItem.isAvailable === false) {
        throw new Error(`Dish "${menuItem.name}" is currently sold out. Please remove it from your cart.`);
      }
      if (it.quantity <= 0) {
        throw new Error(`Invalid quantity for dish "${menuItem.name}".`);
      }
    });

    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    const now = new Date();
    const qrNum = 1040 + db.orders.filter((o) => o.source_type === 'QR_TABLE').length + 1;
    const orderNumber = `QR-${qrNum}`;
    const tokenNumber = `${qrNum}`;

    const orderItems: import('@jamanvaar/types').OrderItem[] = params.items.map((it, idx) => {
      const menuItem = db.menuItems.find((m) => m.id === it.menuItemId)!;

      // Authoritative modifier lookup & price validation (SEC-004 fix). A modifier
      // that doesn't resolve to a real, currently-configured group/option is
      // rejected outright — it used to fall back to Math.max(0, client-sent delta),
      // which floored a NEGATIVE fabricated value to 0 but still silently accepted
      // an entirely made-up modifier (and its positive fabricated price) as real.
      const validatedModifiers = (it.selectedModifiers || []).map((m) => {
        const grp = db.modifierGroups.find((g) => g.id === m.groupId);
        const opt = grp?.options.find((o) => o.id === m.optionId || o.name === m.optionName);
        if (!opt || typeof opt.priceDelta !== 'number') {
          throw new Error(
            `"${m.optionName || m.optionId}" is not a valid modifier for "${menuItem.name}". Please refresh the menu and try again.`
          );
        }
        return {
          ...m,
          priceDelta: opt.priceDelta
        };
      });

      const modDelta = validatedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
      const unitPrice = Math.max(menuItem.price, menuItem.price + modDelta);
      const totalPrice = unitPrice * it.quantity;

      return {
        id: `oi-qr-${qrNum}-${idx + 1}`,
        orderId: `ord-qr-${qrNum}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        sku: menuItem.sku || 'SKU',
        quantity: it.quantity,
        unitPrice,
        modifiers: validatedModifiers,
        specialInstructions: it.specialInstructions,
        totalPrice,
        kitchenStatus: 'PENDING'
      };
    });

    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const cgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const sgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const taxAmount = cgstAmount + sgstAmount;
    const totalAmount = Math.round(subtotal + taxAmount);
    const routing = this.getStationRouting(orderItems);

    const newOrder: Order = {
      id: `ord-qr-${qrNum}`,
      orderNumber,
      tokenNumber,
      businessDayId: activeDay.id,
      restaurantId: db.restaurant.id,
      outletId: db.outlet.id,
      kioskId: `QR-TABLE-${params.tableNumber.padStart(3, '0')}`,
      sessionId: `sess-qr-${orderNumber}`,
      idempotencyKey: `idemp_qr_${orderNumber}_${Date.now()}`,
      orderType: 'QR_TABLE',
      source_type: 'QR_TABLE',
      tableId: table.id,
      tableNumber: params.tableNumber,
      guestCount: 2,
      customerName: params.customerName || `Guest (Table ${params.tableNumber})`,
      customerPhone: params.customerPhone || '',
      customerNotes: params.customerNotes,
      items: orderItems,
      subtotal,
      discountAmount: 0,
      cgstAmount,
      sgstAmount,
      taxAmount,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount,
      paymentMethod: params.paymentMethod || 'UPI',
      // SEC-003 fix: All self-order QR table orders require POS cashier counter confirmation or verified gateway callback
      paymentStatus: 'PENDING',
      orderStatus: 'NEW',
      estimatedWaitMinutes: 15,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      kitchenRouting: routing,
      timeline: [
        {
          status: 'NEW',
          title: 'QR Order Placed',
          timestamp: now.toISOString(),
          note: `Customer placed self-order via QR code at Table ${params.tableNumber} (Payment: ${params.paymentMethod || 'UPI'} - PENDING verification)`
        }
      ],
      isSynced: true
    };

    db.orders.unshift(newOrder);

    // 3. Automatically dispatch KOT to Kitchen / KDS
    const kotItems: import('@jamanvaar/types').KOTItem[] = orderItems.map((oi) => {
      const m = db.menuItems.find((menu) => menu.id === oi.menuItemId);
      return {
        id: `kot-item-${oi.id}`,
        menuItemId: oi.menuItemId,
        name: oi.name,
        quantity: oi.quantity,
        modifiers: oi.modifiers,
        specialInstructions: oi.specialInstructions,
        kitchenStation: m?.kitchenStation || 'Main Kitchen',
        status: 'PREPARING'
      };
    });

    KOTRepository.generateKOT({
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      tokenNumber: newOrder.tokenNumber,
      tableNumber: params.tableNumber,
      orderType: 'QR_TABLE',
      items: kotItems,
      cashierName: 'Guest (Table QR Self-Order)'
    });

    // 4. Update table status to OCCUPIED and record order stats
    const tblObj = db.tables.find((t) => t.tableNumber === params.tableNumber);
    if (tblObj) {
      tblObj.status = 'OCCUPIED';
      tblObj.currentOrderId = newOrder.id;
      tblObj.lastOrderId = newOrder.id;
      tblObj.lastOrderTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      tblObj.totalOrdersToday = (tblObj.totalOrdersToday || 0) + 1;
      tblObj.totalRevenueToday = (tblObj.totalRevenueToday || 0) + newOrder.totalAmount;
    }

    // 5. Create system notification for POS cashier and kitchen
    NotificationRepository.createNotification({
      type: 'QR_ORDER_ARRIVED' as any,
      title: `🔔 New QR Order Table ${params.tableNumber}`,
      message: `${newOrder.orderNumber} • ${orderItems.length} items (${orderItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')}) • ₹${totalAmount}`,
      priority: 'HIGH',
      targetRoles: ['POS', 'POS_ADMIN', 'ALL'],
      tableNumber: params.tableNumber,
      meta: {
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        tokenNumber: newOrder.tokenNumber,
        totalAmount: newOrder.totalAmount
      }
    });

    AuditRepository.log({
      action: 'ORDER_CREATE',
      category: 'BUSINESS',
      details: `New QR Table Order #${newOrder.orderNumber} created for Table ${params.tableNumber} (Total: ₹${totalAmount})`,
      username: `Customer (Table ${params.tableNumber})`
    });

    db.notify();
    return newOrder;
  }

  public static updateOrderStatus(
    orderId: string,
    nextStatus: import('@jamanvaar/types').OrderStatus,
    actor: string = 'POS Cashier',
    note?: string
  ): Order | null {
    const order = db.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) return null;

    order.orderStatus = nextStatus;
    order.updatedAt = new Date().toISOString();

    const stageTitles: Record<string, string> = {
      ACCEPTED: 'Order Accepted by POS',
      PREPARING: 'Sent to Kitchen (KOT Dispatch)',
      READY: 'Order Prepared & Ready',
      SERVED: 'Served at Table',
      COMPLETED: 'Order Completed & Billed',
      CANCELLED: 'Order Cancelled'
    };

    const title = stageTitles[nextStatus] || `Status updated to ${nextStatus}`;

    if (!order.timeline) {
      order.timeline = [];
    }

    order.timeline.push({
      status: nextStatus,
      title,
      timestamp: new Date().toISOString(),
      actor,
      note: note || (nextStatus === 'PREPARING' ? 'Dispatched to Kitchen KOT' : undefined)
    });

    // If served/completed, check table status
    if (nextStatus === 'COMPLETED') {
      order.paymentStatus = 'SUCCESS';
      const tbl = db.tables.find((t) => t.tableNumber === order.tableNumber);
      if (tbl && tbl.currentOrderId === order.id) {
        tbl.status = 'AVAILABLE';
        tbl.currentOrderId = undefined;
      }
    }

    AuditRepository.log({
      action: 'ORDER_UPDATE',
      category: 'BUSINESS',
      details: `Updated QR Order #${order.orderNumber} status to ${nextStatus}`,
      username: actor
    });

    db.notify();
    return order;
  }

  public static getQrStats(datePreset: string = 'TODAY'): {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    activeTablesCount: number;
    pendingCount: number;
    completedCount: number;
    topDish: string;
    topTable: string;
    tableBreakdown: Array<{
      tableNumber: string;
      zone: string;
      orderCount: number;
      revenue: number;
      lastOrder: string;
    }>;
  } {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    const qrOrders = db.orders.filter((o) => o.source_type === 'QR_TABLE' || o.orderType === 'QR_TABLE');

    let scopedOrders = qrOrders;
    if (datePreset === 'TODAY') {
      scopedOrders = qrOrders.filter((o) => o.businessDayId === activeDay.id || new Date(o.createdAt).toDateString() === new Date().toDateString());
    } else if (datePreset === 'YESTERDAY') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      scopedOrders = qrOrders.filter((o) => new Date(o.createdAt).toDateString() === yesterday.toDateString());
    }

    const totalOrders = scopedOrders.length;
    const totalRevenue = scopedOrders
      .filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED')
      .reduce((s, o) => s + o.totalAmount, 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const pendingCount = scopedOrders.filter((o) => o.orderStatus === 'NEW' || o.orderStatus === 'ACCEPTED' || o.orderStatus === 'PREPARING').length;
    const completedCount = scopedOrders.filter((o) => o.orderStatus === 'COMPLETED' || o.orderStatus === 'SERVED').length;

    // Table breakdown
    const tableMap: Record<string, { count: number; revenue: number; zone: string; lastOrder: string }> = {};
    db.tables.forEach((t) => {
      tableMap[t.tableNumber] = {
        count: 0,
        revenue: 0,
        zone: t.zone,
        lastOrder: t.lastOrderTime || '12:00 PM'
      };
    });

    scopedOrders.forEach((o) => {
      const tblNum = o.tableNumber || '1';
      if (!tableMap[tblNum]) {
        tableMap[tblNum] = { count: 0, revenue: 0, zone: 'Main Hall', lastOrder: 'Just now' };
      }
      tableMap[tblNum].count += 1;
      if (o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED') {
        tableMap[tblNum].revenue += o.totalAmount;
      }
      tableMap[tblNum].lastOrder = new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const tableBreakdown = Object.entries(tableMap).map(([tblNum, data]) => ({
      tableNumber: tblNum,
      zone: data.zone,
      orderCount: data.count,
      revenue: data.revenue,
      lastOrder: data.lastOrder
    }));

    // Find top table
    const sortedTables = [...tableBreakdown].sort((a, b) => b.revenue - a.revenue);
    const topTable = sortedTables.length > 0 && sortedTables[0].revenue > 0 ? `Table ${sortedTables[0].tableNumber} (${sortedTables[0].zone})` : 'Table 12';

    // Find top dish
    const dishCounts: Record<string, number> = {};
    scopedOrders.forEach((o) => {
      o.items.forEach((it) => {
        dishCounts[it.name] = (dishCounts[it.name] || 0) + it.quantity;
      });
    });

    const topDishEntry = Object.entries(dishCounts).sort((a, b) => b[1] - a[1])[0];
    const topDish = topDishEntry ? `${topDishEntry[0]} (${topDishEntry[1]} ordered)` : 'Paneer Tikka (Tandoori)';

    const activeTablesCount = db.tables.filter((t) => t.qrStatus === 'ACTIVE').length;

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      activeTablesCount,
      pendingCount,
      completedCount,
      topDish,
      topTable,
      tableBreakdown
    };
  }
}





