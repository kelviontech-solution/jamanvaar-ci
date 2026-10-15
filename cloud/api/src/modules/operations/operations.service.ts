import { branchWaitEstimate } from './wait-estimate';
import { stableJson } from './operations-records';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { enabledConsoleApps } from '../../common/security/admin-product-access';
import { deviceHealth } from '../../common/device-health';
import { DEFAULT_SERVICE_POLICY, servicePolicySchema } from './operations-policy';
import { dishMargins, prepPlan } from './operations-analytics';
import {
  buildContent,
  extractImages,
  viewForBranch,
  type SnapshotContent,
} from '../menu-publications/menu-snapshot';

export interface OpsScope {
  restaurantId: string;
  branchId: string;
  userId: string;
  role: 'OWNER' | 'MANAGER';
  apps: string[];
  timezone: string;
}
const asObject = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const finalStates = ['SERVED', 'COMPLETED'];
const paidStates = ['PAID', 'SUCCESS'];

@Injectable()
export class OperationsService {
  constructor(
    readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async auditAction(s:OpsScope,action:string,details:Record<string,unknown>,tx:Prisma.TransactionClient){
    await this.audit.log({actorType:'TENANT',actorId:s.userId,restaurantId:s.restaurantId,action,category:'OPERATIONS',details},tx);
  }

  async scope(user: User, branchId?: string): Promise<OpsScope> {
    if (!['OWNER', 'MANAGER'].includes(user.role))
      throw new ForbiddenException('Owner or manager access is required');
    const target = branchId || user.branchId;
    if (!target) throw new BadRequestException('Choose one branch');
    if (user.role !== 'OWNER' && user.branchId !== target)
      throw new ForbiddenException('Choose your assigned branch');
    const [branch, apps] = await this.prisma.runAsTenant(user.restaurantId, async (tx) =>
      Promise.all([
        tx.branch.findFirst({ where: { id: target, restaurantId: user.restaurantId, status: 'ACTIVE' } }),
        enabledConsoleApps(tx, user.restaurantId, target),
      ]),
    );
    if (!branch) throw new ForbiddenException('Branch is not available in your restaurant');
    if (!apps.length) throw new ForbiddenException('An active owner-console product is required');
    return {
      restaurantId: user.restaurantId,
      branchId: target,
      userId: user.id,
      role: user.role as OpsScope['role'],
      apps,
      timezone: branch.timezone,
    };
  }
  require(scope: OpsScope, app: string) {
    if (!scope.apps.includes(app))
      throw new ForbiddenException('This tool is not included in your licensed products');
  }
  async read(s: OpsScope, type: string, key = s.branchId) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const row = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: s.restaurantId,
            entityType: type,
            externalId: key,
          },
        },
      });
      return { version: row?.syncVersion ?? 0, data: row ? asObject(row.payload) : null };
    });
  }
  async write(
    s: OpsScope,
    type: string,
    key: string,
    data: Record<string, unknown>,
    expectedVersion: number,
    action: string,
  ) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${s.restaurantId + ':' + type + ':' + key}))`;
      const where = {
        restaurantId_entityType_externalId: {
          restaurantId: s.restaurantId,
          entityType: type,
          externalId: key,
        },
      };
      const row = await tx.syncedEntity.findUnique({ where });
      if ((row?.syncVersion ?? 0) !== expectedVersion)
        throw new ConflictException('This record changed. Refresh and review it again.');
      const payload = {
        ...data,
        branchId: s.branchId,
        updatedBy: s.userId,
        updatedAt: new Date().toISOString(),
      };
      const saved = await tx.syncedEntity.upsert({
        where,
        create: {
          restaurantId: s.restaurantId,
          entityType: type,
          externalId: key,
          payload: payload as Prisma.InputJsonValue,
        },
        update: { payload: payload as Prisma.InputJsonValue, syncVersion: { increment: 1 } },
      });
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: s.userId,
          restaurantId: s.restaurantId,
          action,
          category: 'OPERATIONS',
          details: { branchId: s.branchId, recordId: key, version: saved.syncVersion },
        },
        tx,
      );
      return { version: saved.syncVersion, data: asObject(saved.payload) };
    });
  }
  async list(s: OpsScope, type: string) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) =>
      (
        await tx.syncedEntity.findMany({
          where: {
            restaurantId: s.restaurantId,
            entityType: type,
            payload: { path: ['branchId'], equals: s.branchId },
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        })
      ).map((r) => ({ id: r.externalId, version: r.syncVersion, ...asObject(r.payload) })),
    );
  }
  async context(s: OpsScope) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const [branch, restaurant, devices, menu, orders, requests] = await Promise.all([
        tx.branch.findUniqueOrThrow({ where: { id: s.branchId } }),
        tx.restaurant.findUniqueOrThrow({
          where: { id: s.restaurantId },
          select: { id: true, name: true, currency: true },
        }),
        tx.device.findMany({
          where: { restaurantId: s.restaurantId, branchId: s.branchId },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            lastSeenAt: true,
            pendingSyncCount: true,
            appVersion: true,
            syncError: true,
          },
          take: 500,
        }),
        tx.menuSnapshot.findFirst({
          where: { restaurantId: s.restaurantId },
          orderBy: { version: 'desc' },
          select: { version: true, content: true, createdAt: true },
        }),
        tx.syncedOrder.findMany({
          where: {
            restaurantId: s.restaurantId,
            branchId: s.branchId,
            status: { notIn: ['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED', 'DRAFT'] },
            OR: [
              { status: { notIn: finalStates } },
              { paymentStatus: { notIn: paidStates } },
              { paymentStatus: null },
            ],
          },
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: {
            externalOrderId: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            createdAt: true,
            source: true,
            meta: true,
            tableLabel: true,
            items: true,
          },
        }),
        tx.syncedEntity.count({
          where: {
            restaurantId: s.restaurantId,
            entityType: 'QR_SERVICE_REQUEST',
            AND: [
              { payload: { path: ['branchId'], equals: s.branchId } },
              {
                OR: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].map((status) => ({
                  payload: { path: ['status'], equals: status },
                })),
              },
              { payload: { path: ['expiresAt'], gt: new Date().toISOString() } },
            ],
          },
        }),
      ]);
      return {
        viewerId: s.userId,
        restaurant,
        branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
        apps: s.apps,
        role: s.role,
        menuVersion: menu?.version ?? 0,
        publishedDishes: menu
          ? s.apps.length === 1 && s.apps[0] === 'QR_ORDERING'
            ? viewForBranch(menu.content as unknown as SnapshotContent, s.branchId).items.length
            : (menu.content as unknown as SnapshotContent).items.filter(
                (i) =>
                  i.available &&
                  (!i.branchIds.length || i.branchIds.includes(s.branchId)) &&
                  !(menu.content as unknown as SnapshotContent).overrides.some(
                    (o) =>
                      o.branchId === s.branchId &&
                      o.itemId === i.id &&
                      (o.available === false || o.visible === false),
                  ),
              ).length
          : 0,
        devices: devices.map((d) => ({
          ...d,
          health: deviceHealth(d),
          syncError: d.syncError ? 'A sync problem needs review' : null,
        })),
        orders: orders.map((o) => ({
          ...o,
          total: o.totalAmount / 100,
          label: asObject(o.meta).tokenNumber ?? asObject(o.meta).orderNumber ?? o.externalOrderId,
          ageMinutes: Math.floor((Date.now() - o.createdAt.getTime()) / 60000),
          meta: undefined,
        })),
        serviceRequestRecords: requests,
        generatedAt: new Date().toISOString(),
      };
    });
  }
  async service(s: OpsScope) {
    const row = await this.read(s, 'OPS_SERVICE');
    const p = { ...DEFAULT_SERVICE_POLICY, ...row.data };
    return {
      ...row,
      data: Object.fromEntries(
        Object.keys(DEFAULT_SERVICE_POLICY).map((k) => [k, p[k as keyof typeof DEFAULT_SERVICE_POLICY]]),
      ) as typeof DEFAULT_SERVICE_POLICY,
    };
  }
  async saveService(s: OpsScope, input: unknown) {
    const parsed = servicePolicySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Enter valid branch hours, pause time and capacity');
    const { expectedVersion, ...data } = parsed.data;
    return this.write(s, 'OPS_SERVICE', s.branchId, data, expectedVersion, 'BRANCH_SERVICE_UPDATED');
  }
  async checklist(s: OpsScope, day: string) {
    return this.read(s, 'OPS_CHECKLIST', `${s.branchId}:${day}`);
  }
  async saveChecklist(
    s: OpsScope,
    input: {
      day: string;
      phase: 'OPEN' | 'CLOSE';
      expectedVersion: number;
      checks: Record<string, boolean>;
      notes: string;
    },
  ) {
    const valid =
      input.phase === 'OPEN'
        ? ['menu', 'devices', 'printers', 'cash']
        : ['unpaid', 'kitchen', 'requests', 'cash'];
    if (
      valid.some((key) => input.checks[key] !== true) ||
      Object.keys(input.checks).some((key) => !valid.includes(key))
    )
      throw new BadRequestException('Complete every check for this phase');
    const context = await this.context(s);
    if (input.phase === 'OPEN' && !context.publishedDishes)
      throw new ConflictException('Publish a menu with dishes before completing opening');
    const current = await this.checklist(s, input.day),
      history = Array.isArray(current.data?.history) ? current.data.history : [];
    const evidence = {
      phase: input.phase,
      checks: input.checks,
      notes: input.notes,
      at: new Date().toISOString(),
      by: s.userId,
      openOrders: context.orders.length,
      devicesOnline: context.devices.filter((d) => d.health === 'online').length,
      menuVersion: context.menuVersion,
    };
    return this.write(
      s,
      'OPS_CHECKLIST',
      `${s.branchId}:${input.day}`,
      { day: input.day, lastPhase: input.phase, history: [...history, evidence].slice(-40) },
      input.expectedVersion,
      'DAILY_' + input.phase + '_CHECKED',
    );
  }
  async menuReview(s: OpsScope) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const [rows, previous, branches] = await Promise.all([
        tx.syncedEntity.findMany({
          where: {
            restaurantId: s.restaurantId,
            entityType: {
              in: ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'],
            },
          },
          select: { entityType: true, payload: true },
        }),
        tx.menuSnapshot.findFirst({ where: { restaurantId: s.restaurantId }, orderBy: { version: 'desc' } }),
        tx.branch.findMany({ where: { restaurantId: s.restaurantId }, select: { id: true, name: true } }),
      ]);
      const built = buildContent(rows),
        content = extractImages(built.content).content,
        old = previous?.content as unknown as SnapshotContent | undefined,
        changes: any[] = [];
      const fields = [
        'name',
        'pricePaise',
        'imageUrl',
        'available',
        'categoryId',
        'branchIds',
        'salesChannels',
        'dietaryType',
        'modifierGroupIds',
      ] as const;
      for (const item of content.items) {
        const prior = old?.items.find((i) => i.id === item.id);
        const diff = prior
          ? fields.filter((key) => stableJson((prior as any)[key]) !== stableJson((item as any)[key]))
          : fields;
        if (diff.length)
          changes.push({
            id: item.id,
            name: item.name,
            kind: prior ? 'UPDATED' : 'ADDED',
            fields: diff.map((key) => ({
              field: key,
              before: prior ? (prior as any)[key] : null,
              after: (item as any)[key],
            })),
            affectedBranches: branches.filter(
              (b) => !item.branchIds?.length || item.branchIds.includes(b.id),
            ),
          });
      }
      for (const item of old?.items ?? [])
        if (!content.items.some((i) => i.id === item.id))
          changes.push({
            id: item.id,
            name: item.name,
            kind: 'REMOVED',
            fields: [],
            affectedBranches: branches,
          });
      if (stableJson(old?.overrides ?? []) !== stableJson(content.overrides))
        changes.push({
          id: 'branch-overrides',
          name: 'Branch availability / pricing',
          kind: 'UPDATED',
          fields: [{ field: 'overrides', before: old?.overrides ?? [], after: content.overrides }],
          affectedBranches: branches,
        });
      for (const key of ['categories', 'groups', 'taxGroups'] as const)
        if (stableJson(old?.[key] ?? []) !== stableJson(content[key]))
          changes.push({
            id: key,
            name: key,
            kind: 'UPDATED',
            fields: [{ field: key, before: old?.[key] ?? [], after: content[key] }],
            affectedBranches: branches,
          });
      return {
        version: previous?.version ?? 0,
        checksum: built.checksum,
        items: content.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.pricePaise / 100,
          available: i.available,
        })),
        errors: built.errors,
        warnings: built.warnings,
        changes,
        sharedScope:
          s.role === 'OWNER'
            ? 'Restaurant-wide menu'
            : 'Shared restaurant menu; publication affects all configured branches',
      };
    });
  }
  async planning(s: OpsScope, days: number, buffer: number) {
    this.require(s, 'POS_ADMIN');
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: s.restaurantId,
          branchId: s.branchId,
          createdAt: { gte: new Date(Date.now() - days * 86400000) },
        },
        select: { createdAt: true, status: true, items: true, totalAmount: true, discountAmount: true },
        take: 50000,
      });
      const rows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: s.restaurantId,
          entityType: { in: ['MENU_ITEM', 'RECIPE', 'INVENTORY_ITEM'] },
        },
        select: { externalId: true, entityType: true, payload: true },
      });
      const scoped = rows.filter((r) => {
        const p = asObject(r.payload);
        return (
          p.deleted !== true &&
          (!p.branchId || p.branchId === s.branchId) &&
          (!p.branchIds?.length || p.branchIds.includes(s.branchId))
        );
      });
      return {
        days,
        bufferPercent: buffer,
        timezone: s.timezone,
        ordersAnalyzed: orders.length,
        truncated: orders.length === 50000,
        margins: dishMargins(scoped, orders),
        prep: prepPlan(orders, s.timezone, days, buffer),
        costBasis:
          'Current ingredient costs. Estimates exclude rent, wages, utilities and payment fees; not net profit.',
      };
    });
  }
  async diagnostics(s: OpsScope) {
    const c = await this.context(s);
    return {
      schema: 1,
      generatedAt: c.generatedAt,
      restaurant: { id: c.restaurant.id, name: c.restaurant.name },
      branch: c.branch,
      menuVersion: c.menuVersion,
      devices: c.devices.map(({ id, type, health, pendingSyncCount, appVersion }) => ({
        id,
        type,
        health,
        pendingSyncCount,
        appVersion,
      })),
      counts: { openOrders: c.orders.length, devices: c.devices.length },
      redaction:
        'No credentials, PINs, raw error logs, customer identifiers, order details or payment credentials are included.',
    };
  }
  async acceptance(s: OpsScope) {
    const [records, orders, menu, licensed] = await this.prisma.runAsTenant(s.restaurantId, async (tx) =>
      Promise.all([
        tx.syncedEntity.findMany({
          where: {
            restaurantId: s.restaurantId,
            entityType: 'OPS_ACCEPTANCE',
            payload: { path: ['branchId'], equals: s.branchId },
          },
        }),
        tx.syncedOrder.findMany({
          where: {
            restaurantId: s.restaurantId,
            branchId: s.branchId,
            status: { in: finalStates },
            paymentStatus: { in: paidStates },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { externalOrderId: true, source: true, createdAt: true, meta: true, paymentMethod: true },
        }),
        tx.menuPublication.findFirst({
          where: { restaurantId: s.restaurantId },
          orderBy: { version: 'desc' },
        }),
        tx.applicationEntitlement.findMany({
          where: {
            enabled: true,
            subscription: {
              restaurantId: s.restaurantId,
              status: { in: ['ACTIVE', 'TRIAL'] },
              expiresAt: { gt: new Date() },
            },
          },
          select: { appCode: true },
        }),
      ]),
    );
    return {
      channels: ['POS', 'CAPTAIN', 'KIOSK', 'QR'].filter((channel) =>
        licensed.some((l) => l.appCode === (channel === 'QR' ? 'QR_ORDERING' : channel)),
      ),
      menuVersion: menu?.version ?? 0,
      records: records.map((r) => ({
        version: r.syncVersion,
        ...asObject(r.payload),
        current:
          asObject(r.payload).menuVersion === menu?.version &&
          orders.some((o) => o.externalOrderId === asObject(r.payload).orderId),
      })),
      orders: orders
        .filter((o) => !menu || o.createdAt >= menu.createdAt)
        .map((o) => ({
          id: o.externalOrderId,
          source: o.source,
          label: asObject(o.meta).tokenNumber ?? o.externalOrderId,
          online: !['CASH', 'CASH_AT_COUNTER', 'PAY_AT_COUNTER'].includes(o.paymentMethod ?? ''),
        })),
    };
  }
  async saveAcceptance(
    s: OpsScope,
    input: {
      source: string;
      orderId: string;
      counter: boolean;
      kitchen: boolean;
      receipt: boolean;
      onlineReturn: boolean;
      expectedVersion: number;
    },
  ) {
    const state = await this.acceptance(s);
    if (!state.channels.includes(input.source))
      throw new ForbiddenException('Channel is not licensed in this console');
    const order = state.orders.find((o) => o.id === input.orderId && o.source === input.source);
    if (!order || !input.counter || !input.kitchen || !input.receipt)
      throw new BadRequestException(
        'Choose a paid completed order after the menu publication and confirm delivery',
      );
    if (order.online && !input.onlineReturn)
      throw new BadRequestException('Verify return from the online payment app');
    return this.write(
      s,
      'OPS_ACCEPTANCE',
      `${s.branchId}:${input.source}:${order.online ? 'ONLINE' : 'COUNTER'}`,
      {
        ...input,
        menuVersion: state.menuVersion,
        verifiedAt: new Date().toISOString(),
        onlinePayment: order.online,
      },
      input.expectedVersion,
      'CHANNEL_ACCEPTANCE_RECORDED',
    );
  }
  async timeline(s: OpsScope, id: string) {
    return this.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const order = await tx.syncedOrder.findFirst({
        where: {
          restaurantId: s.restaurantId,
          branchId: s.branchId,
          OR: [
            { externalOrderId: id },
            { meta: { path: ['tokenNumber'], equals: id } },
            { meta: { path: ['orderNumber'], equals: id } },
          ],
        },
        include: { paymentEntries: true },
      });
      if (!order) {
        const pending=await tx.order.findFirst({where:{restaurantId:s.restaurantId,externalOrderId:id,OR:[{branchId:s.branchId},{branchId:null,kiosk:{branchId:s.branchId}}]},include:{paymentTransactions:{include:{refunds:true}}}});
        if(!pending)throw new NotFoundException('Order is not available in this branch');
        const events=[{at:pending.createdAt,type:'CHECKOUT_CREATED',detail:pending.source},...pending.paymentTransactions.flatMap(p=>[{at:p.createdAt,type:'PAYMENT_ATTEMPT',detail:p.status,amount:p.amount/100},...p.refunds.map(r=>({at:r.createdAt,type:'REFUND_'+r.status,detail:r.reason??'',amount:r.amount/100}))])];
        return {id:pending.externalOrderId,label:pending.externalOrderId,status:'KITCHEN_DELIVERY_PENDING',paymentStatus:pending.status,events:events.sort((a,b)=>a.at.getTime()-b.at.getTime()),note:'The original checkout exists, but no canonical kitchen order has been received. Reconnect and synchronize the original terminal; do not create another sale.'};
      }
      const gateway = await tx.order.findUnique({
        where: {
          restaurantId_externalOrderId: {
            restaurantId: s.restaurantId,
            externalOrderId: order.externalOrderId,
          },
        },
        include: { paymentTransactions: { include: { refunds: true } } },
      });
      const events: any[] = [{ at: order.createdAt, type: 'ORDER_CREATED', detail: order.source }];
      for (const event of asObject(order.meta).operationHistory ?? [])
        events.push({
          at: event.at,
          type: 'ORDER_' + event.status,
          detail: event.paymentStatus,
          actor: event.actor,
        });
      for (const event of asObject(order.meta).qrStatusHistory ?? [])
        events.push({ at: event.at, type: 'ORDER_' + event.action, detail: event.reason ?? '' });
      for (const entry of order.paymentEntries)
        events.push({
          at: entry.createdAt,
          type: entry.kind,
          amount: entry.amount / 100,
          detail: entry.method,
        });
      for (const attempt of gateway?.paymentTransactions ?? []) {
        events.push({
          at: attempt.createdAt,
          type: 'PAYMENT_ATTEMPT',
          detail: attempt.status,
          amount: attempt.amount / 100,
        });
        for (const refund of attempt.refunds)
          events.push({ at: refund.createdAt, type: 'REFUND_' + refund.status, amount: refund.amount / 100 });
      }
      const audits = await tx.auditLog.findMany({
        where: {
          restaurantId: s.restaurantId,
          OR: [...new Set([order.externalOrderId, order.id, gateway?.id].filter(Boolean))].flatMap((key) => [
            { details: { path: ['orderId'], equals: key } },
            { details: { path: ['externalOrderId'], equals: key } },
          ]),
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const audit of audits)
        events.push({ at: audit.createdAt, type: audit.action, actor: audit.actorId });
      return {
        id: order.externalOrderId,
        label: asObject(order.meta).tokenNumber ?? id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        events: events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
        note: 'Only recorded history is shown; missing past events are not inferred.',
      };
    });
  }
  async complaint(
    s: OpsScope,
    input: {
      id?: string;
      expectedVersion: number;
      title: string;
      orderId: string;
      assignedTo: string;
      dueAt: string;
      status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
      resolution: string;
    },
  ) {
    if (
      input.orderId &&
      !(await this.prisma.runAsTenant(s.restaurantId, (tx) =>
        tx.syncedOrder.findFirst({
          where: { restaurantId: s.restaurantId, branchId: s.branchId, externalOrderId: input.orderId },
          select: { id: true },
        }),
      ))
    )
      throw new BadRequestException('Order does not belong to this branch');
    if (
      input.assignedTo &&
      !(await this.prisma.runAsTenant(s.restaurantId, (tx) =>
        tx.user.findFirst({
          where: {
            id: input.assignedTo,
            restaurantId: s.restaurantId,
            role: { in: ['OWNER', 'MANAGER'] },
            status: 'ACTIVE',
            OR: [{ branchId: s.branchId }, { role: 'OWNER' }],
          },
          select: { id: true },
        }),
      ))
    )
      throw new BadRequestException('Choose an active branch manager or owner');
    if (input.status === 'RESOLVED' && !input.resolution.trim())
      throw new BadRequestException('Record the resolution before closing the complaint');
    const id = input.id ?? randomUUID();
    const old = input.id ? await this.read(s, 'OPS_COMPLAINT', id) : null;
    if (input.id && old?.data?.branchId !== s.branchId) throw new NotFoundException('Complaint not found');
    const history = [
      ...(Array.isArray(old?.data?.history) ? old.data.history : []),
      {
        status: input.status,
        assignedTo: input.assignedTo,
        dueAt: input.dueAt,
        resolution: input.resolution,
        by: s.userId,
        at: new Date().toISOString(),
      },
    ].slice(-100);
    return this.write(
      s,
      'OPS_COMPLAINT',
      id,
      { ...input, id, history },
      input.expectedVersion,
      'COMPLAINT_' + input.status,
    );
  }
  async assignees(s: OpsScope) {
    return this.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.user.findMany({
        where: {
          restaurantId: s.restaurantId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'MANAGER'] },
          OR: [{ branchId: s.branchId }, { role: 'OWNER' }],
        },
        select: { id: true, fullName: true, role: true },
      }),
    );
  }
  async handover(
    s: OpsScope,
    input: { id?: string; expectedVersion: number; recipientId: string; notes: string; acknowledge: boolean },
  ) {
    if (input.id) {
      if (!input.acknowledge) throw new BadRequestException('Confirm acknowledgement as the receiving user');
      const row = await this.read(s, 'OPS_HANDOVER', input.id);
      if (!row.data || row.data.branchId !== s.branchId) throw new NotFoundException('Handover not found');
      if (row.data.recipientId !== s.userId)
        throw new ForbiddenException('Only the receiving user can acknowledge');
      if (row.data.acceptedAt) throw new ConflictException('Already acknowledged');
      return this.write(
        s,
        'OPS_HANDOVER',
        input.id,
        { ...row.data, acceptedAt: new Date().toISOString() },
        input.expectedVersion,
        'HANDOVER_ACCEPTED',
      );
    }
    if (!(await this.assignees(s)).some((u) => u.id === input.recipientId) || input.recipientId === s.userId)
      throw new BadRequestException('Choose another receiving manager or owner');
    const context = await this.context(s),
      complaints = await this.list(s, 'OPS_COMPLAINT'),
      id = randomUUID();
    return this.write(
      s,
      'OPS_HANDOVER',
      id,
      {
        id,
        recipientId: input.recipientId,
        notes: input.notes,
        from: s.userId,
        acceptedAt: null,
        openOrders: context.orders.map((o) => ({
          id: o.externalOrderId,
          label: o.label,
          status: o.status,
          paymentStatus: o.paymentStatus,
        })),
        pendingServiceRequests: context.serviceRequestRecords,
        deviceIssues: context.devices
          .filter((d) => d.health !== 'online' || d.pendingSyncCount > 0)
          .map((d) => ({ id: d.id, type: d.type, health: d.health, pendingSyncCount: d.pendingSyncCount })),
        openComplaints: complaints.filter((c: any) => c.status !== 'RESOLVED').map((c) => c.id),
        createdAt: new Date().toISOString(),
      },
      0,
      'HANDOVER_CREATED',
    );
  }
  async pickupLink(s: OpsScope) {
    const token = randomBytes(24).toString('base64url'),
      current = await this.read(s, 'OPS_PICKUP');
    await this.write(
      s,
      'OPS_PICKUP',
      s.branchId,
      { tokenHash: hash(token), expiresAt: new Date(Date.now() + 12 * 3600000).toISOString() },
      current.version,
      'PICKUP_DISPLAY_LINK_CREATED',
    );
    return { token, expiresInHours: 12 };
  }
  async publicPickup(token: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new NotFoundException('Display link expired');
    const row = await this.prisma.runAsPlatform((tx) =>
      tx.syncedEntity.findFirst({
        where: { entityType: 'OPS_PICKUP', payload: { path: ['tokenHash'], equals: hash(token) } },
      }),
    );
    const p = asObject(row?.payload);
    if (!row || !p.expiresAt || Date.parse(p.expiresAt) < Date.now())
      throw new NotFoundException('Display link expired');
    return this.prisma.runAsTenant(row.restaurantId, async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: row.restaurantId },
        select: { status: true, deletedAt: true },
      });
      if (
        !(await tx.branch.findFirst({
          where: { id: String(p.branchId), restaurantId: row.restaurantId, status: 'ACTIVE' },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Display is unavailable');
      if (
        !restaurant ||
        restaurant.deletedAt ||
        restaurant.status !== 'ACTIVE' ||
        !(await enabledConsoleApps(tx, row.restaurantId)).length
      )
        throw new NotFoundException('Display is unavailable');
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: row.restaurantId,
          branchId: String(p.branchId),
          orderType: { in: ['TAKEAWAY', 'TOKEN', 'TOKEN_QR'] },
          status: { in: ['NEW', 'CONFIRMED', 'PREPARING', 'COOKING', 'READY', 'SERVED', 'COMPLETED'] },
          createdAt: { gte: new Date(Date.now() - 12 * 3600000) },
          OR: [
            { paymentStatus: { in: paidStates } },
            { paymentMethod: { in: ['CASH', 'CASH_AT_COUNTER', 'PAY_AT_COUNTER'] } },
          ],
        },
        select: { status: true, meta: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      return {
        updatedAt: new Date().toISOString(),
        wait: await branchWaitEstimate(tx, row.restaurantId, String(p.branchId)),
        orders: orders
          .map((o) => ({
            token: String(asObject(o.meta).tokenNumber ?? asObject(o.meta).orderNumber ?? '').slice(0, 30),
            status:
              o.status === 'READY' ? 'READY' : finalStates.includes(o.status) ? 'COLLECTED' : 'PREPARING',
            updatedAt: o.updatedAt,
          }))
          .filter((o) => o.token),
      };
    });
  }
}
