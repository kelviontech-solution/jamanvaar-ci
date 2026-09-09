import { describe, it, expect, beforeEach } from 'vitest';
import { db, QrOrderingRepository, LicenseRepository } from '@jamanvaar/database';

/**
 * Covers the platform -> tenant half of the QR entitlement chain.
 *
 * The plan tier decides whether QR ordering was SOLD to a restaurant
 * (qr_table_ordering_pipeline.test.ts covers that). This file covers whether
 * the platform is currently ALLOWING it: the Super Admin kill-switch, the
 * active-table ceiling and the daily order ceiling must all reach the guest
 * ordering path, and a restaurant admin must not be able to widen them.
 */

const FULL_CONTROL = {
  qrOrderingEnabled: true,
  maxActiveTables: 50,
  maxOrdersPerDay: null,
  digitalMenu: true,
  guestCustomization: true,
  liveOrderTracking: true,
  qrAnalytics: true,
  onlinePayments: true
};

function firstAvailableDish() {
  const dish = db.menuItems[0];
  dish.isAvailable = true;
  return dish;
}

describe('Super Admin platform control over QR ordering', () => {
  beforeEach(() => {
    // Restaurant is sold QR ordering (PRO), and the platform allows it by default.
    LicenseRepository.activatePlan('PRO');
    LicenseRepository.applyPlatformQrControl(FULL_CONTROL, { source: 'cloud-sync' });

    const tbl = db.tables.find((t) => t.tableNumber === '12');
    if (tbl) {
      tbl.qrStatus = 'ACTIVE';
      tbl.status = 'AVAILABLE';
      tbl.currentOrderId = undefined;
    }
  });

  describe('platform kill-switch', () => {
    it('blocks a guest scan when the Super Admin disables QR ordering, even on the PRO plan', () => {
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, qrOrderingEnabled: false },
        { source: 'cloud-sync' }
      );

      // The plan is untouched and still PRO...
      expect(db.license.tier).toBe('PRO');
      expect(db.license.entitlements.qrTableOrdering).toBe(true);

      // ...but the platform has switched the feature off.
      const check = QrOrderingRepository.verifyQrToken('12');
      expect(check.isValid).toBe(false);
      expect(check.reason).toContain('platform administration');
    });

    it('blocks the guest order itself, not merely the scan (no bypass via direct order call)', () => {
      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, qrOrderingEnabled: false },
        { source: 'cloud-sync' }
      );
      const dish = firstAvailableDish();

      expect(() =>
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          token: qrToken,
          items: [{ menuItemId: dish.id, quantity: 1 }]
        })
      ).toThrow(/platform administration/);
    });

    it('restores ordering when the Super Admin re-enables QR ordering', () => {
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, qrOrderingEnabled: false },
        { source: 'cloud-sync' }
      );
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(false);

      LicenseRepository.applyPlatformQrControl(FULL_CONTROL, { source: 'cloud-sync' });

      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = firstAvailableDish();
      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        token: qrToken,
        items: [{ menuItemId: dish.id, quantity: 1 }]
      });

      expect(order.source_type).toBe('QR_TABLE');
      expect(order.tableNumber).toBe('12');
    });

    it('leaves QR ordering governed by the plan alone when the platform has never synced a control block', () => {
      delete (db.license as { platformQrControl?: unknown }).platformQrControl;

      const check = QrOrderingRepository.verifyQrToken('12');
      expect(check.isValid).toBe(true);
    });
  });

  describe('active-table ceiling', () => {
    it('refuses to activate more QR tables than the platform allows', () => {
      // Every seeded table starts ACTIVE, so free one up to have a candidate
      // that genuinely needs headroom to come back online.
      const candidate = db.tables.find((t) => t.tableNumber !== '12');
      expect(candidate).toBeDefined();
      QrOrderingRepository.bulkUpdateQrStatus([candidate!.tableNumber], 'DISABLED');
      expect(candidate!.qrStatus).toBe('DISABLED');

      // Pin the ceiling to exactly what is still in use, leaving zero headroom.
      const activeNow = QrOrderingRepository.countActiveQrTables();
      expect(activeNow).toBeGreaterThan(0);
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxActiveTables: activeNow },
        { source: 'cloud-sync' }
      );

      expect(() => QrOrderingRepository.generateTableQr(candidate!.tableNumber)).toThrow(
        /QR table limit reached/
      );
      expect(() =>
        QrOrderingRepository.bulkUpdateQrStatus([candidate!.tableNumber], 'ACTIVE')
      ).toThrow(/QR table limit reached/);
      expect(candidate!.qrStatus).toBe('DISABLED');

      // Raising the ceiling lets it come back online.
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxActiveTables: activeNow + 1 },
        { source: 'cloud-sync' }
      );
      QrOrderingRepository.bulkUpdateQrStatus([candidate!.tableNumber], 'ACTIVE');
      expect(candidate!.qrStatus).toBe('ACTIVE');
    });

    it('still allows regenerating a QR for a table that is already active at the ceiling', () => {
      const activeNow = QrOrderingRepository.countActiveQrTables();
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxActiveTables: activeNow },
        { source: 'cloud-sync' }
      );

      // Table 12 is already ACTIVE, so it consumes no additional headroom.
      expect(() => QrOrderingRepository.generateTableQr('12')).not.toThrow();
    });

    it('rejects a nonsensical ceiling rather than silently accepting it', () => {
      expect(() =>
        LicenseRepository.applyPlatformQrControl(
          { ...FULL_CONTROL, maxActiveTables: -5 },
          { source: 'cloud-sync' }
        )
      ).toThrow(/maxActiveTables/);
    });
  });

  describe('daily order ceiling', () => {
    it('blocks guest ordering once the platform daily limit is reached', () => {
      const { ordersToday } = QrOrderingRepository.getQrUsageSnapshot();

      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxOrdersPerDay: ordersToday },
        { source: 'cloud-sync' }
      );

      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = firstAvailableDish();

      expect(() =>
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          token: qrToken,
          items: [{ menuItemId: dish.id, quantity: 1 }]
        })
      ).toThrow(/daily QR ordering limit/);
    });

    it('applies no ceiling when the platform sets maxOrdersPerDay to null', () => {
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxOrdersPerDay: null },
        { source: 'cloud-sync' }
      );

      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = firstAvailableDish();

      expect(() =>
        QrOrderingRepository.createCustomerQrOrder({
          tableNumber: '12',
          token: qrToken,
          items: [{ menuItemId: dish.id, quantity: 1 }]
        })
      ).not.toThrow();
    });
  });

  describe('usage snapshot reported to the platform', () => {
    it('counts real orders and revenue from the shared order engine, never estimates', () => {
      const before = QrOrderingRepository.getQrUsageSnapshot();

      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = firstAvailableDish();
      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        token: qrToken,
        items: [{ menuItemId: dish.id, quantity: 1 }]
      });

      const after = QrOrderingRepository.getQrUsageSnapshot();

      expect(after.ordersToday).toBe(before.ordersToday + 1);
      expect(after.revenueToday).toBe(
        Math.round((before.revenueToday + order.totalAmount) * 100) / 100
      );
      expect(after.activeTables).toBe(QrOrderingRepository.countActiveQrTables());
      expect(new Date(after.reportedAt).toString()).not.toBe('Invalid Date');
    });

    it('excludes cancelled orders from reported revenue', () => {
      const { qrToken } = QrOrderingRepository.generateTableQr('12');
      const dish = firstAvailableDish();
      const order = QrOrderingRepository.createCustomerQrOrder({
        tableNumber: '12',
        token: qrToken,
        items: [{ menuItemId: dish.id, quantity: 1 }]
      });

      const withOrder = QrOrderingRepository.getQrUsageSnapshot();
      QrOrderingRepository.updateOrderStatus(order.id, 'CANCELLED', 'POS Cashier');
      const afterCancel = QrOrderingRepository.getQrUsageSnapshot();

      expect(afterCancel.revenueToday).toBe(
        Math.round((withOrder.revenueToday - order.totalAmount) * 100) / 100
      );
      // The order still counts as placed - only its revenue is withdrawn.
      expect(afterCancel.ordersToday).toBe(withOrder.ordersToday);
    });
  });

  describe('tenant isolation of the control block', () => {
    it('exposes no restaurant-facing write path that could widen platform limits', () => {
      LicenseRepository.applyPlatformQrControl(
        { ...FULL_CONTROL, maxActiveTables: 3 },
        { source: 'cloud-sync' }
      );

      // The QR repository - everything a restaurant admin's UI can reach - must
      // offer no way to raise the ceiling it is constrained by.
      const repoWritePaths = Object.getOwnPropertyNames(QrOrderingRepository).filter((k) =>
        /platformQrControl|maxActiveTables|entitlement/i.test(k)
      );
      expect(repoWritePaths).toEqual([]);

      expect(LicenseRepository.getPlatformQrControl()?.maxActiveTables).toBe(3);
    });
  });
});
