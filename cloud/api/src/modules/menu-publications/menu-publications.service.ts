import { ForbiddenException, Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';

export const publishMenuSchema = z.object({ note: z.string().trim().max(200).optional() });
export type PublishMenuDto = z.infer<typeof publishMenuSchema>;

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

  /** Records a new numbered menu version. Only the Restaurant Admin console edits and publishes the menu. */
  async publish(device: Device, dto: PublishMenuDto) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can publish the menu');
    const created = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      // Serialise concurrent publishes so version numbers stay consecutive.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + device.restaurantId}))`;
      const last = await tx.menuPublication.findFirst({ where: { restaurantId: device.restaurantId }, orderBy: { version: 'desc' } });
      const created = await tx.menuPublication.create({
        data: {
          restaurantId: device.restaurantId,
          version: (last?.version ?? 0) + 1,
          watermark: new Date(),
          note: dto.note ?? null,
          publishedByDeviceId: device.id
        }
      });
      await this.audit.log(
        { actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'MENU_PUBLISHED', category: 'MENU', details: { version: created.version, note: created.note } },
        tx
      );
      return created;
    });
    this.realtime.publish({ restaurantId: device.restaurantId, branchId: null, kind: 'menu', seq: created.version, originDeviceId: device.id });
    return created;
  }
}
