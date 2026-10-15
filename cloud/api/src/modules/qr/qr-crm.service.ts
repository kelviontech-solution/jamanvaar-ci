import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { isValidIndianPhone, normalizeIndianPhone } from '../../common/validation/phone';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { refreshLoyaltyBalance, CustomerAccount } from '../entity-sync/customer-loyalty-merge';
import { QrAdvancedService } from './qr-advanced.service';
import { NotificationGatewayService } from '../notifications/notification-gateway.service';

export const qrCustomerSchema = z
  .object({
    phone: z.string().min(8).max(40),
    name: z.string().trim().min(1).max(120),
    email: z.union([z.string().email().max(254), z.literal('')]).optional(),
    notes: z.string().max(1000).optional(),
    consent: z
      .object({ email: z.boolean(), whatsapp: z.boolean(), source: z.string().trim().min(3).max(300) })
      .strict()
      .optional(),
    version: z.number().int().positive().optional()
  })
  .strict();
export const qrPointsSchema = z
  .object({
    points: z
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((n) => n !== 0),
    reason: z.string().trim().min(3).max(300),
    idempotencyKey: z.string().uuid(),
    version: z.number().int().positive()
  })
  .strict();
export const qrProgramSchema = z
  .object({
    version: z.number().int().min(0),
    enabled: z.boolean(),
    earnPoints: z.number().int().min(0).max(10000),
    perRupeesSpent: z.number().positive().max(1000000)
  })
  .strict();
export const qrRewardSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    version: z.number().int().min(0),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000),
    pointsCost: z.number().int().positive().max(1000000),
    discountAmount: z.number().positive().max(1000000),
    isActive: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional()
  })
  .strict();

/** Private staff CRM uses the same restaurant customer/loyalty entities as POS and verified QR checkout. */
@Injectable()
export class QrCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus,
    private readonly advanced: QrAdvancedService,
    private readonly notifications: NotificationGatewayService
  ) {}
  private actor(device: Device) {
    const id = (device as Device & { adminActorId?: string }).adminActorId;
    if (device.type !== 'POS_ADMIN' || !id) throw new ForbiddenException('Current owner or manager sign-in required');
    return id;
  }
  private where(restaurantId: string, entityType: string, externalId: string) {
    return { restaurantId_entityType_externalId: { restaurantId, entityType, externalId } };
  }
  private async authorize(tx: Prisma.TransactionClient, device: Device, global = false) {
    const actor = this.actor(device);
    await this.entitlements.assertQrCapability(tx, device.restaurantId, 'QR_LOYALTY', device.branchId);
    const user = await tx.user.findFirst({ where: { id: actor, restaurantId: device.restaurantId, status: 'ACTIVE' } });
    if (
      !user ||
      !['OWNER', 'MANAGER'].includes(user.role) ||
      (user.role === 'MANAGER' && (!device.branchId || user.branchId !== device.branchId)) ||
      (global && user.role !== 'OWNER')
    )
      throw new ForbiddenException(global ? 'Only the owner can change the shared loyalty program' : 'You cannot manage this customer workspace');
    return user;
  }
  private async write(tx: Prisma.TransactionClient, device: Device, type: string, id: string, payload: any, version: number) {
    const existing = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, type, id) });
    if ((existing?.syncVersion ?? 0) !== version) throw new ConflictException('This record changed. Refresh and review before saving.');
    const seq = await nextSyncSequence(tx, device.restaurantId);
    return tx.syncedEntity.upsert({
      where: this.where(device.restaurantId, type, id),
      create: { restaurantId: device.restaurantId, deviceId: device.id, entityType: type, externalId: id, payload, seq },
      update: { payload, seq, syncVersion: { increment: 1 } }
    });
  }
  private notify(device: Device) {
    this.realtime.publish({ restaurantId: device.restaurantId, branchId: null, kind: 'entities' });
  }
  async list(device: Device, search = '', cursor = '', segment = 'ALL') {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.authorize(tx, device);
      const where: Prisma.SyncedEntityWhereInput = {
        restaurantId: device.restaurantId,
        entityType: 'CUSTOMER',
        AND: [{ OR: [{ payload: { path: ['deleted'], equals: false } }, { payload: { path: ['deleted'], equals: Prisma.AnyNull } }] }],
        ...(search.trim()
          ? {
              OR: [
                { externalId: { contains: search.trim().slice(0, 120), mode: 'insensitive' } },
                { payload: { path: ['name'], string_contains: search.trim().slice(0, 120) } }
              ]
            }
          : {})
      };
      if (!['ALL', 'RETURNING', 'POINTS', 'EMAIL', 'WHATSAPP'].includes(segment)) throw new BadRequestException('Invalid customer segment');
      const criteria: Record<string, Prisma.SyncedEntityWhereInput> = {
        RETURNING: { payload: { path: ['totalVisits'], gte: 2 } },
        POINTS: { payload: { path: ['loyaltyPoints'], gt: 0 } },
        EMAIL: { payload: { path: ['marketingConsent', 'email'], equals: true } },
        WHATSAPP: { payload: { path: ['marketingConsent', 'whatsapp'], equals: true } }
      };
      if (criteria[segment]) (where.AND as Prisma.SyncedEntityWhereInput[]).push(criteria[segment]);
      const rows = await tx.syncedEntity.findMany({
        where: { ...where, ...(cursor ? { externalId: { gt: cursor } } : {}) },
        orderBy: { externalId: 'asc' },
        take: 51
      });
      const page = rows.slice(0, 50);
      return {
        total: await tx.syncedEntity.count({ where }),
        rows: page.map((row) => {
          const p = row.payload as any;
          refreshLoyaltyBalance(p);
          return {
            phone: row.externalId,
            name: p.name || 'Customer',
            email: p.email || '',
            notes: p.notes || '',
            points: p.loyaltyPoints,
            spend: p.totalSpend,
            visits: p.totalVisits,
            version: row.syncVersion,
            consent: p.marketingConsent || null
          };
        }),
        nextCursor: rows.length > 50 ? page.at(-1)?.externalId : null
      };
    });
  }
  async detail(device: Device, phone: string) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.authorize(tx, device);
      const row = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'CUSTOMER', phone) });
      if (!row || (row.payload as any).deleted) throw new NotFoundException('Customer not found');
      const p = row.payload as any;
      refreshLoyaltyBalance(p);
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: device.restaurantId,
          ...(device.branchId ? { branchId: device.branchId } : {}),
          meta: { path: ['verifiedCustomerId'], equals: phone }
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { externalOrderId: true, totalAmount: true, paymentStatus: true, createdAt: true, meta: true }
      });
      return {
        ...p,
        phone,
        version: row.syncVersion,
        orders: orders.map((o) => ({
          id: o.externalOrderId,
          token: (o.meta as any)?.tokenNumber,
          total: o.totalAmount / 100,
          status: o.paymentStatus,
          at: o.createdAt
        }))
      };
    });
  }
  async customer(device: Device, body: z.infer<typeof qrCustomerSchema>) {
    const phone = normalizeIndianPhone(body.phone);
    if (body.consent?.email && !body.email) throw new BadRequestException('An email address is required for email consent');
    if (!isValidIndianPhone(body.phone)) throw new BadRequestException('Enter a valid Indian mobile number');
    const saved = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const user = await this.authorize(tx, device);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const old = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'CUSTOMER', phone) });
      if (old && !body.version) throw new ConflictException('This phone already exists. Open the customer to edit it.');
      const previousConsent = (old?.payload as any)?.marketingConsent;
      const consentChanged = !!body.consent && ['email', 'whatsapp', 'source'].some((k) => (body.consent as any)[k] !== previousConsent?.[k]);
      const p = {
        ...((old?.payload as any) || { loyaltyPoints: 0, totalSpend: 0, totalVisits: 0, recentOrderIds: [] }),
        deleted: false,
        phone,
        name: body.name,
        email: body.email || '',
        notes: body.notes || '',
        ...(consentChanged ? { marketingConsent: { ...body.consent, at: new Date().toISOString(), actorId: user.id } } : {}),
        updatedAt: new Date().toISOString()
      };
      refreshLoyaltyBalance(p);
      const row = await this.write(tx, device, 'CUSTOMER', phone, p, body.version ?? 0);
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: device.restaurantId,
          action: old ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED',
          category: 'CUSTOMER',
          details: { customerId: phone, branchId: device.branchId }
        },
        tx
      );
      return { phone, version: row.syncVersion };
    });
    this.notify(device);
    return saved;
  }
  async points(device: Device, phone: string, body: z.infer<typeof qrPointsSchema>) {
    const result = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const user = await this.authorize(tx, device);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const row = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'CUSTOMER', phone) });
      if (!row || (row.payload as any).deleted) throw new NotFoundException('Customer not found');
      const p = row.payload as unknown as CustomerAccount;
      refreshLoyaltyBalance(p);
      const key = 'adjust:' + body.idempotencyKey,
        old = p.loyaltyLedger![key];
      if (old) {
        if (old.points !== body.points || (old as any).reason !== body.reason) throw new ConflictException('Adjustment reference already used');
        return { points: p.loyaltyPoints, duplicate: true };
      }
      if (p.loyaltyPoints + body.points < 0) throw new BadRequestException('Customer does not have enough points');
      p.loyaltyLedger![key] = {
        points: body.points,
        spend: 0,
        visits: 0,
        at: new Date().toISOString(),
        ...{ reason: body.reason, actorId: user.id, branchId: device.branchId }
      };
      refreshLoyaltyBalance(p);
      p.updatedAt = new Date().toISOString();
      await this.write(tx, device, 'CUSTOMER', phone, p, body.version);
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: device.restaurantId,
          action: 'LOYALTY_POINTS_ADJUSTED',
          category: 'CUSTOMER',
          details: { customerId: phone, points: body.points, reason: body.reason, reference: body.idempotencyKey, branchId: device.branchId }
        },
        tx
      );
      return { points: p.loyaltyPoints, duplicate: false };
    });
    this.notify(device);
    return result;
  }
  async exportCustomers(device: Device, segment: string) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const user = await this.authorize(tx, device, true);
      if (!['ALL', 'EMAIL', 'WHATSAPP'].includes(segment)) throw new BadRequestException('Choose records or one consented contact channel');
      const where: Prisma.SyncedEntityWhereInput = {
        restaurantId: device.restaurantId,
        entityType: 'CUSTOMER',
        AND: [
          { OR: [{ payload: { path: ['deleted'], equals: false } }, { payload: { path: ['deleted'], equals: Prisma.AnyNull } }] },
          ...(segment !== 'ALL' ? [{ payload: { path: ['marketingConsent', segment.toLowerCase()], equals: true } }] : [])
        ]
      };
      const rows = await tx.syncedEntity.findMany({ where, orderBy: { externalId: 'asc' }, take: 10001 });
      if (rows.length > 10000) throw new BadRequestException('Export exceeds 10,000 records; narrow the consent channel or contact support');
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: device.restaurantId,
          action: 'CUSTOMER_EXPORT',
          category: 'CUSTOMER',
          details: { count: rows.length, segment }
        },
        tx
      );
      return {
        rows: rows.map((row) => {
          const p = row.payload as any;
          refreshLoyaltyBalance(p);
          return {
            name: p.name || '',
            phone: segment === 'EMAIL' ? '' : row.externalId,
            email: segment === 'EMAIL' ? p.email || '' : '',
            points: p.loyaltyPoints,
            visits: p.totalVisits,
            spend: p.totalSpend,
            consentAt: segment === 'ALL' ? '' : p.marketingConsent?.at || '',
            consentSource: segment === 'ALL' ? '' : p.marketingConsent?.source || ''
          };
        })
      };
    });
  }
  async followup(device: Device, phone: string, b: { version: number; note: string; idempotencyKey: string }) {
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const user = await this.authorize(tx, device);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const old = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'CUSTOMER', phone) });
      const p = old?.payload as any;
      if (!old || p.deleted) throw new NotFoundException('Customer not found');
      const existing = p.followups?.find((f: any) => f.id === b.idempotencyKey);
      if (existing) {
        if (existing.note !== b.note) throw new ConflictException('Follow-up reference already used');
        return;
      }
      if ((p.followups?.length || 0) >= 200) throw new BadRequestException('This profile has reached its follow-up history limit');
      const followups = [
        ...(p.followups || []),
        { id: b.idempotencyKey, note: b.note, at: new Date().toISOString(), actorId: user.id, branchId: device.branchId }
      ];
      await this.write(tx, device, 'CUSTOMER', phone, { ...p, followups, updatedAt: new Date().toISOString() }, b.version);
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: device.restaurantId,
          action: 'CUSTOMER_FOLLOWUP',
          category: 'CUSTOMER',
          details: { phone, branchId: device.branchId, reference: b.idempotencyKey }
        },
        tx
      );
    });
    this.notify(device);
    return this.detail(device, phone);
  }
  async program(device: Device) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const user = await this.authorize(tx, device);
      const program = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'LOYALTY_PROGRAM_SETTINGS', 'default') }),
        rewards = await tx.syncedEntity.findMany({
          where: {
            restaurantId: device.restaurantId,
            entityType: 'LOYALTY_REWARD',
            AND: [{ OR: [{ payload: { path: ['deleted'], equals: false } }, { payload: { path: ['deleted'], equals: Prisma.AnyNull } }] }]
          }
        });
      return {
        canManageProgram: user.role === 'OWNER',
        qrChannelEnabled: (await this.advanced.effectiveIn(tx, device.restaurantId, device.branchId)).loyaltyEnabled,
        phoneVerificationReady: this.notifications.isQrLoyaltyOtpConfigured(),
        program: { enabled: false, earnPoints: 1, perRupeesSpent: 100, ...(program?.payload as any), version: program?.syncVersion ?? 0 },
        rewards: rewards.map((r) => ({ ...(r.payload as any), id: r.externalId, version: r.syncVersion }))
      };
    });
  }
  async saveProgram(device: Device, body: z.infer<typeof qrProgramSchema>) {
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.authorize(tx, device, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const { version, ...settings } = body;
      await this.write(tx, device, 'LOYALTY_PROGRAM_SETTINGS', 'default', { id: 'default', ...settings, updatedAt: new Date().toISOString() }, version);
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: this.actor(device),
          restaurantId: device.restaurantId,
          action: 'LOYALTY_PROGRAM_UPDATED',
          category: 'CUSTOMER',
          details: settings
        },
        tx
      );
    });
    this.notify(device);
    return this.program(device);
  }
  async reward(device: Device, body: z.infer<typeof qrRewardSchema>) {
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.authorize(tx, device, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const { version, id, ...reward } = body;
      const key = id || randomUUID();
      const prior = await tx.syncedEntity.findUnique({ where: this.where(device.restaurantId, 'LOYALTY_REWARD', key) });
      if (prior && (prior.payload as any).discountKind === 'ITEM')
        throw new BadRequestException('Item rewards are managed in Restaurant Admin; create a fixed bill reward here.');
      await this.write(
        tx,
        device,
        'LOYALTY_REWARD',
        key,
        { id: key, deleted: false, ...reward, discountKind: 'FIXED', updatedAt: new Date().toISOString() },
        version
      );
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: this.actor(device),
          restaurantId: device.restaurantId,
          action: 'LOYALTY_REWARD_UPDATED',
          category: 'CUSTOMER',
          details: { rewardId: key, ...reward }
        },
        tx
      );
    });
    this.notify(device);
    return this.program(device);
  }
}
