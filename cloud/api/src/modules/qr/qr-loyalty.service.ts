import { normalizeIndianPhone } from "../../common/validation/phone";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { ApplicationEntitlementsService } from "../application-entitlements/application-entitlements.service";
import { NotificationGatewayService } from "../notifications/notification-gateway.service";
import { QrAdvancedService } from "./qr-advanced.service";
import {
  CustomerAccount,
  refreshLoyaltyBalance,
} from "../entity-sync/customer-loyalty-merge";
type Tx = Prisma.TransactionClient;
export class QrLoyaltyIdentityUnavailable extends ServiceUnavailableException {
  constructor() {
    super(
      "Phone verification is not configured. You can continue as a guest; ask the restaurant about loyalty.",
    );
  }
}
@Injectable()
export class QrLoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly notifications: NotificationGatewayService,
    private readonly advanced: QrAdvancedService,
    private readonly config: ConfigService,
  ) {}
  private assertSession(session?: string): string {
    if (!session)
      throw new ForbiddenException("A signed browser session is required");
    return session;
  }
  private where(restaurantId: string, type: string, id: string) {
    return {
      restaurantId_entityType_externalId: {
        restaurantId,
        entityType: type,
        externalId: id,
      },
    };
  }
  private hash(value: string) {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    )
      .update("qr-loyalty:" + value)
      .digest("hex");
  }
  async identityIn(tx: Tx, restaurantId: string, sessionId?: string) {
    if (!sessionId) return undefined;
    const identity = await tx.syncedEntity.findUnique({
      where: this.where(restaurantId, "QR_CUSTOMER_IDENTITY", sessionId),
    });
    const payload = identity?.payload as any;
    if (!payload || Date.parse(payload.expiresAt) <= Date.now())
      return undefined;
    return String(payload.phone);
  }
  private async enabledIn(tx: Tx, restaurantId: string, branchId: string) {
    await this.entitlements.assertQrCapability(tx, restaurantId, "QR_LOYALTY");
    if (
      !(await this.advanced.effectiveIn(tx, restaurantId, branchId))
        .loyaltyEnabled
    )
      throw new ForbiddenException("QR loyalty is disabled");
  }
  async account(restaurantId: string, branchId: string, rawSession?: string) {
    const session = this.assertSession(rawSession);
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.enabledIn(tx, restaurantId, branchId);
      const phone = await this.identityIn(tx, restaurantId, session);
      const program = (
        await tx.syncedEntity.findUnique({
          where: this.where(
            restaurantId,
            "LOYALTY_PROGRAM_SETTINGS",
            "default",
          ),
        })
      )?.payload as any;
      const customer = phone
        ? ((
            await tx.syncedEntity.findUnique({
              where: this.where(restaurantId, "CUSTOMER", phone),
            })
          )?.payload as any)
        : undefined;
      const rewards = await tx.syncedEntity.findMany({
        where: { restaurantId, entityType: "LOYALTY_REWARD" },
      });
      const active = rewards
        .map((r) => ({ id: r.externalId, ...(r.payload as any) }))
        .filter((r) => r.isActive && !r.deleted && r.discountAmount > 0);
      return {
        verified: !!phone,
        verificationAvailable: this.notifications.isQrLoyaltyOtpConfigured(),
        phoneMasked: phone ? "******" + phone.slice(-4) : undefined,
        points: customer?.loyaltyPoints ?? 0,
        program: {
          enabled: program?.enabled === true,
          earnPoints: program?.earnPoints ?? 0,
          perRupeesSpent: program?.perRupeesSpent ?? 10,
        },
        rewards: active.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          pointsCost: r.pointsCost,
          discountAmount: r.discountAmount,
          eligible: !!phone && (customer?.loyaltyPoints ?? 0) >= r.pointsCost,
        })),
        message: this.notifications.isQrLoyaltyOtpConfigured()
          ? "Verify your phone to access your points. Rewards cannot be combined with coupons."
          : "Phone verification is not configured. Continue as a guest or ask a member of staff.",
      };
    });
  }
  async sendOtp(
    restaurantId: string,
    branchId: string,
    rawPhone: string,
    rawSession?: string,
  ) {
    const session = this.assertSession(rawSession);
    if (!this.notifications.isQrLoyaltyOtpConfigured())
      throw new QrLoyaltyIdentityUnavailable();
    const phone = normalizeIndianPhone(rawPhone);
    if (!/^[6-9]\d{9}$/.test(phone))
      throw new BadRequestException("Enter a valid Indian mobile number");
    const code = String(randomInt(0, 1000000)).padStart(6, "0"),
      nonce = randomUUID();
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
      await this.enabledIn(tx, restaurantId, branchId);
      const old = await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "QR_CUSTOMER_OTP", session),
      });
      const p = old?.payload as any;
      if (p && Date.now() - Date.parse(p.sentAt) < 60000)
        throw new ConflictException(
          "Wait one minute before requesting another code",
        );
      const counterKey = this.hash(restaurantId + ":" + phone),
        bucket = BigInt(Math.floor(Date.now() / 3600000));
      const rows = await tx.$queryRaw<
        Array<{ count: number }>
      >`INSERT INTO "RateCounter" ("key","windowStart","count") VALUES (${counterKey},${bucket},1) ON CONFLICT ("key","windowStart") DO UPDATE SET "count"="RateCounter"."count"+1 RETURNING "count"`;
      if (rows[0].count > 5)
        throw new ConflictException(
          "Verification limit reached. Please try again later",
        );
      const payload = {
        phone,
        hash: this.hash(session + ":" + phone + ":" + code),
        nonce,
        attempts: 0,
        status: "SENDING",
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      await tx.syncedEntity.upsert({
        where: this.where(restaurantId, "QR_CUSTOMER_OTP", session),
        create: {
          restaurantId,
          entityType: "QR_CUSTOMER_OTP",
          externalId: session,
          payload,
        },
        update: { payload, syncVersion: { increment: 1 } },
      });
    });
    let sent = false;
    try {
      sent = (await this.notifications.sendQrLoyaltyOtp("91" + phone, code))
        .success;
    } catch {
      sent = false;
    }
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
      const row = await tx.syncedEntity.findUniqueOrThrow({
        where: this.where(restaurantId, "QR_CUSTOMER_OTP", session),
      });
      const p = row.payload as any;
      if (p.nonce === nonce)
        await tx.syncedEntity.update({
          where: { id: row.id },
          data: {
            payload: {
              ...p,
              status: sent ? "SENT" : "FAILED",
              ...(sent ? {} : { hash: null }),
            },
            syncVersion: { increment: 1 },
          },
        });
    });
    if (!sent)
      throw new ServiceUnavailableException(
        "Verification message could not be sent. Continue as a guest and try again later.",
      );
    return { sent: true, expiresInSeconds: 600 };
  }
  async verify(
    restaurantId: string,
    branchId: string,
    code: string,
    rawSession?: string,
  ) {
    const session = this.assertSession(rawSession);
    const verified = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
      await this.enabledIn(tx, restaurantId, branchId);
      const row = await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "QR_CUSTOMER_OTP", session),
      });
      const p = row?.payload as any;
      if (
        !p ||
        p.status !== "SENT" ||
        Date.parse(p.expiresAt) <= Date.now() ||
        p.attempts >= 5
      )
        return false;
      const actual = Buffer.from(
          this.hash(session + ":" + p.phone + ":" + code),
        ),
        expected = Buffer.from(p.hash ?? "");
      const ok =
        actual.length === expected.length && timingSafeEqual(actual, expected);
      await tx.syncedEntity.update({
        where: { id: row!.id },
        data: {
          payload: {
            ...p,
            attempts: p.attempts + 1,
            status: ok ? "VERIFIED" : "SENT",
            ...(ok ? { hash: null } : {}),
          },
          syncVersion: { increment: 1 },
        },
      });
      if (!ok) return false;
      const identity = {
        phone: p.phone,
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
        method: "SMS_OTP",
      };
      await tx.syncedEntity.upsert({
        where: this.where(restaurantId, "QR_CUSTOMER_IDENTITY", session),
        create: {
          restaurantId,
          entityType: "QR_CUSTOMER_IDENTITY",
          externalId: session,
          payload: identity,
        },
        update: { payload: identity, syncVersion: { increment: 1 } },
      });
      const existing = await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "CUSTOMER", p.phone),
      });
      if (!existing)
        await tx.syncedEntity.create({
          data: {
            restaurantId,
            entityType: "CUSTOMER",
            externalId: p.phone,
            payload: {
              phone: p.phone,
              loyaltyPoints: 0,
              loyaltyBaseline: { points: 0, spend: 0, visits: 0 },
              loyaltyLedger: {},
              favoriteItemIds: [],
              recentOrderIds: [],
              totalVisits: 0,
              totalSpend: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        });
      return true;
    });
    if (!verified)
      throw new BadRequestException(
        "The verification code is invalid or expired",
      );
    return this.account(restaurantId, branchId, session);
  }

  async earnRateIn(
    tx: Tx,
    restaurantId: string,
    branchId: string,
    customerId: string | undefined,
    totalPaise: number,
  ) {
    if (
      !customerId ||
      !(await this.advanced.effectiveIn(tx, restaurantId, branchId))
        .loyaltyEnabled ||
      !(
        await this.entitlements.resolveQrCapability(
          tx,
          restaurantId,
          "QR_LOYALTY",
        )
      ).enabled
    )
      return undefined;
    const program = (
      await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "LOYALTY_PROGRAM_SETTINGS", "default"),
      })
    )?.payload as any;
    if (
      !program?.enabled ||
      !Number.isSafeInteger(program.earnPoints) ||
      program.earnPoints < 0 ||
      program.earnPoints > 10000 ||
      !Number.isFinite(program.perRupeesSpent) ||
      program.perRupeesSpent <= 0
    )
      return undefined;
    const customer = (
      await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "CUSTOMER", customerId),
      })
    )?.payload as any;
    const tiers = await tx.syncedEntity.findMany({
      where: { restaurantId, entityType: "LOYALTY_TIER" },
    });
    const tier = tiers
      .map((t) => t.payload as any)
      .filter(
        (t) =>
          !t.deleted &&
          t.minLifetimeSpend <= (customer?.totalSpend ?? 0) + totalPaise / 100,
      )
      .sort((a, b) => a.minLifetimeSpend - b.minLifetimeSpend)
      .pop();
    return {
      enabled: true,
      earnPoints: program.earnPoints,
      perRupeesSpent: program.perRupeesSpent,
      multiplier: tier?.pointsMultiplier ?? 1,
    };
  }
  async rewardIn(
    tx: Tx,
    restaurantId: string,
    branchId: string,
    sessionId: string | undefined,
    rewardId: string | undefined,
    cart: {
      totalAmount: number;
      lines: Array<{
        externalItemId: string;
        unitPrice: number;
        quantity: number;
      }>;
    },
    categories: Map<string, string>,
    reserve?: string,
  ) {
    const customerId = await this.identityIn(tx, restaurantId, sessionId);
    if (!rewardId) return { customerId, discountPaise: 0, pointsCost: 0 };
    await this.enabledIn(tx, restaurantId, branchId);
    if (!customerId)
      throw new ForbiddenException("Verify your phone before redeeming points");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
    const customerRow = await tx.syncedEntity.findUniqueOrThrow({
        where: this.where(restaurantId, "CUSTOMER", customerId),
      }),
      customer = customerRow.payload as unknown as CustomerAccount;
    refreshLoyaltyBalance(customer);
    const rewardRow = await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "LOYALTY_REWARD", rewardId),
      }),
      reward = rewardRow?.payload as any;
    const program = (
      await tx.syncedEntity.findUnique({
        where: this.where(restaurantId, "LOYALTY_PROGRAM_SETTINGS", "default"),
      })
    )?.payload as any;
    if (
      !program?.enabled ||
      !reward?.isActive ||
      reward.deleted ||
      !(reward.discountAmount > 0) ||
      !Number.isSafeInteger(reward.pointsCost) ||
      reward.pointsCost <= 0
    )
      throw new BadRequestException("This reward is unavailable");
    if (customer.loyaltyPoints < reward.pointsCost)
      throw new ConflictException("Not enough points for this reward");
    let discountPaise = Math.min(
      cart.totalAmount,
      Math.round(reward.discountAmount * 100),
    );
    if (reward.discountKind === "ITEM") {
      const items = cart.lines.filter(
        (l) =>
          !reward.categoryId ||
          categories.get(l.externalItemId) === reward.categoryId,
      );
      if (!items.length)
        throw new BadRequestException(
          "Add an eligible item to redeem this reward",
        );
      discountPaise = Math.min(discountPaise, ...items.map((l) => l.unitPrice));
    }
    if (reserve) {
      const at = new Date().toISOString();
      customer.loyaltyLedger!["redeem:" + reserve] = {
        points: -reward.pointsCost,
        spend: 0,
        visits: 0,
        at,
      };
      refreshLoyaltyBalance(customer);
      customer.updatedAt = at;
      await tx.syncedEntity.update({
        where: { id: customerRow.id },
        data: {
          payload: customer as unknown as Prisma.InputJsonValue,
          syncVersion: { increment: 1 },
        },
      });
    }
    return {
      customerId,
      discountPaise,
      pointsCost: reward.pointsCost,
      rewardId,
    };
  }
}
