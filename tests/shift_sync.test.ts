import { describe, it, expect, beforeEach } from 'vitest';
import { CollectionSync, type CollectionSyncRecord, ShiftRepository, db } from '@jamanvaar/database';
import { EntitySyncEngine, syncCollection } from '@jamanvaar/sync';
import type { ShiftRecord, CashMovement } from '@jamanvaar/types';

/**
 * B2-056: a POS cash-drawer shift and its cash movements (payouts/cash drops) only ever lived on
 * the POS device that opened them — Restaurant Admin's own Shift & Cash Drawer Ledger,
 * Reconciliation and EOD Z-Report pages read from a `db.shifts`/`db.cashMovements` that never
 * received them, so it showed "No Active Register Shift" while POS genuinely had one open.
 * Same fake-cloud pattern as `tests/menu_edit_delete_sync.test.ts` (push-from-POS, pull-only on
 * Restaurant Admin — only POS ever edits its own shift).
 */
const changedAt = (p: Record<string, unknown>) => {
  const ms = typeof p.updatedAt === 'string' ? Date.parse(p.updatedAt) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

function makeCloud() {
  const rows = new Map<string, { externalId: string; payload: Record<string, unknown>; updatedAt: string }>();
  let clock = 1_000;
  return {
    rows,
    transport: {
      push: async (_type: string, events: CollectionSyncRecord[]) => {
        const results = events.map((e) => {
          const existing = rows.get(e.externalId);
          if (!existing || changedAt(e.payload) >= changedAt(existing.payload)) {
            rows.set(e.externalId, { externalId: e.externalId, payload: e.payload, updatedAt: new Date(Date.UTC(2030, 0, 1) + clock++).toISOString() });
          }
          return { externalId: e.externalId, status: 'ok' as const };
        });
        return { results, serverTime: new Date().toISOString() };
      },
      pull: async (_type: string, since?: string) => {
        const after = since ? Date.parse(since) : 0;
        return { entities: [...rows.values()].filter((r) => Date.parse(r.updatedAt) > after), serverTime: new Date(Date.UTC(2030, 0, 1) + clock).toISOString() };
      }
    }
  };
}

describe('cash-drawer shifts and cash movements reach Restaurant Admin (B2-056)', () => {
  let cloud: ReturnType<typeof makeCloud>;
  let posShifts: ShiftRecord[];
  let adminShifts: ShiftRecord[];
  let posMovements: CashMovement[];
  let adminMovements: CashMovement[];
  let posShiftSync: CollectionSync<ShiftRecord>;
  let adminShiftSync: CollectionSync<ShiftRecord>;
  let posMovementSync: CollectionSync<CashMovement>;
  let adminMovementSync: CollectionSync<CashMovement>;

  const shiftAccepts = (r: Record<string, unknown>) => typeof r.posId === 'string';
  const movementAccepts = (r: Record<string, unknown>) => typeof r.shiftId === 'string';

  const tickShifts = async (which: 'pos' | 'admin') => {
    await syncCollection('SHIFT', which === 'pos' ? posShiftSync : adminShiftSync, which === 'pos');
  };
  const tickMovements = async (which: 'pos' | 'admin') => {
    await syncCollection('CASH_MOVEMENT', which === 'pos' ? posMovementSync : adminMovementSync, which === 'pos');
  };

  beforeEach(async () => {
    cloud = makeCloud();
    EntitySyncEngine.configureTransport(cloud.transport);
    posShifts = [];
    adminShifts = [];
    posMovements = [];
    adminMovements = [];
    posShiftSync = new CollectionSync<ShiftRecord>('t_pos_shift', () => posShifts, shiftAccepts);
    adminShiftSync = new CollectionSync<ShiftRecord>('t_admin_shift', () => adminShifts, shiftAccepts);
    posMovementSync = new CollectionSync<CashMovement>('t_pos_movement', () => posMovements, movementAccepts);
    adminMovementSync = new CollectionSync<CashMovement>('t_admin_movement', () => adminMovements, movementAccepts);
    posShiftSync.reset();
    adminShiftSync.reset();
    posMovementSync.reset();
    adminMovementSync.reset();
  });

  it('a shift opened on POS reaches Restaurant Admin, which never had "No Active Register Shift" wrongly', async () => {
    posShifts.push({
      id: 'shift-1', shiftNumber: 1, posId: 'POS-01', cashierId: 'usr-1', cashierName: 'Amit Cashier',
      openedAt: '2026-09-24T09:00:00.000Z', status: 'OPEN', openingCash: 1000,
      expectedCash: 1000, totalCashSales: 0, totalUpiSales: 0, totalCardSales: 0, totalSales: 0, totalDiscounts: 0, totalOrders: 0
    });
    await tickShifts('pos');
    await tickShifts('admin');

    expect(adminShifts).toHaveLength(1);
    expect(adminShifts[0]).toMatchObject({ id: 'shift-1', status: 'OPEN', posId: 'POS-01', cashierName: 'Amit Cashier', openingCash: 1000 });
  });

  it('closing the shift on POS reaches Restaurant Admin too', async () => {
    posShifts.push({
      id: 'shift-2', shiftNumber: 2, posId: 'POS-01', cashierId: 'usr-1', cashierName: 'Amit Cashier',
      openedAt: '2026-09-24T09:00:00.000Z', status: 'OPEN', openingCash: 1000,
      expectedCash: 1000, totalCashSales: 0, totalUpiSales: 0, totalCardSales: 0, totalSales: 0, totalDiscounts: 0, totalOrders: 0
    });
    await tickShifts('pos');
    await tickShifts('admin');

    posShifts[0].status = 'CLOSED';
    posShifts[0].closedAt = '2026-09-24T18:00:00.000Z';
    posShifts[0].actualCash = 5500;
    await tickShifts('pos');
    await tickShifts('admin');

    expect(adminShifts[0]).toMatchObject({ status: 'CLOSED', actualCash: 5500 });
  });

  it('a cash movement (payout/cash-drop) recorded on POS reaches Restaurant Admin', async () => {
    posMovements.push({ id: 'mv-1', shiftId: 'shift-1', type: 'CASH_OUT', amount: 9000, reason: 'Petty Cash Expense', cashierName: 'Amit Cashier', timestamp: '2026-09-24T10:00:00.000Z' });
    await tickMovements('pos');
    await tickMovements('admin');

    expect(adminMovements).toHaveLength(1);
    expect(adminMovements[0]).toMatchObject({ shiftId: 'shift-1', type: 'CASH_OUT', amount: 9000 });
  });

  /**
   * Confirms the design premise behind syncing the whole ShiftRecord rather than just its
   * identity: `ShiftRepository.getShiftMetrics` always recomputes totals from this device's own
   * (already order-synced) `db.orders` and cash movements, so Restaurant Admin's own recompute —
   * not a blindly-trusted pushed total — is what actually lands on screen, and it is correct as
   * long as the shift's identity and the cash movements have arrived.
   */
  it('Restaurant Admin recomputes the correct expectedCash from a synced shift + synced cash movements + its own orders', () => {
    db.resetToDefaultSeed();
    db.shifts = [];
    db.cashMovements = [];
    db.orders = [];

    const syncedShift: ShiftRecord = {
      id: 'shift-3', shiftNumber: 1, posId: 'POS-01', cashierId: 'usr-1', cashierName: 'Amit Cashier',
      openedAt: new Date().toISOString(), status: 'OPEN', openingCash: 1000,
      expectedCash: 1000, totalCashSales: 0, totalUpiSales: 0, totalCardSales: 0, totalSales: 0, totalDiscounts: 0, totalOrders: 0
    };
    db.shifts.push(syncedShift);
    db.cashMovements.push({ id: 'mv-2', shiftId: 'shift-3', type: 'CASH_OUT', amount: 9000, reason: 'Petty Cash Expense', cashierName: 'Amit Cashier', timestamp: new Date().toISOString() });

    const metrics = ShiftRepository.getShiftMetrics(syncedShift, db.orders);
    // openingCash 1000 + cash sales 0 + cash-in 0 - cash-out 9000 = -8000, matching what POS itself would show.
    expect(metrics.expectedCash).toBe(-8000);
  });
});
