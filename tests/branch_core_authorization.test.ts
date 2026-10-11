import { describe, it, expect } from 'vitest';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';

describe('Branch Core cannot bootstrap human privileges or bypass canonical states', () => {
  it('rejects local staff administration and unverified take-backs but accepts cloud-confirmed changes', () => {
    const store = new BranchStore(':memory:');
    const core = new BranchCore(store, { restaurantId: 'qa', branchId: 'branch', branchCode: 'QA' });
    const device = { id: 'pos', type: 'POS' };
    const order = { externalOrderId: 'qa-order', orderType: 'TAKEAWAY', status: 'NEW', items: [{ externalItemId: 'tea', name: 'Tea', quantity: 1, unitPrice: 100, lineTotal: 100 }], subtotal: 100, taxAmount: 0, totalAmount: 100, updatedAt: new Date().toISOString() };
    try {
      expect(() => core.pushEntities(device, 'STAFF_USER', [{ externalId: 'forged-manager', payload: { roleId: 'role-manager' } }])).toThrow(/authorized cloud manager/);
      expect(core.ingestOrders(device, [order]).results[0].status).toBe('ok');
      expect(core.ingestOrders(device, [{ ...order, status: 'UNKNOWN' }]).results[0].status).toBe('error');
      expect(core.ingestOrders(device, [{ ...order, status: 'CANCELLED' }]).results[0].error).toContain('CLOUD_AUTHORIZATION_REQUIRED');
      expect(core.pullOrders(0).orders[0].status).toBe('NEW');
      expect(core.ingestOrders(device, [{ ...order, status: 'CANCELLED' }], 'cloud').results[0].status).toBe('ok');
      expect(core.ingestOrders({ id: 'kds', type: 'KDS' }, [order]).results[0].status).toBe('error');
      expect(core.pullOrders(0).orders[0].status).toBe('CANCELLED');
    } finally { store.close(); }
  });
});
