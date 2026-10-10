import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Device, Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { ApplicationEntitlementsService } from "../application-entitlements/application-entitlements.service";
import { QrCapability } from "../application-entitlements/qr-capabilities";
import { AuditService } from "../audit/audit.service";
import { QrMenuService, BuiltQrMenu } from "./qr-menu.service";
import { OrderSyncService } from "../order-sync/order-sync.service";
import { RealtimeBus } from "../../common/realtime/realtime-bus";

const translatedText = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();
const language = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
export const qrAdvancedSchema = z
  .object({
    multilingualEnabled: z.boolean(),
    defaultLanguage: language,
    languages: z.array(language).min(1).max(20),
    translations: z.record(
      language,
      z
        .object({
          items: z.record(z.string().max(128), translatedText).default({}),
          categories: z.record(z.string().max(128), translatedText).default({}),
          restaurantDescription: z.string().max(1000).optional(),
        })
        .strict(),
    ),
    feedbackEnabled: z.boolean(),
    historyEnabled: z.boolean(),
    notificationsEnabled: z.boolean(),
    notificationTypes: z
      .array(
        z.enum([
          "NEW_ORDER",
          "CASH_DUE",
          "PAYMENT_COLLECTED",
          "PAYMENT_PENDING",
          "CANCELLED",
          "REFUND",
        ]),
      )
      .max(6),
    quietHours: z
      .object({
        start: z.number().int().min(0).max(23),
        end: z.number().int().min(0).max(23),
      })
      .nullable(),
    capacityEnabled: z.boolean(),
    workloadLimit: z.number().int().min(0).max(10000),
    busyAtWorkload: z.number().int().min(0).max(10000),
    busyExtraMinutes: z.number().int().min(0).max(180),
    promotionsEnabled: z.boolean(),
    recommendationIds: z.array(z.string().min(1).max(128)).max(20),
    groupEnabled: z.boolean(),
    loyaltyEnabled: z.boolean(),
  inventoryEnabled: z.boolean(),
    maxGuests: z.number().int().min(2).max(30),
    sessionMinutes: z.number().int().min(10).max(240),
  })
  .partial()
  .strict();
export type QrAdvancedUpdate = z.infer<typeof qrAdvancedSchema>;
const defaults = {
  multilingualEnabled: false,
  defaultLanguage: "en",
  languages: ["en"],
  translations: {},
  feedbackEnabled: false,
  historyEnabled: false,
  notificationsEnabled: false,
  notificationTypes: [
    "NEW_ORDER",
    "CASH_DUE",
    "PAYMENT_COLLECTED",
    "PAYMENT_PENDING",
    "CANCELLED",
    "REFUND",
  ],
  quietHours: null,
  capacityEnabled: false,
  workloadLimit: 0,
  busyAtWorkload: 0,
  busyExtraMinutes: 10,
  promotionsEnabled: false,
  recommendationIds: [],
  groupEnabled: false,
  loyaltyEnabled: false,
  inventoryEnabled: false,
  maxGuests: 8,
  sessionMinutes: 60,
};
const flagCapabilities: Record<string, QrCapability> = {
  multilingualEnabled: "QR_MULTILINGUAL",
  feedbackEnabled: "QR_FEEDBACK",
  historyEnabled: "QR_ORDER_HISTORY",
  notificationsEnabled: "QR_NOTIFICATIONS",
  capacityEnabled: "QR_KITCHEN_CAPACITY",
  promotionsEnabled: "QR_PROMOTIONS",
  groupEnabled: "QR_GROUP_ORDERING",
  loyaltyEnabled: "QR_LOYALTY",
  inventoryEnabled: "QR_INVENTORY_SYNC",
};
const sectionCapabilities: Record<string, QrCapability> = {
  defaultLanguage: "QR_MULTILINGUAL",
  languages: "QR_MULTILINGUAL",
  translations: "QR_MULTILINGUAL",
  notificationTypes: "QR_NOTIFICATIONS",
  quietHours: "QR_NOTIFICATIONS",
  workloadLimit: "QR_KITCHEN_CAPACITY",
  busyAtWorkload: "QR_KITCHEN_CAPACITY",
  busyExtraMinutes: "QR_KITCHEN_CAPACITY",
  recommendationIds: "QR_PROMOTIONS",
  maxGuests: "QR_GROUP_ORDERING",
  sessionMinutes: "QR_GROUP_ORDERING",
};
type Tx = Prisma.TransactionClient;
const key = (branchId: string | null) => branchId ?? "restaurant";

@Injectable()
export class QrAdvancedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly audit: AuditService,
    private readonly menus: QrMenuService,
    private readonly orders: OrderSyncService,
    private readonly bus: RealtimeBus,
  ) {}

  private assertConsole(device: Device) {
    if (device.type !== "POS_ADMIN")
      throw new ForbiddenException("Restaurant administration is required");
  }

  async effectiveIn(tx: Tx, restaurantId: string, branchId: string | null) {
    const rows = await tx.syncedEntity.findMany({
      where: {
        restaurantId,
        entityType: "QR_ADVANCED_SETTINGS",
        externalId: { in: ["restaurant", ...(branchId ? [branchId] : [])] },
      },
    });
    const base = rows.find((r) => r.externalId === "restaurant");
    const branch = rows.find((r) => r.externalId === branchId);
    const inherited = (base?.payload as QrAdvancedUpdate) ?? {};
    const overrides = (branch?.payload as QrAdvancedUpdate) ?? {};
    const translations: NonNullable<QrAdvancedUpdate["translations"]> = {};
    for (const locale of new Set([
      ...Object.keys(inherited.translations ?? {}),
      ...Object.keys(overrides.translations ?? {}),
    ])) {
      const baseText = inherited.translations?.[locale],
        localText = overrides.translations?.[locale];
      translations[locale] = {
        ...baseText,
        ...localText,
        items: { ...baseText?.items, ...localText?.items },
        categories: { ...baseText?.categories, ...localText?.categories },
      };
    }
    return { ...defaults, ...inherited, ...overrides, translations };
  }

  async configuration(device: Device) {
    this.assertConsole(device);
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const licensing = await this.entitlements.resolveQrCapabilities(
        tx,
        device.restaurantId,
      );
      if (!licensing.module.enabled)
        throw new ForbiddenException("QR Ordering is not enabled");
      const settings = await this.effectiveIn(
        tx,
        device.restaurantId,
        device.branchId,
      );
      const local = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: "QR_ADVANCED_SETTINGS",
            externalId: key(device.branchId),
          },
        },
      });
      const activeCodes = await tx.qrCode.count({
        where: {
          restaurantId: device.restaurantId,
          status: "ACTIVE",
          ...(device.branchId ? { branchId: device.branchId } : {}),
        },
      });
      const activeBranches = await tx.branch.count({
        where: { restaurantId: device.restaurantId, status: "ACTIVE" },
      });
      return {
        settings,
        overrideKeys: device.branchId
          ? Object.keys((local?.payload as object) ?? {})
          : [],
        version: local?.syncVersion ?? 0,
        ...licensing,
        usage: { activeCodes, activeBranches },
        identity: {
          loyaltyAvailable: true,
          reason:
            "Loyalty requires phone verification through the configured SMS OTP integration. Public QR never grants CRM access using an unverified phone number.",
        },
      };
    });
  }

  async update(device: Device, changes: QrAdvancedUpdate, version: number) {
    this.assertConsole(device);
    if (!Object.keys(changes).length)
      throw new BadRequestException("No settings supplied");
    const result = await this.prisma.runAsTenant(
      device.restaurantId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-advanced:" + device.restaurantId}))`;
        await this.entitlements.assertAppEnabled(
          tx,
          device.restaurantId,
          "QR_ORDERING",
        );
        for (const [field, value] of Object.entries(changes)) {
          const capability =
            sectionCapabilities[field] ??
            (value === true ? flagCapabilities[field] : undefined);
          if (capability)
            await this.entitlements.assertQrCapability(
              tx,
              device.restaurantId,
              capability,
            );
        }
        const where = {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: "QR_ADVANCED_SETTINGS",
            externalId: key(device.branchId),
          },
        };
        const old = await tx.syncedEntity.findUnique({ where });
        if ((old?.syncVersion ?? 0) !== version)
          throw new ConflictException(
            "Configuration changed on another screen. Refresh before saving.",
          );
        const merged = {
          ...(await this.effectiveIn(tx, device.restaurantId, device.branchId)),
          ...changes,
        };
        if (!merged.languages.includes(merged.defaultLanguage))
          throw new BadRequestException(
            "Default language must be one of the enabled languages",
          );
        const licensing = await this.entitlements.resolve(
          tx,
          device.restaurantId,
          "QR_ORDERING",
        );
        const limit = licensing.limits.qrMaxLanguages;
        if (typeof limit === "number" && merged.languages.length > limit)
          throw new ConflictException(
            "This license language limit has been reached",
          );
        const prior = (old?.payload as QrAdvancedUpdate) ?? {};
        const updatedTranslations = { ...prior.translations };
        for (const [locale, texts] of Object.entries(
          changes.translations ?? {},
        ))
          updatedTranslations[locale] = {
            ...updatedTranslations[locale],
            ...texts,
            items: { ...updatedTranslations[locale]?.items, ...texts.items },
            categories: {
              ...updatedTranslations[locale]?.categories,
              ...texts.categories,
            },
          };
        const payload = {
          ...prior,
          ...changes,
          ...(changes.translations
            ? { translations: updatedTranslations }
            : {}),
        } as Prisma.InputJsonValue;
        const saved = await tx.syncedEntity.upsert({
          where,
          create: {
            restaurantId: device.restaurantId,
            entityType: "QR_ADVANCED_SETTINGS",
            externalId: key(device.branchId),
            payload,
          },
          update: { payload, syncVersion: { increment: 1 } },
        });
        await this.audit.log(
          {
            actorType: "TENANT",
            actorId:
              (device as Device & { adminActorId?: string }).adminActorId ??
              device.id,
            restaurantId: device.restaurantId,
            action: "QR_ADVANCED_SETTINGS_UPDATED",
            category: "QR_ORDERING",
            details: {
              branchId: device.branchId,
              fields: Object.keys(changes),
              version: saved.syncVersion,
            },
          },
          tx,
        );
        return saved.syncVersion;
      },
    );
    this.bus.publishInvalidation(device.restaurantId);
    return { version: result };
  }

  async publicSettingsIn(tx:Tx,restaurantId:string,branchId:string){
      const settings = await this.effectiveIn(tx, restaurantId, branchId);
      const licensing = await this.entitlements.resolveQrCapabilities(
        tx,
        restaurantId,
      );
      for (const [flag, cap] of Object.entries(flagCapabilities))
        (settings as Record<string, unknown>)[flag] =
          (settings as Record<string, unknown>)[flag] === true &&
          licensing.capabilities.some((c) => c.code === cap && c.enabled);
      return settings;
  }

  publicSettings(restaurantId:string,branchId:string){return this.prisma.runAsTenant(restaurantId,tx=>this.publicSettingsIn(tx,restaurantId,branchId));}

  async inherit(device: Device, version: number) {
    this.assertConsole(device);
    if (!device.branchId)
      throw new BadRequestException(
        "Choose a branch to restore its inherited preferences",
      );
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-advanced:" + device.restaurantId}))`;
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_MULTI_BRANCH",
      );
      const row = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: "QR_ADVANCED_SETTINGS",
            externalId: device.branchId!,
          },
        },
      });
      if ((row?.syncVersion ?? 0) !== version)
        throw new ConflictException(
          "Preferences changed. Refresh before restoring defaults",
        );
      if (row) await tx.syncedEntity.delete({ where: { id: row.id } });
      await this.audit.log(
        {
          actorType: "TENANT",
          actorId: device.id,
          restaurantId: device.restaurantId,
          action: "QR_ADVANCED_INHERITANCE_RESTORED",
          category: "QR_ORDERING",
          details: { branchId: device.branchId },
        },
        tx,
      );
    });
    this.bus.publishInvalidation(device.restaurantId);
    return { inherited: true };
  }

  async propagation(
    device: Device,
    changes: QrAdvancedUpdate,
    branchIds: string[],
    versions?: Record<string, number>,
  ) {
    this.assertConsole(device);
    if (
      device.branchId ||
      (device as Device & { adminActorId?: string }).adminActorId === undefined
    )
      throw new ForbiddenException(
        "Sign in as the restaurant owner and select all branches for propagation",
      );
    return this.prisma
      .runAsTenant(device.restaurantId, async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-advanced:" + device.restaurantId}))`;
        await this.entitlements.assertQrCapability(
          tx,
          device.restaurantId,
          "QR_MULTI_BRANCH",
        );
        const branches = await tx.branch.findMany({
          where: {
            restaurantId: device.restaurantId,
            id: { in: branchIds },
            status: "ACTIVE",
          },
        });
        if (branches.length !== new Set(branchIds).size)
          throw new BadRequestException(
            "Choose only active branches in this restaurant",
          );
        for (const [field, value] of Object.entries(changes)) {
          const cap =
            sectionCapabilities[field] ??
            (value === true ? flagCapabilities[field] : undefined);
          if (cap)
            await this.entitlements.assertQrCapability(
              tx,
              device.restaurantId,
              cap,
            );
        }
        const preview = [];
        for (const branch of branches) {
          const where = {
            restaurantId_entityType_externalId: {
              restaurantId: device.restaurantId,
              entityType: "QR_ADVANCED_SETTINGS",
              externalId: branch.id,
            },
          };
          const row = await tx.syncedEntity.findUnique({ where }),
            local = (row?.payload as Record<string, unknown>) ?? {};
          const preserve = Object.keys(changes).filter((k) => k in local),
            apply = Object.fromEntries(
              Object.entries(changes).filter(([k]) => !(k in local)),
            );
          const before = await this.effectiveIn(
              tx,
              device.restaurantId,
              branch.id,
            ),
            after = { ...before, ...apply };
          if (!after.languages.includes(after.defaultLanguage))
            throw new BadRequestException(
              "Propagated default language must be enabled at every selected branch",
            );
          const languageLimit = (
            await this.entitlements.resolve(
              tx,
              device.restaurantId,
              "QR_ORDERING",
            )
          ).limits.qrMaxLanguages;
          if (
            typeof languageLimit === "number" &&
            after.languages.length > languageLimit
          )
            throw new ConflictException("Configured language limit exceeded");
          const version = row?.syncVersion ?? 0;
          preview.push({
            branchId: branch.id,
            name: branch.name,
            version,
            preservedKeys: preserve,
            appliedKeys: Object.keys(apply),
            changes: Object.fromEntries(
              Object.keys(apply).map((k) => [
                k,
                {
                  before: (before as Record<string, unknown>)[k],
                  after: apply[k],
                },
              ]),
            ),
          });
          if (versions) {
            if (versions[branch.id] !== version)
              throw new ConflictException(
                "A branch changed after preview. Preview the operation again",
              );
            if (Object.keys(apply).length)
              await tx.syncedEntity.upsert({
                where,
                create: {
                  restaurantId: device.restaurantId,
                  entityType: "QR_ADVANCED_SETTINGS",
                  externalId: branch.id,
                  payload: apply as Prisma.InputJsonValue,
                },
                update: {
                  payload: { ...local, ...apply } as Prisma.InputJsonValue,
                  syncVersion: { increment: 1 },
                },
              });
          }
        }
        if (versions) {
          await this.audit.log(
            {
              actorType: "TENANT",
              actorId: (device as Device & { adminActorId?: string })
                .adminActorId!,
              restaurantId: device.restaurantId,
              action: "QR_PREFERENCES_PROPAGATED",
              category: "QR_ORDERING",
              details: {
                branchIds,
                fields: Object.keys(changes),
                policy: "PRESERVE_EXISTING_OVERRIDES",
              },
            },
            tx,
          );
        }
        return {
          applied: !!versions,
          branches: preview,
          policy: "PRESERVE_EXISTING_OVERRIDES",
        };
      })
      .then((result) => {
        if (versions) this.bus.publishInvalidation(device.restaurantId);
        return result;
      });
  }

  async translatedMenu(
    restaurantId: string,
    branchId: string,
    menu: BuiltQrMenu,
  ) {
    const settings = await this.publicSettings(restaurantId, branchId);
    if (!settings.multilingualEnabled)
      return {
        ...menu,
        languages: [
          ...new Set([
            "en",
            ...menu.items.flatMap((i) => Object.keys(i.translations ?? {})),
            ...menu.categories.flatMap((c) =>
              Object.keys(c.translations ?? {}),
            ),
          ]),
        ],
        defaultLanguage: "en",
      };
    const translations = settings.translations;
    const texts = (kind: "items" | "categories", id: string) =>
      Object.fromEntries(
        settings.languages.flatMap((locale) =>
          translations[locale]?.[kind]?.[id]
            ? [[locale, translations[locale][kind][id]]]
            : [],
        ),
      );
    const items = menu.items.map((item) => ({
      ...item,
      translations: { ...item.translations, ...texts("items", item.id) },
    }));
    const categories = menu.categories.map((category) => ({
      ...category,
      translations: {
        ...category.translations,
        ...texts("categories", category.id),
      },
    }));
    return {
      ...menu,
      items,
      categories,
      languages: settings.languages,
      defaultLanguage: settings.defaultLanguage,
      etag:
        menu.etag +
        ":" +
        (await import("node:crypto"))
          .createHash("sha256")
          .update(
            JSON.stringify({
              items,
              categories,
              languages: settings.languages,
            }),
          )
          .digest("hex")
          .slice(0, 16),
    };
  }

  async workloadIn(
    tx: Tx,
    restaurantId: string,
    branchId: string,
    preparationMinutes: number,
  ) {
    const settings = await this.effectiveIn(tx, restaurantId, branchId);
    if (
      !settings.capacityEnabled ||
      !(
        await this.entitlements.resolveQrCapability(
          tx,
          restaurantId,
          "QR_KITCHEN_CAPACITY",
        )
      ).enabled
    )
      return {
        enabled: false,
        units: 0,
        estimateMinutes: preparationMinutes,
        atCapacity: false,
      };
    const active = await tx.syncedOrder.findMany({
      where: {
        restaurantId,
        branchId,
        status: {
          in: ["NEW", "CONFIRMED", "ACCEPTED", "PREPARING", "COOKING"],
        },
      },
      select: { items: true },
    });
    const units = active.reduce(
      (n, order) =>
        n +
        (Array.isArray(order.items)
          ? order.items.reduce(
              (sum: number, line: any) =>
                sum +
                (!["READY", "SERVED", "CANCELLED"].includes(line.kitchenStatus)
                  ? Math.max(0, Number(line.quantity) || 0)
                  : 0),
              0,
            )
          : 0),
      0,
    );
    return {
      enabled: true,
      units,
      estimateMinutes:
        preparationMinutes +
        (settings.busyAtWorkload && units >= settings.busyAtWorkload
          ? settings.busyExtraMinutes
          : 0),
      atCapacity: settings.workloadLimit > 0 && units >= settings.workloadLimit,
    };
  }

  async feedback(
    publicOrderId: string,
    input: { rating: number; comment?: string; categories?: string[] },
  ) {
    const order = await this.prisma.runAsPlatform((tx) =>
      tx.syncedOrder.findUnique({ where: { publicOrderId } }),
    );
    if (!order || order.source !== "QR")
      throw new NotFoundException("Order not found");
    return this.prisma.runAsTenant(order.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"order:" + order.restaurantId + ":" + order.externalOrderId}))`;
      await this.entitlements.assertQrCapability(
        tx,
        order.restaurantId,
        "QR_FEEDBACK",
      );
      const settings = await this.effectiveIn(
        tx,
        order.restaurantId,
        order.branchId,
      );
      if (!settings.feedbackEnabled)
        throw new ForbiddenException("Feedback is disabled");
      const fresh = await tx.syncedOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      if (!["COMPLETED", "SERVED", "DELIVERED"].includes(fresh.status))
        throw new BadRequestException(
          "Feedback is available after the order is completed",
        );
      const where = {
        restaurantId_entityType_externalId: {
          restaurantId: order.restaurantId,
          entityType: "QR_VERIFIED_FEEDBACK",
          externalId: order.id,
        },
      };
      const previous = await tx.syncedEntity.findUnique({ where });
      if (previous)
        throw new ConflictException(
          "Feedback has already been submitted for this order",
        );
      await tx.syncedEntity.create({
        data: {
          restaurantId: order.restaurantId,
          entityType: "QR_VERIFIED_FEEDBACK",
          externalId: order.id,
          payload: {
            ...input,
            branchId: order.branchId,
            submittedAt: new Date().toISOString(),
            verified: true,
          },
        },
      });
      return { submitted: true };
    });
  }

  async feedbackReport(device: Device, filters: { from?: string; to?: string; rating?: string } = {}) {
    const { from, to, rating } = filters;
    for (const day of [from, to]) if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(new Date(day + "T00:00:00Z").getTime()) || new Date(day + "T00:00:00Z").toISOString().slice(0,10) !== day)) throw new BadRequestException("Choose valid calendar dates");
    if (from && to && from > to) throw new BadRequestException("The end date must follow the start date");
    if (rating && !/^[1-5]$/.test(rating)) throw new BadRequestException("Rating must be between one and five");
    const end = to ? new Date(to + "T00:00:00Z") : undefined;
    if (end) end.setUTCDate(end.getUTCDate() + 1);
    this.assertConsole(device);
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_FEEDBACK",
      );
      const rows = await tx.syncedEntity.findMany({
        where: {
          restaurantId: device.restaurantId,
          entityType: "QR_VERIFIED_FEEDBACK",
          ...(from || end ? { createdAt: { ...(from ? { gte: new Date(from + "T00:00:00Z") } : {}), ...(end ? { lt: end } : {}) } } : {}),
          ...(rating ? { AND: [{ payload: { path: ["rating"], equals: Number(rating) } }] } : {}),
          ...(device.branchId
            ? { payload: { path: ["branchId"], equals: device.branchId } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const feedback = rows.map((row) => ({
        id: row.id,
        ...(row.payload as object),
        createdAt: row.createdAt,
      }));
      const ratings = rows.map((row) => (row.payload as any).rating as number);
      return {
        total: rows.length,
        average: ratings.length
          ? ratings.reduce((a, b) => a + b, 0) / ratings.length
          : null,
        distribution: [1, 2, 3, 4, 5].map((rating) => ({
          rating,
          count: ratings.filter((r) => r === rating).length,
        })),
        feedback,
      };
    });
  }

  async history(restaurantId: string, branchId: string, sessionId?: string) {
    if (!sessionId)
      throw new ForbiddenException("A signed browser session is required");
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        restaurantId,
        "QR_ORDER_HISTORY",
      );
      if (!(await this.effectiveIn(tx, restaurantId, branchId)).historyEnabled)
        throw new ForbiddenException("Order history is disabled");
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId,
          branchId,
          source: "QR",
          meta: { path: ["qrBrowserSession"], equals: sessionId },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return orders.map((order) => ({
        publicOrderId: order.publicOrderId,
        orderNumber: (order.meta as any)?.tokenNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.totalAmount / 100,
        createdAt: order.createdAt,
        items: Array.isArray(order.items)
          ? order.items.map((line: any) => ({
              itemId: line.menuItemId,
              name: line.name,
              quantity: line.quantity,
              optionIds:
                line.modifierDetails?.map((o: any) => o.optionId) ?? [],
              note: line.specialInstructions,
            }))
          : [],
      }));
    });
  }

  async notifications(device: Device) {
    this.assertConsole(device);
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_NOTIFICATIONS",
      );
      const settings = await this.effectiveIn(
        tx,
        device.restaurantId,
        device.branchId,
      );
      if (!settings.notificationsEnabled) return { enabled: false, alerts: [] };
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: device.restaurantId,
          source: "QR",
          ...(device.branchId ? { branchId: device.branchId } : {}),
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const allocations = await tx.orderPaymentEntry.findMany({
        where: {
          restaurantId: device.restaurantId,
          orderId: { in: orders.map((o) => o.id) },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const alerts = orders.flatMap((order) => {
        const base = {
          orderId: order.externalOrderId,
          branchId: order.branchId,
          orderNumber: (order.meta as any)?.tokenNumber,
          at: order.createdAt,
        };
        const type =
          order.status === "CANCELLED"
            ? "CANCELLED"
            : order.status === "DRAFT" &&
                Date.now() - order.createdAt.getTime() > 600000
              ? "PAYMENT_PENDING"
              : order.paymentMethod === "CASH_AT_COUNTER" &&
                  order.paymentStatus !== "SUCCESS"
                ? "CASH_DUE"
                : order.status === "DRAFT"
                  ? null
                  : "NEW_ORDER";
        return type ? [{ ...base, id: order.id + ":" + type, type }] : [];
      });
      for (const entry of allocations) {
        const order = orders.find((o) => o.id === entry.orderId)!;
        alerts.push({
          id: entry.id,
          type: entry.kind === "REFUND" ? "REFUND" : "PAYMENT_COLLECTED",
          orderId: order.externalOrderId,
          branchId: order.branchId,
          orderNumber: (order.meta as any)?.tokenNumber,
          at: entry.createdAt,
        });
      }
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: device.restaurantId },
        select: { timezone: true },
      });
      const hour = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: restaurant.timezone,
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date()),
      );
      const q = settings.quietHours;
      const quiet =
        !!q &&
        (q.start <= q.end
          ? hour >= q.start && hour < q.end
          : hour >= q.start || hour < q.end);
      return {
        enabled: true,
        quiet,
        alerts: alerts
          .filter((a) => settings.notificationTypes.includes(a.type))
          .sort((a, b) => b.at.getTime() - a.at.getTime()),
      };
    });
  }

  ledger(device: Device, id: string) {
    this.assertConsole(device);
    return this.orders.orderPaymentLedger(device, id);
  }

  async countedStock(device:Device,requestedBranch?:string){
    this.assertConsole(device);if(device.branchId&&requestedBranch&&requestedBranch!==device.branchId)throw new ForbiddenException('This stock belongs to another branch');const branchId=device.branchId??requestedBranch;
    if(!branchId)throw new BadRequestException('Choose a branch to manage counted dishes');
    return this.prisma.runAsTenant(device.restaurantId,async tx=>{
      await this.entitlements.assertQrCapability(tx,device.restaurantId,'QR_INVENTORY_SYNC');if(!await tx.branch.findFirst({where:{id:branchId,restaurantId:device.restaurantId}}))throw new BadRequestException('Branch not found');
      const rows=await tx.syncedEntity.findMany({where:{restaurantId:device.restaurantId,entityType:{in:['MENU_ITEM','BRANCH_MENU_OVERRIDE']}},select:{entityType:true,externalId:true,payload:true}});
      const overrides=new Map(rows.filter(r=>r.entityType==='BRANCH_MENU_OVERRIDE'&&(r.payload as any).branchId===branchId).map(r=>[(r.payload as any).itemId,r.payload as any]));
      return {branchId,items:rows.filter(r=>r.entityType==='MENU_ITEM'&&!(r.payload as any).deleted).map(r=>{const p=r.payload as any,override=overrides.get(r.externalId);return {itemId:r.externalId,name:p.name,stockQuantity:override?.stockQuantity??p.stockQuantity??null,source:typeof override?.stockQuantity==='number'?'BRANCH':typeof p.stockQuantity==='number'?'RESTAURANT':'MANUAL_AVAILABILITY'};})};
    });
  }
  async refund(
    device: Device,
    id: string,
    input: {
      amountPaise: number;
      version: number;
      idempotencyKey: string;
      reason: string;
    },
  ) {
    this.assertConsole(device);
    return this.orders.refundQrCash(device, id, input);
  }
  async collect(
    device: Device,
    id: string,
    input: { amountPaise: number; version: number; idempotencyKey: string },
  ) {
    this.assertConsole(device);
    await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_SPLIT_PAYMENT",
      ),
    );
    return this.orders.recordQrPartialCash(device, id, input);
  }
}
