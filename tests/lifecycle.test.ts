import { describe, expect, it } from 'vitest';
import { OrderRepository } from '../shared/database/src/repositories';
import { KdsMeshService } from '../shared/api/src/kds';
import { db } from '../shared/database/src/db';

describe('Order Lifecycle, Source Tagging & KDS Mesh Tracking', () => {
  it('should create order with source_type KIOSK and initial stage', () => {
    const order = OrderRepository.createOrder({
      subtotal: 440,
      totalAmount: 462,
      orderType: 'DINE_IN',
      syncStatus: 'SYNCED'
    });

    expect(order.source_type).toBe('KIOSK');
    expect(order.acknowledgementStage).toBe('ORDER_SENT_TO_KDS');
    expect(order.tokenNumber).toBeTruthy();
  });

  it('should advance kitchen order stages and dynamically recalculate wait time', () => {
    const order = OrderRepository.createOrder({
      subtotal: 500,
      totalAmount: 525,
      orderType: 'TAKEAWAY',
      syncStatus: 'SYNCED'
    });

    // Advance to PREPARING
    const prepOrder = KdsMeshService.advanceKitchenStatus(order.id, 'PREPARING');
    expect(prepOrder?.orderStatus).toBe('PREPARING');
    expect(prepOrder?.acknowledgementStage).toBe('ORDER_PREPARING');
    expect(prepOrder?.estimatedWaitMinutes).toBeGreaterThan(0);

    // Advance to READY
    const readyOrder = KdsMeshService.advanceKitchenStatus(order.id, 'READY');
    expect(readyOrder?.orderStatus).toBe('READY');
    expect(readyOrder?.acknowledgementStage).toBe('ORDER_READY');
    expect(readyOrder?.estimatedWaitMinutes).toBe(0);

    // Advance to COLLECTED
    const collectedOrder = KdsMeshService.advanceKitchenStatus(order.id, 'COLLECTED');
    expect(collectedOrder?.orderStatus).toBe('COLLECTED');
    expect(collectedOrder?.acknowledgementStage).toBe('ORDER_COMPLETED');
  });
});
