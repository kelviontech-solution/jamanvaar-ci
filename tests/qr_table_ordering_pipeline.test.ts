import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  QrOrderingRepository,
  KOTRepository,
  OrderRepository,
  TableRepository,
  MenuRepository,
  LicenseRepository
} from '@jamanvaar/database';
import { EntitlementService, PLAN_DEFINITIONS } from '@jamanvaar/business';
import { generateQrSvg, generateQrMatrix, generateQrDataUrl } from '@jamanvaar/utils';

describe('JAMANVAAR QR Table Ordering System End-to-End Pipeline', () => {
  beforeEach(() => {
    // Ensure restaurant is on PRO plan by default for standard ordering pipeline
    LicenseRepository.activatePlan('PRO');

    // Reset or ensure active tables and dishes exist
    const tbl12 = db.tables.find((t) => t.tableNumber === '12');
    if (tbl12) {
      tbl12.qrStatus = 'ACTIVE';
      tbl12.status = 'AVAILABLE';
      tbl12.currentOrderId = undefined;
    }
  });

  describe('1. Pure TypeScript Scannable QR Code Generator', () => {
    it('should generate a valid QR code matrix and SVG string without errors', () => {
      const testUrl = 'http://localhost:5176/?qrTable=12&token=jv_qr_rest-main_out-main_tbl_12';
      const matrix = generateQrMatrix(testUrl);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThan(20);
      expect(matrix[0].length).toBe(matrix.length);

      const svg = generateQrSvg(testUrl, { size: 240, margin: 3 });
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0');
      expect(svg).toContain('</svg>');

      const dataUrl = generateQrDataUrl(testUrl);
      expect(dataUrl).toContain('data:image/svg+xml;charset=utf-8,');
    });
  });

  describe('2. Table QR Identity & Random, Unguessable Tokens (SEC-010)', () => {
    it('generates a high-entropy random token, not one derivable from restaurant/branch/table IDs', () => {
      const res = QrOrderingRepository.generateTableQr('12', 'rest-test', 'branch-test');

      expect(res.tableNumber).toBe('12');
      expect(res.qrShortCode).toBe('QR-TABLE-012');
      expect(res.fullUrl).toContain('qrTable=12');
      expect(res.fullUrl).toContain(`token=${res.qrToken}`);

      // The token must NOT be the old deterministic, guessable format —
      // restaurantId/branchId must not be embedded in it at all.
      expect(res.qrToken).not.toContain('rest-test');
      expect(res.qrToken).not.toContain('branch-test');
      // 18 random bytes -> 36 hex chars of real entropy in the suffix.
      expect(res.qrToken).toMatch(/^jv_qr_tbl_12_[0-9a-f]{36}$/);

      const tbl = db.tables.find((t) => t.tableNumber === '12');
      expect(tbl?.qrToken).toBe(res.qrToken);
      expect(tbl?.qrStatus).toBe('ACTIVE');
    });

    it('generates a different, unpredictable token every time (not a counter or fixed salt)', () => {
      const res1 = QrOrderingRepository.generateTableQr('12');
      const res2 = QrOrderingRepository.regenerateTableQr('12');
      const res3 = QrOrderingRepository.regenerateTableQr('12');

      expect(res2.qrToken).not.toBe(res1.qrToken);
      expect(res3.qrToken).not.toBe(res2.qrToken);
      expect(res2.qrToken).toContain('tbl_12');
    });

    it('should bulk generate and bulk update QR status for multiple tables', () => {
      const count = QrOrderingRepository.bulkGenerateQr(['1', '2', '3']);
      expect(count).toBe(3);

      QrOrderingRepository.bulkUpdateQrStatus(['1', '2'], 'DISABLED');
      const t1 = db.tables.find((t) => t.tableNumber === '1');
      const t2 = db.tables.find((t) => t.tableNumber === '2');
      expect(t1?.qrStatus).toBe('DISABLED');
      expect(t2?.qrStatus).toBe('DISABLED');

      // Re-enable
      QrOrderingRepository.bulkUpdateQrStatus(['1', '2'], 'ACTIVE');
      expect(t1?.qrStatus).toBe('ACTIVE');
    });
  });

  describe('3. Token Verification & Security Guardrails', () => {
    it('should verify a valid QR table and token', () => {
      const res = QrOrderingRepository.generateTableQr('12');
      const check = QrOrderingRepository.verifyQrToken('12', res.qrToken);

      expect(check.isValid).toBe(true);
      expect(check.table).toBeDefined();
      expect(check.table?.tableNumber).toBe('12');
    });

    it('should reject verification if table QR is disabled', () => {
      QrOrderingRepository.bulkUpdateQrStatus(['12'], 'DISABLED');
      const check = QrOrderingRepository.verifyQrToken('12');

      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('disabled');

      // Restore
      QrOrderingRepository.bulkUpdateQrStatus(['12'], 'ACTIVE');
    });

    it('should reject verification if QR token belongs to another table', () => {
      QrOrderingRepository.generateTableQr('12');
      const check = QrOrderingRepository.verifyQrToken('12', 'jv_qr_tbl_99_deadbeef');

      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('Security verification failed');
    });

    it('SEC-010: rejects a guessed token built from the old deterministic pattern (public IDs only)', () => {
      QrOrderingRepository.generateTableQr('12');
      const guessedOldStyleToken = `jv_qr_${db.restaurant?.id || 'rest-main'}_${db.outlet?.id || 'br-main'}_tbl_12`;
      const check = QrOrderingRepository.verifyQrToken('12', guessedOldStyleToken);

      expect(check.isValid).toBe(false);
    });

    it('SEC-010: createCustomerQrOrder rejects an order placed with a wrong/forged token', () => {
      QrOrderingRepository.generateTableQr('12');
      const dish = db.menuItems[0];
      dish.isAvailable = true;

      expect(() =>
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          token: 'jv_qr_tbl_12_0000000000000000000000000000000000',
          items: [{ menuItemId: dish.id, quantity: 1 }]
        })
      ).toThrow(/Security verification failed/);
    });

    it('SEC-010: createCustomerQrOrder succeeds when given the real, currently-issued token', () => {
      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = db.menuItems[0];
      dish.isAvailable = true;

      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        token: qrToken,
        items: [{ menuItemId: dish.id, quantity: 1 }]
      });

      expect(order).toBeDefined();
      expect(order.tableNumber).toBe('12');
    });
  });

  describe('4. End-to-End Guest Ordering to POS and KDS Pipeline', () => {
    it('should place order, create in db.orders, generate KOT in db.kots, and update table status', () => {
      const dishes = db.menuItems.slice(0, 2);
      expect(dishes.length).toBeGreaterThanOrEqual(2);

      const initialOrderCount = db.orders.length;
      const initialKotCount = db.kots.length;

      // Guest places order
      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        customerName: 'Aarav Patel',
        customerPhone: '9876543210',
        paymentMethod: 'UPI',
        items: [
          {
            menuItemId: dishes[0].id,
            quantity: 2,
            specialInstructions: 'Extra spicy'
          },
          {
            menuItemId: dishes[1].id,
            quantity: 1,
            selectedModifiers: [
              {
                groupId: 'mod-addons',
                groupName: 'Add-ons',
                optionId: 'opt-cheese',
                optionName: 'Extra Amul Cheese',
                priceDelta: 40
              }
            ]
          }
        ]
      });

      // 1. Check order in db.orders
      expect(db.orders.length).toBe(initialOrderCount + 1);
      expect(order.orderNumber).toContain('QR-');
      expect(order.orderType).toBe('QR_TABLE');
      expect(order.source_type).toBe('QR_TABLE');
      expect(order.tableNumber).toBe('12');
      expect(order.customerName).toContain('Aarav Patel');
      expect(order.items.length).toBe(2);
      expect(order.totalAmount).toBeGreaterThan(0);

      // 2. Check automatic KOT ticket generation in db.kots
      expect(db.kots.length).toBeGreaterThan(initialKotCount);
      const generatedKots = db.kots.filter((k) => k.orderId === order.id);
      expect(generatedKots.length).toBeGreaterThanOrEqual(1);
      expect(generatedKots[0].tableNumber).toBe('12');
      expect(generatedKots[0].items.length).toBeGreaterThan(0);

      // 3. Check table occupancy updated
      const tbl = db.tables.find((t) => t.tableNumber === '12');
      expect(tbl?.status).toBe('OCCUPIED');
      expect(tbl?.currentOrderId).toBe(order.id);

      // 4. POS Cashier advances order status: PREPARING -> READY -> SERVED -> COMPLETED
      const prepOrder = QrOrderingRepository.updateOrderStatus(order.id, 'PREPARING', 'POS Cashier');
      expect(prepOrder?.orderStatus).toBe('PREPARING');

      const readyOrder = QrOrderingRepository.updateOrderStatus(order.id, 'READY', 'POS Cashier');
      expect(readyOrder?.orderStatus).toBe('READY');

      const servedOrder = QrOrderingRepository.updateOrderStatus(order.id, 'SERVED', 'Server Rohan');
      expect(servedOrder?.orderStatus).toBe('SERVED');

      const completedOrder = QrOrderingRepository.updateOrderStatus(order.id, 'COMPLETED', 'POS Cashier');
      expect(completedOrder?.orderStatus).toBe('COMPLETED');
      expect(completedOrder?.paymentStatus).toBe('SUCCESS');

      // Table is released back to AVAILABLE once order completed
      expect(tbl?.status).toBe('AVAILABLE');
      expect(tbl?.currentOrderId).toBeUndefined();
    });

    it('should reject ordering if a dish is marked unavailable / sold out', () => {
      const dish = db.menuItems[0];
      const originalAvail = dish.isAvailable;

      // Mark sold out
      dish.isAvailable = false;

      expect(() => {
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          items: [{ menuItemId: dish.id, quantity: 1 }]
        });
      }).toThrow(/sold out/i);

      // Restore availability
      dish.isAvailable = originalAvail;
    });

    it('Milestone Test: Create Table 12 -> Generate QR -> Scan QR -> Order Royal Veg Handi -> Order appears in POS -> KDS receives KOT -> Restaurant accepts -> Guest sees "Preparing"', () => {
      // 1. Create or ensure Table 12
      let tbl12 = db.tables.find((t) => t.tableNumber === '12');
      if (!tbl12) {
        tbl12 = QrOrderingRepository.addTable({ tableNumber: '12', zone: 'Dining area', capacity: 4 });
      }
      expect(tbl12).toBeDefined();

      // 2. Generate QR
      const qrData = QrOrderingRepository.generateTableQr('12');
      expect(qrData.qrToken).toBeDefined();
      expect(qrData.tableNumber).toBe('12');

      // 3. Scan QR - verification
      const verifyResult = QrOrderingRepository.verifyQrToken('12', qrData.qrToken);
      expect(verifyResult.isValid).toBe(true);
      expect(verifyResult.table?.tableNumber).toBe('12');

      // 4. Ensure "Royal Veg Handi" (or main vegetarian curry dish) exists in canonical menu
      let handiDish = db.menuItems.find((m) => m.name.toLowerCase().includes('handi') || m.name.toLowerCase().includes('veg'));
      if (!handiDish) {
        handiDish = db.menuItems[0];
      }
      expect(handiDish).toBeDefined();
      handiDish.isAvailable = true;

      // 5. Order Royal Veg Handi from Table 12 with valid QR token
      const initialPosOrderCount = db.orders.length;
      const initialKdsKotCount = db.kots.length;

      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        token: qrData.qrToken,
        items: [
          {
            menuItemId: handiDish.id,
            quantity: 1,
            specialInstructions: 'Less oil, spicy'
          }
        ],
        customerName: 'Aarav (Table 12)',
        paymentMethod: 'UPI'
      });

      // 6. Order appears in shared order engine for POS
      expect(db.orders.length).toBe(initialPosOrderCount + 1);
      expect(order.source_type).toBe('QR_TABLE');
      expect(order.orderType).toBe('QR_TABLE');
      expect(order.tableNumber).toBe('12');
      expect(order.items[0].menuItemId).toBe(handiDish.id);
      expect(order.orderStatus).toBe('NEW');

      // 7. KDS receives KOT ticket for table 12
      expect(db.kots.length).toBeGreaterThan(initialKdsKotCount);
      const kotsForOrder = db.kots.filter((k) => k.orderId === order.id);
      expect(kotsForOrder.length).toBeGreaterThanOrEqual(1);
      expect(kotsForOrder[0].tableNumber).toBe('12');
      expect(kotsForOrder[0].items[0].name).toBe(handiDish.name);

      // 8. Restaurant accepts order -> updates status to PREPARING
      const acceptedOrder = QrOrderingRepository.updateOrderStatus(order.id, 'PREPARING', 'Kitchen Station Cook');
      expect(acceptedOrder?.orderStatus).toBe('PREPARING');

      // 9. Guest sees "Preparing"
      const guestCheckedOrder = db.orders.find((o) => o.id === order.id);
      expect(guestCheckedOrder?.orderStatus).toBe('PREPARING');

      // 10. Advance to READY -> SERVED -> COMPLETED
      const readyOrder = QrOrderingRepository.updateOrderStatus(order.id, 'READY', 'Kitchen Station Cook');
      expect(readyOrder?.orderStatus).toBe('READY');

      const servedOrder = QrOrderingRepository.updateOrderStatus(order.id, 'SERVED', 'Server Rohan');
      expect(servedOrder?.orderStatus).toBe('SERVED');

      const settledOrder = QrOrderingRepository.updateOrderStatus(order.id, 'COMPLETED', 'POS Cashier');
      expect(settledOrder?.orderStatus).toBe('COMPLETED');
      expect(settledOrder?.paymentStatus).toBe('SUCCESS');
    });
  });

  describe('5. Super Admin 7K Plan Allotment & Entitlement Guardrails', () => {
    it('should define QR ordering strictly as part of the ₹7,000 PRO plan, not ₹5,000 CORE plan', () => {
      expect(PLAN_DEFINITIONS.CORE.price).toBe(5000);
      expect(PLAN_DEFINITIONS.PRO.price).toBe(7000);

      const coreQr = PLAN_DEFINITIONS.CORE.features.find((f) => f.name.toLowerCase().includes('qr table ordering'));
      const proQr = PLAN_DEFINITIONS.PRO.features.find((f) => f.name.toLowerCase().includes('qr table ordering'));

      expect(coreQr?.included).toBe(false);
      expect(coreQr?.note).toContain('PRO (₹7,000)');

      expect(proQr?.included).toBe(true);
      expect(proQr?.name).toContain('Super Admin');
    });

    it('should reject verification and ordering when restaurant is on ₹5,000 CORE plan', () => {
      // Simulate restaurant on CORE (5K) plan
      LicenseRepository.activatePlan('CORE');

      // Entitlement check fails
      const entitlement = EntitlementService.checkQrOrderingAccess();
      expect(entitlement.allowed).toBe(false);
      expect(entitlement.tier).toBe('CORE');
      expect(entitlement.message).toContain('7,000');

      // verifyQrToken fails with plan lock explanation
      const check = QrOrderingRepository.verifyQrToken('12');
      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('JAMANVAAR PRO (₹7,000)');

      // Guest order is blocked at the database level
      const dish = db.menuItems[0];
      expect(() => {
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          items: [{ menuItemId: dish.id, quantity: 1 }]
        });
      }).toThrow(/JAMANVAAR PRO \(₹7,000\) plan/i);
    });

    it('should unlock and permit full QR ordering pipeline when Super Admin allots the ₹7,000 PRO plan', () => {
      // Super Admin allots PRO 7K plan
      LicenseRepository.activatePlan('PRO');

      const entitlement = EntitlementService.checkQrOrderingAccess();
      expect(entitlement.allowed).toBe(true);
      expect(entitlement.tier).toBe('PRO');

      // Verification succeeds
      const check = QrOrderingRepository.verifyQrToken('12');
      expect(check.isValid).toBe(true);
      expect(check.table?.tableNumber).toBe('12');

      // Order placement succeeds
      const dish = db.menuItems[0];
      dish.isAvailable = true;
      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        customerName: 'Pooja Shah',
        items: [{ menuItemId: dish.id, quantity: 1 }]
      });

      expect(order).toBeDefined();
      expect(order.orderType).toBe('QR_TABLE');
      expect(order.orderNumber).toContain('QR-');
    });
  });
});
