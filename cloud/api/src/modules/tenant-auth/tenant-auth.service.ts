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
import { User, TenantUserStatus, Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashOpaqueToken, generateOpaqueToken } from '../../common/security/token.util';
import { CreateTenantStaffUserDto, TenantLoginDto, ActivateDeviceDto } from './dto/login.dto';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { AppCode } from '@prisma/client';

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

export interface TenantLoginSuccess {
  status: 'LOGIN_SUCCESS';
  requiresActivation: false;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: TenantLoginResult['user'];
  restaurant: { id: string; name: string };
  deviceId?: string;
  deviceToken?: string;
}

export interface TenantActivationRequired {
  status: 'ACTIVATION_REQUIRED';
  requiresActivation: true;
  activationSessionToken: string;
  restaurant: { id: string; name: string };
  user: { id: string; email: string; fullName: string };
  message: string;
}

export type TenantAuthResponse = TenantLoginSuccess | TenantActivationRequired;

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
    private readonly audit: AuditService,
    private readonly appEntitlements: ApplicationEntitlementsService
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

  /**
   * Universal Tenant / Restaurant Admin Login:
   * 1. Resolves tenant user by email and validates bcrypt password.
   * 2. Checks whether this physical device is already registered and ACTIVE.
   * 3. If registered and active -> returns LOGIN_SUCCESS with session tokens.
   * 4. If not registered/active -> returns ACTIVATION_REQUIRED with an activationSessionToken.
   */
  async login(dto: TenantLoginDto): Promise<TenantAuthResponse> {
    const { email, password, restaurantId, deviceId, deviceToken, deviceType, appVersion } = dto;

    // Look up user(s) matching this email across candidate tenants
    const candidates = await this.prisma.runAsPlatform(async (tx) => {
      return tx.user.findMany({
        where: {
          email,
          ...(restaurantId ? { restaurantId } : {}),
          status: { not: TenantUserStatus.DISABLED }
        },
        include: {
          restaurant: {
            select: { id: true, name: true, status: true, deletedAt: true }
          }
        }
      });
    });

    let matchedUser: (typeof candidates)[0] | null = null;
    for (const cand of candidates) {
      if (cand.passwordHash && (await bcrypt.compare(password, cand.passwordHash))) {
        matchedUser = cand;
        break;
      }
    }

    if (!matchedUser || !matchedUser.passwordHash || matchedUser.status !== TenantUserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (matchedUser.restaurant.status !== 'ACTIVE' || matchedUser.restaurant.deletedAt !== null) {
      throw new ForbiddenException('Restaurant account is suspended or archived. Please contact Super Admin.');
    }

    // Check device activation state
    let isDeviceActive = false;
    let activeDevice: { id: string; type: string; status: string; deviceTokenHash: string | null } | null = null;

    if (deviceId) {
      activeDevice = await this.prisma.runAsTenant(matchedUser.restaurantId, async (tx) => {
        return tx.device.findFirst({
          where: {
            id: deviceId,
            restaurantId: matchedUser.restaurantId,
            status: 'ACTIVE'
          },
          select: { id: true, type: true, status: true, deviceTokenHash: true }
        });
      });

      if (activeDevice) {
        if (deviceToken && activeDevice.deviceTokenHash) {
          if (hashOpaqueToken(deviceToken) === activeDevice.deviceTokenHash) {
            isDeviceActive = true;
          }
        } else {
          isDeviceActive = true;
        }
      }
    }

    // If a device type or deviceId was passed (e.g. from POS, pos-admin, captain, kds):
    const isDeviceFlow = Boolean(deviceType || deviceId);

    // Case 1: Device is registered and active -> LOGIN_SUCCESS
    if (isDeviceActive && activeDevice) {
      const accessToken = this.signAccessToken(matchedUser);
      const { token: refreshToken, expiresAt } = await this.issueRefreshToken(matchedUser.id, matchedUser.restaurantId);

      await this.prisma.runAsTenant(matchedUser.restaurantId, (tx) =>
        tx.device.update({
          where: { id: activeDevice.id },
          data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) }
        })
      );

      await this.audit.log({
        actorType: 'TENANT',
        actorId: matchedUser.id,
        restaurantId: matchedUser.restaurantId,
        action: 'TENANT_LOGIN',
        category: 'AUTH',
        details: { email: matchedUser.email, deviceId: activeDevice.id }
      });

      return {
        status: 'LOGIN_SUCCESS',
        requiresActivation: false,
        accessToken,
        refreshToken,
        refreshTokenExpiresAt: expiresAt,
        user: publicUser(matchedUser),
        restaurant: {
          id: matchedUser.restaurant.id,
          name: matchedUser.restaurant.name
        },
        deviceId: activeDevice.id
      };
    }

    // Case 2: First-time login on this terminal device -> ACTIVATION_REQUIRED
    if (isDeviceFlow) {
      const activationPayload = {
        sub: matchedUser.id,
        restaurantId: matchedUser.restaurantId,
        email: matchedUser.email,
        type: 'DEVICE_ACTIVATION'
      };
      const activationSessionToken = this.jwt.sign(activationPayload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m'
      });

      return {
        status: 'ACTIVATION_REQUIRED',
        requiresActivation: true,
        activationSessionToken,
        restaurant: {
          id: matchedUser.restaurant.id,
          name: matchedUser.restaurant.name
        },
        user: {
          id: matchedUser.id,
          email: matchedUser.email,
          fullName: matchedUser.fullName
        },
        message: 'First-time device activation required. Please enter the activation key from your Super Admin Welcome Kit.'
      };
    }

    // Case 3: Direct API / non-terminal login
    const accessToken = this.signAccessToken(matchedUser);
    const { token: refreshToken, expiresAt } = await this.issueRefreshToken(matchedUser.id, matchedUser.restaurantId);

    await this.audit.log({
      actorType: 'TENANT',
      actorId: matchedUser.id,
      restaurantId: matchedUser.restaurantId,
      action: 'TENANT_LOGIN',
      category: 'AUTH',
      details: { email: matchedUser.email, isDirectApi: true }
    });

    return {
      status: 'LOGIN_SUCCESS',
      requiresActivation: false,
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: publicUser(matchedUser),
      restaurant: {
        id: matchedUser.restaurant.id,
        name: matchedUser.restaurant.name
      }
    };
  }

  /**
   * Completes device onboarding when an activation key is entered.
   * Atomically validates the key, binds the device, and mints access credentials.
   */
  async activateDevice(dto: ActivateDeviceDto): Promise<TenantLoginSuccess & { deviceToken: string }> {
    let decoded: { sub: string; restaurantId: string; email: string; type: string };
    try {
      decoded = this.jwt.verify(dto.activationSessionToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET')
      });
    } catch {
      throw new UnauthorizedException('Activation session has expired or is invalid. Please sign in again.');
    }

    if (decoded.type !== 'DEVICE_ACTIVATION') {
      throw new UnauthorizedException('Invalid activation session');
    }

    return this.prisma.runAsPlatform(async (tx) => {
      const code = dto.activationKey.trim().toUpperCase();
      const key = await tx.activationKey.findUnique({
        where: { code },
        include: { restaurant: true }
      });

      if (!key) {
        throw new NotFoundException('Invalid activation key. Please verify the code.');
      }
      if (key.restaurantId !== decoded.restaurantId) {
        throw new BadRequestException('This activation key belongs to a different restaurant.');
      }
      if (key.status === 'REVOKED') {
        throw new GoneException('This activation key has been revoked by Super Admin.');
      }
      if (key.status === 'REDEEMED') {
        throw new ConflictException('This activation key has already been redeemed.');
      }
      if (key.status === 'EXPIRED' || key.expiresAt < new Date()) {
        throw new GoneException('This activation key has expired. Request a new key in Super Admin.');
      }

      // Check device compatibility (for POS_ADMIN management console, any valid key for this restaurant is accepted)
      const isCompatible =
        dto.deviceType === 'POS_ADMIN' ||
        key.allowedDeviceType === 'ANY' ||
        key.allowedDeviceType === (dto.deviceType as any);

      if (!isCompatible) {
        throw new BadRequestException(
          `This activation key is designated for ${key.allowedDeviceType} terminals, not ${dto.deviceType}.`
        );
      }

      // Same real gate as activation-keys.service.ts's generate()/redeem() —
      // this is a separate device-provisioning path (the tenant-auth
      // login -> ACTIVATION_REQUIRED -> activate-device flow used by the
      // Restaurant Admin / Kiosk Admin device-connect screens) and it was
      // the one place a device could be created without ever checking the
      // restaurant's application entitlements at all, POS_ADMIN's
      // compatibility bypass above notwithstanding — compatibility with a
      // specific key's allowedDeviceType and entitlement to the app itself
      // are two different questions.
      await this.appEntitlements.assertAppEnabled(tx, key.restaurantId, dto.deviceType as AppCode);

      const deviceToken = generateOpaqueToken();

      // Create or activate the device record
      const device = await tx.device.create({
        data: {
          restaurantId: key.restaurantId,
          type: dto.deviceType,
          appVersion: dto.appVersion,
          status: 'ACTIVE',
          activatedAt: new Date(),
          lastSeenAt: new Date(),
          deviceTokenHash: hashOpaqueToken(deviceToken)
        }
      });

      // Mark the key as redeemed
      await tx.activationKey.update({
        where: { id: key.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: new Date(),
          redeemedByDeviceId: device.id
        }
      });

      const user = await tx.user.findUnique({
        where: { id: decoded.sub }
      });
      if (!user) throw new NotFoundException('User account not found');

      const accessToken = this.signAccessToken(user);
      const token = randomBytes(48).toString('base64url');
      const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      await tx.tenantRefreshToken.create({
        data: {
          userId: user.id,
          restaurantId: user.restaurantId,
          tokenHash: hashRefreshToken(token),
          expiresAt
        }
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: user.restaurantId,
          action: 'DEVICE_ACTIVATED',
          category: 'ACTIVATION',
          details: {
            deviceId: device.id,
            deviceType: device.type,
            activationKeyId: key.id,
            email: user.email
          }
        },
        tx
      );

      return {
        status: 'LOGIN_SUCCESS',
        requiresActivation: false,
        accessToken,
        refreshToken: token,
        refreshTokenExpiresAt: expiresAt,
        user: publicUser(user),
        restaurant: {
          id: key.restaurant.id,
          name: key.restaurant.name
        },
        deviceId: device.id,
        deviceToken
      };
    });
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
