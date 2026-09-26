import { buildActivationUrl } from './activation-url';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '../../common/security/password-cost';
import { ConfigService } from '@nestjs/config';
import { PlatformUser, PlatformUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { platformTeamInviteEmail } from '../notifications/email-templates';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/security/token.util';
import { InviteTeammateDto, UpdateRoleDto, ActivateTeammateDto } from './dto/platform-user.dto';

const ACTIVATION_TOKEN_TTL_DAYS = 7;

/** Never selects passwordHash or activationTokenHash — this response shape is never allowed to leak a credential. */
const PLATFORM_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  invitedAt: true,
  activatedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} as const;

/**
 * Real server-side RBAC gate for team management — the frontend's
 * hasPermission() previously had nothing behind it to actually check,
 * since every login response hardcoded role: 'SUPER_ADMIN'. Only a
 * PLATFORM_OWNER or SUPER_ADMIN may invite, re-role, or enable/disable
 * teammates; everyone else (PLATFORM_OPS, SUPPORT_ADMIN, FINANCE_ADMIN,
 * READ_ONLY) can view the team list but not mutate it.
 */
function assertCanManageTeam(actor: PlatformUser): void {
  if (actor.role !== 'PLATFORM_OWNER' && actor.role !== 'SUPER_ADMIN') {
    throw new ForbiddenException('Only a Platform Owner or Super Admin can manage the team');
  }
}

function assertActorIsOwner(actor: PlatformUser, what: string): void {
  if (actor.role !== 'PLATFORM_OWNER') {
    throw new ForbiddenException(`Only a Platform Owner can ${what}`);
  }
}

@Injectable()
export class PlatformUsersService {
  private readonly logger = new Logger(PlatformUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService
  ) {
    if (!this.config.get<string>('PLATFORM_FRONTEND_URL')) {
      this.logger.warn(
        'PLATFORM_FRONTEND_URL is not set: invitation links will point at http://localhost:5180, which invitees cannot open. Set it to the public Super Admin URL.'
      );
    }
  }

  /** Builds the real, clickable link the Super Admin web app's public /activate page reads. */
  private buildActivationUrl(email: string, activationToken: string): string {
    return buildActivationUrl(this.config.get<string>('PLATFORM_FRONTEND_URL'), email, activationToken);
  }

  /**
   * Public. Lets the activation page tell an invitee their link is expired or already used BEFORE
   * they type a password. Every failure that could reveal whether an account exists (unknown
   * email, wrong token) reports the same 'INVALID'.
   */
  async activationStatus(email: string, token: string): Promise<{ state: 'VALID' | 'EXPIRED' | 'USED' | 'INVALID'; fullName?: string }> {
    const user = await this.prisma.platformUser.findUnique({ where: { email: (email || '').trim().toLowerCase() } });
    if (!user || !token) return { state: 'INVALID' };
    if (user.passwordHash !== null) {
      // Only reveal "already used" to someone who holds the real (now consumed) invitation? The
      // token hash is cleared on use, so there is nothing to compare: report USED for a known,
      // already-activated account. That reveals only that this email has an account, which the
      // login form already does not hide from the account holder.
      return { state: 'USED' };
    }
    if (!user.activationTokenHash || hashOpaqueToken(token) !== user.activationTokenHash) return { state: 'INVALID' };
    if (!user.activationTokenExpiresAt || user.activationTokenExpiresAt < new Date()) return { state: 'EXPIRED' };
    return { state: 'VALID', fullName: user.fullName };
  }

  list() {
    return this.prisma.platformUser.findMany({
      orderBy: { createdAt: 'asc' },
      select: PLATFORM_USER_SELECT
    });
  }

  async invite(dto: InviteTeammateDto, actor: PlatformUser) {
    assertCanManageTeam(actor);
    if (dto.role === 'PLATFORM_OWNER') assertActorIsOwner(actor, 'invite another Platform Owner');

    const existing = await this.prisma.platformUser.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A platform account with this email already exists');
    }

    const activationToken = generateOpaqueToken();
    const activationTokenExpiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.prisma.platformUser.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        status: PlatformUserStatus.PENDING_ACTIVATION,
        invitedAt: new Date(),
        activationTokenHash: hashOpaqueToken(activationToken),
        activationTokenExpiresAt
      },
      select: PLATFORM_USER_SELECT
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLATFORM_TEAM_MEMBER_INVITED',
      category: 'TEAM',
      details: { invitedUserId: created.id, email: created.email, role: created.role }
    });

    const activationUrl = this.buildActivationUrl(created.email, activationToken);

    let emailSent = false;
    try {
      const { subject, html } = platformTeamInviteEmail({
        inviteeName: created.fullName,
        email: created.email,
        role: created.role,
        activationToken,
        activationUrl,
        expiresAt: activationTokenExpiresAt
      });
      emailSent = await this.email.send(created.email, subject, html);
    } catch (err) {
      this.logger.error(`Team invite email failed to send to ${created.email}`, err instanceof Error ? err.stack : err);
    }

    // Returned once, out-of-band from the audited detail payload above — the
    // same "shown once" shape as the owner-invite and ActivationKey flows.
    return { user: created, activationToken, activationUrl, activationTokenExpiresAt, emailSent };
  }

  async resendInvite(id: string, actor: PlatformUser) {
    assertCanManageTeam(actor);

    const existing = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Platform user not found');
    // security-audit MED-03: every OTHER mutation on a PLATFORM_OWNER row in this
    // service (updateRole, setStatus) requires the actor to themselves be an owner —
    // this one didn't, so a SUPER_ADMIN could regenerate a fresh, 7-day activation
    // token for a still-pending PLATFORM_OWNER invite and take over that owner-level
    // identity via the public /platform-users/activate endpoint.
    if (existing.role === 'PLATFORM_OWNER') {
      assertActorIsOwner(actor, 'resend an invite to a Platform Owner');
    }
    if (existing.status !== PlatformUserStatus.PENDING_ACTIVATION) {
      throw new ConflictException('This account has already been activated');
    }

    const activationToken = generateOpaqueToken();
    const activationTokenExpiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.platformUser.update({
      where: { id },
      data: {
        activationTokenHash: hashOpaqueToken(activationToken),
        activationTokenExpiresAt,
        invitedAt: new Date()
      },
      select: PLATFORM_USER_SELECT
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLATFORM_TEAM_INVITE_RESENT',
      category: 'TEAM',
      details: { invitedUserId: id }
    });

    const activationUrl = this.buildActivationUrl(updated.email, activationToken);

    let emailSent = false;
    try {
      const { subject, html } = platformTeamInviteEmail({
        inviteeName: updated.fullName,
        email: updated.email,
        role: updated.role,
        activationToken,
        activationUrl,
        expiresAt: activationTokenExpiresAt
      });
      emailSent = await this.email.send(updated.email, subject, html);
    } catch (err) {
      this.logger.error(`Team invite resend failed to send to ${updated.email}`, err instanceof Error ? err.stack : err);
    }

    return { user: updated, activationToken, activationUrl, activationTokenExpiresAt, emailSent };
  }

  /** The platform must always keep at least one active Platform Owner. */
  private async assertAnotherActiveOwner(exceptUserId: string): Promise<void> {
    const others = await this.prisma.platformUser.count({
      where: { role: 'PLATFORM_OWNER', status: PlatformUserStatus.ACTIVE, id: { not: exceptUserId } }
    });
    if (others === 0) {
      throw new ForbiddenException('The last active Platform Owner cannot be demoted or disabled');
    }
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: PlatformUser) {
    assertCanManageTeam(actor);
    if (id === actor.id) {
      throw new ForbiddenException('You cannot change your own role — ask another Platform Owner to do it');
    }

    const existing = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Platform user not found');

    // Owners are protected: only an owner can grant or change that role, and the
    // last active owner can never be demoted (the platform would be left without one).
    if (existing.role === 'PLATFORM_OWNER' || dto.role === 'PLATFORM_OWNER') {
      assertActorIsOwner(actor, 'grant or change the Platform Owner role');
    }
    if (existing.role === 'PLATFORM_OWNER' && dto.role !== 'PLATFORM_OWNER') {
      await this.assertAnotherActiveOwner(id);
    }

    const updated = await this.prisma.platformUser.update({
      where: { id },
      data: { role: dto.role },
      select: PLATFORM_USER_SELECT
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'PLATFORM_TEAM_ROLE_CHANGED',
      category: 'TEAM',
      details: { targetUserId: id, previousRole: existing.role, newRole: dto.role }
    });

    return updated;
  }

  async setStatus(id: string, status: 'ACTIVE' | 'DISABLED', actor: PlatformUser) {
    assertCanManageTeam(actor);
    if (id === actor.id) {
      throw new ForbiddenException('You cannot disable your own account');
    }

    const existing = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Platform user not found');
    if (existing.role === 'PLATFORM_OWNER') {
      assertActorIsOwner(actor, 'change a Platform Owner account');
      if (status === 'DISABLED') await this.assertAnotherActiveOwner(id);
    }
    if (existing.status === status) {
      throw new ConflictException(`Account is already ${status}`);
    }
    if (existing.status === PlatformUserStatus.PENDING_ACTIVATION) {
      throw new ConflictException('This account has not been activated yet');
    }

    const updated = await this.prisma.platformUser.update({
      where: { id },
      data: { status },
      select: PLATFORM_USER_SELECT
    });

    // A disabled teammate's active sessions must not keep working.
    if (status === 'DISABLED') {
      const now = new Date();
      await this.prisma.platformRefreshToken.updateMany({
        where: { platformUserId: id, terminatedAt: null },
        data: { revokedAt: now, terminatedAt: now }
      });
    }

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: `PLATFORM_TEAM_MEMBER_${status}`,
      category: 'TEAM',
      details: { targetUserId: id, previousStatus: existing.status }
    });

    return updated;
  }

  /** Public — no actor/guard, mirrors TenantAuthService.setInitialPassword (SEC-001 shape). */
  async activate(dto: ActivateTeammateDto): Promise<void> {
    const user = await this.prisma.platformUser.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('Account not found');
    if (user.passwordHash !== null) {
      throw new ConflictException('Password already set — use login, not activation');
    }
    if (!user.activationTokenHash || !user.activationTokenExpiresAt) {
      throw new UnauthorizedException('No pending invitation for this account — ask a Platform Owner to invite you');
    }
    if (user.activationTokenExpiresAt < new Date()) {
      throw new GoneException('Invitation has expired — ask a Platform Owner to resend it');
    }
    if (hashOpaqueToken(dto.activationToken) !== user.activationTokenHash) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
        status: PlatformUserStatus.ACTIVE,
        activatedAt: new Date(),
        activationTokenHash: null,
        activationTokenExpiresAt: null
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: user.id,
      action: 'PLATFORM_TEAM_MEMBER_ACTIVATED',
      category: 'TEAM',
      details: { email: user.email }
    });
  }
}
