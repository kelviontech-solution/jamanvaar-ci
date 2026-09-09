import { describe, it, expect, beforeEach } from 'vitest';
import { db, LicenseRepository, QrOrderingRepository } from '@jamanvaar/database';
import { pullQrPlatformControl, pushQrUsage, syncQrPlatformState } from '@jamanvaar/business';

/**
 * The wire between cloud/api's tenant QR endpoints and the local license.
 * These tests use a stub fetch so they assert our behaviour, not the network.
 */

const OPTIONS_BASE = { baseUrl: 'https://cloud.jamanvaar.test', accessToken: 'tenant-token-abc' };

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response;
}

function fullEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    qrEntitled: true,
    qrOrderingEnabled: true,
    maxActiveTables: 50,
    maxOrdersPerDay: null,
    digitalMenu: true,
    guestCustomization: true,
    liveOrderTracking: true,
    qrAnalytics: true,
    onlinePayments: true,
    source: 'PLAN',
    ...overrides
  };
}

describe('QR platform sync', () => {
  beforeEach(() => {
    LicenseRepository.activatePlan('PRO');
    delete (db.license as { platformQrControl?: unknown }).platformQrControl;

    const tbl = db.tables.find((t) => t.tableNumber === '12');
    if (tbl) {
      tbl.qrStatus = 'ACTIVE';
      tbl.status = 'AVAILABLE';
      tbl.currentOrderId = undefined;
    }
  });

  describe('pulling entitlement down', () => {
    it('records the platform control block and enforces it on the next guest scan', async () => {
      const fetchImpl = async () => jsonResponse(fullEntitlement({ qrOrderingEnabled: false }));

      const result = await pullQrPlatformControl({ ...OPTIONS_BASE, fetchImpl: fetchImpl as typeof fetch });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.control.qrOrderingEnabled).toBe(false);
      expect(result.control.syncedAt).toBeTruthy();

      // The pull is only meaningful if it actually reaches the guest path.
      const scan = QrOrderingRepository.verifyQrToken('12');
      expect(scan.isValid).toBe(false);
      expect(scan.reason).toContain('platform administration');
    });

    it('treats an unentitled restaurant as switched off, not merely limited', async () => {
      const fetchImpl = async () =>
        jsonResponse(fullEntitlement({ qrEntitled: false, qrOrderingEnabled: true }));

      const result = await pullQrPlatformControl({ ...OPTIONS_BASE, fetchImpl: fetchImpl as typeof fetch });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.control.qrOrderingEnabled).toBe(false);
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(false);
    });

    it('sends the tenant bearer token and never sends a restaurantId', async () => {
      let seenUrl = '';
      let seenInit: RequestInit | undefined;
      const fetchImpl = async (url: string, init?: RequestInit) => {
        seenUrl = url;
        seenInit = init;
        return jsonResponse(fullEntitlement());
      };

      await pullQrPlatformControl({ ...OPTIONS_BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

      expect(seenUrl).toBe('https://cloud.jamanvaar.test/api/v1/tenant/qr-ordering/entitlement');
      expect((seenInit?.headers as Record<string, string>).Authorization).toBe('Bearer tenant-token-abc');
      expect(seenUrl).not.toContain('restaurantId');
      expect(seenInit?.body).toBeUndefined();
    });
  });

  describe('offline-first behaviour', () => {
    it('keeps the last synced control in force when the cloud is unreachable', async () => {
      // A good sync lands a permissive control block.
      await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => jsonResponse(fullEntitlement())) as typeof fetch
      });
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(true);

      // The link then drops.
      const result = await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => {
          throw new Error('ECONNREFUSED');
        }) as typeof fetch
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('unreachable');

      // Never fail closed: the restaurant keeps trading on what it was granted.
      expect(db.license.platformQrControl?.qrOrderingEnabled).toBe(true);
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(true);
    });

    it('does not fail open: an unreachable cloud cannot lift an existing block', async () => {
      await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => jsonResponse(fullEntitlement({ qrOrderingEnabled: false }))) as typeof fetch
      });
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(false);

      await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => {
          throw new Error('offline');
        }) as typeof fetch
      });

      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(false);
    });

    it('rejects a malformed payload rather than coercing it into the license', async () => {
      await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => jsonResponse(fullEntitlement())) as typeof fetch
      });
      const goodSyncedAt = db.license.platformQrControl?.syncedAt;

      const result = await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () =>
          jsonResponse({ qrOrderingEnabled: 'yes', maxActiveTables: 'lots' })) as typeof fetch
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('malformed');
      // Untouched.
      expect(db.license.platformQrControl?.syncedAt).toBe(goodSyncedAt);
    });

    it('reports an expired or rejected tenant session distinctly from being offline', async () => {
      const result = await pullQrPlatformControl({
        ...OPTIONS_BASE,
        fetchImpl: (async () => jsonResponse({ message: 'Unauthorized' }, 401)) as typeof fetch
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('unauthorized');
    });
  });

  describe('pushing measured usage up', () => {
    it('reports figures counted from the shared order engine', async () => {
      let sentBody: unknown;
      const fetchImpl = async (_url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        return jsonResponse({ ok: true });
      };

      const expected = QrOrderingRepository.getQrUsageSnapshot();
      const result = await pushQrUsage({
        ...OPTIONS_BASE,
        fetchImpl: fetchImpl as unknown as typeof fetch
      });

      expect(result.ok).toBe(true);
      expect(sentBody).toEqual({
        activeTables: expected.activeTables,
        ordersToday: expected.ordersToday,
        revenueToday: expected.revenueToday
      });
    });

    it('hands back the unreported snapshot so a sync queue can retry it', async () => {
      const result = await pushQrUsage({
        ...OPTIONS_BASE,
        fetchImpl: (async () => {
          throw new Error('network down');
        }) as typeof fetch
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('unreachable');
      expect(result.pending.activeTables).toBe(QrOrderingRepository.countActiveQrTables());
      expect(typeof result.pending.reportedAt).toBe('string');
    });
  });

  describe('full round trip', () => {
    it('pulls rules before reporting usage, and survives a one-sided failure', async () => {
      const calls: string[] = [];
      const fetchImpl = async (url: string) => {
        calls.push(url);
        if (url.endsWith('/entitlement')) return jsonResponse(fullEntitlement());
        return jsonResponse({ message: 'boom' }, 500);
      };

      const { pull, push } = await syncQrPlatformState({
        ...OPTIONS_BASE,
        fetchImpl: fetchImpl as unknown as typeof fetch
      });

      expect(calls[0]).toContain('/entitlement');
      expect(calls[1]).toContain('/usage');
      expect(pull.ok).toBe(true);
      expect(push.ok).toBe(false);

      // A failed usage report must not disturb what the restaurant may do.
      expect(QrOrderingRepository.verifyQrToken('12').isValid).toBe(true);
    });
  });
});
