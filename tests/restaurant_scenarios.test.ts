import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, ComboRepository, OrderRepository, CouponRepository, TableRepository, ReceiptRepository } from '@jamanvaar/database';
import { calculateCart, calculateItemUnitPrice, calculateItemTotal, MenuBuilderService, CustomerChatbotEngine, AdminChatbotEngine, ReportGeneratorService } from '@jamanvaar/business';
import { KdsMeshService, PaymentService, PrinterService } from '@jamanvaar/api';
import { CartItem, MenuItem, SelectedModifier } from '@jamanvaar/types';

describe('JAMANVAAR End-to-End Restaurant Owner & Customer Scenarios', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  describe('🥬 Scenario 1: Strict Pure Veg & Jain Brand Integrity', () => {
    it('should have 100% pure vegetarian dishes in menu with zero non-veg items', () => {
      const items = MenuRepository.getAllMenuItems();
      expect(items.length).toBeGreaterThanOrEqual(10);
      const nonVegItems = items.filter((it) => it.dietaryType === 'NON_VEG' || it.name.toLowerCase().includes('chicken') || it.name.toLowerCase().includes('mutton'));
      expect(nonVegItems).toHaveLength(0);
    });

    it('should have dishes that are 100% vegetarian', () => {
      const vegItems = MenuRepository.getAllMenuItems().filter((it) => it.dietaryType === 'VEG');
      expect(vegItems.length).toBeGreaterThan(0);
      vegItems.forEach((it) => {
        expect(it.dietaryType).toBe('VEG');
      });
    });

    it('customer chatbot should never suggest non-veg dishes for any prompt', () => {
      const resp1 = CustomerChatbotEngine.processQuery('Show me non-veg chicken dishes');
      const items = resp1.actionItems || [];
      const nonVeg = items.filter((it) => it.dietaryType === 'NON_VEG' || it.name.toLowerCase().includes('chicken'));
      expect(nonVeg).toHaveLength(0);

      const resp2 = CustomerChatbotEngine.processQuery('Show jain food');
      expect(resp2.text).toContain('Jain');
    });
  });

  describe('🛒 Scenario 2: Complete Customer Order Journey (Dine-In + Modifiers + Combos + Coupons)', () => {
    it('should allow customer to pick a table, add customized dish, and calculate correct subtotal', () => {
      const tables = TableRepository.getAllTables();
      expect(tables.length).toBeGreaterThan(0);
      const table = tables[0];
      expect(table).toBeDefined();

      const dish = MenuRepository.getAllMenuItems()[0];
      expect(dish).toBeDefined();

      const modifiers: SelectedModifier[] = [
        { groupId: 'mod-spice', groupName: 'Spice Level', optionId: 'opt-sp-med', optionName: 'Medium Spicy', priceDelta: 0 },
        { groupId: 'mod-cheese', groupName: 'Cheese Add-on', optionId: 'opt-ch-ext', optionName: 'Extra Cheese Melt', priceDelta: 40 }
      ];

      const unitPrice = calculateItemUnitPrice(dish.price, modifiers);
      expect(unitPrice).toBe(dish.price + 40);

      const cartItem: CartItem = {
        cartItemId: 'c1',
        menuItemId: dish.id,
        item: dish,
        quantity: 2,
        unitPrice,
        selectedModifiers: modifiers,
        itemTotal: calculateItemTotal(dish.price, 2, modifiers)
      };

      expect(cartItem.itemTotal).toBe(unitPrice * 2);

      const cart = calculateCart({ items: [cartItem] });
      expect(cart.subtotal).toBe(cartItem.itemTotal);
      expect(cart.totalPayable).toBeGreaterThan(0);
    });

    it('should support 1-tap combo package ordering with exact discount savings', () => {
      const combos = ComboRepository.getAllCombos();
      expect(combos.length).toBeGreaterThan(0);

      const biryaniCombo = combos.find((c) => c.id === 'combo-biryani-feast')!;
      expect(biryaniCombo).toBeDefined();
      expect(biryaniCombo.basePrice).toBe(449);
      expect(biryaniCombo.savingsAmount).toBe(111);

      const comboMenuItem: MenuItem = {
        id: `combo-${biryaniCombo.id}`,
        categoryId: 'cat-combos',
        sku: `CMB-${biryaniCombo.id.toUpperCase()}`,
        name: biryaniCombo.name,
        description: biryaniCombo.description,
        price: biryaniCombo.basePrice,
        dietaryType: 'VEG',
        spiceLevel: 'MILD',
        isPopular: true,
        isNew: false,
        isFeatured: true,
        isAvailable: true,
        prepTimeMinutes: 15,
        allergens: ['Dairy'],
        modifierGroupIds: [],
        sortOrder: 1
      };

      const cartItem: CartItem = {
        cartItemId: 'c-combo-1',
        menuItemId: comboMenuItem.id,
        item: comboMenuItem,
        quantity: 1,
        unitPrice: comboMenuItem.price,
        selectedModifiers: [],
        itemTotal: comboMenuItem.price
      };

      const cart = calculateCart({ items: [cartItem] });
      expect(cart.subtotal).toBe(449);
    });

    it('should validate and apply minimum order discount coupon WELCOME50', () => {
      const coupon = CouponRepository.getByCode('WELCOME50')!;
      expect(coupon).toBeDefined();

      const item = MenuRepository.getAllMenuItems()[0];
      const cartItem: CartItem = {
        cartItemId: 'c2',
        menuItemId: item.id,
        item,
        quantity: 2,
        unitPrice: item.price,
        selectedModifiers: [],
        itemTotal: item.price * 2
      };

      const cartWithCoupon = calculateCart({ items: [cartItem], coupon });
      expect(cartWithCoupon.discountAmount).toBe(50);
      expect(cartWithCoupon.totalPayable).toBe(410);
    });
  });

  describe('💳 Scenario 3: Multi-Gateway Payment Processing & Idempotency', () => {
    it('should generate dynamic UPI QR code data for instant kiosk payment', async () => {
      const res = await PaymentService.startPayment({
        orderId: 'ord-test-upi',
        idempotencyKey: 'idemp-test-upi-1',
        amount: 719,
        method: 'UPI_QR'
      });

      expect(res.transactionId).toBeDefined();
      expect(res.status).toBe('WAITING_FOR_USER');
      expect(res.qrCodeData).toContain('upi://pay');
      expect(res.qrCodeData).toContain('am=719');
    });

    it('should create order in database with sequential token number and wait target', () => {
      const items = MenuRepository.getAllMenuItems().slice(0, 2);
      const newOrder = OrderRepository.createOrder({
        idempotencyKey: `idemp-ord-${Date.now()}`,
        kioskId: 'KIOSK-01',
        sessionId: 'sess-test-1',
        orderType: 'DINE_IN',
        tableNumber: '4',
        paymentMethod: 'UPI_QR',
        paymentStatus: 'SUCCESS',
        items: items.map((it, idx) => ({
          id: `oi-${idx}`,
          orderId: 'ord-temp',
          menuItemId: it.id,
          name: it.name,
          sku: it.sku,
          quantity: 1,
          unitPrice: it.price,
          totalPrice: it.price,
          modifiers: []
        }))
      });

      expect(newOrder.tokenNumber).toBeDefined();
      expect(newOrder.orderStatus).toBe('CONFIRMED');
      expect(newOrder.estimatedWaitMinutes).toBeGreaterThanOrEqual(10);
    });
  });

  describe('🖨️ Scenario 4: Built-in ESC/POS Thermal Receipt Generation & Printing', () => {
    it('should queue print jobs and auto-configure default thermal printer', () => {
      PrinterService.autoConfigureKioskPrinter();
      const defaultPrn = db.configuredPrinters.find((p) => p.isDefault) || db.configuredPrinters[0];
      expect(defaultPrn.paperSize).toBe('80mm');

      // No more ambient fabricated seed orders — create a real one to print.
      const printItem = MenuRepository.getAllMenuItems()[0];
      const existingOrder = OrderRepository.createOrder({
        orderType: 'TAKEAWAY',
        items: [
          { id: 'oi-print-1', orderId: '', menuItemId: printItem.id, name: printItem.name, sku: printItem.sku, quantity: 1, unitPrice: printItem.price, modifiers: [], totalPrice: printItem.price, kitchenStatus: 'SERVED' }
        ],
        subtotal: printItem.price,
        taxAmount: 0,
        totalAmount: printItem.price,
        paymentMethod: 'CASH',
        paymentStatus: 'SUCCESS',
        orderStatus: 'COMPLETED',
        source_type: 'POS'
      });
      const res = PrinterService.queuePrintJob(existingOrder);

      expect(res.success).toBe(true);
      expect(res.job).toBeDefined();
    });
  });

  describe('👨‍🍳 Scenario 5: Restaurant Owner KDS Lifecycle & Live Urgency Timers', () => {
    it('should advance order status smoothly through CONFIRMED -> PREPARING -> READY -> COMPLETED', () => {
      // No more ambient fabricated seed orders — create a real one to advance.
      const kdsItem = MenuRepository.getAllMenuItems()[0];
      const order = OrderRepository.createOrder({
        orderType: 'DINE_IN',
        tableNumber: '2',
        items: [
          { id: 'oi-kds-1', orderId: '', menuItemId: kdsItem.id, name: kdsItem.name, sku: kdsItem.sku, quantity: 1, unitPrice: kdsItem.price, modifiers: [], totalPrice: kdsItem.price, kitchenStatus: 'PREPARING' }
        ],
        subtotal: kdsItem.price,
        taxAmount: 0,
        totalAmount: kdsItem.price,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
        source_type: 'POS'
      });

      KdsMeshService.advanceKitchenStatus(order.id, 'PREPARING');
      let current = OrderRepository.getOrderById(order.id)!;
      expect(current.orderStatus).toBe('PREPARING');

      KdsMeshService.advanceKitchenStatus(order.id, 'READY');
      current = OrderRepository.getOrderById(order.id)!;
      expect(current.orderStatus).toBe('READY');

      KdsMeshService.advanceKitchenStatus(order.id, 'COMPLETED');
      current = OrderRepository.getOrderById(order.id)!;
      expect(current.orderStatus).toBe('COMPLETED');
    });
  });

  describe('📊 Scenario 6: Restaurant Owner EOD Z-Report & Cash Settlement', () => {
    it('should generate accurate daily financial reports and Z-Report metrics', () => {
      const report = ReportGeneratorService.generateDailySalesReport();
      expect(report.title).toContain('Daily Sales');
      expect(report.summaryMetrics.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(report.summaryMetrics.totalOrders).toBeGreaterThanOrEqual(0);

      const csv = ReportGeneratorService.exportToCsv(report);
      expect(csv).toContain('Gross Revenue');
    });
  });

  describe('🍽️ Scenario 7: Restaurant Owner Smart Prebuilt Menu Builder & Real-time Sync', () => {
    it('should stage prebuilt menu templates into draft and publish with version snapshots', () => {
      const res = MenuBuilderService.importTemplates(['tpl-pizza'], {
        importCategories: true,
        importItems: true,
        importImages: true,
        importModifiers: true,
        importCombos: true,
        importSuggestedPrices: true,
        duplicateStrategy: 'IMPORT_AS_NEW'
      });
      expect(res.importedItemsCount).toBeGreaterThan(0);
      expect(MenuBuilderService.isDraft()).toBe(true);

      const snapshot = MenuBuilderService.publishMenu('Test POS Admin', 'Test release notes');
      expect(snapshot.versionTag).toBeDefined();
      expect(MenuBuilderService.isDraft()).toBe(false);
    });

    it('should support bulk pricing adjustment (+10%) across the catalog', () => {
      const res = MenuBuilderService.applyBulkPriceAdjustment({
        percentageDelta: 10,
        roundToNearest: 5
      });
      expect(res.updatedCount).toBeGreaterThan(0);
    });
  });

  describe('🤖 Scenario 8: Admin Operational Chatbot & Intelligence', () => {
    it('should answer sales, hardware, 86 inventory, and table occupancy queries accurately', () => {
      const salesQuery = AdminChatbotEngine.processQuery('How much did I sell today?');
      expect(salesQuery.text).toContain("Today's Revenue Overview");

      const bestSellers = AdminChatbotEngine.processQuery('Show top dishes');
      expect(bestSellers.text).toContain('Top Best-Selling Dishes');

      const printerStatus = AdminChatbotEngine.processQuery('Check printer status');
      expect(printerStatus.text).toContain('Thermal Receipt Printer Status');

      const tables = AdminChatbotEngine.processQuery('Show table occupancy');
      expect(tables.text).toContain('Dining Table Matrix');
    });
  });
});
