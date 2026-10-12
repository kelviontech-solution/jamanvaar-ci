import { describe, expect, it } from 'vitest';
import { orderSyncMetaSchema } from '../cloud/api/src/modules/order-sync/dto/push-order-sync.dto';
import { outstandingBillAmount } from '@jamanvaar/utils';
describe('Service occupancy and collection metadata', () => {
  it('retains descriptive evidence through the validated sync payload and rejects invented verification kinds', () => {
    const meta={tableReleasedAt:'2026-10-12T07:00:00.000Z',paymentConfirmation:{kind:'CASHIER_CONFIRMED' as const,actor:'Cashier',at:'2026-10-12T07:01:00.000Z',reference:'txn-example'}};
    expect(orderSyncMetaSchema.parse(meta)).toEqual(meta);
    expect(orderSyncMetaSchema.safeParse({...meta,paymentConfirmation:{...meta.paymentConfirmation,kind:'GATEWAY_VERIFIED'}}).success).toBe(false);
    expect(orderSyncMetaSchema.safeParse({...meta,tableReleasedAt:'not-a-date'}).success).toBe(false);
  });
  it('keeps completed-but-unpaid bills collectible and shows actual partial balance', () => {
    const order={orderStatus:'COMPLETED' as const,paymentStatus:'PENDING' as const,totalAmount:250};
    expect(outstandingBillAmount(order)).toBe(250);
    expect(outstandingBillAmount({...order,paymentStatus:'PARTIALLY_PAID',paymentAllocationSummary:{collectedPaise:10000,outstandingPaise:15000}})).toBe(150);
    expect(outstandingBillAmount({...order,paymentStatus:'SUCCESS'})).toBe(0);
    expect(outstandingBillAmount({...order,orderStatus:'CANCELLED'})).toBe(0);
    expect(outstandingBillAmount({...order,orderStatus:'DRAFT'})).toBe(0);
  });
});
