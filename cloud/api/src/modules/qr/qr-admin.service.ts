import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { QrResolutionCache } from './qr-resolution-cache';
import { QrSettingsService, QrSettingsUpdate, QrBrandingUpdate } from './qr-settings.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderSyncService } from '../order-sync/order-sync.service';
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

export const createTableSchema = z
  .object({
    tableNumber: z.string().trim().min(1).max(20),
    capacity: z.number().int().min(1).max(200).default(4),
    zone: z.string().trim().max(60).optional(),
    branchId: z.string().uuid().optional()
  })
  .strict();
export type CreateTable = z.infer<typeof createTableSchema>;

export const updateTableSchema = z
  .object({
    tableNumber: z.string().trim().min(1).max(20).optional(),
    capacity: z.number().int().min(1).max(200).optional(),
    zone: z.string().trim().max(60).optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateTable = z.infer<typeof updateTableSchema>;

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
    private readonly settings: QrSettingsService,
    private readonly cache: QrResolutionCache<{ restaurant: { id: string } }>,
    private readonly realtime: RealtimeBus,
    private readonly payments: PaymentsService,
    private readonly orderSync: OrderSyncService
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

  async listTables(restaurantId: string, branchId?: string | null) {
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
      .filter(t => !branchId || t.branchId === branchId)
      .sort((a, b) => a.displayNumber.localeCompare(b.displayNumber, undefined, { numeric: true }));
  }

  /** Adds a table from the console. It lands in the same store the floor plan syncs through, so every device receives it. */
  async createTable(device: Device, dto: CreateTable) {
    const restaurantId = device.restaurantId;
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const branchId = await this.resolveBranch(tx, restaurantId, this.scopedBranch(device, dto.branchId), null);
      const live = (await tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'DINING_TABLE' }, select: { payload: true } })).map((r) => r.payload as Record<string, unknown>).filter((p) => isObject(p) && p.deleted !== true);
      if (live.some((p) => String(p.tableNumber ?? '').toLowerCase() === dto.tableNumber.toLowerCase() && (p.branchId === undefined || p.branchId === branchId))) throw new ConflictException(`Table ${dto.tableNumber} already exists in this branch.`);
      const id = `tbl-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
      const payload = { id, tableNumber: dto.tableNumber, capacity: dto.capacity, zone: dto.zone ?? 'Main Hall', floor: 1, status: 'AVAILABLE', isActive: true, branchId, updatedAt: new Date().toISOString() };
      await tx.syncedEntity.create({ data: { restaurantId, deviceId: device.id, entityType: 'DINING_TABLE', externalId: id, payload } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: 'TABLE_CREATED', category: 'QR_ORDERING', details: { tableId: id, tableNumber: dto.tableNumber, branchId } }, tx);
      return payload;
    });
  }

  /** Renames, resizes, or switches a table on/off. A switched-off table's QR code stops resolving straight away. */
  async updateTable(device: Device, tableId: string, dto: UpdateTable) {
    const restaurantId = device.restaurantId;
    const out = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const row = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'DINING_TABLE', externalId: tableId } } });
      const current = isObject(row?.payload) && (row!.payload as Record<string, unknown>).deleted !== true ? (row!.payload as Record<string, unknown>) : null;
      if (!row || !current || (device.branchId && current.branchId !== device.branchId)) throw new NotFoundException('That table does not exist.');
      if (dto.tableNumber && dto.tableNumber.toLowerCase() !== String(current.tableNumber ?? '').toLowerCase()) {
        const others = (await tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'DINING_TABLE', NOT: { id: row.id } }, select: { payload: true } })).map((r) => r.payload as Record<string, unknown>);
        if (others.some((p) => isObject(p) && p.deleted !== true && String(p.tableNumber ?? '').toLowerCase() === dto.tableNumber!.toLowerCase() && (p.branchId ?? null) === (current.branchId ?? null))) throw new ConflictException(`Table ${dto.tableNumber} already exists in this branch.`);
      }
      const payload = { ...current, ...dto, updatedAt: new Date().toISOString() };
      await tx.syncedEntity.update({ where: { id: row.id }, data: { payload, syncVersion: row.syncVersion + 1 } });
      if (dto.tableNumber) await tx.qrCode.updateMany({ where: { restaurantId, tableId }, data: { tableNumber: dto.tableNumber } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: 'TABLE_UPDATED', category: 'QR_ORDERING', details: { tableId, changes: dto } }, tx);
      return payload;
    });
    this.cache.invalidate(restaurantId);
    this.realtime.publish({ restaurantId, branchId: device.branchId, kind: 'entity:DINING_TABLE', originDeviceId: device.id });
    return out;
  }

  async listBranches(restaurantId: string, branchId?: string | null) {
    return this.prisma.runAsTenant(restaurantId, (tx) => tx.branch.findMany({ where: { restaurantId, ...(branchId ? { id: branchId } : {}) }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } }));
  }

  scopedBranch(device: Device, requested?: string): string | undefined {
    if (device.branchId && requested && device.branchId !== requested) throw new ForbiddenException('Branch is outside this console workspace');
    return device.branchId ?? requested;
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
      await this.assertTableLimit(tx, restaurantId, ent.limits);
      let tableNumber: string | null = null;
      let tablePayload: Record<string, unknown> | null = null;
      if (dto.mode === QR_MODE.TABLE_ORDER) {
        if (!dto.tableId) throw new BadRequestException('Choose a table.');
        const row = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'DINING_TABLE', externalId: dto.tableId } } });
        tablePayload = isObject(row?.payload) && (row!.payload as Record<string, unknown>).deleted !== true ? (row!.payload as Record<string, unknown>) : null;
        if (!tablePayload || (device.branchId && tablePayload.branchId !== device.branchId)) throw new NotFoundException('That table does not exist.');
        if (dto.branchId && tablePayload.branchId && dto.branchId !== tablePayload.branchId) throw new ConflictException('Table and QR branch must match.');
        tableNumber = String(tablePayload.tableNumber ?? '');
        const existing = await tx.qrCode.findFirst({ where: { restaurantId, tableId: dto.tableId, status: QR_STATUS.ACTIVE, mode: QR_MODE.TABLE_ORDER } });
        if (existing) throw new ConflictException('This table already has an active QR code. Regenerate it to replace it.');
      }
      const branchId = await this.resolveBranch(tx, restaurantId, this.scopedBranch(device, dto.branchId), tablePayload);
      await this.assertBranchLimit(tx,restaurantId,ent.limits,branchId);
      const code = await tx.qrCode.create({
        data: { restaurantId, branchId, tableId: dto.tableId ?? null, tableNumber: tableNumber ?? dto.label ?? null, mode: dto.mode, publicToken: newPublicToken(), status: QR_STATUS.ACTIVE, metadata: dto.label ? { label: dto.label } : undefined }
      });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: QR_AUDIT.CREATED, category: 'QR_ORDERING', details: { qrCodeId: code.id, branchId, tableId: dto.tableId ?? null, mode: dto.mode } }, tx);
      return code;
    });
    this.cache.invalidate(restaurantId);
    return this.view(created);
  }

  async regenerate(device: Device, codeId: string) {
    const restaurantId = device.restaurantId;
    await this.requireEnabled(restaurantId);
    const next = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const current = await this.own(tx, restaurantId, codeId, device.branchId);
      if (current.status === QR_STATUS.REVOKED) throw new ConflictException('This code was already revoked. Generate a new one for the table.');
      // The old code stops working in the same transaction the new one starts, so there is never a moment with two live tokens.
      await tx.qrCode.update({ where: { id: current.id }, data: { status: QR_STATUS.REVOKED, revokedAt: new Date() } });
      const fresh = await tx.qrCode.create({
        data: { restaurantId, branchId: current.branchId, tableId: current.tableId, tableNumber: current.tableNumber, mode: current.mode, publicToken: newPublicToken(), status: QR_STATUS.ACTIVE, version: current.version + 1, metadata: (current.metadata ?? undefined) as never }
      });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: QR_AUDIT.REGENERATED, category: 'QR_ORDERING', details: { previousQrCodeId: current.id, qrCodeId: fresh.id, version: fresh.version, tableId: current.tableId } }, tx);
      return fresh;
    });
    this.cache.invalidate(restaurantId);
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
      const current = await this.own(tx, restaurantId, codeId, device.branchId);
      if (current.status === QR_STATUS.REVOKED) throw new ConflictException('A revoked code cannot be changed. Generate a new one.');
      if (to === QR_STATUS.ACTIVE && ent) {
        if(current.status!==QR_STATUS.ACTIVE)await this.assertTableLimit(tx, restaurantId, ent.limits);
        if(current.branchId)await this.assertBranchLimit(tx,restaurantId,ent.limits,current.branchId);
        const clash = current.tableId ? await tx.qrCode.findFirst({ where: { restaurantId, tableId: current.tableId, status: QR_STATUS.ACTIVE, mode: QR_MODE.TABLE_ORDER, NOT: { id: current.id } } }) : null;
        if (clash) throw new ConflictException('This table already has another active QR code.');
      }
      const row = await tx.qrCode.update({ where: { id: current.id }, data: { status: to, revokedAt: to === QR_STATUS.REVOKED ? new Date() : null } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action, category: 'QR_ORDERING', details: { qrCodeId: current.id, from: current.status, to } }, tx);
      return row;
    });
    this.cache.invalidate(restaurantId);
    return this.view(updated);
  }

  private async own(tx: Tx, restaurantId: string, codeId: string, branchId?: string | null) {
    const code = await tx.qrCode.findFirst({ where: { id: codeId, restaurantId, ...(branchId ? { branchId } : {}) } });
    if (!code) throw new NotFoundException('QR code not found.');
    return code;
  }

  private async assertTableLimit(tx: Tx, restaurantId: string, limits: Record<string, unknown>) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-codes:' + restaurantId}))`;
    const max = typeof limits.qrMaxActiveTables === 'number' ? (limits.qrMaxActiveTables as number) : typeof limits.maxActiveTables === 'number' ? (limits.maxActiveTables as number) : null;
    if (max === null) return;
    const active = await tx.qrCode.count({ where: { restaurantId, status: QR_STATUS.ACTIVE } });
    if (active >= max) throw new ConflictException(`This plan allows ${max} active QR code${max === 1 ? '' : 's'}. Revoke one or upgrade the plan.`);
  }

  private async assertBranchLimit(tx:Tx,restaurantId:string,limits:Record<string,unknown>,branchId:string){
    const cap=limits.qrMaxBranches;if(typeof cap!=='number')return;
    const active=await tx.qrCode.findMany({where:{restaurantId,status:QR_STATUS.ACTIVE},select:{branchId:true},distinct:['branchId']});
    if(!active.some(b=>b.branchId===branchId)&&active.length>=cap)throw new ConflictException('This license has reached its configured active QR branch limit. Existing codes keep working.');
  }

  private view(code: { id: string; status: string; mode: string; version: number; tableId: string | null; tableNumber: string | null; branchId: string | null; publicToken: string }) {
    return { id: code.id, status: code.status, mode: code.mode, version: code.version, tableId: code.tableId, displayNumber: code.tableNumber, branchId: code.branchId, url: code.status === QR_STATUS.ACTIVE ? this.urlFor(code.publicToken) : null };
  }

  /** Everything the print layout needs and nothing internal: no ids, no tokens beyond the URL the QR itself encodes. */
  async printData(restaurantId: string, codeId: string, branchId?: string | null) {
    const { code, restaurant, branch } = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const found = await this.own(tx, restaurantId, codeId, branchId);
      return {
        code: found,
        restaurant: await tx.restaurant.findFirstOrThrow({ where: { id: restaurantId }, select: { name: true } }),
        branch: found.branchId ? await tx.branch.findFirst({ where: { id: found.branchId, restaurantId }, select: { name: true } }) : null
      };
    });
    if (code.status !== QR_STATUS.ACTIVE) throw new ConflictException('Only an active code can be printed.');
    const branding = await this.settings.branding(restaurantId);
    return { restaurantName: restaurant.name, branchName: branch?.name ?? null, tableLabel: code.tableNumber ? `Table ${code.tableNumber}` : 'Scan to view menu', url: this.urlFor(code.publicToken), tagline: 'Scan • Order • Enjoy', logoUrl: branding.logoUrl, design: await this.settings.printDesign(restaurantId) };
  }

  // ------------------------------------------------------------------ orders and dashboard (from real data)

  async listOrders(restaurantId: string, opts: { branchId?: string; limit?: number }) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedOrder.findMany({ where: { restaurantId, source: 'QR', ...(opts.branchId ? { branchId: opts.branchId } : {}) }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(opts.limit ?? 50, 1), 200) })
    );
    return rows.map((o) => {
      const meta = (o.meta ?? {}) as Record<string, unknown>;
      return { id: o.externalOrderId, version: o.syncVersion, orderNumber: typeof meta.tokenNumber === 'string' ? meta.tokenNumber : null, table: o.tableLabel, branchId: o.branchId, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, total: o.totalAmount / 100, placedAt: o.createdAt.toISOString(), itemCount: Array.isArray(o.items) ? (o.items as unknown[]).length : 0,
        pickupAt:meta.pickupAt??null,pickupTimezone:meta.pickupTimezone??null,pickupInstructions:meta.pickupInstructions??null,items: o.items, notes: o.notes, history: meta.qrStatusHistory ?? [], customerName: meta.customerName ?? null };
    });
  }

  /** Everything still open at one table (QR orders and staff orders alike), so a waiter can see the table's whole tab. */
  async tableOrders(restaurantId: string, tableId: string, branchId?: string | null) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedOrder.findMany({ where: { restaurantId, tableId, ...(branchId ? { branchId } : {}), status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } }, orderBy: { createdAt: 'asc' }, take: 200 })
    );
    return rows.map((o) => {
      const meta = (o.meta ?? {}) as Record<string, unknown>;
      return { orderNumber: typeof meta.orderNumber === 'string' ? meta.orderNumber : typeof meta.tokenNumber === 'string' ? meta.tokenNumber : null, source: o.source, status: o.status, paymentStatus: o.paymentStatus, total: o.totalAmount / 100, placedAt: o.createdAt.toISOString(), items: Array.isArray(o.items) ? (o.items as Array<Record<string, unknown>>).map((i) => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers })) : [] };
    });
  }

  async overview(restaurantId: string, branchId?: string | null) {
    const entitlement = await this.entitlement(restaurantId);
    const data = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const restaurant = await tx.restaurant.findFirstOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
      const dayStart = startOfDayIn(restaurant.timezone);
      const [tables, activeCodes, totalCodes, orders, events] = await Promise.all([
        tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'DINING_TABLE', ...(branchId ? { payload: { path: ['branchId'], equals: branchId } } : {}) }, select: { payload: true } }),
        tx.qrCode.count({ where: { restaurantId, ...(branchId ? { branchId } : {}), status: QR_STATUS.ACTIVE } }),
        tx.qrCode.count({ where: { restaurantId, ...(branchId ? { branchId } : {}) } }),
        tx.syncedOrder.findMany({ where: { restaurantId, source: 'QR', ...(branchId ? { branchId } : {}), createdAt: { gte: dayStart } }, select: { status: true, paymentStatus: true, totalAmount: true, tableLabel: true, branchId: true } }),
        tx.qrEvent.groupBy({ by: ['type'], where: { restaurantId, ...(branchId ? { branchId } : {}), createdAt: { gte: dayStart } }, _count: { _all: true } })
      ]);
      return { tables, activeCodes, totalCodes, orders, events };
    });
    const liveTables = data.tables.filter((t) => isObject(t.payload) && t.payload.deleted !== true);
    const placed = data.orders.filter((o) => !['DRAFT', 'CANCELLED', 'VOIDED', 'REFUNDED'].includes(o.status));
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
    return this.settings.update(device.restaurantId, { id: device.id, type: 'DEVICE' }, changes, this.scopedBranch(device, branchId) ?? null);
  }

  async inheritSettings(device: Device, branchId?: string) {
    await this.requireEnabled(device.restaurantId);
    const branch = this.scopedBranch(device, branchId);
    if (!branch) throw new BadRequestException('Select a branch first');
    return this.settings.inherit(device.restaurantId, device.id, branch);
  }

  async manageOrder(device: Device, orderId: string, body: { action: string; version: number; reason?: string }) {
    await this.requireEnabled(device.restaurantId);
    return this.orderSync.manageQrOrder(device, orderId, body.action, body.version, body.reason);
  }

  async analytics(device: Device, from?: string, to?: string, branchId?: string) {
    await this.requireEnabled(device.restaurantId);
    const branch = this.scopedBranch(device, branchId);
    for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date + 'T00:00:00Z').getTime()) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)) throw new BadRequestException('Use valid calendar dates');
    const start = from ? new Date(from + 'T00:00:00Z') : new Date(Date.now() - 7 * 86400000);
    const end = to ? new Date(to + 'T00:00:00Z') : new Date();
    if (to) end.setUTCDate(end.getUTCDate() + 1);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 367 * 86400000) throw new BadRequestException('Choose a valid date range of up to one year');
    const where = { restaurantId: device.restaurantId, ...(branch ? { branchId: branch } : {}), createdAt: { gte: start, lt: end } };
    const [orders, events, payments, codeEvents, codes, refunds, allocations] = await this.prisma.runAsTenant(device.restaurantId, tx => Promise.all([
      tx.syncedOrder.findMany({ where: { ...where, source: 'QR' } }),
      tx.qrEvent.groupBy({ by: ['type'], where, _count: { _all: true } }),
      tx.paymentTransaction.findMany({ where: { restaurantId: device.restaurantId, createdAt: where.createdAt, order: { source: 'QR', ...(branch ? { branchId: branch } : {}) } }, orderBy: { createdAt: 'desc' }, select: { status: true, amount: true, createdAt: true, failureReason: true, providerPaymentId: true } }),
      tx.qrEvent.groupBy({ by: ['qrCodeId', 'type'], where, _count: { _all: true } }),
      tx.qrCode.findMany({ where: { restaurantId: device.restaurantId, ...(branch ? { branchId: branch } : {}) }, select: { id: true, tableNumber: true, branchId: true, version: true, status: true } }),
      // Refunds are attributed to the original order cohort, matching the shared dashboard.
      tx.refund.findMany({ where: { restaurantId: device.restaurantId, status: 'SUCCESS', payment: { order: { source: 'QR', createdAt: where.createdAt, ...(branch ? { branchId: branch } : {}) } } }, select: { amount: true, payment: { select: { order: { select: { externalOrderId: true } } } } } }),
      tx.orderPaymentEntry.findMany({where:{restaurantId:device.restaurantId,order:{source:'QR',createdAt:where.createdAt,...(branch?{branchId:branch}:{})}},select:{orderId:true,kind:true,amount:true}})
    ]));
    const live = orders.filter(o => !['DRAFT', 'CANCELLED', 'REFUNDED', 'VOIDED'].includes(o.status));
    const count = (type: string) => events.find(e => e.type === type)?._count._all ?? 0;
    const sum = (rows: typeof orders) => rows.reduce((n, o) => n + o.totalAmount, 0) / 100;
    const refundByOrder = new Map<string, number>();
    for (const refund of refunds) {
      const id = refund.payment.order.externalOrderId;
      refundByOrder.set(id, (refundByOrder.get(id) ?? 0) + refund.amount);
    }
    const paid = orders.filter(o => ['SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUND_PENDING', 'REFUNDED'].includes(o.paymentStatus ?? '') && !['DRAFT', 'CANCELLED', 'VOID', 'VOIDED'].includes(o.status));
    const legacyRefunds = new Map<string,number>();
    const refundedPaise = paid.reduce((total, order) => {
      const meta = isObject(order.meta) ? order.meta : {};
      const gateway = refundByOrder.get(order.externalOrderId) ?? 0;
      const full = order.status === 'REFUNDED' || order.paymentStatus === 'REFUNDED';
      const amount=Math.min(order.totalAmount, Math.max(0, full ? typeof meta.refundAmountPaise === 'number' ? Math.max(gateway, meta.refundAmountPaise) : order.totalAmount : gateway));
      legacyRefunds.set(order.id,amount);return total+amount;
    }, 0);
    const byOrder = new Map<string,{collected:number;refunded:number}>();
    for(const entry of allocations){const row=byOrder.get(entry.orderId)??{collected:0,refunded:0};if(entry.kind==='COLLECTION')row.collected+=entry.amount;else row.refunded+=entry.amount;byOrder.set(entry.orderId,row);}
    const grossSales = orders.reduce((n,o)=>n+(byOrder.get(o.id)?.collected??(paid.some(p=>p.id===o.id)?o.totalAmount:0)),0)/100;
    const ledgerRefunds=orders.reduce((n,o)=>n+(byOrder.get(o.id)?.refunded??0),0);
    const refundsTotal=orders.reduce((n,o)=>n+Math.max(legacyRefunds.get(o.id)??0,byOrder.get(o.id)?.refunded??0),0),netSales=grossSales-refundsTotal/100;
    const outstanding=live.filter(o=>o.paymentMethod==='CASH_AT_COUNTER').reduce((n,o)=>n+Math.max(0,o.totalAmount-(byOrder.get(o.id)?.collected??(paid.some(p=>p.id===o.id)?o.totalAmount:0))),0)/100;
    const byBranch = new Map<string, { orders: number; sales: number }>(), trend = new Map<string, { orders: number; sales: number }>(), popular = new Map<string, { name: string; quantity: number }>();
    for (const o of live) {
      for (const [map, key] of [[byBranch, o.branchId ?? 'Unassigned'], [trend, o.createdAt.toISOString().slice(0, 10)]] as const) { const row = map.get(key) ?? { orders: 0, sales: 0 }; row.orders++; row.sales += o.totalAmount; map.set(key, row); }
      for (const i of Array.isArray(o.items) ? o.items : []) { const item = i as Record<string, any>; const key = String(item.menuItemId ?? item.name); const row = popular.get(key) ?? { name: String(item.name), quantity: 0 }; row.quantity += Number(item.quantity) || 0; popular.set(key, row); }
    }
    const byCode = codes.map(code => {
      const own = live.filter(order => order.qrCodeId === code.id);
      return { codeId: code.id, table: code.tableNumber ?? 'Counter / takeaway', branchId: code.branchId, version: code.version, status: code.status, scans: codeEvents.find(event => event.qrCodeId === code.id && event.type === QR_EVENT.SCANNED)?._count._all ?? 0, orders: own.length, sales: sum(own) };
    }).filter(code => code.scans || code.orders);
    return { from: start.toISOString(), to: end.toISOString(), metrics: { scans: count(QR_EVENT.SCANNED), menuViews: count(QR_EVENT.MENU_VIEWED), itemAdds: count('QR_ITEM_ADDED'), carts: count(QR_EVENT.CART_CREATED), checkoutStarts: count('QR_CHECKOUT_STARTED'), orders: live.length, preparing: live.filter(o => o.status === 'PREPARING').length, pending: live.filter(o => ['NEW', 'CONFIRMED', 'READY'].includes(o.status)).length, completed: live.filter(o => ['COMPLETED', 'SERVED'].includes(o.status)).length, cancelled: orders.filter(o => o.status === 'CANCELLED').length, grossOrderValue: sum(live), grossSales, netSales, collected: grossSales, outstandingCounter: outstanding, refunded: refundsTotal / 100, averageOrderValue: live.length ? sum(live) / live.length : 0, conversion: count(QR_EVENT.MENU_VIEWED) ? live.length / count(QR_EVENT.MENU_VIEWED) : 0, onlineSuccess: payments.filter(p => ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUND_PENDING', 'REFUNDED'].includes(p.status)).length, onlineFailed: payments.filter(p => p.status === 'FAILED').length, onlinePending: payments.filter(p => ['PENDING', 'CREATED', 'AUTHORIZED'].includes(p.status)).length, cashOrders: live.filter(o => o.paymentMethod === 'CASH_AT_COUNTER').length }, byCode, byBranch: [...byBranch].map(([branchId, v]) => ({ branchId, orders: v.orders, sales: v.sales / 100 })), trend: [...trend].map(([date, v]) => ({ date, orders: v.orders, sales: v.sales / 100 })).sort((a,b) => a.date.localeCompare(b.date)), popular: [...popular.values()].sort((a,b) => b.quantity - a.quantity).slice(0, 10), payments: payments.slice(0, 50) };
  }

  getBranding(restaurantId: string) {
    return this.settings.branding(restaurantId);
  }

  getPrintDesign(restaurantId: string) { return this.settings.printDesign(restaurantId); }
  async savePrintDesign(device: Device, body: Parameters<QrSettingsService['savePrintDesign']>[2]) {
    await this.requireEnabled(device.restaurantId);
    return this.settings.savePrintDesign(device.restaurantId, device.id, body);
  }

  async updateBranding(device: Device, changes: QrBrandingUpdate) {
    await this.requireEnabled(device.restaurantId);
    return this.settings.updateBranding(device.restaurantId, { id: device.id, type: 'DEVICE' }, changes);
  }

  getSettings(restaurantId: string, branchId?: string) {
    return this.settings.get(restaurantId, branchId ?? null);
  }

  async paymentReadiness(restaurantId: string, branchId?: string) {
    const settings = await this.settings.get(restaurantId, branchId ?? null);
    const readiness = await this.payments.qrOnlineReadiness(restaurantId);
    return { ...readiness, enabled: settings.allowOnlinePayment, guestAvailable: settings.allowOnlinePayment && readiness.available };
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
