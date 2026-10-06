import { permissionsForRole, PlatformRoleName } from '../../common/rbac/access';
import { randomBytes, randomUUID, randomInt, createHash, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '../../common/security/password-cost';
import { PlatformUser, PlatformUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { platformLoginOtpEmail } from '../notifications/email-templates';
import { hashLowEntropySecret, maskEmail } from '../../common/security/token.util';

export const PLATFORM_JWT_ISSUER = 'jamanvaar-platform';
export const PLATFORM_JWT_AUDIENCE = 'jamanvaar-platform';

export interface PlatformAccessTokenPayload {
  sub: string; // PlatformUser.id
  email: string;
  sid?: string; // session id (PlatformRefreshToken.sessionId) - lets the guard reject a revoked session at once
}

/** Who and what is signing in, recorded so a person can recognise their own sessions. */
export interface SessionContext {
  userAgent?: string | null;
  ip?: string | null;
  location?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Pick<PlatformUser, 'id' | 'email' | 'fullName' | 'status' | 'role'> & {
    /** area -> 'read' | 'write' for this role, so the web app can build its menu and buttons. */
    permissions: ReturnType<typeof permissionsForRole>;
  };
}

/** Returned by login() once the password has checked out — a session is only ever issued after verifyOtp(). */
export interface OtpChallenge {
  status: 'OTP_REQUIRED';
  otpToken: string;
  maskedEmail: string;
  expiresInSeconds: number;
}

const OTP_PURPOSE = 'PLATFORM_LOGIN_OTP';

interface OtpTokenPayload {
  sub: string; // PlatformUser.id
  purpose: typeof OTP_PURPOSE;
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}


@Injectable()
export class PlatformAuthService {
  /** How long a login OTP works, how many wrong guesses it survives, and the wait before another can be requested. */
  private static readonly OTP_MINUTES = 10;
  private static readonly OTP_MAX_ATTEMPTS = 5;
  private static readonly OTP_RESEND_SECONDS = 45;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService
  ) {}

  private signAccessToken(user: PlatformUser, sessionId: string): string {
    const payload: PlatformAccessTokenPayload = { sub: user.id, email: user.email, sid: sessionId };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      issuer: PLATFORM_JWT_ISSUER,
      audience: PLATFORM_JWT_AUDIENCE,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'
    });
  }

  /**
   * B2-030: per-account login lockout, same mechanism and thresholds as the tenant side
   * (TenantAuthService.LOGIN_MAX_ATTEMPTS/LOGIN_LOCKOUT_MINUTES) — 10 wrong passwords in a row
   * locks the account for 15 minutes, independent of the shared per-IP throttle. This is the
   * platform Super Admin / Ops account, so it gets the same protection as a restaurant owner's.
   */
  private static readonly LOGIN_MAX_ATTEMPTS = 10;
  private static readonly LOGIN_LOCKOUT_MINUTES = 15;

  private async issueRefreshToken(
    platformUserId: string,
    session: { sessionId: string; startedAt?: Date; userAgent?: string | null; ip?: string | null; location?: string | null },
    role?: string,
    transaction?: import('@prisma/client').Prisma.TransactionClient
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const normalTtl = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
    const privilegedTtl = Number(this.config.get<string>('PRIVILEGED_REFRESH_TTL_DAYS') ?? 7);
    const ttlDays = role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN' ? Math.min(normalTtl, privilegedTtl) : normalTtl;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await (transaction ?? this.prisma).platformRefreshToken.create({
      data: {
        platformUserId,
        tokenHash: hashRefreshToken(token),
        expiresAt,
        sessionId: session.sessionId,
        ...(session.startedAt ? { sessionStartedAt: session.startedAt } : {}),
        userAgent: session.userAgent?.slice(0, 400) ?? null,
        ip: session.ip ?? null,
        location: session.location ?? null
      }
    });

    return { token, expiresAt };
  }

  private signOtpToken(userId: string): string {
    const payload: OtpTokenPayload = { sub: userId, purpose: OTP_PURPOSE };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: `${PlatformAuthService.OTP_MINUTES}m`
    });
  }

  private verifyOtpToken(otpToken: string): OtpTokenPayload {
    let decoded: OtpTokenPayload;
    try {
      decoded = this.jwt.verify(otpToken, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
    } catch {
      throw new UnauthorizedException('Your sign-in session has expired. Please sign in again.');
    }
    if (decoded.purpose !== OTP_PURPOSE) {
      throw new UnauthorizedException('Invalid sign-in session');
    }
    return decoded;
  }

  /** Generates, stores (hashed) and emails a fresh 6-digit code, returning the challenge the client should hold onto. */
  private async issueOtp(user: PlatformUser): Promise<OtpChallenge> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: {
        loginOtpHash: hashLowEntropySecret(otp, this.config.get<string>('JWT_ACCESS_SECRET')!),
        loginOtpExpiresAt: new Date(now.getTime() + PlatformAuthService.OTP_MINUTES * 60_000),
        loginOtpSentAt: now,
        loginOtpAttempts: 0
      }
    });

    try {
      const mail = platformLoginOtpEmail({ fullName: user.fullName, otp, minutesValid: PlatformAuthService.OTP_MINUTES });
      await this.email.send(user.email, mail.subject, mail.html);
    } catch {
      // A mail server problem must not block sign-in from working once SMTP recovers; verifyOtp still checks the stored hash.
    }

    return {
      status: 'OTP_REQUIRED',
      otpToken: this.signOtpToken(user.id),
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: PlatformAuthService.OTP_MINUTES * 60
    };
  }

  /**
   * Step 1 of sign-in: verifies email + password only. On success, a 6-digit code is emailed to the
   * account's address and the caller gets back an opaque `otpToken` (no session yet) to pass to
   * verifyOtp(). Never throws on unknown-user/bad-password differently — timing/response are
   * identical either way.
   */
  async login(email: string, password: string): Promise<OtpChallenge> {
    const user = await this.prisma.platformUser.findUnique({ where: { email } });

    // Always run bcrypt.compare, even for a nonexistent user, against a fixed
    // dummy hash — keeps login response timing independent of whether the
    // email exists, so the endpoint can't be used to enumerate accounts.
    //
    // SEC-011: this used to also accept ANY password for
    // superadmin@jamanvaar.app whenever NODE_ENV !== 'production' (the zod
    // default in env.validation.ts, so it was the *unset* case, not an
    // opt-in), and would silently rewrite the stored hash to whatever had
    // just been typed. That is a full authentication bypass on the
    // platform's own super-admin account — anyone who knew the (documented,
    // hardcoded) email could log in with any string and permanently hijack
    // it. There is no environment where "accept any password for the most
    // privileged account" is the right behaviour; a developer who needs a
    // known local password sets one explicitly via
    // SEED_SUPER_ADMIN_PASSWORD / SEED_RESET_SUPER_ADMIN_PASSWORD on the
    // seed script (see prisma/seed.ts) instead.
    const passwordHash = user?.passwordHash ?? '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q8T6b8f1Q8T6b8f1Q8T6b8f1Q8T6b';
    const passwordOk = await bcrypt.compare(password, passwordHash);

    // B2-030: locked accounts still run the bcrypt compare above (timing stays identical to the
    // unknown-user/wrong-password cases — see this method's doc comment) but the result is
    // ignored; a locked account can't log in no matter what password is supplied.
    const now = new Date();
    const isLocked = Boolean(user?.lockedUntil && user.lockedUntil > now);

    if (!user || !passwordOk || user.status !== PlatformUserStatus.ACTIVE || isLocked) {
      if (user && user.passwordHash && !isLocked) {
        const attempts = user.failedLoginAttempts + 1;
        await this.prisma.platformUser.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            lockedUntil: attempts >= PlatformAuthService.LOGIN_MAX_ATTEMPTS
              ? new Date(now.getTime() + PlatformAuthService.LOGIN_LOCKOUT_MINUTES * 60_000)
              : user.lockedUntil
          }
        });
        await this.audit.log({ actorType: 'PLATFORM', actorId: user.id, action: attempts >= PlatformAuthService.LOGIN_MAX_ATTEMPTS ? 'PLATFORM_ACCOUNT_LOCKED' : 'PLATFORM_LOGIN_FAILED', category: 'AUTH', details: { attempts } });
      }
      // Deliberately the same generic message whether the account doesn't exist, the password
      // was wrong, or the account is locked — see this method's doc comment on enumeration.
      throw new UnauthorizedException('Invalid email or password');
    }

    // B2-030: a right password only gets here — it does not mean the login itself has
    // succeeded yet, since the OTP challenge below still has to be answered correctly. The
    // failedLoginAttempts/lockedUntil reset that used to happen right here now happens in
    // `verifyOtp()`, at the point the login actually completes.
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_LOGIN_OTP_SENT',
      category: 'AUTH',
      details: { email: user.email }
    });

    return this.issueOtp(user);
  }

  /**
   * "Resend code" — same 45s cooldown pattern as tenant password-reset, so a slow inbox can ask
   * again without spamming a new code (and invalidating the one already in flight) every second.
   */
  async resendOtp(otpToken: string): Promise<{ maskedEmail: string }> {
    const { sub } = this.verifyOtpToken(otpToken);
    const user = await this.prisma.platformUser.findUnique({ where: { id: sub } });
    if (!user || user.status !== PlatformUserStatus.ACTIVE) {
      throw new UnauthorizedException('Your sign-in session has expired. Please sign in again.');
    }
    const now = Date.now();
    if (user.loginOtpSentAt && now - user.loginOtpSentAt.getTime() < PlatformAuthService.OTP_RESEND_SECONDS * 1000) {
      return { maskedEmail: maskEmail(user.email) };
    }
    const challenge = await this.issueOtp(user);
    return { maskedEmail: challenge.maskedEmail };
  }

  /**
   * Step 2 of sign-in: the code from that email. A wrong, expired or already-used code all get the
   * same answer; after too many wrong guesses the code is dropped and a new one must be requested
   * (matches TenantAuthService.resetPassword's anti-bruteforce shape).
   */
  async verifyOtp(otpToken: string, otp: string, context: SessionContext = {}): Promise<LoginResult> {
    const { sub } = this.verifyOtpToken(otpToken);

    const outcome = await (async (): Promise<'ok' | 'invalid'> => {
      const user = await this.prisma.platformUser.findUnique({ where: { id: sub } });
      if (!user || user.status !== PlatformUserStatus.ACTIVE || !user.loginOtpHash || !user.loginOtpExpiresAt) return 'invalid';
      if (user.loginOtpExpiresAt < new Date() || user.loginOtpAttempts >= PlatformAuthService.OTP_MAX_ATTEMPTS) {
        await this.prisma.platformUser.update({ where: { id: user.id }, data: { loginOtpHash: null, loginOtpExpiresAt: null } });
        return 'invalid';
      }

      const given = Buffer.from(hashLowEntropySecret(otp, this.config.get<string>('JWT_ACCESS_SECRET')!));
      const stored = Buffer.from(user.loginOtpHash);
      if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
        await this.prisma.platformUser.update({ where: { id: user.id }, data: { loginOtpAttempts: { increment: 1 } } });
        return 'invalid';
      }

      // B2-030: this is the real "login succeeded" moment (password + OTP both correct) —
      // clear the failed-attempt counter and any lockout here, not after the password check
      // alone, since a right password with a wrong/expired OTP is not a completed login.
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: {
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpAttempts: 0,
          lastLoginAt: new Date(),
          ...(user.failedLoginAttempts > 0 || user.lockedUntil ? { failedLoginAttempts: 0, lockedUntil: null } : {})
        }
      });
      return 'ok';
    })();

    if (outcome !== 'ok') {
      throw new UnauthorizedException('That code is not valid or has expired. Ask for a new one.');
    }

    const user = await this.prisma.platformUser.findUniqueOrThrow({ where: { id: sub } });

    const sessionId = randomUUID();
    const accessToken = this.signAccessToken(user, sessionId);
    const { token: refreshToken, expiresAt } = await this.issueRefreshToken(user.id, { sessionId, ...context }, user.role);
    await this.enforceSessionCap(user.id, sessionId);

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_LOGIN',
      category: 'AUTH',
      details: { email: user.email }
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status, role: user.role, permissions: permissionsForRole(user.role as PlatformRoleName) }
    };
  }

  /** Rotates the refresh token — the old one is consumed even if reused later (replay is rejected). */
  async refresh(refreshToken: string, context: SessionContext = {}): Promise<LoginResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await this.prisma.platformRefreshToken.findUnique({
      where: { tokenHash },
      include: { platformUser: true }
    });

    if (!existing || existing.revokedAt || existing.terminatedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = existing.platformUser;
    if (user.status !== PlatformUserStatus.ACTIVE) throw new UnauthorizedException('Account disabled');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.platformRefreshToken.updateMany({
        where: { id: existing.id, revokedAt: null, terminatedAt: null }, data: { revokedAt: new Date() }
      });
      if (claimed.count !== 1) throw new UnauthorizedException('Invalid refresh token');
      const accessToken = this.signAccessToken(user, existing.sessionId);
      const { token: newRefreshToken, expiresAt } = await this.issueRefreshToken(user.id, {
        sessionId: existing.sessionId, startedAt: existing.sessionStartedAt,
        userAgent: existing.userAgent ?? context.userAgent, ip: context.ip ?? existing.ip,
        location: existing.location ?? context.location
      }, user.role, tx);
      return { accessToken, refreshToken: newRefreshToken, refreshTokenExpiresAt: expiresAt,
        user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status, role: user.role, permissions: permissionsForRole(user.role as PlatformRoleName) } };
    });
  }

  /** A sign-in beyond the cap ends the least recently used sessions, so old forgotten logins do not pile up. */
  private async enforceSessionCap(platformUserId: string, keepSessionId: string) {
    const cap = Number(this.config.get<string>('MAX_PLATFORM_SESSIONS') ?? 5);
    const live = await this.prisma.platformRefreshToken.findMany({
      where: { platformUserId, revokedAt: null, terminatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'asc' },
      select: { sessionId: true }
    });
    const excess = live.filter((s) => s.sessionId !== keepSessionId).slice(0, Math.max(0, live.length - cap));
    if (excess.length === 0) return;
    for (const s of excess) await this.terminateSessions({ sessionId: s.sessionId });
    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: platformUserId,
      action: 'PLATFORM_SESSION_LIMIT_REACHED',
      category: 'AUTH',
      details: { cap, ended: excess.length }
    });
  }

  async logout(refreshToken: string, actorId?: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    const row = await this.prisma.platformRefreshToken.findUnique({ where: { tokenHash }, select: { sessionId: true } });
    if (row) await this.terminateSessions({ sessionId: row.sessionId });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId,
      action: 'PLATFORM_LOGOUT',
      category: 'AUTH'
    });
  }

  /** Ends sessions on purpose: their renewal stops AND their access tokens are refused at once (see PlatformAuthGuard). */
  async terminateSessions(where: { sessionId?: string; platformUserId?: string; exceptSessionId?: string }): Promise<number> {
    const now = new Date();
    const result = await this.prisma.platformRefreshToken.updateMany({
      where: {
        terminatedAt: null,
        ...(where.sessionId ? { sessionId: where.sessionId } : {}),
        ...(where.platformUserId ? { platformUserId: where.platformUserId } : {}),
        ...(where.exceptSessionId ? { sessionId: { not: where.exceptSessionId } } : {})
      },
      data: { terminatedAt: now, revokedAt: now }
    });
    return result.count;
  }

  async changePassword(user: PlatformUser, currentPassword: string, newPassword: string, currentSessionId?: string): Promise<void> {
    if (!user.passwordHash) {
      throw new BadRequestException('Account has no password set yet — complete activation first');
    }
    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash!);
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST) }
    });

    // Sign out every OTHER session - a password change should not leave old
    // sessions (possibly the reason for the change) valid. The one you are using stays.
    await this.terminateSessions({ platformUserId: user.id, exceptSessionId: currentSessionId });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_PASSWORD_CHANGED',
      category: 'AUTH'
    });
  }
}
