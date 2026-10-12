import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { DeviceAuthGuard, DEVICE_AUTH_CACHE } from '../src/common/guards/device-auth.guard';
import { restaurantIdentitySchema } from '../src/modules/devices/dto/heartbeat.dto';
import { PaymentsService } from '../src/modules/payments/payments.service';

describe('Owner rollover settings and targeted payment lookup', () => {
  beforeEach(() => DEVICE_AUTH_CACHE.clear());
  afterEach(() => vi.restoreAllMocks());
  function auth(type = 'POS_ADMIN', role = 'OWNER', proof?: string, foreign = false) {
    const device = { id: 'device', restaurantId: 'restaurant', branchId: 'branch', type, status: 'ACTIVE', isLocked: false, restaurant: { status: 'ACTIVE', deletedAt: null }, branch: { status: 'ACTIVE', name: 'Branch' } };
    const tx = { device: { findUnique: vi.fn().mockResolvedValue(device) }, subscription: { findMany: vi.fn().mockResolvedValue([{ id: 'subscription' }]) }, applicationEntitlement: { findMany: vi.fn().mockResolvedValue([{ appCode: type }]) }, user: { findFirst: vi.fn().mockResolvedValue({ role, status: 'ACTIVE', branchId: 'branch' }) } };
    const prisma = { runAsPlatform: (fn: (tx: unknown) => unknown) => fn(tx), runAsTenant: (_id: string, fn: (tx: unknown) => unknown) => fn(tx) };
    vi.spyOn(JwtService.prototype, 'verifyAsync').mockResolvedValue({ sub: 'owner', did: 'device', restaurantId: foreign ? 'foreign' : 'restaurant' } as never);
    const request = { originalUrl: '/api/v1/devices/me/restaurant', method: 'PATCH', body: { businessDayCutoffHour: 3 }, headers: { authorization: 'Bearer test-device', ...(proof ? { 'x-owner-authorization': proof } : {}) }, query: {} };
    const guard = new DeviceAuthGuard(prisma as never, { invalidations$: { subscribe: () => {} } } as never, { getOrThrow: () => 'unit-test-only-secret' } as never);
    return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
  }
  it('validates whole rollover hours, including midnight; rejects malformed configuration', () => {
    expect(restaurantIdentitySchema.parse({ businessDayCutoffHour: 0 }).businessDayCutoffHour).toBe(0);
    for (const value of [-1, 24, 3.5, '5']) expect(restaurantIdentitySchema.safeParse({ businessDayCutoffHour: value }).success).toBe(false);
  });
  it('requires owner proof even from an activated administrator console', async () => {
    await expect(auth()).rejects.toThrow();
    await expect(auth('POS_ADMIN', 'OWNER', 'owner-proof')).resolves.toBe(true);
  });
  it('rejects customer terminals, managers and foreign owner context', async () => {
    await expect(auth('KIOSK', 'OWNER', 'proof')).rejects.toThrow();
    await expect(auth('POS_ADMIN', 'MANAGER', 'proof')).rejects.toThrow();
    await expect(auth('POS_ADMIN', 'OWNER', 'proof', true)).rejects.toThrow();
  });
  it('targeted payment lookup retains restaurant and branch restrictions', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = Object.create(PaymentsService.prototype) as PaymentsService;
    Object.assign(service, { prisma: { runAsTenant: async (_id: string, fn: (tx: unknown) => unknown) => fn({ paymentTransaction: { findMany } }) } });
    await service.tenantRecent('restaurant-a', 30, 'branch-a', 'old-order');
    expect(findMany.mock.calls[0][0].where).toEqual({ restaurantId: 'restaurant-a', order: { externalOrderId: 'old-order', OR: [{ branchId: 'branch-a' }, { branchId: null, kiosk: { branchId: 'branch-a' } }] } });
  });
});
