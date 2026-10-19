import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { QrRestaurantPageService } from './qr-restaurant-page.service';
import { CreateReservation, ReservationAction } from './qr-reservations.schema';

const TYPE = 'QR_RESERVATION';

@Injectable()
export class QrReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ApplicationEntitlementsService,
    private readonly pages: QrRestaurantPageService,
    private readonly audit: AuditService
  ) {}

  private where(restaurantId: string, id: string) {
    return { restaurantId_entityType_externalId: { restaurantId, entityType: TYPE, externalId: id } };
  }

  private view(row: { externalId: string; payload: Prisma.JsonValue; createdAt: Date }) {
    const p = row.payload as any;
    return {
      id: row.externalId,
      branchId: p.branchId as string,
      name: p.name as string,
      phone: p.phone as string,
      date: p.date as string,
      time: p.time as string,
      guests: p.guests as number,
      note: (p.note as string) ?? '',
      status: p.status as string,
      createdAt: row.createdAt.toISOString()
    };
  }

  /** Public: a business-page visitor requesting a table, identified only by the page's own slug --
   * there is no device or table context here, unlike every other QR guest action. */
  async create(slug: string, input: CreateReservation) {
    const { restaurantId, branchId } = await this.pages.resolveSlug(slug);
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const capability = await this.access.resolveQrCapability(tx, restaurantId, 'QR_RESERVATIONS', branchId);
      if (!capability.enabled) throw new ForbiddenException('Table reservations are not available for this restaurant.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-reservation:' + restaurantId + ':' + branchId + ':' + input.phone}))`;
      const recent = await tx.syncedEntity.findMany({
        where: { restaurantId, entityType: TYPE, createdAt: { gte: new Date(Date.now() - 5 * 60000) }, payload: { path: ['phone'], equals: input.phone } },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      if (recent.filter((r) => (r.payload as any).branchId === branchId).length >= 3)
        throw new ConflictException('You already have a recent reservation request. Please wait before submitting another.');
      const now = new Date().toISOString();
      const id = 'qr-reservation-' + randomBytes(16).toString('hex');
      const row = await tx.syncedEntity.create({
        data: {
          restaurantId,
          entityType: TYPE,
          externalId: id,
          payload: { branchId, ...input, status: 'PENDING', createdAt: now, updatedAt: now, history: [] }
        }
      });
      return this.view(row);
    });
  }

  /** Console-side inbox: every reservation for the device's restaurant, narrowed to its own
   * branch unless the device is restaurant-wide (branchId null, e.g. an owner's "all branches" view). */
  async list(device: Device) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.access.assertQrCapability(tx, device.restaurantId, 'QR_RESERVATIONS', device.branchId);
      const rows = await tx.syncedEntity.findMany({
        where: { restaurantId: device.restaurantId, entityType: TYPE },
        orderBy: { createdAt: 'desc' },
        take: 200
      });
      return rows.filter((r) => !device.branchId || (r.payload as any).branchId === device.branchId).map((r) => this.view(r));
    });
  }

  async action(device: Device, id: string, input: ReservationAction) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.access.assertQrCapability(tx, device.restaurantId, 'QR_RESERVATIONS', device.branchId);
      const where = this.where(device.restaurantId, id);
      const row = await tx.syncedEntity.findUnique({ where });
      if (!row) throw new NotFoundException('Reservation not found');
      const p = row.payload as any;
      if (device.branchId && p.branchId !== device.branchId) throw new ForbiddenException('Reservation belongs to a different branch');
      const now = new Date().toISOString();
      const updated = await tx.syncedEntity.update({
        where,
        data: { payload: { ...p, status: input.status, updatedAt: now, history: [...(p.history ?? []), { status: input.status, at: now }] } }
      });
      await this.audit.log(
        { actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'QR_RESERVATION_' + input.status, category: 'QR_ORDERING', details: { id } },
        tx
      );
      return this.view(updated);
    });
  }
}
