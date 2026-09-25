import { assertSessionStillAllowed } from '../../common/security/session-state';
import { randomBytes, createHash, randomInt, timingSafeEqual } from 'crypto';
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
import { hashOpaqueToken, generateOpaqueToken, hashLowEntropySecret, maskEmail } from '../../common/security/token.util';
import { CreateTenantStaffUserDto, TenantLoginDto, ActivateDeviceDto, LoginOwnerDto } from './dto/login.dto';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { AppCode } from '@prisma/client';
import { EmailService } from '../notifications/email.service';
import { passwordResetOtpEmail } from '../notifications/email-templates';
import { RestaurantsService } from '../restaurants/restaurants.service';

/** A restaurant with a single active branch has an obvious answer for which branch a new terminal belongs to. */
export async function onlyActiveBranchId(tx: { branch: { findMany: (args: any) => Promise<Array<{ id: string }>> } }, restaurantId: string): Promise<string | null> {
  const branches = await tx.branch.findMany({ where: { restaurantId, status: 'ACTIVE' }, select: { id: true }, take: 2 });
  return branches.length === 1 ? branches[0].id : null;
}

export const TENANT_JWT_ISSUER = 'jamanvaar-tenant';
export const TENANT_JWT_AUDIENCE = 'jamanvaar-tenant';

export interface TenantAccessTokenPayload {
  sub: string; // User.id
  restaurantId: string;
  email: string;
  impersonatedBy?: string; // PlatformUser.id — set only on a support-issued impersonation token
  did?: string; // Device.id - the terminal this session was created on (revoking it ends the session)
}

export interface TenantLoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Pick<User, 'id' | 'restaurantId' | 'branchId' | 'email' | 'fullName' | 'role' | 'status'>;
}

/**
 * What a terminal learns about its restaurant when it signs in (BUG-158): the real name and the legal details the
 * platform holds. Without them a new restaurant's Restaurant Admin kept showing the demo install's GSTIN, address
 * and phone, which could be printed on a legal tax invoice.
 */
export interface RestaurantProfile {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export function restaurantProfile(r: RestaurantProfile): RestaurantProfile {
  return { id: r.id, name: r.name, legalName: r.legalName ?? null, gstin: r.gstin ?? null, fssaiNumber: r.fssaiNumber ?? null, address: r.address ?? null, city: r.city ?? null, state: r.state ?? null };
}

/** RestaurantProfile plus the two fields authenticateAndRespond checks before minting a session — not part of the public profile shape any response returns. */
interface RestaurantAuthCheck extends RestaurantProfile {
  status: string;
  deletedAt: Date | null;
}

export interface TenantLoginSuccess {
  status: 'LOGIN_SUCCESS';
  requiresActivation: false;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: TenantLoginResult['user'];
  restaurant: RestaurantProfile;
  deviceId?: string;
  deviceToken?: string;
}

export interface TenantActivationRequired {
  status: 'ACTIVATION_REQUIRED';
  requiresActivation: true;
  activationSessionToken: string;
  restaurant: RestaurantProfile;
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
    private readonly appEntitlements: ApplicationEntitlementsService,
    private readonly email: EmailService,
    private readonly restaurants: RestaurantsService
  ) {}

  private signAccessToken(user: User, deviceId?: string): string {
    const payload: TenantAccessTokenPayload = {
      sub: user.id,
      restaurantId: user.restaurantId,
      email: user.email,
      ...(deviceId ? { did: deviceId } : {})
    };
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

  private async issueRefreshToken(userId: string, restaurantId: string, deviceId?: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.tenantRefreshToken.create({
        data: { userId, restaurantId, tokenHash: hashRefreshToken(token), expiresAt, deviceId }
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
    const { email, password, restaurantId } = dto;

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
            select: { id: true, name: true, status: true, deletedAt: true, legalName: true, gstin: true, fssaiNumber: true, address: true, city: true, state: true }
          }
        }
      });
    });

    return this.authenticateAndRespond(candidates, password, {
      deviceId: dto.deviceId,
      deviceToken: dto.deviceToken,
      deviceType: dto.deviceType,
      appVersion: dto.appVersion,
      adminOnly: dto.adminOnly
    });
  }

  /**
   * The shared core of every tenant login entry point (email-based `login()` and, from
   * Phase 3, owner-only restaurant-code `loginOwner()`): given an already-resolved list of
   * candidate users, checks the password against each (respecting per-account lockout),
   * then runs the same device-activation branching (Case 1/2/3) and audit logging either
   * entry point relies on. `candidates` may be a one-element list (owner-only login) or
   * several (email login across a shared email address) — the logic is identical either way.
   */
  private async authenticateAndRespond(
    candidates: Array<User & { restaurant: RestaurantAuthCheck }>,
    password: string,
    opts: { deviceId?: string; deviceToken?: string; deviceType?: string; appVersion?: string; adminOnly?: boolean }
  ): Promise<TenantAuthResponse> {
    const { deviceId, deviceToken, deviceType, appVersion } = opts;
    const now = new Date();
    let matchedUser: (typeof candidates)[0] | null = null;
    let sawLockedCandidate = false;
    const triedButWrong: (typeof candidates)[0][] = [];
    for (const cand of candidates) {
      if (!cand.passwordHash) continue;
      if (cand.lockedUntil && cand.lockedUntil > now) {
        // Locked — don't spend a bcrypt compare on it, and it can't match while locked anyway.
        sawLockedCandidate = true;
        continue;
      }
      if (await bcrypt.compare(password, cand.passwordHash)) {
        matchedUser = cand;
        break;
      }
      triedButWrong.push(cand);
    }

    if (!matchedUser || matchedUser.status !== TenantUserStatus.ACTIVE) {
      // B2-030: every candidate whose password was actually checked and was wrong gets its
      // counter bumped; enough in a row locks that account regardless of IP or how the
      // attempts were spread out.
      for (const cand of triedButWrong) {
        const attempts = cand.failedLoginAttempts + 1;
        const locked = attempts >= TenantAuthService.LOGIN_MAX_ATTEMPTS;
        await this.prisma.runAsPlatform((tx) =>
          tx.user.update({
            where: { id: cand.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: locked ? new Date(now.getTime() + TenantAuthService.LOGIN_LOCKOUT_MINUTES * 60_000) : cand.lockedUntil
            }
          })
        );
      }
      if (sawLockedCandidate || triedButWrong.some((c) => c.failedLoginAttempts + 1 >= TenantAuthService.LOGIN_MAX_ATTEMPTS)) {
        throw new UnauthorizedException(`Too many failed attempts. Try again in ${TenantAuthService.LOGIN_LOCKOUT_MINUTES} minutes.`);
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (matchedUser.failedLoginAttempts > 0 || matchedUser.lockedUntil) {
      await this.prisma.runAsPlatform((tx) =>
        tx.user.update({ where: { id: matchedUser!.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
      );
    }

    if (matchedUser.restaurant.status !== 'ACTIVE' || matchedUser.restaurant.deletedAt !== null) {
      throw new ForbiddenException('Restaurant account is suspended or archived. Please contact Super Admin.');
    }

    // security-audit HIGH-04: `dto.adminOnly` is client-supplied and was the ONLY thing
    // gating this — pos-admin's own client never sent it, so any tenant role (including
    // STAFF) got a full admin-console session. POS_ADMIN and KIOSK_ADMIN are the two
    // device types with a real staff/PIN/billing/backup admin console behind them, so
    // the OWNER/MANAGER requirement is now enforced server-side for those device types
    // unconditionally — the client can no longer opt out of it by omitting the flag.
    const isAdminConsoleDevice = deviceType === 'POS_ADMIN' || deviceType === 'KIOSK_ADMIN';
    if ((opts.adminOnly || isAdminConsoleDevice) && matchedUser.role !== 'OWNER' && matchedUser.role !== 'MANAGER') {
      throw new ForbiddenException('This login is restricted to restaurant owners and managers.');
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

      // security-audit MED-13: the old `else { isDeviceActive = true }` branch trusted
      // `deviceId` alone whenever `deviceToken` was omitted (or the device row somehow
      // had no stored hash) — a caller who merely knew an EXISTING device's id (device
      // ids are not secret; they're visible in Super Admin's fleet list and API
      // responses) could bind a session to that device's identity (the `did` JWT claim,
      // trusted by audit trails and by `assertSessionStillAllowed`/`DeviceAuthGuard`
      // downstream) without ever proving possession of its actual bearer token. A
      // session may only claim an existing device's identity by presenting a token that
      // hashes to that device's stored hash — no token, or a device row with no hash
      // yet, both fall through to the ACTIVATION_REQUIRED path below instead.
      if (activeDevice && deviceToken && activeDevice.deviceTokenHash && hashOpaqueToken(deviceToken) === activeDevice.deviceTokenHash) {
        isDeviceActive = true;
      }
    }

    // If a device type or deviceId was passed (e.g. from POS, pos-admin, captain, kds):
    const isDeviceFlow = Boolean(deviceType || deviceId);

    // Case 1: Device is registered and active -> LOGIN_SUCCESS
    if (isDeviceActive && activeDevice) {
      const accessToken = this.signAccessToken(matchedUser, activeDevice.id);
      const { token: refreshToken, expiresAt } = await this.issueRefreshToken(matchedUser.id, matchedUser.restaurantId, activeDevice.id);

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
        restaurant: restaurantProfile(matchedUser.restaurant),
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
        restaurant: restaurantProfile(matchedUser.restaurant),
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
      restaurant: restaurantProfile(matchedUser.restaurant)
    };
  }

  /**
   * Owner-only restaurant-code login (spec section 5/33): no email, just the restaurant's
   * customer-facing ID + the owner's password. Delegates to the exact same
   * authenticateAndRespond core as email-login — lockout, device-activation branching and
   * audit logging are all identical, applied to a one-candidate list instead of an
   * email-matched one.
   */
  async loginOwner(dto: LoginOwnerDto): Promise<TenantAuthResponse> {
    const restaurantId = dto.restaurantId ?? (await this.restaurants.resolveByCode(dto.restaurantCode!)).restaurantId;

    const candidates = await this.prisma.runAsPlatform((tx) =>
      tx.user.findMany({
        where: { restaurantId, role: 'OWNER', status: { not: TenantUserStatus.DISABLED } },
        include: {
          restaurant: {
            select: { id: true, name: true, status: true, deletedAt: true, legalName: true, gstin: true, fssaiNumber: true, address: true, city: true, state: true }
          }
        }
      })
    );

    return this.authenticateAndRespond(candidates, dto.password, {
      deviceId: dto.deviceId,
      deviceToken: dto.deviceToken,
      deviceType: dto.deviceType,
      appVersion: dto.appVersion
    });
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

      // security-audit MED-02: this path claims the key with a plain `findUnique` +
      // later `update`, same as activation-keys.service.ts's `redeem` had — a race
      // window where two concurrent calls both see `status === 'ACTIVE'` and both
      // create a device from the same key. Claimed atomically here, before any device
      // is created, mirroring the fix there (see its comment for why `updateMany` with
      // a `status` guard is safe under Postgres's READ COMMITTED).
      const claimed = await tx.activationKey.updateMany({
        where: { id: key.id, status: 'ACTIVE' },
        data: { status: 'REDEEMED', redeemedAt: new Date() }
      });
      if (claimed.count === 0) {
        throw new ConflictException('This activation key has already been redeemed.');
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

      // security-audit MED-02 (F-013) / Phase 2: per-app quota, not one global cap shared
      // across every device type and every subscription the restaurant holds (see
      // ApplicationEntitlementsService.assertDeviceQuotaAvailable's doc comment).
      await this.appEntitlements.assertDeviceQuotaAvailable(tx, key.restaurantId, dto.deviceType as AppCode);

      const deviceToken = generateOpaqueToken();

      // Create or activate the device record
      // The terminal belongs to the branch its key was issued for, and carries the name the key was given
      // (BUG-155): this path used to leave both empty, so Restaurant Admin, Captain and Kiosk Admin showed as
      // "Unnamed terminal" with "No branch assigned", and a deactivated branch could never lock them.
      const branchId = key.branchId ?? (await onlyActiveBranchId(tx, key.restaurantId));
      const device = await tx.device.create({
        data: {
          restaurantId: key.restaurantId,
          type: dto.deviceType,
          appVersion: dto.appVersion,
          branchId,
          name: key.label ?? dto.deviceName ?? null,
          status: 'ACTIVE',
          activatedAt: new Date(),
          lastSeenAt: new Date(),
          deviceTokenHash: hashOpaqueToken(deviceToken)
        }
      });

      // status/redeemedAt were already set atomically by the claim above; only the
      // device id (unknown until now) is filled in here.
      await tx.activationKey.update({
        where: { id: key.id },
        data: { redeemedByDeviceId: device.id }
      });

      const user = await tx.user.findUnique({
        where: { id: decoded.sub }
      });
      if (!user) throw new NotFoundException('User account not found');

      const accessToken = this.signAccessToken(user, device.id);
      const token = randomBytes(48).toString('base64url');
      const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

      await tx.tenantRefreshToken.create({
        data: {
          userId: user.id,
          restaurantId: user.restaurantId,
          tokenHash: hashRefreshToken(token),
          expiresAt,
          deviceId: device.id
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
        restaurant: restaurantProfile(key.restaurant),
        deviceId: device.id,
        deviceToken
      };
    });
  }

  /** See common/security/session-state.ts - shared with the request guard. */
  async assertSessionStillAllowed(restaurantId: string, deviceId?: string): Promise<void> {
    return assertSessionStillAllowed(this.prisma, restaurantId, deviceId);
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

    // A session must not outlive the state that allowed it: the restaurant, its
    // subscription and the device it was created on are re-checked on every refresh.
    await this.assertSessionStillAllowed(user.restaurantId, existing.deviceId ?? undefined);

    const accessToken = this.signAccessToken(user, existing.deviceId ?? undefined);
    const { token: newRefreshToken, expiresAt } = await this.issueRefreshToken(user.id, user.restaurantId, existing.deviceId ?? undefined);

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
   *
   * Phase 2: a restaurant may hold more than one active subscription at once (one per
   * product family). Every top-level field here describes the RESTAURANT-family subscription
   * specifically (or, absent one, whichever is most recent) — unchanged in shape and value
   * from before this phase, so a restaurant with only ever one subscription sees
   * byte-identical output. `subscriptions` and `effectiveEntitlements` are new and additive,
   * for callers that need the full multi-subscription picture.
   */
  async getEntitlements(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const subscriptions = await tx.subscription.findMany({
        where: {
          restaurantId,
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: { gt: new Date() }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      if (subscriptions.length === 0) {
        return {
          subscriptionStatus: null, expiresAt: null, planName: null, planTier: null, entitlements: null, limits: null,
          subscriptions: [], effectiveEntitlements: {}
        };
      }

      const primary = subscriptions.find((s) => s.plan.productFamily === 'RESTAURANT') ?? subscriptions[0];

      const effectiveEntitlements: Record<string, boolean> = {};
      for (const sub of subscriptions) {
        const flags = (sub.plan.entitlements as Record<string, boolean>) ?? {};
        for (const [key, value] of Object.entries(flags)) {
          effectiveEntitlements[key] = effectiveEntitlements[key] || value;
        }
      }

      return {
        subscriptionStatus: primary.status,
        // When the current subscription ends (BUG-158: a console showed a made-up "valid until" date).
        expiresAt: primary.expiresAt,
        planName: primary.plan.name,
        planTier: primary.plan.tier,
        entitlements: primary.plan.entitlements,
        limits: {
          maxBranches: primary.plan.maxBranches,
          maxDevices: primary.plan.maxDevices,
          maxUsers: primary.plan.maxUsers
        },
        subscriptions: subscriptions.map((s) => ({
          subscriptionId: s.id,
          productFamily: s.plan.productFamily,
          planName: s.plan.name,
          planTier: s.plan.tier,
          status: s.status,
          expiresAt: s.expiresAt,
          entitlements: s.plan.entitlements,
          limits: { maxBranches: s.plan.maxBranches, maxDevices: s.plan.maxDevices, maxUsers: s.plan.maxUsers }
        })),
        effectiveEntitlements
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

  /** How long a reset code works, how many wrong guesses it survives, and the wait before another can be requested. */
  private static readonly RESET_CODE_MINUTES = 15;
  private static readonly RESET_MAX_ATTEMPTS = 5;
  private static readonly RESET_RESEND_SECONDS = 60;

  /**
   * B2-030: per-account login lockout. Independent of the global per-IP throttle (which stays
   * as a separate defense against request-flooding, not credential guessing) — a wrong password
   * increments this account's own counter, and 10 in a row locks it for 15 minutes, no matter
   * which IP(s) the attempts came from. This is what actually stops a guesser; the IP throttle
   * alone let 25+ wrong passwords through in a row and, worse, could lock the real owner out
   * once an attacker's flood tripped it.
   */
  private static readonly LOGIN_MAX_ATTEMPTS = 10;
  private static readonly LOGIN_LOCKOUT_MINUTES = 15;

  /**
   * "Forgot password" step 1 (BUG-142). Emails a 6-digit one-time code to an active user. It always answers the
   * same way, whether or not the address belongs to a user, so it cannot be used to find out who has an account.
   * Only a hash of the code is stored; asking again within a minute is ignored.
   */
  async requestPasswordReset(restaurantId: string, email: string): Promise<void> {
    const found = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { restaurantId, email } });
      if (!user || user.status !== TenantUserStatus.ACTIVE || !user.passwordHash) return null;
      const now = new Date();
      if (user.passwordResetSentAt && now.getTime() - user.passwordResetSentAt.getTime() < TenantAuthService.RESET_RESEND_SECONDS * 1000) return null;

      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.user.update({
        where: { id: user.id },
        data: {
          // security-audit HIGH-01: HMAC-keyed, not a bare hash — see hashLowEntropySecret's doc comment.
          passwordResetHash: hashLowEntropySecret(otp, this.config.get<string>('JWT_ACCESS_SECRET')!),
          passwordResetExpiresAt: new Date(now.getTime() + TenantAuthService.RESET_CODE_MINUTES * 60_000),
          passwordResetSentAt: now,
          passwordResetAttempts: 0
        }
      });
      await this.audit.log(
        { actorType: 'TENANT', actorId: user.id, restaurantId, action: 'TENANT_PASSWORD_RESET_REQUESTED', category: 'AUTH', details: { email: user.email } },
        tx
      );
      return { user, otp };
    });
    if (!found) return;

    // B2-047: this used to `await` the SMTP round trip inside the request — 5.1s for a real
    // account (mail actually sent) vs 0.01s for one that doesn't exist (nothing to send),
    // a ~400x timing difference that let an attacker enumerate every valid email at a
    // restaurant just by timing requests, despite both paths returning the identical generic
    // message. Firing the send without awaiting it means both paths now return as soon as the
    // (comparably fast) database write finishes, regardless of how slow the mail server is.
    const mail = passwordResetOtpEmail({ fullName: found.user.fullName, otp: found.otp, minutesValid: TenantAuthService.RESET_CODE_MINUTES });
    void this.email.send(found.user.email, mail.subject, mail.html).catch(() => {
      // A mail server problem must not reveal anything to the caller; the code simply never arrives and they can ask again.
    });
  }

  /**
   * "Forgot password" step 2 (BUG-142): the code plus a new password. A wrong, expired or already-used code all
   * get the same answer; after too many wrong guesses the code is dropped and a new one must be requested. A
   * successful reset signs the user out everywhere.
   */
  async resetPassword(restaurantId: string, email: string, otp: string, newPassword: string): Promise<void> {
    // The wrong-guess count and the dropped code must be saved even though the request fails, so the checks run in
    // a transaction that returns the outcome, and the refusal is thrown only after it has committed.
    const outcome = await this.prisma.runAsTenant(restaurantId, async (tx): Promise<'ok' | 'invalid'> => {
      const user = await tx.user.findFirst({ where: { restaurantId, email } });
      if (!user || user.status !== TenantUserStatus.ACTIVE || !user.passwordResetHash || !user.passwordResetExpiresAt) return 'invalid';
      if (user.passwordResetExpiresAt < new Date() || user.passwordResetAttempts >= TenantAuthService.RESET_MAX_ATTEMPTS) {
        await tx.user.update({ where: { id: user.id }, data: { passwordResetHash: null, passwordResetExpiresAt: null } });
        return 'invalid';
      }

      const given = Buffer.from(hashLowEntropySecret(otp, this.config.get<string>('JWT_ACCESS_SECRET')!));
      const stored = Buffer.from(user.passwordResetHash);
      if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
        await tx.user.update({ where: { id: user.id }, data: { passwordResetAttempts: { increment: 1 } } });
        return 'invalid';
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          passwordResetHash: null,
          passwordResetExpiresAt: null,
          passwordResetAttempts: 0
        }
      });
      // Whoever knew the old password (or had a stolen session) is signed out.
      await tx.tenantRefreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(
        { actorType: 'TENANT', actorId: user.id, restaurantId, action: 'TENANT_PASSWORD_RESET', category: 'AUTH', details: { email: user.email } },
        tx
      );
      return 'ok';
    });
    if (outcome !== 'ok') throw new BadRequestException('That code is not valid or has expired. Ask for a new one.');
  }

  /**
   * Restaurant-code forgot-password, step 1 (spec section 6/34): resolves the code to the
   * restaurant's OWNER, masks their email for display (matching the UI's "OTP sent to
   * o***@example.com"), and reuses requestPasswordReset unmodified — every existing security
   * property (expiry, attempt limit, resend cooldown, HMAC hash, silent no-op for an
   * unactivated owner) carries over by construction, not by re-implementation.
   */
  async forgotPasswordOwner(restaurantCode: string): Promise<{ success: true; maskedEmail: string }> {
    const { restaurantId } = await this.restaurants.resolveByCode(restaurantCode);
    const owner = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, role: 'OWNER' } })
    );
    if (!owner) throw new NotFoundException('Restaurant not found');

    await this.requestPasswordReset(restaurantId, owner.email);
    return { success: true, maskedEmail: maskEmail(owner.email) };
  }

  /** Restaurant-code forgot-password, step 2: the emailed code and the new password. */
  async resetPasswordOwner(restaurantCode: string, otp: string, newPassword: string): Promise<void> {
    const { restaurantId } = await this.restaurants.resolveByCode(restaurantCode);
    const owner = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.user.findFirst({ where: { restaurantId, role: 'OWNER' } })
    );
    if (!owner) throw new NotFoundException('Restaurant not found');

    await this.resetPassword(restaurantId, owner.email, otp, newPassword);
  }
}
