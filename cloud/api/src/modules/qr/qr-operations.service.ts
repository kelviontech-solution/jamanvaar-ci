import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Device, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ApplicationEntitlementsService } from "../application-entitlements/application-entitlements.service";
import { RealtimeBus } from "../../common/realtime/realtime-bus";
import { QrMenuService } from "./qr-menu.service";
import { QrSettingsService } from "./qr-settings.service";
import { PaymentsService } from "../payments/payments.service";
import { ConfigService } from "@nestjs/config";
import { orderingAvailability, type QrRules } from "./qr-rules";
import { qrItemPerformance } from "./qr-menu-analytics";
import type { QrContext } from "./qr-public.service";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const qrOperationsSchema = z
  .object({
    serviceEnabled: z.boolean(),
    requestTypes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Z0-9_-]{1,30}$/),
            label: z.string().trim().min(1).max(60),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    serviceCooldownSeconds: z.number().int().min(15).max(600),
    overdueMinutes: z.number().int().min(1).max(120),
    requestExpiryMinutes: z.number().int().min(10).max(240),
    quietHours: z.object({ start: clock, end: clock }).nullable(),
    pickupEnabled: z.boolean(),
    asapEnabled: z.boolean(),
    leadMinutes: z.number().int().min(5).max(240),
    cutoffMinutes: z.number().int().min(0).max(240),
    slotMinutes: z.number().int().min(10).max(120),
    slotCapacity: z.number().int().min(1).max(500),
    pickupDays: z.number().int().min(1).max(7),
    pickupHours: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            open: clock,
            close: clock,
          })
          .strict(),
      )
      .min(1)
      .max(21),
    closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(90),
    pickupInstructions: z.string().trim().max(300),
  })
  .partial()
  .strict();
const defaults = {
  serviceEnabled: false,
  requestTypes: [
    ["WAITER", "Call waiter"],
    ["WATER", "Water"],
    ["CUTLERY", "Cutlery"],
    ["NAPKINS", "Napkins"],
    ["BILL", "Request bill"],
    ["ASSISTANCE", "Assistance"],
  ].map(([id, label]) => ({ id, label, enabled: true })),
  serviceCooldownSeconds: 60,
  overdueMinutes: 5,
  requestExpiryMinutes: 120,
  quietHours: null as { start: string; end: string } | null,
  pickupEnabled: false,
  asapEnabled: true,
  leadMinutes: 30,
  cutoffMinutes: 15,
  slotMinutes: 30,
  slotCapacity: 10,
  pickupDays: 3,
  pickupHours: Array.from({ length: 7 }, (_, day) => ({
    day,
    open: "10:00",
    close: "22:00",
  })),
  closedDates: [] as string[],
  pickupInstructions: "",
};
type Tx = Prisma.TransactionClient;
type Settings = typeof defaults;
const terminal = new Set(["CANCELLED", "VOID", "VOIDED", "REFUNDED"]);
const timeFormatters = new Map<
  string,
  { parts: Intl.DateTimeFormat; label: Intl.DateTimeFormat }
>();
function formatters(timezone: string) {
  let f = timeFormatters.get(timezone);
  if (!f) {
    f = {
      parts: new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      label: new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    };
    if (timeFormatters.size >= 128)
      timeFormatters.delete(timeFormatters.keys().next().value!);
    timeFormatters.set(timezone, f);
  }
  return f;
}
export function localPickupParts(date: Date, timezone: string) {
  const p = formatters(timezone).parts.formatToParts(date);
  const get = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
    label: formatters(timezone).label.format(date),
  };
}
@Injectable()
export class QrOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus,
    private readonly menus: QrMenuService,
    private readonly settings: QrSettingsService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}
  private console(device: Device) {
    if (device.type !== "POS_ADMIN")
      throw new ForbiddenException("QR administration required");
  }
  async effectiveIn(tx: Tx, rid: string, branch: string | null) {
    const rows = await tx.syncedEntity.findMany({
      where: {
        restaurantId: rid,
        entityType: "QR_OPERATIONS_SETTINGS",
        externalId: { in: ["restaurant", ...(branch ? [branch] : [])] },
      },
    });
    let s: Settings = { ...defaults };
    for (const key of ["restaurant", branch]) {
      const p = rows.find((r) => r.externalId === key)?.payload as any;
      if (p) s = { ...s, ...p.settings };
    }
    return s;
  }
  async effective(rid: string, branch: string | null) {
    return this.prisma.runAsTenant(rid, (tx) =>
      this.effectiveIn(tx, rid, branch),
    );
  }
  async configuration(device: Device) {
    this.console(device);
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertAppEnabled(
        tx,
        device.restaurantId,
        "QR_ORDERING",
      );
      const key = device.branchId ?? "restaurant",
        row = await tx.syncedEntity.findUnique({
          where: {
            restaurantId_entityType_externalId: {
              restaurantId: device.restaurantId,
              entityType: "QR_OPERATIONS_SETTINGS",
              externalId: key,
            },
          },
        });
      return {
        settings: await this.effectiveIn(
          tx,
          device.restaurantId,
          device.branchId,
        ),
        version: row?.syncVersion ?? 0,
        capabilities: await this.entitlements.resolveQrCapabilities(
          tx,
          device.restaurantId,
        ),
      };
    });
  }
  async update(
    device: Device,
    changes: z.infer<typeof qrOperationsSchema>,
    version: number,
  ) {
    this.console(device);
    return this.prisma
      .runAsTenant(device.restaurantId, async (tx) => {
        await this.entitlements.assertAppEnabled(
          tx,
          device.restaurantId,
          "QR_ORDERING",
        );
        if (
          Object.keys(changes).some((k) =>
            /^service|request|overdue|quiet/.test(k),
          )
        )
          await this.entitlements.assertQrCapability(
            tx,
            device.restaurantId,
            "QR_SERVICE_REQUESTS",
          );
        if (
          Object.keys(changes).some((k) =>
            /^pickup|asap|lead|cutoff|slot|closed/.test(k),
          )
        )
          await this.entitlements.assertQrCapability(
            tx,
            device.restaurantId,
            "QR_SCHEDULED_PICKUP",
          );
        const key = device.branchId ?? "restaurant";
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-operations:" + device.restaurantId + ":" + key}))`;
        const where = {
            restaurantId_entityType_externalId: {
              restaurantId: device.restaurantId,
              entityType: "QR_OPERATIONS_SETTINGS",
              externalId: key,
            },
          },
          prior = await tx.syncedEntity.findUnique({ where });
        if ((prior?.syncVersion ?? 0) !== version)
          throw new ConflictException(
            "Settings changed. Reload before saving.",
          );
        const old = (prior?.payload as any)?.settings ?? {},
          next = { ...old, ...changes };
        const effective = {
          ...(await this.effectiveIn(tx, device.restaurantId, device.branchId)),
          ...changes,
        };
        if (
          new Set(effective.requestTypes.map((r) => r.id)).size !==
          effective.requestTypes.length
        )
          throw new BadRequestException("Request type IDs must be unique");
        for (const day of effective.closedDates)
          if (
            !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
            new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day
          )
            throw new BadRequestException("Use valid closure dates");
        await tx.syncedEntity.upsert({
          where,
          create: {
            restaurantId: device.restaurantId,
            entityType: "QR_OPERATIONS_SETTINGS",
            externalId: key,
            syncVersion: 1,
            payload: { settings: next } as any,
          },
          update: {
            syncVersion: { increment: 1 },
            payload: { settings: next } as any,
          },
        });
        await this.audit.log(
          {
            actorType: "TENANT",
            actorId: device.id,
            restaurantId: device.restaurantId,
            action: "QR_OPERATIONS_SETTINGS_CHANGED",
            category: "QR_ORDERING",
            details: {
              branchId: device.branchId,
              fields: Object.keys(changes),
            },
          },
          tx,
        );
        return { saved: true };
      })
      .then(async (r) => {
        this.bus.publishInvalidation(device.restaurantId);
        return r;
      });
  }
  async publicOptions(ctx: QrContext) {
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      const s = await this.effectiveIn(tx, ctx.restaurant.id, ctx.branch.id),
        c = await this.entitlements.resolveQrCapabilities(
          tx,
          ctx.restaurant.id,
        );
      return {
        serviceEnabled:
          s.serviceEnabled &&
          c.capabilities.some(
            (c) => c.code === "QR_SERVICE_REQUESTS" && c.enabled,
          ) &&
          !!ctx.table,
        requestTypes:
          s.serviceEnabled &&
          c.capabilities.some(
            (c) => c.code === "QR_SERVICE_REQUESTS" && c.enabled,
          )
            ? s.requestTypes.filter((t) => t.enabled)
            : [],
        pickupEnabled:
          s.pickupEnabled &&
          c.capabilities.some(
            (c) => c.code === "QR_SCHEDULED_PICKUP" && c.enabled,
          ),
        asapEnabled: s.asapEnabled,
        pickupInstructions: s.pickupInstructions,
      };
    });
  }
  private view(row: any, s: Settings, publicView = false) {
    const p = row.payload,
      expired =
        new Date(p.expiresAt).getTime() < Date.now() &&
        !["COMPLETED", "CANCELLED"].includes(p.status);
    return {
      id: row.externalId,
      version: row.syncVersion,
      typeId: p.typeId,
      label: p.label,
      note: p.note,
      status: expired ? "EXPIRED" : p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      tableNumber: p.tableNumber,
      overdue:
        !expired &&
        !["COMPLETED", "CANCELLED"].includes(p.status) &&
        Date.now() - Date.parse(p.createdAt) > s.overdueMinutes * 60000,
      ...(!publicView
        ? {
            branchId: p.branchId,
            assignedDeviceId: p.assignedDeviceId,
            history: p.history,
          }
        : {}),
    };
  }
  async requests(ctx: QrContext, session?: string) {
    if (!session || !ctx.table)
      throw new ForbiddenException(
        "A table QR and verified browser session are required",
      );
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        ctx.restaurant.id,
        "QR_SERVICE_REQUESTS",
      );
      const s = await this.effectiveIn(tx, ctx.restaurant.id, ctx.branch.id);
      const rows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: ctx.restaurant.id,
          entityType: "QR_SERVICE_REQUEST",
          payload: { path: ["browserSession"], equals: session },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      return rows
        .filter(
          (r) =>
            (r.payload as any).qrCodeId === ctx.code.id &&
            (r.payload as any).branchId === ctx.branch.id,
        )
        .map((r) => this.view(r, s, true));
    });
  }
  async createRequest(
    ctx: QrContext,
    session: string | undefined,
    input: { typeId: string; note?: string; idempotencyKey: string },
  ) {
    if (!session || !ctx.table)
      throw new ForbiddenException(
        "A table QR and verified browser session are required",
      );
    const rid = ctx.restaurant.id;
    const result = await this.prisma.runAsTenant(rid, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        rid,
        "QR_SERVICE_REQUESTS",
      );
      const s = await this.effectiveIn(tx, rid, ctx.branch.id),
        type = s.requestTypes.find((t) => t.id === input.typeId && t.enabled);
      if (!s.serviceEnabled || !type)
        throw new BadRequestException("This service request is unavailable");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-service:" + rid + ":" + ctx.branch.id + ":" + ctx.table!.id}))`;
      const id =
        "qr-service-" +
        createHash("sha256")
          .update(ctx.code.id + ":" + session + ":" + input.idempotencyKey)
          .digest("hex")
          .slice(0, 36);
      const prior = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: rid,
            entityType: "QR_SERVICE_REQUEST",
            externalId: id,
          },
        },
      });
      if (prior) return { request: this.view(prior, s, true), created: false };
      const recent = await tx.syncedEntity.findMany({
        where: {
          restaurantId: rid,
          entityType: "QR_SERVICE_REQUEST",
          createdAt: {
            gte: new Date(Date.now() - s.requestExpiryMinutes * 60000),
          },
          payload: { path: ["tableId"], equals: ctx.table!.id },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const mine = recent.filter(
          (r) => (r.payload as any).branchId === ctx.branch.id,
        ),
        open = mine.filter(
          (r) =>
            !["COMPLETED", "CANCELLED"].includes((r.payload as any).status),
        );
      const same = open.find((r) => (r.payload as any).typeId === type.id);
      if (same) {
        if ((same.payload as any).browserSession !== session)
          throw new ConflictException(
            "Your table already has this request pending.",
          );
        return { request: this.view(same, s, true), created: false };
      }
      if (
        open.length >= 5 ||
        mine.some(
          (r) =>
            Date.now() - r.createdAt.getTime() <
            s.serviceCooldownSeconds * 1000,
        )
      )
        throw new ConflictException(
          "Your table already has a recent request. Please wait before requesting again.",
        );
      const now = new Date().toISOString();
      const row = await tx.syncedEntity.create({
        data: {
          restaurantId: rid,
          entityType: "QR_SERVICE_REQUEST",
          externalId: id,
          payload: {
            branchId: ctx.branch.id,
            qrCodeId: ctx.code.id,
            tableId: ctx.table!.id,
            tableNumber: ctx.table!.number,
            browserSession: session,
            typeId: type.id,
            label: type.label,
            note: input.note ?? "",
            status: "OPEN",
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(
              Date.now() + s.requestExpiryMinutes * 60000,
            ).toISOString(),
            history: [],
          },
        },
      });
      return { request: this.view(row, s, true), created: true };
    });
    if (result.created)
      this.bus.publish({
        restaurantId: rid,
        branchId: ctx.branch.id,
        kind: "entities",
      });
    return result.request;
  }
  async staffRequests(device: Device) {
    if (!["POS_ADMIN", "CAPTAIN", "POS"].includes(device.type))
      throw new ForbiddenException("Service staff access required");
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_SERVICE_REQUESTS",
      );
      const s = await this.effectiveIn(
        tx,
        device.restaurantId,
        device.branchId,
      );
      const scope = {
          restaurantId: device.restaurantId,
          entityType: "QR_SERVICE_REQUEST",
          ...(device.branchId
            ? { payload: { path: ["branchId"], equals: device.branchId } }
            : {}),
        };
      const recent = await tx.syncedEntity.findMany({
        where: scope,
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const pending = await tx.syncedEntity.findMany({where:{...scope,createdAt:{gte:new Date(Date.now()-240*60000)},OR:['OPEN','ACKNOWLEDGED','IN_PROGRESS'].map(status=>({payload:{path:['status'],equals:status}}))},orderBy:{createdAt:'desc'},take:5001});
      if(pending.length>5000)throw new BadRequestException('Choose a branch to review this large service backlog.');
      const rows=[...new Map([...recent,...pending.filter(r=>!['EXPIRED','COMPLETED','CANCELLED'].includes(this.view(r,s).status))].map(r=>[r.id,r])).values()].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: device.restaurantId },
        select: { timezone: true },
      });
      const branch = device.branchId
        ? await tx.branch.findFirst({
            where: { id: device.branchId, restaurantId: device.restaurantId },
            select: { timezone: true },
          })
        : null;
      const local = localPickupParts(
          new Date(),
          branch?.timezone || restaurant.timezone,
        ),
        clock =
          String(Math.floor(local.minute / 60)).padStart(2, "0") +
          ":" +
          String(local.minute % 60).padStart(2, "0");
      const q = s.quietHours;
      const quietNow =
        !!q &&
        (q.start <= q.end
          ? clock >= q.start && clock < q.end
          : clock >= q.start || clock < q.end);
      const byBranch = new Map<string, Settings>();
      for (const branch of [
        ...new Set(rows.map((r) => (r.payload as any).branchId as string)),
      ])
        byBranch.set(
          branch,
          await this.effectiveIn(tx, device.restaurantId, branch),
        );
      const branches = await tx.branch.findMany({
        where: {
          restaurantId: device.restaurantId,
          id: { in: [...byBranch.keys()] },
        },
        select: { id: true, name: true, timezone: true },
      });
      const staff = await tx.device.findMany({
        where: {
          restaurantId: device.restaurantId,
          id: {
            in: rows
              .map((r) => (r.payload as any).assignedDeviceId)
              .filter((id): id is string => typeof id === "string"),
          },
        },
        select: { id: true, name: true, branchId: true },
      });
      return {
        requests: rows.map((r) => {
          const payload = r.payload as any,
            settings = byBranch.get(payload.branchId) ?? s,
            b = branches.find((b) => b.id === payload.branchId),
            assigned = staff.find(
              (d) =>
                d.id === payload.assignedDeviceId &&
                d.branchId === payload.branchId,
            ),
            q = settings.quietHours;
          const time = localPickupParts(
              new Date(),
              b?.timezone || restaurant.timezone,
            ),
            clock = `${String(Math.floor(time.minute / 60)).padStart(2, "0")}:${String(time.minute % 60).padStart(2, "0")}`;
          return {
            ...this.view(r, settings),
            branchName: b?.name,
            assignedDeviceName: assigned?.name,
            quietNow:
              !!q &&
              (q.start <= q.end
                ? clock >= q.start && clock < q.end
                : clock >= q.start || clock < q.end),
          };
        }),
        quietHours: s.quietHours,
        quietNow,
      };
    });
  }
  async act(
    device: Device,
    id: string,
    input: { status: string; version: number; assignedDeviceId?: string },
  ) {
    if (!["POS_ADMIN", "CAPTAIN", "POS"].includes(device.type))
      throw new ForbiddenException("Service staff access required");
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_SERVICE_REQUESTS",
      );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-service-action:" + device.restaurantId + ":" + id}))`;
      const where = {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: "QR_SERVICE_REQUEST",
            externalId: id,
          },
        },
        row = await tx.syncedEntity.findUnique({ where });
      const p = row?.payload as any;
      if (!row || (device.branchId && p.branchId !== device.branchId))
        throw new NotFoundException("Request not found");
      if (row.syncVersion !== input.version)
        throw new ConflictException("Request changed. Refresh its status.");
      if (new Date(p.expiresAt) < new Date())
        throw new ConflictException("This request has expired");
      const next: Record<string, string[]> = {
        OPEN: ["ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        ACKNOWLEDGED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED", "CANCELLED"],
      };
      if (!next[p.status]?.includes(input.status))
        throw new ConflictException("Invalid service request transition");
      if (
        input.assignedDeviceId &&
        !(await tx.device.findFirst({
          where: {
            id: input.assignedDeviceId,
            restaurantId: device.restaurantId,
            branchId: p.branchId,
            type: { in: ["CAPTAIN", "POS", "POS_ADMIN"] },
            status: "ACTIVE",
          },
        }))
      )
        throw new BadRequestException("Assignment must belong to this branch");
      const at = new Date().toISOString();
      const actorId=(device as Device & {adminActorId?:string}).adminActorId ?? device.id;
      const assignedDeviceId=input.assignedDeviceId ?? p.assignedDeviceId ?? (await tx.device.findFirst({where:{id:device.id,restaurantId:device.restaurantId,branchId:p.branchId,status:'ACTIVE'},select:{id:true}}))?.id;
      await tx.syncedEntity.update({
        where,
        data: {
          syncVersion: { increment: 1 },
          payload: {
            ...p,
            status: input.status,
            updatedAt: at,
            ...(assignedDeviceId ? {assignedDeviceId} : {}),
            history: [
              ...p.history,
              { status: input.status, at, deviceId: device.id, actorId },
            ],
          },
        },
      });
      await this.audit.log(
        {
          actorType: "TENANT",
          actorId: device.id,
          restaurantId: device.restaurantId,
          action: "QR_SERVICE_REQUEST_UPDATED",
          category: "QR_ORDERING",
          details: { id, branchId: p.branchId, status: input.status },
        },
        tx,
      );
    });
    this.bus.publish({
      restaurantId: device.restaurantId,
      branchId: device.branchId,
      kind: "entities",
    });
    return { saved: true };
  }
  private validSlot(
    date: Date,
    s: Settings,
    timezone: string,
    rules: QrRules,
    now: Date,
  ) {
    const delta = date.getTime() - now.getTime(),
      local = localPickupParts(date, timezone);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0 &&
      delta >= Math.max(s.leadMinutes, s.cutoffMinutes) * 60000 &&
      delta <= s.pickupDays * 86400000 &&
      local.minute % s.slotMinutes === 0 &&
      !s.closedDates.includes(local.date) &&
      orderingAvailability({ ...rules, hours: s.pickupHours }, timezone, date)
        .available &&
      orderingAvailability(rules, timezone, date).available
    );
  }
  async slots(ctx: QrContext, now = new Date()) {
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        ctx.restaurant.id,
        "QR_SCHEDULED_PICKUP",
      );
      const s = await this.effectiveIn(tx, ctx.restaurant.id, ctx.branch.id);
      if (!s.pickupEnabled) return { slots: [], timezone: ctx.branch.timezone };
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: ctx.restaurant.id,
          branchId: ctx.branch.id,
          source: "QR",
          createdAt: { gte: new Date(now.getTime() - 8 * 86400000) },
          status: { notIn: [...terminal] },
        },
        select: { meta: true },
      });
      const slots = [];
      for (
        let epoch = Math.ceil(now.getTime() / 60000) * 60000;
        epoch <= now.getTime() + s.pickupDays * 86400000;
        epoch += 60000
      ) {
        const date = new Date(epoch);
        if (
          localPickupParts(date, ctx.branch.timezone).minute % s.slotMinutes !==
          0
        )
          continue;
        if (
          !this.validSlot(
            date,
            s,
            ctx.branch.timezone,
            ctx.settings.rules!,
            now,
          )
        )
          continue;
        const at = date.toISOString(),
          held = orders.filter((o) => (o.meta as any)?.pickupAt === at).length;
        slots.push({
          at,
          label: localPickupParts(date, ctx.branch.timezone).label,
          remaining: Math.max(0, s.slotCapacity - held),
        });
      }
      return {
        slots: slots.filter((s) => s.remaining > 0).slice(0, 350),
        timezone: ctx.branch.timezone,
        instructions: s.pickupInstructions,
      };
    });
  }
  async reservePickupIn(
    tx: Tx,
    ctx: QrContext,
    orderType: string,
    pickupAt?: string,
  ) {
    const s = await this.effectiveIn(tx, ctx.restaurant.id, ctx.branch.id);
    if (!pickupAt) {
      if (orderType === "TAKEAWAY" && !s.asapEnabled)
        throw new BadRequestException(
          "Choose a pickup slot; ASAP takeaway is unavailable",
        );
      return {};
    }
    await this.entitlements.assertQrCapability(
      tx,
      ctx.restaurant.id,
      "QR_SCHEDULED_PICKUP",
    );
    if (
      orderType !== "TAKEAWAY" ||
      !s.pickupEnabled ||
      !this.validSlot(
        new Date(pickupAt),
        s,
        ctx.branch.timezone,
        ctx.settings.rules!,
        new Date(),
      )
    )
      throw new ConflictException(
        "This pickup slot is unavailable. Choose another time.",
      );
    const at = new Date(pickupAt).toISOString();
    const held = await tx.syncedOrder.count({
      where: {
        restaurantId: ctx.restaurant.id,
        branchId: ctx.branch.id,
        source: "QR",
        status: { notIn: [...terminal] },
        meta: { path: ["pickupAt"], equals: at },
      },
    });
    if (held >= s.slotCapacity)
      throw new ConflictException(
        "This pickup slot is full. Choose another time.",
      );
    return {
      pickupAt: at,
      pickupTimezone: ctx.branch.timezone,
      pickupInstructions: s.pickupInstructions,
    };
  }
  async analytics(device: Device, from?: string, to?: string) {
    this.console(device);
    const valid = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
    if ([from, to].some((v) => v && !valid(v)))
      throw new BadRequestException("Choose valid calendar dates");
    const start = from
        ? new Date(from + "T00:00:00Z")
        : new Date(Date.now() - 7 * 86400000),
      end = to
        ? new Date(Date.parse(to + "T00:00:00Z") + 86400000)
        : new Date();
    if (end <= start || end.getTime() - start.getTime() > 367 * 86400000)
      throw new BadRequestException("Choose a date range of up to one year");
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_MENU_ANALYTICS",
      );
      const scope = {
        restaurantId: device.restaurantId,
        ...(device.branchId ? { branchId: device.branchId } : {}),
        createdAt: { gte: start, lt: end },
      };
      // Read in bounded database pages, never silently truncate financial reports.
      const pages = async (model: any, args: any): Promise<any[]> => {
        const rows: any[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
          const batch = await model.findMany({
            ...args,
            orderBy: { id: "asc" },
            take: 1000,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          rows.push(...batch);
          if (batch.length < 1000) return rows;
          cursor = batch[batch.length - 1].id;
        }
        throw new BadRequestException(
          "This report is too large. Choose a shorter date range.",
        );
      };
      const [orders, events, entries, requests] = await Promise.all([
        pages(tx.syncedOrder, {
          where: { ...scope, source: "QR" },
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            discountAmount: true,
            items: true,
            meta: true,
            orderType: true,
            branchId: true,
            createdAt: true,
          },
        }),
        pages(tx.qrEvent, {
          where: scope,
          select: { id: true, type: true, metadata: true, sessionId: true },
        }),
        pages(tx.orderPaymentEntry, {
          where: {
            restaurantId: device.restaurantId,
            order: { ...scope, source: "QR" },
          },
          select: { id: true, orderId: true, kind: true, amount: true },
        }),
        pages(tx.syncedEntity, {
          where: {
            restaurantId: device.restaurantId,
            entityType: "QR_SERVICE_REQUEST",
            createdAt: scope.createdAt,
            ...(device.branchId
              ? { payload: { path: ["branchId"], equals: device.branchId } }
              : {}),
          },
          select: { id: true, payload: true },
        }),
      ]);
      const count = (type: string) =>
        events.filter((e) => e.type === type).length;
      const items = qrItemPerformance(orders, entries, events);
      const accepted = orders.filter(
        (o) => !["DRAFT", "CANCELLED", "VOID", "VOIDED"].includes(o.status),
      );
      const groupItems = new Map<string, any>();
      for (const item of items) {
        const row = groupItems.get(item.category) || {
          category: item.category,
          quantity: 0,
          orderedValuePaise: 0,
          discountPaise: 0,
          netCollectedPaise: 0,
        };
        row.quantity += item.orderedQuantity;
        row.orderedValuePaise += item.orderedValuePaise;
        row.discountPaise += item.discountPaise;
        row.netCollectedPaise += item.netCollectedPaise;
        groupItems.set(item.category, row);
      }
      const groupedOrders = (key: (o: any) => string) => {
        const groups = new Map<
          string,
          { label: string; orders: number; valuePaise: number }
        >();
        for (const order of accepted) {
          const label = key(order),
            row = groups.get(label) || { label, orders: 0, valuePaise: 0 };
          row.orders++;
          row.valuePaise += order.totalAmount;
          groups.set(label, row);
        }
        return [...groups.values()].sort((a, b) =>
          a.label.localeCompare(b.label),
        );
      };
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        dateBasis: "UTC calendar days; orders created in this range",
        items,
        byCategory: [...groupItems.values()],
        byMode: groupedOrders((o) => o.orderType),
        byBranch: groupedOrders((o) => o.branchId || "Unassigned"),
        trend: groupedOrders((o) => o.createdAt.toISOString().slice(0, 10)),
        byHour: groupedOrders(
          (o) => String(o.createdAt.getUTCHours()).padStart(2, "0") + ":00 UTC",
        ),
        conversion: {
          denominator: "Observed menu views",
          percent: count("QR_MENU_VIEWED")
            ? (accepted.length / count("QR_MENU_VIEWED")) * 100
            : 0,
        },
        funnel: {
          landingSessions: count("QR_SCANNED"),
          menuViews: count("QR_MENU_VIEWED"),
          itemViews: count("QR_ITEM_VIEWED"),
          itemAdds: count("QR_ITEM_ADDED"),
          carts: count("QR_CART_CREATED"),
          checkoutStarts: count("QR_CHECKOUT_STARTED"),
          placedOrders: accepted.length,
          completedOrders: accepted.filter((o) =>
            ["COMPLETED", "SERVED"].includes(o.status),
          ).length,
          paidOrders: accepted.filter((o) =>
            ["SUCCESS", "PAID"].includes(o.paymentStatus),
          ).length,
        },
        requestCounts: Object.fromEntries(
          [
            "OPEN",
            "ACKNOWLEDGED",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
            "EXPIRED",
          ].map((status) => [
            status,
            requests.filter(
              (r) =>
                this.view({ payload: r.payload }, defaults).status === status,
            ).length,
          ]),
        ),
        costCoverage: {
          available: 0,
          total: items.filter((i) => i.orderedQuantity > 0).length,
          message:
            "Historical ingredient costs are not stored on these orders. Profit is unavailable; net collections are not profit.",
        },
        definitions:
          "Views and add taps are deduplicated per item, browser session and restaurant day. Landing sessions measure page opens, not physical camera scans. Collections and refunds follow the original order cohort; line allocations include tax and discount proportionally.",
      };
    });
  }
  async health(device: Device) {
    this.console(device);
    const rid = device.restaurantId;
    const [ent, branches, menu, settings, online, codes] = await Promise.all([
      this.prisma.runAsTenant(rid, (tx) =>
        this.entitlements.resolve(tx, rid, "QR_ORDERING"),
      ),
      this.prisma.runAsTenant(rid, (tx) =>
        tx.branch.findMany({
          where: {
            restaurantId: rid,
            status: "ACTIVE",
            ...(device.branchId ? { id: device.branchId } : {}),
          },
          select: { id: true, name: true },
        }),
      ),
      this.menus
        .build(rid, device.branchId)
        .catch(() => ({ items: [], menuVersion: 0 })),
      this.settings.effective(rid, device.branchId),
      this.payments.qrOnlineAvailable(rid),
      this.prisma.runAsTenant(rid, (tx) =>
        tx.qrCode.findMany({
          where: {
            restaurantId: rid,
            status: "ACTIVE",
            ...(device.branchId ? { branchId: device.branchId } : {}),
          },
          select: { branchId: true, tableId: true, mode: true },
        }),
      ),
    ]);
    const tables = await this.prisma.runAsTenant(rid, (tx) =>
      tx.syncedEntity.findMany({
        where: { restaurantId: rid, entityType: "DINING_TABLE" },
        select: { externalId: true, payload: true },
      }),
    );
    const bad = codes.filter(
      (c) =>
        !branches.some((b) => b.id === c.branchId) ||
        (c.mode === "TABLE_ORDER" &&
          !tables.some(
            (t) =>
              t.externalId === c.tableId &&
              (t.payload as any).isActive !== false &&
              (t.payload as any).deleted !== true &&
              (!(t.payload as any).branchId ||
                (t.payload as any).branchId === c.branchId),
          )),
    );
    const checks = [
      {
        id: "ordering",
        label: "Ordering enabled",
        ready: settings.orderingEnabled,
        required: true,
        action: "Turn on ordering in QR Settings.",
        tab: "SETTINGS",
      },
      {
        id: "license",
        label: "QR Ordering license",
        ready: ent.enabled,
        required: true,
        action: "Ask your platform administrator to enable QR Ordering.",
        tab: "ADVANCED",
      },
      {
        id: "branch",
        label: "Active branch",
        ready: branches.length > 0,
        required: true,
        action: "Create or reactivate a branch in Restaurant Admin.",
        tab: "SETTINGS",
      },
      {
        id: "menu",
        label: "Published dishes",
        ready: menu.items.length > 0,
        required: true,
        action: "Upload and publish your menu in Menu & Availability.",
        tab: "MENU",
      },
      {
        id: "codes",
        label: "Active, correctly mapped QR codes",
        ready: codes.length > 0 && bad.length === 0,
        required: true,
        action: "Generate a QR code for a valid table or menu in Tables & QR.",
        tab: "TABLES",
      },
      {
        id: "payment",
        label: "A usable payment method",
        ready: settings.allowCash || (settings.allowOnlinePayment && online),
        required: true,
        action: "Enable cash, or configure verified online checkout.",
        tab: "PAYMENTS",
      },
      {
        id: "online",
        label: "Online payment readiness",
        ready: !settings.allowOnlinePayment || online,
        required: false,
        action:
          "Configure your merchant integration or turn off online payment.",
        tab: "PAYMENTS",
      },
      {
        id: "routing",
        label: "Canonical order routing",
        ready: ent.enabled && branches.length > 0,
        required: true,
        action:
          "QR Admin uses the shared order engine; check the branch and license.",
        tab: "ORDERS",
      },
      {
        id: "origin",
        label: "Public ordering address",
        ready:
          !!this.config.get<string>("QR_ORDER_BASE_URL") ||
          this.config.get("NODE_ENV") !== "production",
        required: true,
        action: "Platform administrator: configure QR_ORDER_BASE_URL.",
        tab: "TABLES",
      },
    ];
    return {
      checks,
      scope: device.branchId
        ? "Selected branch"
        : "Restaurant defaults — check each branch separately",
      ready: checks.filter((c) => c.required).every((c) => c.ready),
      completed: checks.filter((c) => c.ready).length,
      total: checks.length,
      menuVersion: menu.menuVersion,
      orderingEnabled: settings.orderingEnabled,
    };
  }
}
