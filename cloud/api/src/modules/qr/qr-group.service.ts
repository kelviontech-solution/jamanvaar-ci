import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { QrPublicService, PlaceQrOrder } from "./qr-public.service";
import { QrAdvancedService } from "./qr-advanced.service";
import { ApplicationEntitlementsService } from "../application-entitlements/application-entitlements.service";

type Lines = PlaceQrOrder["items"];
type Group = {
  qrCodeId: string;
  branchId: string;
  owner: string;
  state: "OPEN" | "LOCKED_FOR_CHECKOUT" | "SUBMITTED" | "CLOSED";
  expiresAt: string;
  guests: Record<string, { label: string; lines: Lines; version: number }>;
  checkout?: PlaceQrOrder;
  orderReference?: string;
  jobClaim?: string;
  jobUntil?: string;
};
const pattern = /^qg_[A-Za-z0-9_-]{32}$/;

@Injectable()
export class QrGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrPublicService,
    private readonly advanced: QrAdvancedService,
    private readonly entitlements: ApplicationEntitlementsService,
  ) {}
  private session(sessionId?: string) {
    if (!sessionId)
      throw new ForbiddenException("A signed browser session is required");
    return sessionId;
  }
  private async context(token: string) {
    const ctx = await this.qr.resolve(token);
    if (!ctx.table)
      throw new BadRequestException("Shared ordering requires a table QR");
    const settings = await this.advanced.publicSettings(
      ctx.restaurant.id,
      ctx.branch.id,
    );
    if (!settings.groupEnabled)
      throw new ForbiddenException(
        "Shared ordering is not enabled for this table",
      );
    return { ctx, settings };
  }
  private view(id: string, group: Group, version: number, sessionId: string) {
    const self = group.guests[sessionId];
    return {
      invitation: id,
      state: group.state,
      expiresAt: group.expiresAt,
      version,
      isOwner: group.owner === sessionId,
      myVersion: self.version,
      myItems: self.lines,
      guests: Object.values(group.guests).map((g) => ({
        label: g.label,
        items: g.lines,
      })),
      orderReference: group.orderReference,
      paymentResponsibility:
        "The host pays the entire consolidated order. Partial online payments are not offered.",
    };
  }
  private async load(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    codeId: string,
    id: string,
  ) {
    if (!pattern.test(id))
      throw new NotFoundException("Shared session not found");
    const row = await tx.syncedEntity.findUnique({
      where: {
        restaurantId_entityType_externalId: {
          restaurantId,
          entityType: "QR_SHARED_SESSION",
          externalId: id,
        },
      },
    });
    const group = row?.payload as unknown as Group;
    if (!row || group.qrCodeId !== codeId)
      throw new NotFoundException("Shared session not found");
    if (group.state === "OPEN" && Date.parse(group.expiresAt) <= Date.now())
      throw new GoneException(
        "This shared session has expired. Start a new session or order individually.",
      );
    return { row, group };
  }
  async create(token: string, rawSession?: string) {
    const session = this.session(rawSession),
      { ctx, settings } = await this.context(token),
      id = "qg_" + randomBytes(24).toString("base64url");
    const group: Group = {
      qrCodeId: ctx.code.id,
      branchId: ctx.branch.id,
      owner: session,
      state: "OPEN",
      expiresAt: new Date(
        Date.now() + settings.sessionMinutes * 60000,
      ).toISOString(),
      guests: { [session]: { label: "Guest 1 (host)", lines: [], version: 0 } },
    };
    await this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await this.entitlements.assertQrCapability(
        tx,
        ctx.restaurant.id,
        "QR_GROUP_ORDERING",
      );
      await tx.syncedEntity.create({
        data: {
          restaurantId: ctx.restaurant.id,
          entityType: "QR_SHARED_SESSION",
          externalId: id,
          payload: group as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.view(id, group, 1, session);
  }
  async read(token: string, id: string, rawSession?: string) {
    const session = this.session(rawSession),
      { ctx } = await this.context(token);
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      const { row, group } = await this.load(
        tx,
        ctx.restaurant.id,
        ctx.code.id,
        id,
      );
      if (!group.guests[session])
        throw new ForbiddenException(
          "Join this session explicitly using its invitation",
        );
      return this.view(id, group, row.syncVersion, session);
    });
  }
  async join(token: string, id: string, rawSession?: string) {
    const session = this.session(rawSession),
      { ctx, settings } = await this.context(token);
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-group:" + ctx.restaurant.id + ":" + id}))`;
      const { row, group } = await this.load(
        tx,
        ctx.restaurant.id,
        ctx.code.id,
        id,
      );
      if (group.state !== "OPEN")
        throw new ConflictException(
          "This session is no longer open for joining",
        );
      if (!group.guests[session]) {
        if (Object.keys(group.guests).length >= settings.maxGuests)
          throw new ConflictException(
            "This shared session has reached its guest limit",
          );
        group.guests[session] = {
          label: "Guest " + (Object.keys(group.guests).length + 1),
          lines: [],
          version: 0,
        };
        const saved = await tx.syncedEntity.update({
          where: { id: row.id },
          data: {
            payload: group as unknown as Prisma.InputJsonValue,
            syncVersion: { increment: 1 },
          },
        });
        return this.view(id, group, saved.syncVersion, session);
      }
      return this.view(id, group, row.syncVersion, session);
    });
  }
  async contribution(
    token: string,
    id: string,
    lines: Lines,
    version: number,
    rawSession?: string,
  ) {
    const session = this.session(rawSession),
      { ctx } = await this.context(token);
    if (lines.length) await this.qr.quote(token, { items: lines });
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-group:" + ctx.restaurant.id + ":" + id}))`;
      const { row, group } = await this.load(
          tx,
          ctx.restaurant.id,
          ctx.code.id,
          id,
        ),
        guest = group.guests[session];
      if (!guest)
        throw new ForbiddenException(
          "You are not a member of this shared session",
        );
      if (group.state !== "OPEN")
        throw new ConflictException("Checkout has locked these contributions");
      if (guest.version !== version)
        throw new ConflictException(
          "Your contribution changed. Refresh before saving.",
        );
      guest.lines = lines;
      guest.version++;
      if (
        Object.values(group.guests).reduce((n, g) => n + g.lines.length, 0) > 50
      )
        throw new BadRequestException("Shared orders support up to 50 lines");
      const saved = await tx.syncedEntity.update({
        where: { id: row.id },
        data: {
          payload: group as unknown as Prisma.InputJsonValue,
          syncVersion: { increment: 1 },
        },
      });
      return this.view(id, group, saved.syncVersion, session);
    });
  }
  async leave(token: string, id: string, rawSession?: string) {
    const session = this.session(rawSession),
      { ctx } = await this.context(token);
    return this.prisma.runAsTenant(ctx.restaurant.id, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-group:" + ctx.restaurant.id + ":" + id}))`;
      const { row, group } = await this.load(
        tx,
        ctx.restaurant.id,
        ctx.code.id,
        id,
      );
      if (!group.guests[session]) return { left: true };
      if (group.state !== "OPEN")
        throw new ConflictException(
          "Submitted contributions cannot be removed",
        );
      if (group.owner === session) group.state = "CLOSED";
      else delete group.guests[session];
      await tx.syncedEntity.update({
        where: { id: row.id },
        data: {
          payload: group as unknown as Prisma.InputJsonValue,
          syncVersion: { increment: 1 },
        },
      });
      return { left: true };
    });
  }

  async submit(
    token: string,
    id: string,
    version: number,
    paymentMethod: PlaceQrOrder["paymentMethod"],
    expectedTotalPaise: number,
    rawSession?: string,
  ) {
    const session = this.session(rawSession),
      { ctx } = await this.context(token),
      claim = randomBytes(16).toString("hex");
    const prepared = await this.prisma.runAsTenant(
      ctx.restaurant.id,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-group:" + ctx.restaurant.id + ":" + id}))`;
        const { row, group } = await this.load(
          tx,
          ctx.restaurant.id,
          ctx.code.id,
          id,
        );
        if (group.owner !== session)
          throw new ForbiddenException(
            "Only the host may submit and take responsibility for the consolidated bill",
          );
        if (group.orderReference) return { reference: group.orderReference };
        if (group.state === "CLOSED")
          throw new ConflictException("This shared session is closed");
        if (
          group.state === "LOCKED_FOR_CHECKOUT" &&
          Date.parse(group.jobUntil ?? "") > Date.now()
        )
          throw new ConflictException(
            "Shared checkout is already in progress. Check this session again shortly.",
          );
        if (group.state === "OPEN") {
          if (row.syncVersion !== version)
            throw new ConflictException(
              "Contributions changed. Review the shared bill before submitting.",
            );
          const items = Object.values(group.guests).flatMap((g) => g.lines);
          if (!items.length)
            throw new BadRequestException("Add items before checking out");
          if (
            ctx.settings.requireCustomerName ||
            ctx.settings.requireCustomerPhone
          )
            throw new BadRequestException(
              "This restaurant requires customer details. Please use individual checkout.",
            );
          group.checkout = {
            items,
            paymentMethod,
            expectedTotalPaise,
            idempotencyKey: "group-" + id,
          };
          group.state = "LOCKED_FOR_CHECKOUT";
        }
        group.jobClaim = claim;
        group.jobUntil = new Date(Date.now() + 60000).toISOString();
        await tx.syncedEntity.update({
          where: { id: row.id },
          data: {
            payload: group as unknown as Prisma.InputJsonValue,
            syncVersion: { increment: 1 },
          },
        });
        return { checkout: group.checkout!, sharedGuests: Object.values(group.guests).map(guest => ({ label: guest.label, lines: guest.lines })) };
      },
    );
    if (prepared.reference) return this.qr.orderStatus(prepared.reference);
    try {
      const order = await this.qr.placeOrder(
        token,
        prepared.checkout!,
        session,
        prepared.sharedGuests,
      );
      await this.finish(
        ctx.restaurant.id,
        ctx.code.id,
        id,
        claim,
        order.publicOrderId!,
        true,
      );
      return order;
    } catch (error) {
      const externalOrderId =
        "qr_" +
        createHash("sha256")
          .update(`${ctx.restaurant.id}:${ctx.code.id}:group-${id}`)
          .digest("hex")
          .slice(0, 40);
      const existing = await this.prisma.runAsTenant(ctx.restaurant.id, (tx) =>
        tx.syncedOrder.findUnique({
          where: {
            restaurantId_externalOrderId: {
              restaurantId: ctx.restaurant.id,
              externalOrderId,
            },
          },
        }),
      );
      if (existing?.publicOrderId) {
        await this.finish(
          ctx.restaurant.id,
          ctx.code.id,
          id,
          claim,
          existing.publicOrderId,
          true,
        );
        return this.qr.orderStatus(existing.publicOrderId);
      }
      await this.finish(
        ctx.restaurant.id,
        ctx.code.id,
        id,
        claim,
        undefined,
        false,
      );
      throw error;
    }
  }
  private async finish(
    restaurantId: string,
    codeId: string,
    id: string,
    claim: string,
    reference: string | undefined,
    success: boolean,
  ) {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"qr-group:" + restaurantId + ":" + id}))`;
      const { row, group } = await this.load(tx, restaurantId, codeId, id);
      if (!success && (group.jobClaim !== claim || group.orderReference))
        return;
      group.state = success ? "SUBMITTED" : "OPEN";
      if (reference) group.orderReference = reference;
      else delete group.checkout;
      delete group.jobClaim;
      delete group.jobUntil;
      await tx.syncedEntity.update({
        where: { id: row.id },
        data: {
          payload: group as unknown as Prisma.InputJsonValue,
          syncVersion: { increment: 1 },
        },
      });
    });
  }
}
