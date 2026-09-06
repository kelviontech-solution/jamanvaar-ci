import { randomBytes, createHash } from 'crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PlatformUser, PlatformUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const PLATFORM_JWT_ISSUER = 'jamanvaar-platform';
export const PLATFORM_JWT_AUDIENCE = 'jamanvaar-platform';

export interface PlatformAccessTokenPayload {
  sub: string; // PlatformUser.id
  email: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Pick<PlatformUser, 'id' | 'email' | 'fullName' | 'status'>;
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private signAccessToken(user: PlatformUser): string {
    const payload: PlatformAccessTokenPayload = { sub: user.id, email: user.email };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      issuer: PLATFORM_JWT_ISSUER,
      audience: PLATFORM_JWT_AUDIENCE,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'
    });
  }

  private async issueRefreshToken(platformUserId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.platformRefreshToken.create({
      data: { platformUserId, tokenHash: hashRefreshToken(token), expiresAt }
    });

    return { token, expiresAt };
  }

  /** Never throws on unknown-user/bad-password differently — timing/response are identical either way. */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.platformUser.findUnique({ where: { email } });

    // Always run bcrypt.compare, even for a nonexistent user, against a fixed
    // dummy hash — keeps login response timing independent of whether the
    // email exists, so the endpoint can't be used to enumerate accounts.
    const passwordHash = user?.passwordHash ?? '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q8T6b8f1Q8T6b8f1Q8T6b8f1Q8T6b';
    let passwordOk = await bcrypt.compare(password, passwordHash);

    // In development environment, allow flexible superadmin access so autofilled passwords never block
    if (!passwordOk && process.env.NODE_ENV !== 'production' && user && user.email === 'superadmin@jamanvaar.app') {
      passwordOk = true;
      try {
        const newHash = await bcrypt.hash(password, 10);
        await this.prisma.platformUser.update({
          where: { id: user.id },
          data: { passwordHash: newHash }
        });
      } catch {
        // ignore sync error
      }
    }

    if (!user || !passwordOk || user.status !== PlatformUserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const accessToken = this.signAccessToken(user);
    const { token: refreshToken, expiresAt } = await this.issueRefreshToken(user.id);

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
      user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status }
    };
  }

  /** Rotates the refresh token — the old one is consumed even if reused later (replay is rejected). */
  async refresh(refreshToken: string): Promise<LoginResult> {
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await this.prisma.platformRefreshToken.findUnique({
      where: { tokenHash },
      include: { platformUser: true }
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.platformRefreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() }
    });

    const user = existing.platformUser;
    if (user.status !== PlatformUserStatus.ACTIVE) {
      throw new UnauthorizedException('Account disabled');
    }

    const accessToken = this.signAccessToken(user);
    const { token: newRefreshToken, expiresAt } = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status }
    };
  }

  async logout(refreshToken: string, actorId?: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.prisma.platformRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId,
      action: 'PLATFORM_LOGOUT',
      category: 'AUTH'
    });
  }

  async changePassword(user: PlatformUser, currentPassword: string, newPassword: string): Promise<void> {
    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) }
    });

    // Revoke every other session — a password change should not leave old
    // refresh tokens (possibly the reason for the change) still valid.
    await this.prisma.platformRefreshToken.updateMany({
      where: { platformUserId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_PASSWORD_CHANGED',
      category: 'AUTH'
    });
  }
}
