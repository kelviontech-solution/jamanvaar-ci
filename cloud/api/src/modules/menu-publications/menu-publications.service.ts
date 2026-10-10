import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { buildContent, explainHidden, extractImages, publicImageUrl, SnapshotContent, viewForBranch } from './menu-snapshot';

export const publishMenuSchema = z.object({ note: z.string().trim().max(200).optional() });
export type PublishMenuDto = z.infer<typeof publishMenuSchema>;

/** One branch's own price or availability for one dish. A field left null/absent means "no override": the dish's normal value applies. */
export const branchOverrideSchema = z
  .object({
    branchId: z.string().uuid(),
    itemId: z.string().min(1).max(128),
    price: z.number().min(0).max(100000).nullable().optional(),
    isAvailable: z.boolean().nullable().optional(),
    stockQuantity: z.number().int().min(0).max(1000000).nullable().optional()
  })
  .strict();
export type BranchOverrideDto = z.infer<typeof branchOverrideSchema>;

const MENU_ENTITY_TYPES = ['MENU_CATEGORY', 'MENU_ITEM', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'];

export interface LatestSnapshot { version: number; checksum: string; content: SnapshotContent }

@Injectable()
export class MenuPublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}

  async latest(restaurantId: string) {
    const row = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuPublication.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' } })
    );
    return { version: row?.version ?? 0, watermark: row?.watermark ?? null, note: row?.note ?? null };
  }

  private async draftRows(tx: Prisma.TransactionClient, restaurantId: string) {
    return tx.syncedEntity.findMany({ where: { restaurantId, entityType: { in: MENU_ENTITY_TYPES } }, select: { entityType: true, payload: true } });
  }

  /** What would be published right now: the problems that block publishing and the things that will be hidden from guests. */
  async draftStatus(device: Device) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can review the menu');
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const built = buildContent(await this.draftRows(tx, device.restaurantId));
      const last = await tx.menuSnapshot.findFirst({ where: { restaurantId: device.restaurantId }, orderBy: { version: 'desc' }, select: { version: true, checksum: true } });
      return {
        publishedVersion: last?.version ?? 0,
        hasUnpublishedChanges: !last || last.checksum !== built.checksum,
        errors: built.errors,
        warnings: built.warnings,
        counts: { categories: built.content.categories.length, items: built.content.items.length, modifierGroups: built.content.groups.length }
      };
    });
  }

  /** What a guest at this branch WOULD see if the draft were published now, and why each other dish is hidden. Creates nothing. */
  async preview(device: Device, branchId: string | null) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can preview the menu');
    if (device.branchId && branchId && branchId !== device.branchId) throw new ForbiddenException('Branch is outside this workspace');
    branchId = device.branchId ?? branchId;
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      if (branchId) {
        const b = await tx.branch.findFirst({ where: { id: branchId, restaurantId: device.restaurantId }, select: { id: true } });
        if (!b) throw new NotFoundException('Branch not found');
      }
      const built = buildContent(await this.draftRows(tx, device.restaurantId));
      const view = viewForBranch(built.content, branchId);
      return {
        errors: built.errors,
        warnings: built.warnings,
        categories: view.categories.map((c) => ({ id: c.id, name: c.name })),
        items: view.items.map((i) => ({ id: i.id, name: i.name, categoryId: i.categoryId, price: i.effectivePricePaise / 100, imageUrl: i.imageUrl?.startsWith('data:') ? 'pending-upload' : publicImageUrl(i.imageUrl), options: i.modifierGroupIds })),
        hidden: explainHidden(built.content, branchId)
      };
    });
  }

  /** Builds the snapshot from the draft inside an open transaction and records the numbered version. */
  private async publishTx(tx: Prisma.TransactionClient, restaurantId: string, deviceId: string | null, note: string | null) {
    // Serialise concurrent publishes so version numbers stay consecutive.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + restaurantId}))`;
    const built = buildContent(await this.draftRows(tx, restaurantId));
    if (built.errors.length > 0) throw new UnprocessableEntityException({ message: 'The menu has problems that must be fixed before publishing', errors: built.errors, warnings: built.warnings });
    const last = await tx.menuPublication.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    const created = await tx.menuPublication.create({ data: { restaurantId, version, watermark: new Date(), note, publishedByDeviceId: deviceId } });
    const moved = extractImages(built.content);
    for (const img of moved.images) {
      await tx.menuImage.upsert({
        where: { restaurantId_hash: { restaurantId, hash: img.hash } },
        create: { restaurantId, hash: img.hash, contentType: img.contentType, size: img.data.length, data: img.data },
        update: {}
      });
    }
    await tx.menuSnapshot.create({ data: { restaurantId, version, checksum: built.checksum, content: moved.content as unknown as Prisma.InputJsonValue, note, publishedBy: deviceId } });
    return { created, warnings: [...built.warnings, ...moved.warnings] };
  }

  /** Records a new numbered menu version with a frozen snapshot. Only the Restaurant Admin console edits and publishes the menu. */
  async publish(device: Device, dto: PublishMenuDto) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can publish the menu');
    const { created, warnings } = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const r = await this.publishTx(tx, device.restaurantId, device.id, dto.note ?? null);
      await this.audit.log(
        { actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'MENU_PUBLISHED', category: 'MENU', details: { version: r.created.version, note: r.created.note } },
        tx
      );
      return r;
    });
    this.realtime.publish({ restaurantId: device.restaurantId, branchId: null, kind: 'menu', seq: created.version, originDeviceId: device.id });
    return { ...created, warnings };
  }

  /** Published versions never change, so a bounded in-process cache keyed by restaurant and version is always correct. */
  private readonly snapshots = new Map<string, LatestSnapshot>();

  private remember(restaurantId: string, snap: LatestSnapshot): LatestSnapshot {
    const key = `${restaurantId}:${snap.version}`;
    this.snapshots.delete(key);
    this.snapshots.set(key, snap);
    if (this.snapshots.size > 200) this.snapshots.delete(this.snapshots.keys().next().value as string);
    return snap;
  }

  /** One cheap indexed read: the newest published version number, or 0. */
  async latestVersion(restaurantId: string): Promise<number> {
    const row = await this.prisma.runAsTenant(restaurantId, (tx) => tx.menuSnapshot.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' }, select: { version: true } }));
    return row?.version ?? 0;
  }

  /** A specific published version (for checking what a guest was looking at). Null when that version does not exist. */
  async snapshotAt(restaurantId: string, version: number): Promise<LatestSnapshot | null> {
    const hit = this.snapshots.get(`${restaurantId}:${version}`);
    if (hit) return hit;
    const row = await this.prisma.runAsTenant(restaurantId, (tx) => tx.menuSnapshot.findUnique({ where: { restaurantId_version: { restaurantId, version } } }));
    return row ? this.remember(restaurantId, { version: row.version, checksum: row.checksum, content: row.content as unknown as SnapshotContent }) : null;
  }

  /**
   * The snapshot customers read. A restaurant that has synced a menu but never pressed Publish gets its first snapshot made
   * automatically, so a new restaurant is not blank; after that, guests only ever see what was published.
   */
  async currentSnapshot(restaurantId: string): Promise<LatestSnapshot | null> {
    let version = await this.latestVersion(restaurantId);
    if (version === 0) {
      version = await this.prisma.runAsTenant(restaurantId, async (tx) => {
        const existing = await tx.menuSnapshot.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' }, select: { version: true } });
        if (existing) return existing.version;
        // Categories/tax groups arrive before dishes during the first sync.
        // Freezing that partial upload would leave guests on an empty version.
        const draft = buildContent(await this.draftRows(tx, restaurantId));
        if (!draft.content.items.length || draft.errors.length) return 0;
        try {
          return (await this.publishTx(tx, restaurantId, null, 'Automatic first publication')).created.version;
        } catch (e) {
          if (e instanceof UnprocessableEntityException) return 0;
          throw e;
        }
      });
      if (version === 0) return null;
    }
    const snapshot = await this.snapshotAt(restaurantId, version);
    if (snapshot && snapshot.content.items.length === 0) {
      // Recover the old automatic empty first snapshot once dishes arrive.
      // An owner's explicit publication (including an intentionally empty one)
      // must still be stable until they choose Publish again.
      const recovered = await this.prisma.runAsTenant(restaurantId, async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + restaurantId}))`;
        const latest = await tx.menuSnapshot.findFirst({where:{restaurantId},orderBy:{version:'desc'}});
        if (!latest || latest.version !== version || latest.note !== 'Automatic first publication') return latest?.version ?? version;
        const draft = buildContent(await this.draftRows(tx, restaurantId));
        if (!draft.content.items.length || draft.errors.length) return version;
        return (await this.publishTx(tx, restaurantId, null, 'Recovered first menu publication')).created.version;
      });
      if (recovered !== version) return this.snapshotAt(restaurantId, recovered);
    }
    return snapshot;
  }

  // ---------------------------------------------------------------- branch overrides (draft until published)

  async listBranchOverrides(device: Device, branchId?: string) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can manage branch menus');
    if (device.branchId && branchId && branchId !== device.branchId) throw new ForbiddenException('Branch is outside this workspace');
    branchId = device.branchId ?? branchId;
    const rows = await this.prisma.runAsTenant(device.restaurantId, (tx) => tx.syncedEntity.findMany({ where: { restaurantId: device.restaurantId, entityType: 'BRANCH_MENU_OVERRIDE' }, select: { payload: true } }));
    const all = rows.map((r) => r.payload as Record<string, unknown>).filter((p) => p && p.deleted !== true && (p.price !== undefined || p.isAvailable !== undefined));
    return { overrides: branchId ? all.filter((p) => p.branchId === branchId) : all };
  }

  /** Sets (or, with both fields null, clears) a branch's price/availability for a dish. Guests see it after the next publish. */
  async setBranchOverride(device: Device, dto: BranchOverrideDto) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can manage branch menus');
    if (device.branchId && dto.branchId !== device.branchId) throw new ForbiddenException('Branch is outside this workspace');
    const restaurantId = device.restaurantId;
    const result = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      if(dto.stockQuantity!==undefined&&dto.stockQuantity!==null)await this.entitlements.assertQrCapability(tx,restaurantId,'QR_INVENTORY_SYNC');
      const branch = await tx.branch.findFirst({ where: { id: dto.branchId, restaurantId }, select: { id: true } });
      if (!branch) throw new NotFoundException('Branch not found');
      const item = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'MENU_ITEM', externalId: dto.itemId } } });
      if (!item || (item.payload as Record<string, unknown>).deleted === true) throw new BadRequestException('That dish is not on the menu');
      const externalId = `${dto.branchId}:${dto.itemId}`;
      const existing = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId } } });
      const prior = (existing?.payload ?? {}) as Record<string, unknown>;
      const payload = {
        ...prior,
        id: externalId, branchId: dto.branchId, itemId: dto.itemId,
        ...(dto.price !== null && dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.isAvailable !== null && dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
        ...(dto.stockQuantity !== null && dto.stockQuantity !== undefined ? {stockQuantity:dto.stockQuantity} : {}),
        updatedAt: new Date().toISOString()
      };
      if (dto.price === null) delete payload.price;
      if (dto.isAvailable === null) delete payload.isAvailable;
      if(dto.stockQuantity===null)delete (payload as Record<string,unknown>).stockQuantity;
      await tx.syncedEntity.upsert({
        where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId } },
        create: { restaurantId, deviceId: device.id, entityType: 'BRANCH_MENU_OVERRIDE', externalId, payload },
        update: { payload, syncVersion: { increment: 1 } }
      });
      // Touch the dish so the branch's terminals pull it again with the new price (they only pull records changed since their cursor).
      await tx.syncedEntity.update({ where: { id: item.id }, data: { syncVersion: item.syncVersion + 1 } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: 'MENU_BRANCH_OVERRIDE_SET', category: 'MENU', details: { branchId: dto.branchId, itemId: dto.itemId, price: dto.price ?? null, isAvailable: dto.isAvailable ?? null } }, tx);
      return payload;
    });
    this.realtime.publish({ restaurantId, branchId: dto.branchId, kind: 'entity:MENU_ITEM', originDeviceId: device.id });
    return result;
  }

  /** A stored menu picture by content hash. The hash of the bytes is the address, so it is safe to cache for a year. */
  async image(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) return null;
    return this.prisma.runAsPlatform((tx) => tx.menuImage.findFirst({ where: { hash }, select: { contentType: true, data: true } }));
  }
}
