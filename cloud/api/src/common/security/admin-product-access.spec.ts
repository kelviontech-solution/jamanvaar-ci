import { describe, expect, it } from 'vitest';
import { requiredConsoleApps } from './admin-product-access';
import { tenantRefreshTracker } from '../throttle';

describe('shared console resource authorization', () => {
  it.each(['CUSTOMER','INVENTORY_ITEM','RECIPE','SUPPLIER','PAYMENT_TRANSACTION','SHIFT','CASH_MOVEMENT','RESERVATION'])('requires Restaurant Admin for %s', type => {
    expect(requiredConsoleApps(`/api/v1/entity-sync/${type}?afterSeq=0`)).toEqual(['POS_ADMIN']);
  });
  it.each(['MENU_ITEM','MENU_CATEGORY','MODIFIER_GROUP','TAX_GROUP','COMBO','COUPON','DINING_TABLE','STAFF_USER','CUSTOMER_FEEDBACK'])('retains shared management of %s', type => {
    expect(requiredConsoleApps(`/api/v1/entity-sync/${type}`)).toEqual(['POS_ADMIN','KIOSK_ADMIN']);
  });
  it('requires kiosk access for customer configuration and bank setup', () => {
    expect(requiredConsoleApps('/api/v1/entity-sync/KIOSK_CONFIGURATION')).toEqual(['POS_ADMIN', 'KIOSK_ADMIN']);
    expect(requiredConsoleApps('/api/v1/tenant/payment-connection/bank-details')).toEqual(['KIOSK_ADMIN']);
    expect(requiredConsoleApps('/api/v1/inventory/movements')).toEqual(['POS_ADMIN']);
  });
  it('separates session buckets behind the same NAT without exposing refresh credentials', () => {
    const one = tenantRefreshTracker({ ip: '127.0.0.1', cookies: { jamanvaar_tenant_refresh: 'opaque-one' } });
    const two = tenantRefreshTracker({ ip: '127.0.0.1', cookies: { jamanvaar_tenant_refresh: 'opaque-two' } });
    expect(one).not.toBe(two);expect(one).toMatch(/^[a-f0-9]{64}$/);
    expect(tenantRefreshTracker({ip:'127.0.0.1'})).toBe('127.0.0.1');
  });
  it('checks decoded resource names using the same interpretation as the API router', () => {
    expect(requiredConsoleApps('/api/v1/entity-sync/%49NVENTORY_ITEM?afterSeq=0')).toEqual(['POS_ADMIN']);
    expect(requiredConsoleApps('/api/v1/tenant/%70ayment-connection')).toEqual(['KIOSK_ADMIN']);
  });
});
