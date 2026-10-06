import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSessionService } from '../entity-sync/staff-session.service';
import { MANAGER_ROLES } from '../entity-sync/entity-authority';
import { TENANT_JWT_AUDIENCE, TENANT_JWT_ISSUER, TenantAccessTokenPayload } from '../tenant-auth/tenant-auth.service';

/** Device signatures prove the machine; money refunds also require a currently authorized person. */
@Injectable()
export class RefundAuthorizationGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly sessions: StaffSessionService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { device: Device; refundActor?: string; refundActorId?: string }>();
    const device = req.device;
    if (!device) throw new ForbiddenException('Refund device authentication is required');
    const now = Date.now();
    const approval = this.sessions.verify(req.body?.approvalSession, device.restaurantId, device.id, 'approval', now);
    const scope = approval?.scope;
    const matchesRequest = scope?.action === 'REFUND' && scope.paymentId === req.params.paymentId && scope.amountPaise === req.body?.amountPaise && scope.idempotencyKey === req.body?.idempotencyKey;
    const evidence = [
      matchesRequest ? approval : null,
      this.sessions.verify(req.body?.staffSession, device.restaurantId, device.id, 'session', now)
    ].filter(c => c && c.exp > now && MANAGER_ROLES.includes(c.role));
    for (const claim of evidence) {
      if (!claim) continue;
      const row = await this.prisma.runAsTenant(device.restaurantId, tx => tx.syncedEntity.findFirst({ where: { restaurantId: device.restaurantId, entityType: 'STAFF_USER', externalId: claim.sid }, select: { payload: true } }));
      const staff = row?.payload as { isActive?: boolean; deleted?: boolean; roleId?: string; fullName?: string } | undefined;
      if (staff && staff.isActive !== false && !staff.deleted && staff.roleId === claim.role) {
        req.refundActor = staff.fullName || claim.name;
        req.refundActorId = claim.sid;
        return true;
      }
    }
    if (device.type === 'POS_ADMIN' || device.type === 'KIOSK_ADMIN') {
      const token = req.headers['x-owner-authorization'];
      if (typeof token === 'string') {
        let claims: TenantAccessTokenPayload | null = null;
        try { claims = await this.jwt.verifyAsync<TenantAccessTokenPayload>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), issuer: TENANT_JWT_ISSUER, audience: TENANT_JWT_AUDIENCE }); } catch { /* Deny invalid or expired owner proof. */ }
        if (claims && !claims.impersonatedBy && claims.restaurantId === device.restaurantId && claims.did === device.id) {
          const owner = await this.prisma.runAsTenant(device.restaurantId, tx => tx.user.findFirst({ where: { id: claims!.sub, restaurantId: device.restaurantId, status: 'ACTIVE' } }));
          if (owner && (owner.role === 'OWNER' || owner.role === 'MANAGER')) {
            req.refundActor = owner.fullName;
            req.refundActorId = owner.id;
            return true;
          }
        }
      }
    }
    throw new ForbiddenException({ code: 'REFUND_APPROVAL_REQUIRED', message: 'A verified manager approval or current owner sign-in is required to refund a payment.' });
  }
}
