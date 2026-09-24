import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformUser, RestaurantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/security/token.util';
import { EmailService } from '../notifications/email.service';
import { ownerInviteEmail } from '../notifications/email-templates';
import * as bcrypt from 'bcryptjs';
import { EntitySyncService } from '../entity-sync/entity-sync.service';
import { ImportMenuDto } from './dto/import-menu.dto';
import { redactActivationKeyCode } from '../../common/security/activation-key-presentation';
import { hasDevicesArea, PlatformRoleName, permissionsForRole } from '../../common/rbac/access';
import { generateRestaurantCode } from './restaurant-code.util';
import { normalizeIndianPhone } from '../../common/validation/phone';

const ACTIVATION_TOKEN_TTL_DAYS = 7;

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger(RestaurantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly entitySync: EntitySyncService
  ) {}

  /**
   * Creates Restaurant -> default Branch -> pending Owner User atomically, all
   * inside one platform-context transaction, with the audit row in the same
   * transaction so a partial failure never leaves an unaudited restaurant.
   */
  async createRestaurant(dto: CreateRestaurantDto, actor: PlatformUser) {
    const result = await this.prisma.runAsPlatform(async (tx) => {
      let restaurant;
      try {
        restaurant = await tx.restaurant.create({
          data: {
            name: dto.name,
            legalName: dto.legalName,
            gstin: dto.gstin,
            fssaiNumber: dto.fssaiNumber,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            country: dto.country,
            timezone: dto.timezone,
            currency: dto.currency,
            defaultLanguage: dto.defaultLanguage,
            ...(dto.mobile
              ? { mobile: normalizeIndianPhone(dto.mobile), restaurantCode: generateRestaurantCode(dto.mobile) }
              : {})
          }
        });
      } catch (err) {
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') {
          throw new ConflictException(`A restaurant is already registered with mobile number ${normalizeIndianPhone(dto.mobile!)}`);
        }
        throw err;
      }

      const branch = await tx.branch.create({
        data: {
          restaurantId: restaurant.id,
          name: `${dto.name} — Main Branch`,
          code: 'MAIN',
          address: dto.address,
          timezone: dto.timezone
        }
      });

      // SEC-001 fix: a PENDING_ACTIVATION owner can no longer set their password with
      // just restaurantId + email. A one-time invitation token is minted here, its hash
      // stored on the User row, and the plaintext returned exactly once (never persisted,
      // never logged) — the same pattern already used for ActivationKey.code and the
      // seeded Super Admin password below.
      const activationToken = generateOpaqueToken();
      const activationTokenExpiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

      const passwordHash = dto.ownerPassword ? await bcrypt.hash(dto.ownerPassword, 10) : null;
      const ownerStatus = dto.ownerPassword ? 'ACTIVE' : 'PENDING_ACTIVATION';
      const activatedAt = dto.ownerPassword ? new Date() : null;

      const owner = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          email: dto.ownerEmail,
          phone: dto.ownerPhone,
          fullName: dto.ownerName,
          role: 'OWNER',
          passwordHash,
          status: ownerStatus,
          invitedAt: new Date(),
          activatedAt,
          activationTokenHash: hashOpaqueToken(activationToken),
          activationTokenExpiresAt
        },
        // passwordHash and activationTokenHash are always excluded by shape
        // (not just value) so this response can never leak a credential.
        select: {
          id: true,
          restaurantId: true,
          branchId: true,
          email: true,
          phone: true,
          fullName: true,
          role: true,
          status: true,
          invitedAt: true,
          activatedAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: restaurant.id,
          action: 'RESTAURANT_CREATED',
          category: 'RESTAURANT',
          details: { name: restaurant.name, ownerEmail: owner.email, branchId: branch.id }
        },
        tx
      );

      // Returned once, out-of-band from the audited detail payload above, so it
      // never ends up in the audit log — the operator must relay it to the owner now.
      return { restaurant, branch, owner, activationToken, activationTokenExpiresAt };
    });

    // Sent after the transaction commits — a slow/unreachable SMTP server
    // must never hold the DB transaction open or roll back a successful
    // restaurant creation. If this fails or isn't configured, the operator
    // still has the token above to relay manually (emailSent tells them so).
    let emailSent = false;
    if (!dto.skipInviteEmail) {
      try {
        const { subject, html } = ownerInviteEmail({
          restaurantName: result.restaurant.name,
          ownerName: result.owner.fullName,
          email: result.owner.email,
          activationToken: result.activationToken,
          expiresAt: result.activationTokenExpiresAt
        });
        emailSent = await this.email.send(result.owner.email, subject, html);
      } catch (err) {
        this.logger.error(`Owner invite email failed to send to ${result.owner.email}`, err instanceof Error ? err.stack : err);
      }
    }

    return { ...result, emailSent };
  }

  async listRestaurants() {
    return this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { branches: true, devices: true } },
          users: {
            where: { role: 'OWNER' },
            take: 1,
            select: { id: true, fullName: true, email: true, phone: true }
          },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true }
          }
        }
      })
    );
  }

  /**
   * B2-053 / security-audit HIGH-01/HIGH-02: this used to always embed `devices` (full rows,
   * including each terminal's `deviceTokenHash`) and `activationKeys` (full, unredacted `code`)
   * regardless of who was asking. The deny-by-default guard on this route only checks the
   * `restaurants` area — which Finance, Support and Read-Only all have — so a caller explicitly
   * refused 403 on the direct `/devices` and `/activation-keys` endpoints got the exact same
   * data back anyway, just nested one level down. `actorRole` now gates both relations the same
   * way the direct endpoints do (see `hasDevicesArea`); the `devices` relation is also fetched
   * through an explicit field `select` rather than `true`, so `deviceTokenHash` is never even
   * read out of the database for this endpoint, and any code included is redacted by the one
   * shared rule (`redactActivationKeyCode`) every endpoint that can return one agrees on.
   */
  async getRestaurantById(id: string, actorRole: PlatformRoleName = 'READ_ONLY') {
    const canSeeDevices = hasDevicesArea(actorRole);
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({
        where: { id, deletedAt: null },
        include: {
          branches: true,
          users: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              restaurantId: true,
              branchId: true,
              email: true,
              phone: true,
              fullName: true,
              role: true,
              status: true,
              invitedAt: true,
              activatedAt: true,
              createdAt: true,
              updatedAt: true
            }
          },
          // security-audit HIGH-01/HIGH-02: `devices: true` used to return the raw row,
          // including `deviceTokenHash` — a device's bearer credential's hash. An explicit
          // `select` means it's never even read out of the database for this endpoint,
          // regardless of `canSeeDevices` below. `false` (no relation at all) when the
          // caller's role has no devices area — same as `/devices` returning 403 directly.
          devices: canSeeDevices
            ? {
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true, restaurantId: true, branchId: true, type: true, appVersion: true, status: true,
                  lastSeenAt: true, lastSyncAt: true, lastBackupAt: true, syncStatus: true, activatedAt: true,
                  createdAt: true, updatedAt: true, name: true, ipAddress: true, macAddress: true, osPlatform: true,
                  isLocked: true, lockReason: true, lockedAt: true, pendingSyncCount: true, syncError: true
                }
              }
            : false,
          subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
          activationKeys: canSeeDevices ? { orderBy: { createdAt: 'desc' } } : false
        }
      })
    );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (!canSeeDevices) {
      // Prisma still puts the keys on the object as `false`/omitted depending on relation
      // shape; make the contract explicit rather than relying on that.
      return { ...restaurant, devices: [], activationKeys: [] };
    }
    const canSeeFullCode = permissionsForRole(actorRole).devices === 'write';
    const now = new Date();
    return {
      ...restaurant,
      devices: restaurant.devices ?? [],
      activationKeys: (restaurant.activationKeys ?? []).map((k) => redactActivationKeyCode(k, now, canSeeFullCode))
    };
  }

  /**
   * Resolves a customer-facing Restaurant ID to its internal id/name — used by login,
   * forgot-password and Kiosk activation screens (Phases 3/4/8) before any credential is
   * checked. A Restaurant ID is not itself a secret (same footing as the raw UUID already
   * was — see tenant-auth.service.ts's login() comment on restaurantId being "effectively
   * public"), so a plain 404 for an unknown code is fine; only the account's *password* needs
   * a generic/constant-time response.
   */
  async resolveByCode(restaurantCode: string): Promise<{ restaurantId: string; name: string }> {
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({ where: { restaurantCode, deletedAt: null }, select: { id: true, name: true } })
    );
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return { restaurantId: restaurant.id, name: restaurant.name };
  }

  async update(id: string, dto: UpdateRestaurantDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurant.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Restaurant not found');

      const updated = await tx.restaurant.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: id,
          action: 'RESTAURANT_UPDATED',
          category: 'RESTAURANT',
          details: { fields: Object.keys(dto) }
        },
        tx
      );

      return updated;
    });
  }

  async setStatus(id: string, status: RestaurantStatus, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurant.findFirst({ where: { id, deletedAt: null } });
      if (!existing) {
        throw new NotFoundException('Restaurant not found');
      }
      if (existing.status === status) {
        throw new ConflictException(`Restaurant is already ${status}`);
      }

      const updated = await tx.restaurant.update({ where: { id }, data: { status } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: id,
          action: `RESTAURANT_${status}`,
          category: 'RESTAURANT',
          details: { previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }

  /**
   * BUG-015: the restaurant's real menu — the same SyncedEntity rows a device's own
   * MENU_ITEM/MENU_CATEGORY entity-sync push/pull already reads and writes.
   */
  async getMenu(id: string) {
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({ where: { id, deletedAt: null }, select: { selfMenuUploadEnabled: true } })
    );
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const [categories, items] = await Promise.all([
      this.entitySync.catchUpForRestaurant(id, 'MENU_CATEGORY', new Date(0).toISOString()),
      this.entitySync.catchUpForRestaurant(id, 'MENU_ITEM', new Date(0).toISOString())
    ]);

    // A deleted dish or category stays in the store as a tombstone so it cannot come back; it is not part of the menu.
    const live = <E extends { payload: unknown }>(rows: E[]) => rows.filter((r) => !(r.payload && typeof r.payload === 'object' && (r.payload as Record<string, unknown>).deleted === true));

    return {
      categories: live(categories.entities),
      items: live(items.entities),
      selfUploadEnabled: restaurant.selfMenuUploadEnabled
    };
  }

  async importMenu(id: string, dto: ImportMenuDto, actor: PlatformUser) {
    const restaurant = await this.prisma.runAsPlatform((tx) => tx.restaurant.findFirst({ where: { id, deletedAt: null } }));
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    // An import is a deliberate edit made now: stamp it so it is newer than what terminals last wrote (BUG-149),
    // otherwise a terminal's older copy of a dish would win over the imported one.
    const stampedAt = new Date().toISOString();
    const stamp = <E extends { payload: Record<string, unknown> }>(events: E[]) => events.map((e) => ({ ...e, payload: { ...e.payload, updatedAt: stampedAt } }));
    const [categoryResult, itemResult] = await Promise.all([
      this.entitySync.pushEventsForRestaurant(id, 'MENU_CATEGORY', stamp(dto.categories)),
      this.entitySync.pushEventsForRestaurant(id, 'MENU_ITEM', stamp(dto.items))
    ]);

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: id,
      action: 'RESTAURANT_MENU_IMPORTED',
      category: 'MENU',
      details: { categoriesImported: categoryResult.results.length, itemsImported: itemResult.results.length }
    });

    return { categoriesImported: categoryResult.results.length, itemsImported: itemResult.results.length };
  }

  async setMenuPermission(id: string, enabled: boolean, actor: PlatformUser) {
    const restaurant = await this.prisma.runAsPlatform((tx) => tx.restaurant.findFirst({ where: { id, deletedAt: null } }));
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const updated = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.update({ where: { id }, data: { selfMenuUploadEnabled: enabled } })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: id,
      action: 'RESTAURANT_MENU_PERMISSION_CHANGED',
      category: 'MENU',
      details: { enabled }
    });

    return { selfUploadEnabled: updated.selfMenuUploadEnabled };
  }
}
