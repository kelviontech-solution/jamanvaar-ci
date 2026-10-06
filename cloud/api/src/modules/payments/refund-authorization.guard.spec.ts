import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefundAuthorizationGuard } from './refund-authorization.guard';
import { StaffSessionService } from '../entity-sync/staff-session.service';

const config = new ConfigService({ JWT_ACCESS_SECRET: 'refund-guard-local-test-only' });
const sessions = new StaffSessionService(config);
function fixture(role = 'role-manager', active = true) {
  const req: any = { device: { id: 'terminal-a', restaurantId: 'restaurant-a', type: 'POS' }, body: { amountPaise: 100, idempotencyKey: 'guard-refund-123' }, headers: {}, params: { paymentId: 'payment-a' } };
  const prisma: any = { runAsTenant: async (_: string, fn: any) => fn({ syncedEntity: { findFirst: async () => ({ payload: { isActive: active, roleId: role, fullName: 'Verified Manager' } }) } }) };
  const guard = new RefundAuthorizationGuard(prisma, sessions, new JwtService(), config);
  const context: any = { switchToHttp: () => ({ getRequest: () => req }) };
  return { guard, req, context };
}
function token(role: string, deviceId = 'terminal-a', now = Date.now(), kind: 'approval' | 'session' = 'session') {
  return sessions.issue(kind, { deviceId, restaurantId: 'restaurant-a', staffId: 'staff-a', role, name: 'Client Name', ...(kind === 'approval' ? { scope: { action: 'REFUND' as const, paymentId: 'payment-a', amountPaise: 100, idempotencyKey: 'guard-refund-123' } } : {}) }, now).token;
}
describe('refund server authorization', () => {
  it('rejects device-only and cashier proofs despite a manager name in the request', async () => {
    const f = fixture('role-cashier'); f.req.body.requestedBy = 'Manager';
    await expect(f.guard.canActivate(f.context)).rejects.toThrow();
    f.req.body.staffSession = token('role-cashier');
    await expect(f.guard.canActivate(f.context)).rejects.toThrow();
  });
  it('authorizes an active manager and derives actor from the current server record', async () => {
    const f = fixture(); f.req.body.staffSession = token('role-manager');
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    expect(f.req.refundActor).toBe('Verified Manager');
  });
  it('requires approval to be bound to this terminal, unexpired and still authorized', async () => {
    const f = fixture();
    for (const proof of [token('role-manager', 'other-terminal', Date.now(), 'approval'), token('role-manager', 'terminal-a', Date.now() - 16 * 60_000, 'approval'), token('role-manager') + 'forged']) {
      f.req.body.approvalSession = proof; await expect(f.guard.canActivate(f.context)).rejects.toThrow();
    }
    f.req.body.approvalSession = token('role-manager', 'terminal-a', Date.now(), 'approval');
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    const revoked = fixture('role-manager', false); revoked.req.body.staffSession = token('role-manager');
    await expect(revoked.guard.canActivate(revoked.context)).rejects.toThrow();
    const demoted = fixture('role-cashier'); demoted.req.body.staffSession = token('role-manager');
    await expect(demoted.guard.canActivate(demoted.context)).rejects.toThrow();
  });
  it('cannot use a generic override or change the approved payment, amount or refund intent', async () => {
    const f = fixture();
    f.req.body.approvalSession = sessions.issue('approval', { restaurantId: 'restaurant-a', deviceId: 'terminal-a', staffId: 'staff-a', role: 'role-manager', name: 'Manager' }).token;
    await expect(f.guard.canActivate(f.context)).rejects.toThrow();
    f.req.body.approvalSession = token('role-manager', 'terminal-a', Date.now(), 'approval');
    f.req.body.amountPaise = 101; await expect(f.guard.canActivate(f.context)).rejects.toThrow();
    f.req.body.amountPaise = 100; f.req.params.paymentId = 'other-payment'; await expect(f.guard.canActivate(f.context)).rejects.toThrow();
    f.req.params.paymentId = 'payment-a'; f.req.body.idempotencyKey = 'other-refund-456'; await expect(f.guard.canActivate(f.context)).rejects.toThrow();
  });
});
