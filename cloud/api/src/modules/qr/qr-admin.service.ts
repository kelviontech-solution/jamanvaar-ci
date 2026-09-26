import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { QrSettingsService, QrSettingsUpdate } from './qr-settings.service';
import { newPublicToken, QR_APP_CODE, QR_AUDIT, QR_EVENT, QR_MODE, QR_STATUS, startOfDayIn } from './qr.support';

export const generateQrSchema = z
  .object({
    tableId: z.string().min(1).max(128).optional(),
    branchId: z.string().uuid().optional(),
    mode: z.enum(['TABLE_ORDER', 'MENU_ONLY']).default('TABLE_ORDER'),
    label: z.string().trim().max(60).optional()
  })
  .strict();
export type GenerateQr = z.infer<typeof generateQrSchema>;

type Tx = Prisma.TransactionClient;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Everything a restaurant does with its QR codes. The restaurant always comes from the authenticated console
 * device, never from a request field. QR state (tokens, status, versions) is authoritative here in the cloud:
 * a terminal cannot mint, extend or re-point a code.
 */
@Injectable()
export class QrAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly settings: QrSettingsService
  ) {}

  /** Only the restaurant's own Restaurant Admin console may manage QR codes. */
  assertConsole(device: Device): void {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can manage QR codes.');
  }

  /** The public address a QR code opens. Configured, never guessed; development gets a local default, production must set it. */
  publicBaseUrl(): string | null {
    const configured = this.config.get<string>('QR_ORDER_BASE_URL')?.trim().replace(/\/+$/, '');
    if (configured) return configured;
    return this.config.get<string>('NODE_ENV') === 'production' ? null : 'http://localhost:5190';
  }

  urlFor(token: string): string | null {
    const base = this.publicBaseUrl();
    return base ? `${base}/q/${token}` : null;
  }

  // ------------------------------------------------------------------ entitlement, for display

  async entitlement(restaurantId: string) {
    const result = await this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, QR_APP_CODE));
    return { ...result, lockedMessage: result.enabled ? null : lockMessage(result.reason) };
  }

  private async requireEnabled(restaurantId: string) {
    const result = await this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, QR_APP_CODE));
    if (!result.enabled) {
      throw new ForbiddenException({ statusCode: 403, code: 'ENTITLEMENT_REQUIRED', feature: QR_APP_CODE, reason: result.reason, message: lockMessage(result.reason) });
    }
    return result;
  }

  // ------------------------------------------------------------------ tables and codes

  async listTables(restaurantId: string) {
    const { tables, codes, branches } = await this.prisma.runAsTenant(restaurantId, async (tx) => ({
      tables: await tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'DINING_TABLE' }, select: { externalId: true, payload: true } }),
      codes: await tx.qrCode.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' } }),
      branches: await tx.branch.findMany({ where: { restaurantId }, select: { id: true, name: true, status: true } })
    }));
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    return tables
      .filter((t) => isObject(t.payload) && t.payload.deleted !== true)
      .map((t) => {
        const p = t.payload as Record<string, unknown>;
        const mine = codes.filter((c) => c.tableId === t.externalId);
        const active = mine.find((c) => c.status === QR_STATUS.ACTIVE) ?? null;
        const latest = active ?? mine[0] ?? null;
        return {
          tableId: t.externalId,
          displayNumber: String(p.tableNumber ?? ''),
          capacity: typeof p.capacity === 'number' ? p.capacity : null,
          zone: typeof p.zone === 'string' ? p.zone : null,
          isActive: p.isActive !== false,
          branchId: typeof p.branchId === 'string' ? p.branchId : latest?.branchId ?? null,
          qr: latest
            ? {
                id: latest.id,
                status: latest.status,
                version: latest.version,
                branchId: latest.branchId,
                branchName: latest.branchId ? branchName.get(latest.branchId) ?? null : null,
                lastScannedAt: latest.lastScannedAt?.toISOString() ?? null,
                url: latest.status === QR_STATUS.ACTIVE ? this.urlFor(latest.publicToken) : null
              }
            : null
        };
      })
      .sort((a, b) => a.displayNumber.localeCompare(b.displayNumber, undefined, { numeric: true }));
  }

  async listBranches(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, (tx) => tx.branch.findMany({ where: { restaurantId }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } }));
  }

  private async resolveBranch(tx: Tx, restaurantId: string, requested: string | undefined, tablePayload: Record<string, unknown> | null): Promise<string> {
    const branches = await tx.branch.findMany({ where: { restaurantId, status: 'ACTIVE' }, select: { id: true } });
    const wanted = requested ?? (typeof tablePayload?.branchId === 'string' ? (tablePayload.branchId as string) : undefined);
    if (wanted) {
      if (!branches.some((b) => b.id === wanted)) throw new BadRequestException('That branch does not belong to this restaurant or is not active.');
      return wanted;
    }
    if (branches.length === 1) return branches[0].id;
    throw new BadRequestException(branches.length === 0 ? 'Add a branch before creating QR codes.' : 'Choose the branch this QR code belongs to.');
  }

  async generate(device: Device, dto: GenerateQr) {
    const restaurantId = device.restaurantId;
    const ent = await this.requireEnabled(restaurantId);
    const created = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      let tableNumber: string | null = null;
      let tablePayload: Record<string, unknown> | null = null;
      if (dto.mode === QR_MODE.TABLE_ORDER) {
        if (!dto.tableId) throw new BadRequestException('Choose a table.');
        const row = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'DINING_TABLE', externalId: dto.tableId } } });
        tablePayload = isObject(row?.payload) && (row!.payload as Record<string, unknown>).deleted !== true ? (row!.payload as Record<string, unknown>) : null;
        if (!tablePayload) throw new NotFoundException('That table does not exist.');
        tableNumber = String(tablePayload.tableNumber ?? '');
        const existing = await tx.qrCode.findFirst({ where: { restaurantId, tableId: dto.tableId, status: QR_STATUS.ACTIVE, mode: QR_MODE.TABLE_ORDER } });
        if (existing) throw new ConflictException('This table already has an active QR code. Regenerate it to replace it.');
      }
      await this.assertTableLimit(tx, restaurantId, ent.limits);
      const branchId = await this.resolveBranch(tx, restaurantId, dto.branchId, tablePayload);
      const code = await tx.qrCode.create({
        data: { restaurantId, branchId, tableId: dto.tableId ?? null, tableNumber: tableNumber ?? dto.label ?? null, mode: dto.mode, publicToken: newPublicToken(), status: QR_STATUS.ACTIVE, metadata: dto.label ? { label: dto.label } : undefined }
      });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: QR_AUDIT.CREATED, category: 'QR_ORDERING', details: { qrCodeId: code.id, branchId, tableId: dto.tableId ?? null, mode: dto.mode } }, tx);
      return code;
    });
    return this.view(created);
  }

  async regenerate(device: Device, codeId: string) {
    const restaurantId = device.restaurantId;
    await this.requireEnabled(restaurantId);
    const next = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const current = await this.own(tx, restaurantId, codeId);
      if (current.status === QR_STATUS.REVOKED) throw new ConflictException('This code was already revoked. Generate a new one for the table.');
      // The old code stops working in the same transaction the new one starts, so there is never a moment with two live tokens.
      await tx.qrCode.update({ where: { id: current.id }, data: { status: QR_STATUS.REVOKED, revokedAt: new Date() } });
      const fresh = await tx.qrCode.create({
        data: { restaurantId, branchId: current.branchId, tableId: current.tableId, tableNumber: current.tableNumber, mode: current.mode, publicToken: newPublicToken(), status: QR_STATUS.ACTIVE, version: current.version + 1, metadata: (current.metadata ?? undefined) as never }
      });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: QR_AUDIT.REGENERATED, category: 'QR_ORDERING', details: { previousQrCodeId: current.id, qrCodeId: fresh.id, version: fresh.version, tableId: current.tableId } }, tx);
      return fresh;
    });
    return this.view(next);
  }

  async revoke(device: Device, codeId: string) {
    return this.transition(device, codeId, QR_STATUS.REVOKED, QR_AUDIT.REVOKED);
  }

  async disable(device: Device, codeId: string) {
    return this.transition(device, codeId, QR_STATUS.DISABLED, QR_AUDIT.DISABLED);
  }

  async enable(device: Device, codeId: string) {
    return this.transition(device, codeId, QR_STATUS.ACTIVE, QR_AUDIT.ENABLED);
  }

  private async transition(device: Device, codeId: string, to: string, action: string) {
    const restaurantId = device.restaurantId;
    const ent = to === QR_STATUS.ACTIVE ? await this.requireEnabled(restaurantId) : null;
    const updated = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const current = await this.own(tx, restaurantId, codeId);
      if (current.status === QR_STATUS.REVOKED) throw new ConflictException('A revoked code cannot be changed. Generate a new one.');
      if (to === QR_STATUS.ACTIVE && ent) {
        await this.assertTableLimit(tx, restaurantId, ent.limits);
        const clash = current.tableId ? await tx.qrCode.findFirst({ where: { restaurantId, tableId: current.tableId, status: QR_STATUS.ACTIVE, mode: QR_MODE.TABLE_ORDER, NOT: { id: current.id } } }) : null;
        if (clash) throw new ConflictException('This table already has another active QR code.');
      }
      const row = await tx.qrCode.update({ where: { id: current.id }, data: { status: to, revokedAt: to === QR_STATUS.REVOKED ? new Date() : null } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action, category: 'QR_ORDERING', details: { qrCodeId: current.id, from: current.status, to } }, tx);
      return row;
    });
    return this.view(updated);
  }

  private async own(tx: Tx, restaurantId: string, codeId: string) {
    const code = await tx.qrCode.findFirst({ where: { id: codeId, restaurantId } });
    if (!code) throw new NotFoundException('QR code not found.');
    return code;
  }

  private async assertTableLimit(tx: Tx, restaurantId: string, limits: Record<string, unknown>) {
    const max = typeof limits.qrMaxActiveTables === 'number' ? (limits.qrMaxActiveTables as number) : typeof limits.maxActiveTables === 'number' ? (limits.maxActiveTables as number) : null;
    if (max === null) return;
    const active = await tx.qrCode.count({ where: { restaurantId, status: QR_STATUS.ACTIVE } });
    if (active >= max) throw new ConflictException(`This plan allows ${max} active QR code${max === 1 ? '' : 's'}. Revoke one or upgrade the plan.`);
  }

  private view(code: { id: string; status: string; mode: string; version: number; tableId: string | null; tableNumber: string | null; branchId: string | null; publicToken: string }) {
    return { id: code.id, status: code.status, mode: code.mode, version: code.version, tableId: code.tableId, displayNumber: code.tableNumber, branchId: code.branchId, url: code.status === QR_STATUS.ACTIVE ? this.urlFor(code.publicToken) : null };
  }

  /** Everything the print layout needs and nothing internal: no ids, no tokens beyond the URL the QR itself encodes. */
  async printData(restaurantId: string, codeId: string) {
    const { code, restaurant, branch } = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const found = await this.own(tx, restaurantId, codeId);
      return {
        code: found,
        restaurant: await tx.restaurant.findFirstOrThrow({ where: { id: restaurantId }, select: { name: true } }),
        branch: found.branchId ? await tx.branch.findFirst({ where: { id: found.branchId, restaurantId }, select: { name: true } }) : null
      };
    });
    if (code.status !== QR_STATUS.ACTIVE) throw new ConflictException('Only an active code can be printed.');
    return { restaurantName: restaurant.name, branchName: branch?.name ?? null, tableLabel: code.tableNumber ? `Table ${code.tableNumber}` : 'Scan to view menu', url: this.urlFor(code.publicToken), tagline: 'Scan • Order • Enjoy' };
  }

  // ------------------------------------------------------------------ orders and dashboard (from real data)

  async listOrders(restaurantId: string, opts: { branchId?: string; limit?: number }) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedOrder.findMany({ where: { restaurantId, source: 'QR', ...(opts.branchId ? { branchId: opts.branchId } : {}) }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(opts.limit ?? 50, 1), 200) })
    );
    return rows.map((o) => {
      const meta = (o.meta ?? {}) as Record<string, unknown>;
      return { orderNumber: typeof meta.tokenNumber === 'string' ? meta.tokenNumber : null, table: o.tableLabel, branchId: o.branchId, status: o.status, paymentStatus: o.paymentStatus, total: o.totalAmount / 100, placedAt: o.createdAt.toISOString(), itemCount: Array.isArray(o.items) ? (o.items as unknown[]).length : 0 };
    });
  }

  async overview(restaurantId: string) {
    const entitlement = await this.entitlement(restaurantId);
    const data = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const restaurant = await tx.restaurant.findFirstOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
      const dayStart = startOfDayIn(restaurant.timezone);
      const [tables, activeCodes, totalCodes, orders, events] = await Promise.all([
        tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'DINING_TABLE' }, select: { payload: true } }),
        tx.qrCode.count({ where: { restaurantId, status: QR_STATUS.ACTIVE } }),
        tx.qrCode.count({ where: { restaurantId } }),
        tx.syncedOrder.findMany({ where: { restaurantId, source: 'QR', createdAt: { gte: dayStart } }, select: { status: true, paymentStatus: true, totalAmount: true, tableLabel: true, branchId: true } }),
        tx.qrEvent.groupBy({ by: ['type'], where: { restaurantId, createdAt: { gte: dayStart } }, _count: { _all: true } })
      ]);
      return { tables, activeCodes, totalCodes, orders, events };
    });
    const liveTables = data.tables.filter((t) => isObject(t.payload) && t.payload.deleted !== true);
    const placed = data.orders.filter((o) => !['CANCELLED', 'VOIDED', 'REFUNDED'].includes(o.status));
    const done = data.orders.filter((o) => ['COMPLETED', 'SERVED'].includes(o.status));
    const count = (type: string) => data.events.find((e) => e.type === type)?._count._all ?? 0;
    const byTable = new Map<string, number>();
    for (const o of placed) byTable.set(o.tableLabel ?? '-', (byTable.get(o.tableLabel ?? '-') ?? 0) + 1);
    const salesPaise = placed.reduce((s, o) => s + o.totalAmount, 0);
    return {
      entitlement,
      tables: liveTables.length,
      activeTables: liveTables.filter((t) => (t.payload as Record<string, unknown>).isActive !== false).length,
      codesGenerated: data.totalCodes,
      activeCodes: data.activeCodes,
      today: {
        scans: count(QR_EVENT.SCANNED),
        menuViews: count(QR_EVENT.MENU_VIEWED),
        ordersPlaced: placed.length,
        ordersPending: data.orders.filter((o) => ['NEW', 'PREPARING', 'CONFIRMED', 'READY'].includes(o.status)).length,
        ordersCompleted: done.length,
        failedAttempts: count(QR_EVENT.ORDER_FAILED),
        sales: salesPaise / 100,
        paidSales: placed.filter((o) => o.paymentStatus === 'SUCCESS').reduce((s, o) => s + o.totalAmount, 0) / 100,
        averageOrderValue: placed.length ? salesPaise / placed.length / 100 : 0,
        ordersByTable: [...byTable.entries()].map(([table, orders]) => ({ table, orders })).sort((a, b) => b.orders - a.orders)
      },
      publicBaseUrlConfigured: this.publicBaseUrl() !== null
    };
  }

  async updateSettings(device: Device, changes: QrSettingsUpdate, branchId?: string) {
    await this.requireEnabled(device.restaurantId);
    return this.settings.update(device.restaurantId, { id: device.id, type: 'DEVICE' }, changes, branchId ?? null);
  }

  getSettings(restaurantId: string, branchId?: string) {
    return this.settings.get(restaurantId, branchId ?? null);
  }
}

export function lockMessage(reason: string): string {
  switch (reason) {
    case 'NOT_INCLUDED':
      return 'QR Ordering is not included in your current plan.';
    case 'DISABLED':
      return "QR Ordering is disabled because this restaurant's current plan does not include QR Ordering.";
    case 'SUBSCRIPTION_EXPIRED':
      return 'QR Ordering is unavailable because the subscription has expired.';
    case 'NO_SUBSCRIPTION':
      return 'QR Ordering is unavailable because there is no active subscription.';
    case 'RESTAURANT_INACTIVE':
      return 'QR Ordering is unavailable because this restaurant is not active.';
    default:
      return 'QR Ordering is available on an eligible plan.';
  }
}
