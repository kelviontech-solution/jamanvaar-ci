import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Device, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { ApplicationEntitlementsService } from "../application-entitlements/application-entitlements.service";
import { QrAdvancedService } from "./qr-advanced.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeBus } from "../../common/realtime/realtime-bus";
import { BuiltQrMenu } from "./qr-menu.service";
import { discountPricedCart, PricedCart } from "../payments/pricing.util";
export const promotionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/),
    description: z.string().max(300),
    discountType: z.enum(["PERCENTAGE", "FLAT"]),
    discountValue: z.number().positive().max(100000),
    minOrderValue: z.number().min(0).max(1000000),
    maxDiscountAmount: z.number().positive().optional(),
    usageLimit: z.number().int().positive().optional(),
    perCustomerLimit: z.number().int().positive().optional(),
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime(),
    isActive: z.boolean(),
    branchIds: z.array(z.string().uuid()).max(200).default([]),
    itemIds: z.array(z.string().min(1).max(128)).max(500).default([]),
    categoryIds: z.array(z.string().min(1).max(128)).max(200).default([]),
    firstOrderOnly: z.boolean().default(false),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.discountType === "PERCENTAGE" && p.discountValue > 100)
      ctx.addIssue({
        code: "custom",
        message: "Percentage must not exceed 100",
        path: ["discountValue"],
      });
    if (Date.parse(p.validUntil) <= Date.parse(p.validFrom))
      ctx.addIssue({
        code: "custom",
        message: "End must be after start",
        path: ["validUntil"],
      });
  });
type Tx = Prisma.TransactionClient;
@Injectable()
export class QrPromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly advanced: QrAdvancedService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus,
  ) {}
  async list(device: Device) {
    if (device.type !== "POS_ADMIN")
      throw new ForbiddenException("Restaurant Admin is required");
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        device.restaurantId,
        "QR_PROMOTIONS",
      );
      const rows = await tx.syncedEntity.findMany({
        where: { restaurantId: device.restaurantId, entityType: "COUPON" },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const orders = await tx.syncedOrder.findMany({
        where: {
          restaurantId: device.restaurantId,
          source: "QR",
          ...(device.branchId ? { branchId: device.branchId } : {}),
          status: { notIn: ["DRAFT", "CANCELLED", "VOID", "VOIDED"] },
        },
        select: {
          meta: true,
          discountAmount: true,
          totalAmount: true,
          paymentStatus: true,
        },
      });
      return rows
        .filter((r) => {
          const p = r.payload as any;
          return (
            !p.deleted &&
            (!device.branchId ||
              !p.branchIds?.length ||
              p.branchIds.includes(device.branchId))
          );
        })
        .map((r) => {
          const own = orders.filter(
            (o) => (o.meta as any)?.promotion?.couponId === r.externalId,
          );
          return {
            id: r.externalId,
            version: r.syncVersion,
            ...(r.payload as object),
            report: {
              acceptedOrders: own.length,
              discountValue:
                own.reduce((n, o) => n + o.discountAmount, 0) / 100,
              orderValue: own.reduce((n, o) => n + o.totalAmount, 0) / 100,
              settledSales:
                own
                  .filter((o) => o.paymentStatus === "SUCCESS")
                  .reduce((n, o) => n + o.totalAmount, 0) / 100,
            },
          };
        });
    });
  }
  async save(
    device: Device,
    input: z.infer<typeof promotionSchema>,
    id?: string,
    version?: number,
  ) {
    if (device.type !== "POS_ADMIN")
      throw new ForbiddenException("Restaurant Admin is required");
    const result = await this.prisma.runAsTenant(
      device.restaurantId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + device.restaurantId}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-promotions:" + device.restaurantId}))`;
        await this.entitlements.assertQrCapability(
          tx,
          device.restaurantId,
          "QR_PROMOTIONS",
        );
        const ids = input.branchIds.length
          ? input.branchIds
          : device.branchId
            ? [device.branchId]
            : [];
        if (device.branchId && ids.some((b) => b !== device.branchId))
          throw new ForbiddenException("Promotion belongs to another branch");
        if (
          ids.length &&
          (await tx.branch.count({
            where: { restaurantId: device.restaurantId, id: { in: ids } },
          })) !== ids.length
        )
          throw new BadRequestException("Invalid promotion branch");
        const where = {
          restaurantId_entityType_externalId: {
            restaurantId: device.restaurantId,
            entityType: "COUPON",
            externalId: id ?? randomUUID(),
          },
        };
        const old = id ? await tx.syncedEntity.findUnique({ where }) : null;
        if (id && !old) throw new NotFoundException("Promotion not found");
        const oldPayload = old?.payload as any;
        if (
          old &&
          device.branchId &&
          (!oldPayload.branchIds?.length ||
            oldPayload.branchIds.some((b: string) => b !== device.branchId))
        )
          throw new ForbiddenException(
            "Restaurant-wide promotions must be edited by the owner",
          );
        if (old && old.syncVersion !== version)
          throw new ConflictException(
            "Promotion changed; refresh before saving",
          );
        const rows = await tx.syncedEntity.findMany({
          where: { restaurantId: device.restaurantId, entityType: "COUPON" },
          select: { externalId: true, payload: true },
        });
        if (
          rows.some(
            (r) =>
              r.externalId !== id &&
              !(r.payload as any).deleted &&
              String((r.payload as any).code).toUpperCase() === input.code,
          )
        )
          throw new ConflictException("This coupon code already exists");
        const cap = (
          await this.entitlements.resolve(
            tx,
            device.restaurantId,
            "QR_ORDERING",
          )
        ).limits.qrMaxPromotions;
        if (
          !old &&
          typeof cap === "number" &&
          rows.filter((r) => !(r.payload as any).deleted).length >= cap
        )
          throw new ConflictException("Configured promotion limit reached");
        const payload = {
          ...input,
          branchIds: ids,
          id: where.restaurantId_entityType_externalId.externalId,
          usageCount: oldPayload?.usageCount ?? 0,
          updatedAt: new Date().toISOString(),
        };
        const saved = await tx.syncedEntity.upsert({
          where,
          create: {
            restaurantId: device.restaurantId,
            entityType: "COUPON",
            externalId: payload.id,
            payload,
          },
          update: { payload, syncVersion: { increment: 1 } },
        });
        await this.audit.log(
          {
            actorType: "TENANT",
            actorId: device.id,
            restaurantId: device.restaurantId,
            action: "QR_PROMOTION_SAVED",
            category: "DISCOUNTS",
            details: { id: payload.id, code: input.code, branchIds: ids },
          },
          tx,
        );
        return { id: payload.id, version: saved.syncVersion };
      },
    );
    this.bus.publish({
      restaurantId: device.restaurantId,
      branchId: null,
      kind: "entity:COUPON",
    });
    return result;
  }
  async priceIn(
    tx: Tx,
    restaurantId: string,
    branchId: string,
    menu: BuiltQrMenu,
    cart: PricedCart,
    code?: string,
    customerId?: string,
    reserve?: string,
  ) {
    if (!code) return { ...cart, discountAmount: 0, promotion: undefined };
    await this.entitlements.assertQrCapability(
      tx,
      restaurantId,
      "QR_PROMOTIONS",
    );
    if (
      !(await this.advanced.effectiveIn(tx, restaurantId, branchId))
        .promotionsEnabled
    )
      throw new ForbiddenException("Promotions are disabled");
    if (reserve)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-promotions:" + restaurantId}))`;
    const coupons = await tx.syncedEntity.findMany({
        where: { restaurantId, entityType: "COUPON" },
      }),
      row = coupons.find(
        (r) =>
          String((r.payload as any).code).toUpperCase() ===
            code.toUpperCase() && !(r.payload as any).deleted,
      );
    if (!row) throw new BadRequestException("Coupon is not valid");
    const p = row.payload as any,
      now = Date.now();
    if (
      !p.isActive ||
      now < Date.parse(p.validFrom) ||
      now > Date.parse(p.validUntil)
    )
      throw new BadRequestException(
        "Coupon is inactive or outside its validity period",
      );
    if (p.branchIds?.length && !p.branchIds.includes(branchId))
      throw new BadRequestException("Coupon is not valid at this branch");
    if (p.usageLimit && p.usageCount >= p.usageLimit)
      throw new ConflictException("Coupon usage limit reached");
    if (cart.subtotal < Math.round(p.minOrderValue * 100))
      throw new BadRequestException("Coupon minimum spend is not reached");
    if (p.firstOrderOnly || p.perCustomerLimit) {
      if (!customerId)
        throw new BadRequestException(
          "Verify your loyalty phone number to use this customer-specific promotion",
        );
      const customerOrders = await tx.syncedOrder.count({
        where: {
          restaurantId,
          source: "QR",
          meta: { path: ["verifiedCustomerId"], equals: customerId },
          status: { notIn: ["CANCELLED", "VOIDED"] },
        },
      });
      if (p.firstOrderOnly && customerOrders > 0)
        throw new BadRequestException(
          "This promotion is for first orders only",
        );
      if (p.perCustomerLimit) {
        const used = await tx.syncedEntity.count({
          where: {
            restaurantId,
            entityType: "QR_PROMOTION_REDEMPTION",
            payload: {
              path: ["customerCoupon"],
              equals: customerId + ":" + row.externalId,
            },
          },
        });
        if (used >= p.perCustomerLimit)
          throw new ConflictException(
            "Your coupon usage limit has been reached",
          );
      }
    }
    const eligible = new Set(
      menu.items
        .filter(
          (i) =>
            (!p.itemIds?.length || p.itemIds.includes(i.id)) &&
            (!p.categoryIds?.length || p.categoryIds.includes(i.categoryId)),
        )
        .map((i) => i.id),
    );
    const eligibleGross = cart.lines
      .filter((l) => eligible.has(l.externalItemId))
      .reduce((n, l) => n + l.unitPrice * l.quantity, 0);
    if (!eligibleGross)
      throw new BadRequestException("No cart items qualify for this promotion");
    const value =
      p.discountType === "PERCENTAGE"
        ? Math.round((eligibleGross * p.discountValue) / 100)
        : Math.round(p.discountValue * 100);
    const amount = Math.min(
      eligibleGross,
      p.maxDiscountAmount
        ? Math.round(p.maxDiscountAmount * 100)
        : eligibleGross,
      value,
    );
    const discounted = discountPricedCart(cart, amount, eligible);
    if (reserve) {
      await tx.syncedEntity.update({
        where: { id: row.id },
        data: {
          payload: {
            ...p,
            usageCount: (p.usageCount ?? 0) + 1,
            updatedAt: new Date().toISOString(),
          },
          syncVersion: { increment: 1 },
        },
      });
      await tx.syncedEntity.create({
        data: {
          restaurantId,
          entityType: "QR_PROMOTION_REDEMPTION",
          externalId: reserve,
          payload: {
            couponId: row.externalId,
            code: p.code,
            branchId,
            externalOrderId: reserve,
            discountPaise: discounted.discountAmount,
            ...(customerId
              ? { customerCoupon: customerId + ":" + row.externalId }
              : {}),
            at: new Date().toISOString(),
          },
        },
      });
    }
    return {
      ...discounted,
      promotion: {
        couponId: row.externalId,
        code: p.code,
        discountPaise: discounted.discountAmount,
      },
    };
  }
}
