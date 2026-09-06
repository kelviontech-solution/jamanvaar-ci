import { randomBytes, createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, TenantUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashOpaqueToken } from '../../common/security/token.util';
import { CreateTenantStaffUserDto } from './dto/login.dto';

export const TENANT_JWT_ISSUER = 'jamanvaar-tenant';
export const TENANT_JWT_AUDIENCE = 'jamanvaar-tenant';

export interface TenantAccessTokenPayload {
  sub: string; // User.id
  restaurantId: string;
  email: string;
  impersonatedBy?: string; // PlatformUser.id — set only on a support-issued impersonation token
}

export interface TenantLoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Pick<User, 'id' | 'restaurantId' | 'branchId' | 'email' | 'fullName' | 'role' | 'status'>;
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user: User): TenantLoginResult['user'] {
  return {
    id: user.id,
    restaurantId: user.restaurantId,
    branchId: user.branchId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status
  };
}

@Injectable()
export class TenantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private signAccessToken(user: User): string {
    const payload: TenantAccessTokenPayload = { sub: user.id, restaurantId: user.restaurantId, email: user.email };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      issuer: TENANT_JWT_ISSUER,
      audience: TENANT_JWT_AUDIENCE,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'
    });
  }

  /**
   * Support-issued impersonation token — a real, valid tenant access token
   * for the restaurant's OWNER, scoped to 15 minutes and stamped with
   * `impersonatedBy` so it's distinguishable from an ordinary login if
   * decoded later. No refresh token is issued: once it expires, the support
   * agent must re-request (and re-justify) another one. Callers (the
   * support/platform-side endpoint) are responsible for the audit log entry
   * and the actor-role check — this method only knows how to mint the token
   * once a caller has already decided it's authorized.
   */
  async impersonateOwner(restaurantId: string, impersonatingPlatformUserId: string): Promise<{ accessToken: string; expiresAt: Date; owner: TenantLoginResult['user'] }> {
    const owner = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, role: 'OWNER', status: TenantUserStatus.ACTIVE } })
    );
    if (!owner) throw new NotFoundException('No active owner account found for this restaurant');

    const ttlSeconds = 15 * 60;
    const payload: TenantAccessTokenPayload = {
      sub: owner.id,
      restaurantId: owner.restaurantId,
      email: owner.email,
      impersonatedBy: impersonatingPlatformUserId
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      issuer: TENANT_JWT_ISSUER,
      audience: TENANT_JWT_AUDIENCE,
      expiresIn: ttlSeconds
    });

    return {
      accessToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      owner: publicUser(owner)
    };
  }

  private async issueRefreshToken(userId: string, restaurantId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.tenantRefreshToken.create({
        data: { userId, restaurantId, tokenHash: hashRefreshToken(token), expiresAt }
      })
    );

    return { token, expiresAt };
  }

  /**
   * One-time bootstrap for a PENDING_ACTIVATION user (passwordHash is null until this runs).
   * SEC-001 fix: requires the invitation token minted by RestaurantsService.createRestaurant —
   * restaurantId + email alone are not a credential (a restaurant ID is effectively public,
   * discoverable from the Super Admin restaurant list). The comparison is against a stored
   * hash, never the plaintext, and the token is single-use and time-limited.
   */
  async setInitialPassword(
    restaurantId: string,
    email: string,
    activationToken: string,
    newPassword: string
  ): Promise<void> {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { restaurantId, email } });
      if (!user) throw new NotFoundException('User not found');
      if (user.passwordHash !== null) {
        throw new ConflictException('Password already set — use login, not initial setup');
      }
      if (!user.activationTokenHash || !user.activationTokenExpiresAt) {
        throw new UnauthorizedException('No pending invitation for this account — ask Super Admin to re-invite');
      }
      if (user.activationTokenExpiresAt < new Date()) {
        throw new GoneException('Invitation link has expired — ask Super Admin to re-invite');
      }
      if (hashOpaqueToken(activationToken) !== user.activationTokenHash) {
        throw new UnauthorizedException('Invalid invitation token');
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          status: TenantUserStatus.ACTIVE,
          activatedAt: new Date(),
          activationTokenHash: null,
          activationTokenExpiresAt: null
        }
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId,
          action: 'TENANT_USER_ACTIVATED',
          category: 'AUTH',
          details: { email: user.email }
        },
        tx
      );
    });
  }

  /** Never throws differently for unknown-user/wrong-password/pending-activation — response is uniform. */
  async login(restaurantId: string, email: string, password: string): Promise<TenantLoginResult> {
    const user = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, email } })
    );

    const passwordHash = user?.passwordHash ?? '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q8T6b8f1Q8T6b8f1Q8T6b8f1Q8T6b';
    const passwordOk = await bcrypt.compare(password, passwordHash);

    if (!user || !user.passwordHash || !passwordOk || user.status !== TenantUserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = this.signAccessToken(user);
    const { token: refreshToken, expiresAt } = await this.issueRefreshToken(user.id, user.restaurantId);

    await this.audit.log({
      actorType: 'TENANT',
      actorId: user.id,
      restaurantId,
      action: 'TENANT_LOGIN',
      category: 'AUTH',
      details: { email: user.email }
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: publicUser(user)
    };
  }

  /** Rotates the refresh token — the old one is consumed even if reused later (replay is rejected). */
  async refresh(refreshToken: string): Promise<TenantLoginResult> {
    const tokenHash = hashRefreshToken(refreshToken);

    // The restaurantId isn't known yet at this point, so this one lookup runs
    // as platform context (read-only, immediately re-scoped to the token's own
    // restaurantId for every subsequent operation in this method).
    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.tenantRefreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
    );

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = existing.user;

    await this.prisma.runAsTenant(user.restaurantId, (tx) =>
      tx.tenantRefreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } })
    );

    if (user.status !== TenantUserStatus.ACTIVE) {
      throw new UnauthorizedException('Account disabled');
    }

    const accessToken = this.signAccessToken(user);
    const { token: newRefreshToken, expiresAt } = await this.issueRefreshToken(user.id, user.restaurantId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: publicUser(user)
    };
  }

  async logout(refreshToken: string, restaurantId: string, actorId?: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.tenantRefreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
    );

    await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: 'TENANT_LOGOUT', category: 'AUTH' });
  }

  /**
   * The restaurant's active-subscription plan entitlements + limits — the one real
   * entitlement-check endpoint (see docs/architecture/super-admin-architecture.md §I.4).
   * Returns entitlements: null (not an error) when there's no ACTIVE/TRIAL subscription;
   * callers should treat that as "nothing entitled" rather than crash.
   */
  async getEntitlements(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: {
          restaurantId,
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: { gt: new Date() }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) {
        return { subscriptionStatus: null, planName: null, planTier: null, entitlements: null, limits: null };
      }

      return {
        subscriptionStatus: subscription.status,
        planName: subscription.plan.name,
        planTier: subscription.plan.tier,
        entitlements: subscription.plan.entitlements,
        limits: {
          maxBranches: subscription.plan.maxBranches,
          maxDevices: subscription.plan.maxDevices,
          maxUsers: subscription.plan.maxUsers
        }
      };
    });
  }

  private static readonly USER_LIST_SELECT = {
    id: true,
    restaurantId: true,
    email: true,
    fullName: true,
    role: true,
    status: true,
    phone: true,
    invitedAt: true,
    activatedAt: true,
    createdAt: true
  } as const;

  /** Every login this restaurant has — the owner Super Admin created plus any
   * staff/device logins the owner has since generated (see createStaffUser). */
  async listUsers(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'asc' },
        select: TenantAuthService.USER_LIST_SELECT
      })
    );
  }

  /**
   * OWNER-only self-service login creation for other apps/devices (Captain,
   * etc.) — deliberately sets the password immediately rather than routing
   * through the invitation-token dance in setInitialPassword above: the owner
   * is choosing the credential and handing it to a device/staff member
   * directly, the same "set now" shape Super Admin's onboarding already uses.
   */
  async createStaffUser(actor: User, dto: CreateTenantStaffUserDto) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the restaurant owner can create additional logins');
    }

    return this.prisma.runAsTenant(actor.restaurantId, async (tx) => {
      const [userCount, activeSub] = await Promise.all([
        tx.user.count({ where: { restaurantId: actor.restaurantId } }),
        tx.subscription.findFirst({
          where: { restaurantId: actor.restaurantId, status: { in: ['TRIAL', 'ACTIVE'] } },
          include: { plan: true },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      if (activeSub && userCount >= activeSub.plan.maxUsers) {
        throw new ConflictException(`User limit reached: ${activeSub.plan.name} allows up to ${activeSub.plan.maxUsers} login(s)`);
      }

      const existing = await tx.user.findFirst({ where: { restaurantId: actor.restaurantId, email: dto.email } });
      if (existing) {
        throw new ConflictException('A login with this email already exists for this restaurant');
      }

      const created = await tx.user.create({
        data: {
          restaurantId: actor.restaurantId,
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone,
          role: dto.role,
          status: TenantUserStatus.ACTIVE,
          passwordHash: await bcrypt.hash(dto.password, 10),
          activatedAt: new Date()
        },
        select: TenantAuthService.USER_LIST_SELECT
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: actor.id,
          restaurantId: actor.restaurantId,
          action: 'TENANT_STAFF_USER_CREATED',
          category: 'AUTH',
          details: { userId: created.id, email: created.email, role: created.role }
        },
        tx
      );

      return created;
    });
  }

  /** OWNER-only — disable or re-enable a login this restaurant issued. Cannot target the owner's own account. */
  async setUserStatus(actor: User, userId: string, status: 'ACTIVE' | 'DISABLED') {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('Only the restaurant owner can manage other logins');
    }
    if (userId === actor.id) {
      throw new BadRequestException('Cannot change the status of your own account here');
    }

    return this.prisma.runAsTenant(actor.restaurantId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id: userId, restaurantId: actor.restaurantId } });
      if (!target) throw new NotFoundException('Login not found');

      const updated = await tx.user.update({
        where: { id: userId },
        data: { status },
        select: TenantAuthService.USER_LIST_SELECT
      });

      if (status === 'DISABLED') {
        await tx.tenantRefreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: actor.id,
          restaurantId: actor.restaurantId,
          action: status === 'DISABLED' ? 'TENANT_STAFF_USER_DISABLED' : 'TENANT_STAFF_USER_REENABLED',
          category: 'AUTH',
          details: { userId }
        },
        tx
      );

      return updated;
    });
  }

  async changePassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
    if (!user.passwordHash) {
      throw new BadRequestException('No password set yet — use the initial activation step first');
    }
    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.prisma.runAsTenant(user.restaurantId, async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) }
      });

      // A password change should not leave old refresh tokens still valid.
      await tx.tenantRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: user.restaurantId,
          action: 'TENANT_PASSWORD_CHANGED',
          category: 'AUTH'
        },
        tx
      );
    });
  }
}
