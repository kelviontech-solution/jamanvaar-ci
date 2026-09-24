import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PlatformUser } from '@prisma/client';
import { AppCode } from '@prisma/client';
import { pageOf, parsePaging } from '../../common/paging';
import { ts } from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GenerateActivationKeyDto, ReactivateKeyDto, RedeemActivationKeyDto } from './dto/activation-key.dto';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/security/token.util';
import { redactActivationKeyCode } from '../../common/security/activation-key-presentation';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { onlyActiveBranchId } from '../tenant-auth/tenant-auth.service';
import { PlatformRoleName, permissionsForRole } from '../../common/rbac/access';

/** JMV-XXXX-XXXX-XXXX — human-relayable but drawn from a cryptographically random 96-bit value, not a counter or a guessable pattern. */
function generateCode(): string {
  const raw = randomBytes(12).toString('hex').toUpperCase(); // 24 hex chars
  const groups = raw.match(/.{1,4}/g) ?? [];
  return `JMV-${groups.slice(0, 3).join('-')}`;
}

@Injectable()
export class ActivationKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appEntitlements: ApplicationEntitlementsService
  ) {}

  /** Where-clause for each lifecycle. EXPIRED is a date rule as well as a status: nothing else flips it. */
  private lifecycleWhere(lifecycle: string, now: Date): Prisma.ActivationKeyWhereInput | undefined {
    switch (lifecycle) {
      case 'AVAILABLE': return { status: 'ACTIVE', expiresAt: { gt: now } };
      case 'REDEEMED': return { status: 'REDEEMED' };
      case 'REVOKED': return { status: 'REVOKED' };
      case 'EXPIRED': return { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lte: now } }] };
      default: return undefined;
    }
  }

  /**
   * B2-051 / security-audit HIGH-02: an AVAILABLE key's full code used to go out to *any*
   * caller regardless of role, so a Read-Only or Support Admin token (both only
   * `devices: 'read'`) got a live, usable bearer credential back in full. Once redeemed,
   * revoked or expired it is always redacted, leaving the last 4 characters so an operator
   * can still tell keys apart (BUG-060). Delegates to `redactActivationKeyCode`, the one
   * shared definition of "who gets to see a code" also used by `support.service.ts` and
   * `/restaurants/:id`'s embedded activationKeys — every endpoint that can ever return a
   * key must agree on who gets to see a live one.
   */
  private present<T extends { code: string; status: string; expiresAt: Date }>(key: T, now: Date, canSeeFullCode: boolean) {
    return redactActivationKeyCode(key, now, canSeeFullCode);
  }

  /**
   * Plain array without `page` (as before, but redacted and with a lifecycle); with `page` a server-side
   * searched, filtered and paged envelope carrying per-lifecycle counts for the same scope.
   */
  async list(query: {
    restaurantId?: string; q?: string; lifecycle?: string; allowedDeviceType?: string; batchId?: string;
    branchId?: string; expiringInDays?: string; page?: unknown; pageSize?: unknown;
  } = {}, actorRole?: PlatformRoleName) {
    const canSeeFullCode = actorRole ? permissionsForRole(actorRole).devices === 'write' : false;
    const paging = parsePaging(query);
    const now = new Date();
    const q = query.q?.trim();
    const scope: Prisma.ActivationKeyWhereInput = {
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.allowedDeviceType ? { allowedDeviceType: query.allowedDeviceType as never } : {}),
      ...(q
        ? { OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { label: { contains: q, mode: 'insensitive' } },
            { restaurant: { name: { contains: q, mode: 'insensitive' } } }
          ] }
        : {})
    };
    const days = Number.parseInt(query.expiringInDays ?? '', 10);
    const expiring: Prisma.ActivationKeyWhereInput =
      Number.isFinite(days) && days > 0
        ? { status: 'ACTIVE', expiresAt: { gt: now, lte: new Date(now.getTime() + days * 86400_000) } }
        : {};
    const lifecycle = query.lifecycle ? this.lifecycleWhere(query.lifecycle, now) : undefined;
    const where: Prisma.ActivationKeyWhereInput = { AND: [scope, expiring, ...(lifecycle ? [lifecycle] : [])] };
    const include = { restaurant: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } };

    return this.prisma.runAsPlatform(async (tx) => {
      if (!paging.paged) {
        const rows = await tx.activationKey.findMany({ where, orderBy: { createdAt: 'desc' }, include });
        return rows.map((k) => this.present(k, now, canSeeFullCode));
      }
      const [rows, total, available, redeemed, revoked, expired] = await Promise.all([
        tx.activationKey.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include, skip: paging.skip, take: paging.take }),
        tx.activationKey.count({ where }),
        ...(['AVAILABLE', 'REDEEMED', 'REVOKED', 'EXPIRED'] as const).map((l) =>
          tx.activationKey.count({ where: { AND: [scope, this.lifecycleWhere(l, now)!] } })
        )
      ]);
      return {
        ...pageOf(rows.map((k) => this.present(k, now, canSeeFullCode)), total, paging),
        lifecycleCounts: { AVAILABLE: available, REDEEMED: redeemed, REVOKED: revoked, EXPIRED: expired }
      };
    });
  }

  /** One row per restaurant: issued / available / redeemed / revoked / expired / expiring in 7 days. */
  async byRestaurant(query: { q?: string; page?: unknown; pageSize?: unknown } = {}) {
    const paging = parsePaging(query);
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86400_000);
    const q = query.q?.trim();
    const like = q ? `%${q}%` : null;
    return this.prisma.runAsPlatform(async (tx) => {
      const limit = paging.paged ? paging.take : 1000;
      const offset = paging.paged ? paging.skip : 0;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT r.id AS "restaurantId", r.name AS "restaurantName",
          COUNT(k.id)::int AS issued,
          COUNT(*) FILTER (WHERE k.status = 'ACTIVE' AND k."expiresAt" > ${ts(now)})::int AS available,
          COUNT(*) FILTER (WHERE k.status = 'REDEEMED')::int AS redeemed,
          COUNT(*) FILTER (WHERE k.status = 'REVOKED')::int AS revoked,
          COUNT(*) FILTER (WHERE k.status = 'EXPIRED' OR (k.status = 'ACTIVE' AND k."expiresAt" <= ${ts(now)}))::int AS expired,
          COUNT(*) FILTER (WHERE k.status = 'ACTIVE' AND k."expiresAt" > ${ts(now)} AND k."expiresAt" <= ${ts(soon)})::int AS "expiringSoon"
        FROM "Restaurant" r
        JOIN "ActivationKey" k ON k."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
        GROUP BY r.id, r.name
        ORDER BY r.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
      if (!paging.paged) return rows;
      const totalRows = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT r.id)::int AS n FROM "Restaurant" r JOIN "ActivationKey" k ON k."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
      `);
      return pageOf(rows, totalRows[0]?.n ?? 0, paging);
    });
  }

  /** Unredeemed keys past their expiry become EXPIRED. Run by the scheduler; safe to repeat. */
  async expireDueKeys() {
    return this.prisma.runAsPlatform(async (tx) => {
      const res = await tx.activationKey.updateMany({ where: { status: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
      return { expired: res.count };
    });
  }

  /** One call for many keys. Keys that cannot be revoked (already revoked) are skipped, not fatal. */
  async bulkRevoke(ids: string[], actor: PlatformUser) {
    let revoked = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        await this.revoke(id, actor);
        revoked++;
      } catch (err) {
        if (err instanceof ConflictException || err instanceof NotFoundException) skipped++;
        else throw err;
      }
    }
    return { revoked, skipped };
  }

  async getById(id: string, actorRole?: PlatformRoleName) {
    const key = await this.prisma.runAsPlatform((tx) =>
      tx.activationKey.findUnique({
        where: { id },
        include: { restaurant: { select: { id: true, name: true } } }
      })
    );
    if (!key) throw new NotFoundException('Activation key not found');
    // B2-051 / security-audit HIGH-02: this endpoint returned the raw row — full code,
    // regardless of status or caller — with no redaction at all. Same masking as list() now
    // applies here too.
    const canSeeFullCode = actorRole ? permissionsForRole(actorRole).devices === 'write' : false;
    return this.present(key, new Date(), canSeeFullCode);
  }

  async generate(dto: GenerateActivationKeyDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: dto.restaurantId, deletedAt: null } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      if (dto.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: dto.branchId, restaurantId: dto.restaurantId } });
        if (!branch) throw new NotFoundException('Branch not found for this restaurant');
      }

      if (dto.subscriptionId) {
        const sub = await tx.subscription.findFirst({
          where: { id: dto.subscriptionId, restaurantId: dto.restaurantId }
        });
        if (!sub) throw new NotFoundException('Subscription not found for this restaurant');
      }

      // 'ANY' isn't scoped to one application yet — the meaningful gate for
      // it is at redeem() below, once the redeeming device says what it
      // actually is. A key generated for a specific app, though, should
      // fail here rather than mint a code nobody can ever legitimately use.
      if (dto.allowedDeviceType !== 'ANY') {
        await this.appEntitlements.assertAppEnabled(tx, dto.restaurantId, dto.allowedDeviceType as AppCode);
      }

      // Retry on the astronomically unlikely code collision rather than trusting uniqueness blindly.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          const key = await tx.activationKey.create({
            data: {
              code,
              restaurantId: dto.restaurantId,
              subscriptionId: dto.subscriptionId,
              allowedDeviceType: dto.allowedDeviceType,
              expiresAt: dto.expiresAt,
              branchId: dto.branchId,
              label: dto.label,
              batchId: dto.batchId
            },
            include: { restaurant: { select: { id: true, name: true } } }
          });

          await this.audit.log(
            {
              actorType: 'PLATFORM',
              actorId: actor.id,
              restaurantId: dto.restaurantId,
              action: 'ACTIVATION_KEY_GENERATED',
              category: 'ACTIVATION',
              details: { activationKeyId: key.id, allowedDeviceType: key.allowedDeviceType }
            },
            tx
          );

          return key;
        } catch (err) {
          if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') continue;
          throw err;
        }
      }
      throw new ConflictException('Could not generate a unique activation code — please retry');
    });
  }

  /**
   * The other half of the flow `generate` starts (see
   * docs/architecture/super-admin-architecture.md §I.2). Deliberately not
   * behind PlatformAuthGuard or TenantAuthGuard — a device presenting this
   * call has neither kind of session yet; the code itself is the credential.
   * Creates the Device row and marks the key REDEEMED in one transaction.
   */
  async redeem(dto: RedeemActivationKeyDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const key = await tx.activationKey.findUnique({ where: { code: dto.code } });
      if (!key) throw new NotFoundException('Invalid activation code');

      if (key.status === 'REVOKED') throw new GoneException('Activation code has been revoked');
      if (key.status === 'REDEEMED') throw new ConflictException('Activation code has already been redeemed');
      if (key.status === 'EXPIRED' || key.expiresAt < new Date()) {
        throw new GoneException('Activation code has expired');
      }
      if (key.allowedDeviceType !== 'ANY' && key.allowedDeviceType !== dto.deviceType) {
        throw new BadRequestException(
          `This activation code is only valid for ${key.allowedDeviceType} devices, not ${dto.deviceType}`
        );
      }

      // security-audit MED-02: claim the key atomically HERE, before creating a device
      // for it — the old code only flipped `status` to REDEEMED at the very end, after
      // already creating a Device row, with nothing stopping two concurrent redemptions
      // of the same code from both passing the `status === 'ACTIVE'` check above and
      // each creating their own device. `updateMany` with `status: 'ACTIVE'` in its own
      // WHERE clause is an atomic compare-and-set: under Postgres, a second concurrent
      // UPDATE targeting the same row blocks until the first commits, then re-evaluates
      // the WHERE clause against the now-REDEEMED row and matches zero rows — so at
      // most one caller ever sees `claimed.count === 1`.
      const claimed = await tx.activationKey.updateMany({
        where: { id: key.id, status: 'ACTIVE' },
        data: { status: 'REDEEMED', redeemedAt: new Date() }
      });
      if (claimed.count === 0) {
        throw new ConflictException('Activation code has already been redeemed');
      }

      // The real gate: whatever the key allowed, this restaurant's current
      // subscription must still actually include the app the device claims
      // to be — closes the window where a key was generated while entitled
      // but the plan was downgraded before it got redeemed (an 'ANY' key
      // reaches this check for the first time here, since generate() above
      // has nothing to check it against yet).
      await this.appEntitlements.assertAppEnabled(tx, key.restaurantId, dto.deviceType as AppCode);

      // BUG-061 / Phase 2: the quota check is per-app now, not one global cap shared across
      // every device type and every subscription the restaurant holds (see
      // ApplicationEntitlementsService.assertDeviceQuotaAvailable's doc comment).
      await this.appEntitlements.assertDeviceQuotaAvailable(tx, key.restaurantId, dto.deviceType as AppCode);

      // The device's long-lived credential for everything it calls after this
      // point (e.g. PATCH /api/v1/devices/me/heartbeat) — returned once, here,
      // exactly like ActivationKey.code and User.activationToken. Only the
      // hash is ever persisted.
      const deviceToken = generateOpaqueToken();

      const device = await tx.device.create({
        data: {
          restaurantId: key.restaurantId,
          type: dto.deviceType,
          appVersion: dto.appVersion,
          // BUG-048: the terminal belongs to the branch (and carries the name) its key was issued for.
          // With one active branch there is no doubt which one (BUG-155).
          branchId: key.branchId ?? (await onlyActiveBranchId(tx, key.restaurantId)),
          name: key.label,
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

      await this.audit.log(
        {
          actorType: 'SYSTEM',
          restaurantId: key.restaurantId,
          action: 'ACTIVATION_KEY_REDEEMED',
          category: 'ACTIVATION',
          details: { activationKeyId: key.id, deviceId: device.id, deviceType: device.type }
        },
        tx
      );

      // Real branding for the device to adopt immediately — without this, a
      // freshly-activated terminal (e.g. Kiosk's welcome screen) keeps
      // showing its local seed placeholder ("My Restaurant") until some
      // other, unrelated sync happens to overwrite it.
      const restaurant = await tx.restaurant.findUnique({
        where: { id: key.restaurantId },
        select: { name: true, gstin: true, address: true, fssaiNumber: true }
      });

      return { device, restaurantId: key.restaurantId, deviceToken, restaurant };
    });
  }

  async revoke(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.activationKey.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Activation key not found');
      if (existing.status === 'REVOKED') throw new ConflictException('Activation key is already revoked');

      const updated = await tx.activationKey.update({
        where: { id },
        data: { status: 'REVOKED' },
        include: { restaurant: { select: { id: true, name: true } } }
      });

      // A redeemed key's terminal has its own credential, so revoking only the key
      // used to leave the terminal running. Revoking the key now revokes that terminal too.
      let revokedDeviceId: string | null = null;
      if (existing.status === 'REDEEMED' && existing.redeemedByDeviceId) {
        await tx.device.updateMany({
          where: { id: existing.redeemedByDeviceId, status: { not: 'REVOKED' } },
          data: { status: 'REVOKED' }
        });
        await tx.tenantRefreshToken.updateMany({ where: { deviceId: existing.redeemedByDeviceId, revokedAt: null }, data: { revokedAt: new Date() } });
        revokedDeviceId = existing.redeemedByDeviceId;
      }

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'ACTIVATION_KEY_REVOKED',
          category: 'ACTIVATION',
          details: { activationKeyId: id, previousStatus: existing.status, revokedDeviceId }
        },
        tx
      );

      return updated;
    });
  }

  /** A lapsed key that is brought back gets this many days, unless the operator chose a date. */
  private static readonly REACTIVATED_KEY_DAYS = 30;

  /**
   * Brings a revoked key back (BUG-128). An unused key becomes available again (with a new expiry when the old one
   * has passed). A key that had been redeemed brings its terminal back too - the device is active again and signs
   * in again - so a mistaken revoke is fully undone; that terminal takes a device seat, so the plan limit applies.
   */
  async reactivate(id: string, actor: PlatformUser, dto: ReactivateKeyDto = {}) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.activationKey.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Activation key not found');
      if (existing.status !== 'REVOKED') throw new ConflictException('Only a revoked activation key can be activated again');

      const now = new Date();
      let restoredDeviceId: string | null = null;
      let data: Prisma.ActivationKeyUpdateInput;

      if (existing.redeemedByDeviceId) {
        const device = await tx.device.findUnique({ where: { id: existing.redeemedByDeviceId } });
        if (device && device.status === 'REVOKED') {
          // Phase 2: per-app quota, not one global cap (see assertDeviceQuotaAvailable).
          await this.appEntitlements.assertDeviceQuotaAvailable(tx, existing.restaurantId, device.type as AppCode);
          await tx.device.update({ where: { id: device.id }, data: { status: 'ACTIVE' } });
          restoredDeviceId = device.id;
        }
        // It was in use: it goes back to being the record of that terminal, not a fresh key.
        data = { status: 'REDEEMED' };
      } else {
        const expiresAt = dto.expiresAt ?? (existing.expiresAt > now ? existing.expiresAt : new Date(now.getTime() + ActivationKeysService.REACTIVATED_KEY_DAYS * 86_400_000));
        if (expiresAt <= now) throw new BadRequestException('Choose an expiry date in the future');
        data = { status: 'ACTIVE', expiresAt };
      }

      const updated = await tx.activationKey.update({ where: { id }, data, include: { restaurant: { select: { id: true, name: true } } } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'ACTIVATION_KEY_REACTIVATED',
          category: 'ACTIVATION',
          details: { activationKeyId: id, code: existing.code, restoredDeviceId, expiresAt: updated.expiresAt.toISOString() }
        },
        tx
      );
      return updated;
    });
  }

  /**
   * Deletes a key that is not in use (BUG-128): available, revoked or expired. A redeemed key is the record of a
   * registered terminal, so it must be revoked first. The delete is audited with the key's code, and the code can
   * no longer be redeemed.
   */
  async remove(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.activationKey.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Activation key not found');
      if (existing.status === 'REDEEMED') throw new ConflictException('This key is in use by a terminal. Revoke it first, then it can be deleted.');

      await tx.activationKey.delete({ where: { id } });
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'ACTIVATION_KEY_DELETED',
          category: 'ACTIVATION',
          details: { activationKeyId: id, code: existing.code, previousStatus: existing.status, label: existing.label ?? null }
        },
        tx
      );
      return { deleted: true, id };
    });
  }

  /** One call for many keys; a key that cannot be deleted (in use) is skipped, not fatal. */
  async bulkRemove(ids: string[], actor: PlatformUser) {
    let deleted = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        await this.remove(id, actor);
        deleted++;
      } catch (err) {
        if (err instanceof ConflictException || err instanceof NotFoundException) skipped++;
        else throw err;
      }
    }
    return { deleted, skipped };
  }

  async bulkReactivate(ids: string[], actor: PlatformUser) {
    let reactivated = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        await this.reactivate(id, actor);
        reactivated++;
      } catch (err) {
        if (err instanceof ConflictException || err instanceof NotFoundException || err instanceof BadRequestException) skipped++;
        else throw err;
      }
    }
    return { reactivated, skipped };
  }
}
