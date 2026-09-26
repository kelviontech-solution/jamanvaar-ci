import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { buildContent, SnapshotContent } from './menu-snapshot';

export const publishMenuSchema = z.object({ note: z.string().trim().max(200).optional() });
export type PublishMenuDto = z.infer<typeof publishMenuSchema>;

const MENU_ENTITY_TYPES = ['MENU_CATEGORY', 'MENU_ITEM', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'];

export interface LatestSnapshot { version: number; checksum: string; content: SnapshotContent }

@Injectable()
export class MenuPublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus
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

  /** Builds the snapshot from the draft inside an open transaction and records the numbered version. */
  private async publishTx(tx: Prisma.TransactionClient, restaurantId: string, deviceId: string | null, note: string | null) {
    // Serialise concurrent publishes so version numbers stay consecutive.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + restaurantId}))`;
    const built = buildContent(await this.draftRows(tx, restaurantId));
    if (built.errors.length > 0) throw new UnprocessableEntityException({ message: 'The menu has problems that must be fixed before publishing', errors: built.errors, warnings: built.warnings });
    const last = await tx.menuPublication.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    const created = await tx.menuPublication.create({ data: { restaurantId, version, watermark: new Date(), note, publishedByDeviceId: deviceId } });
    await tx.menuSnapshot.create({ data: { restaurantId, version, checksum: built.checksum, content: built.content as unknown as Prisma.InputJsonValue, note, publishedBy: deviceId } });
    return { created, warnings: built.warnings };
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

  /**
   * The snapshot customers read. A restaurant that has synced a menu but never pressed Publish gets its first snapshot made
   * automatically, so a new restaurant is not blank; after that, guests only ever see what was published.
   */
  async currentSnapshot(restaurantId: string): Promise<LatestSnapshot | null> {
    const read = (tx: Prisma.TransactionClient) => tx.menuSnapshot.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' } });
    const row = await this.prisma.runAsTenant(restaurantId, read);
    if (row) return { version: row.version, checksum: row.checksum, content: row.content as unknown as SnapshotContent };
    const first = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const existing = await read(tx);
      if (existing) return existing;
      if ((await this.draftRows(tx, restaurantId)).length === 0) return null;
      try {
        await this.publishTx(tx, restaurantId, null, 'Automatic first publication');
      } catch (e) {
        if (e instanceof UnprocessableEntityException) return null;
        throw e;
      }
      return read(tx);
    });
    return first ? { version: first.version, checksum: first.checksum, content: first.content as unknown as SnapshotContent } : null;
  }
}
