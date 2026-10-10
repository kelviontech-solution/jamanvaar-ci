import { randomUUID } from "node:crypto";
import { NotificationGatewayService } from "../src/modules/notifications/notification-gateway.service";
import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  createTestApp,
  createTestPlatformUser,
  platformLogin,
  refundManagerSession,
} from "./helpers";
import { PrismaService } from "../src/prisma/prisma.service";
import { RazorpayGatewayService } from "../src/modules/payments/razorpay-gateway.service";
import { QrRateLimiter } from "../src/modules/qr/qr-rate-limit";
import { QrSettingsService } from "../src/modules/qr/qr-settings.service";
import { JwtService } from "@nestjs/jwt";
import {
  TENANT_JWT_AUDIENCE,
  TENANT_JWT_ISSUER,
} from "../src/modules/tenant-auth/tenant-auth.service";

// Actual auth, entitlements, tenant RLS, transactions, money and HMAC; provider transport only is simulated.
let app: any, prisma: PrismaService, gateway: RazorpayGatewayService;
let restaurantId: string,
  planId: string,
  branch: string,
  branchB: string,
  admin: string,
  adminB: string,
  qr: string,
  qrB: string,
  platform: string;
const stamp = Date.now(),
  email = `qr-operations-${stamp}@test.example.com`,
  secret = "isolated-qr-operations-secret";
const http = () => request(app.getHttpServer());
const auth = (method: "get" | "post" | "put", url: string, token = admin) =>
  http()[method](url).set("Authorization", `Bearer ${token}`);
const push = (type: string, id: string, payload: any) =>
  auth("post", `/api/v1/entity-sync/${type}`).send({
    events: [
      {
        externalId: id,
        payload: { id, ...payload, updatedAt: new Date().toISOString() },
      },
    ],
  });
const body = (key: string, online = false) => ({
  items: [{ itemId: "meal", quantity: 1, optionIds: [] }],
  paymentMethod: online ? "ONLINE" : "CASH_AT_COUNTER",
  idempotencyKey: key,
});
const place = async (key: string, online = false, token = qr) => {
  const r = await http()
    .post(`/api/v1/public/qr/${token}/orders`)
    .send(body(key, online));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
};
const stored = (id: string) =>
  prisma.runAsPlatform((tx) =>
    tx.syncedOrder.findUniqueOrThrow({ where: { publicOrderId: id } }),
  );
const pay = async (id: string) => {
  const o = await stored(id);
  return prisma.runAsTenant(restaurantId, (tx) =>
    tx.paymentTransaction.findFirstOrThrow({
      where: { order: { externalOrderId: o.externalOrderId } },
    }),
  );
};
const rules = (changes: any) =>
  auth("put", "/api/v1/restaurant/qr/settings").send({ rules: changes });
const action = async (
  id: string,
  type: string,
  token = admin,
  reason?: string,
) => {
  const o = await stored(id);
  return auth(
    "post",
    `/api/v1/restaurant/qr/orders/${o.externalOrderId}/action`,
    token,
  ).send({
    action: type,
    version: o.syncVersion,
    ...(reason ? { reason } : {}),
  });
};
const verify = (
  id: string,
  paymentId: string,
  orderId: string,
  signature?: string,
) =>
  http()
    .post(`/api/v1/public/qr/orders/${id}/verify-payment`)
    .send({
      paymentId,
      signature:
        signature ??
        createHmac("sha256", secret)
          .update(`${orderId}|${paymentId}`)
          .digest("hex"),
    });

beforeAll(async () => {
  Object.assign(process.env, {
    QR_PAYMENT_CHECKOUT_MODE: "STANDARD",
    RAZORPAY_KEY_ID: "rzp_test_isolated",
    RAZORPAY_KEY_SECRET: secret,
    RAZORPAY_WEBHOOK_SECRET: secret,
    QR_ORDER_BASE_URL: "http://localhost:5290",
  });
  app = await createTestApp();
  prisma = app.get(PrismaService);
  gateway = app.get(RazorpayGatewayService);
  vi.spyOn(gateway, "createCheckoutOrder").mockImplementation(async (i) => ({
    id: `order_${i.reference.replace(/[^a-z0-9]/gi, "")}`,
    receipt: i.reference,
    amount: i.amount,
    currency: i.currency,
  }));
  vi.spyOn(gateway, "fetchCheckoutPayments").mockResolvedValue([]);
  vi.spyOn(gateway, "createPaymentLink").mockRejectedValue(
    Error("Hosted transport must not be used"),
  );
  app.get(QrRateLimiter).configure({
    ipRequestsPerMinute: 100000,
    ipFailedLookupsPerMinute: 100000,
    tokenRequestsPerMinute: 100000,
    tokenOrdersPerMinute: 100000,
    sessionOrdersPerMinute: 100000,
    orderStatusPerMinute: 100000,
  });
  await createTestPlatformUser(prisma, {
    email,
    password: "correct-horse-battery-staple",
  });
  platform = (await platformLogin(app, email, "correct-horse-battery-staple"))
    .body.accessToken;
  const plan = await auth("post", "/api/v1/plans", platform).send({
    tier: "QR",
    name: `TEST QR operations ${stamp}`,
    priceMonthly: 10000,
    maxBranches: 3,
    maxDevices: 10,
    maxUsers: 10,
    entitlements: { restaurantAdmin: true, qrTableOrdering: true },
  });
  expect(plan.status, JSON.stringify(plan.body)).toBe(201);
  planId = plan.body.id;
  restaurantId = (
    await auth("post", "/api/v1/restaurants", platform).send({
      name: `TEST QR operations ${stamp}`,
      ownerName: "Owner",
      ownerEmail: email,
      ownerPassword: "Owner-test-password-123!",
    })
  ).body.restaurant.id;
  const sub = await auth("post", "/api/v1/subscriptions", platform).send({
    restaurantId,
    planId,
    applications: ["POS_ADMIN", "QR_ORDERING"],
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  expect(sub.status, JSON.stringify(sub.body)).toBe(201);
  branch = await prisma.runAsTenant(
    restaurantId,
    async (tx) =>
      (await tx.branch.findFirstOrThrow({ where: { restaurantId } })).id,
  );
  branchB = (
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.branch.create({
        data: { restaurantId, name: "Second branch", code: "SECOND" },
      }),
    )
  ).id;
  for (const b of [branch, branchB]) {
    const k = await auth("post", "/api/v1/activation-keys", platform).send({
      restaurantId,
      branchId: b,
      allowedDeviceType: "POS_ADMIN",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const r = await http()
      .post("/api/v1/activation/redeem")
      .send({ code: k.body.code, deviceType: "POS_ADMIN" });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    if (b === branch) admin = r.body.deviceToken;
    else adminB = r.body.deviceToken;
  }
  await push("MENU_CATEGORY", "main", { name: "Meals", isActive: true });
  await push("MENU_ITEM", "meal", {
    name: "Gujarati Thali",
    categoryId: "main",
    price: 250,
    isAvailable: true,
    modifierGroupIds: [],
  });
  await push("DINING_TABLE", "table-a", {
    tableNumber: "TN1",
    capacity: 4,
    isActive: true,
    branchId: branch,
  });
  await auth("post", "/api/v1/entity-sync/DINING_TABLE", adminB).send({
    events: [
      {
        externalId: "table-b",
        payload: {
          id: "table-b",
          tableNumber: "TN2",
          capacity: 4,
          isActive: true,
          branchId: branchB,
          updatedAt: new Date().toISOString(),
        },
      },
    ],
  });
  expect((await auth("post", "/api/v1/menu/publish").send({})).status).toBe(
    201,
  );
  for (const [b, table, tok] of [
    [branch, "table-a", admin],
    [branchB, "table-b", adminB],
  ]) {
    const r = await auth(
      "post",
      `/api/v1/restaurant/qr/tables/${table}/generate`,
      tok,
    ).send({ branchId: b });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    if (b === branch) qr = r.body.url.split("/q/")[1];
    else qrB = r.body.url.split("/q/")[1];
  }
  await prisma.runAsTenant(restaurantId, (tx) =>
    tx.restaurantPaymentConnection.create({
      data: { restaurantId, status: "ACTIVE" },
    }),
  );
}, 120000);
afterAll(async () => {
  vi.restoreAllMocks();
  if (restaurantId)
    await prisma.runAsPlatform((tx) =>
      tx.restaurant.deleteMany({ where: { id: restaurantId } }),
    );
  if (planId)
    await prisma.runAsPlatform((tx) =>
      tx.plan.deleteMany({ where: { id: planId } }),
    );
  await prisma.platformUser.deleteMany({ where: { email } });
  await app?.close();
  for (const k of [
    "QR_PAYMENT_CHECKOUT_MODE",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ])
    delete process.env[k];
});

const ops = "/api/v1/restaurant/qr/operations";
const enable = () =>
  prisma.runAsTenant(restaurantId, (tx) =>
    tx.applicationEntitlement.updateMany({
      where: { restaurantId, appCode: "QR_ORDERING" },
      data: {
        config: {
          qrServiceRequests: true,
          qrScheduledPickup: true,
          qrMenuAnalytics: true,
          qrBranding: true,
        },
      },
    }),
  );
const config = async (changes: any) => {
  const r = await auth("get", ops);
  return auth("put", ops).send({ version: r.body.version, changes });
};
const session = async () =>
  (await http().post("/api/v1/public/qr/session")).body.session;
const guestRequest = (
  token: string,
  s: string,
  key: string,
  type = "WATER",
  note = "",
) =>
  http()
    .post(`/api/v1/public/qr/${token}/operations/requests`)
    .set("X-QR-Session", s)
    .send({ typeId: type, idempotencyKey: key, note });

it("keeps optional operations off and health available on a base QR plan", async () => {
  expect(
    (await http().get(`/api/v1/public/qr/${qr}/operations`)).body,
  ).toMatchObject({ serviceEnabled: false, pickupEnabled: false });
  expect((await config({ serviceEnabled: true })).status).toBe(403);
  expect((await auth("get", ops + "/analytics")).status).toBe(403);
  const health = await auth("get", ops + "/health");
  expect(health.status, JSON.stringify(health.body)).toBe(200);
  expect(health.body.checks.find((c: any) => c.id === "menu").ready).toBe(true);
});
it("deduplicates simultaneous table requests and isolates sessions and branches", async () => {
  await enable();
  expect(
    (await config({ serviceEnabled: true, serviceCooldownSeconds: 15 })).status,
  ).toBe(200);
  const s = await session(),
    other = await session();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => guestRequest(qr, s, "request-water")),
  );
  expect(responses.every((r) => r.status === 201)).toBe(true);
  expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
  expect((await guestRequest(qr, other, "other-browser")).status).toBe(409);
  expect(
    (
      await http()
        .get(`/api/v1/public/qr/${qr}/operations/requests`)
        .set("X-QR-Session", other)
    ).body,
  ).toEqual([]);
  expect((await auth("get", ops + "/requests", adminB)).body.requests).toEqual(
    [],
  );
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${qr}/operations/requests`)
        .send({ typeId: "WATER", idempotencyKey: "unsigned-browser" })
    ).status,
  ).toBe(403);
  const r = responses[0].body;
  expect(
    (
      await auth("post", ops + `/requests/${r.id}/action`, adminB).send({
        status: "COMPLETED",
        version: r.version,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await auth("post", ops + `/requests/${r.id}/action`).send({
        status: "ACKNOWLEDGED",
        version: r.version,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await auth("post", ops + `/requests/${r.id}/action`).send({
        status: "COMPLETED",
        version: r.version,
      })
    ).status,
  ).toBe(409);
  const current = (await auth("get", ops + "/requests")).body.requests[0];
  expect(current.history).toHaveLength(1);
  expect(
    (
      await auth("post", ops + `/requests/${r.id}/action`).send({
        status: "COMPLETED",
        version: current.version,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http()
        .get(`/api/v1/public/qr/${qr}/operations/requests`)
        .set("X-QR-Session", s)
    ).body[0].status,
  ).toBe("COMPLETED");
});
it("rejects stale configuration, malformed closures and terminal request mutation", async () => {
  const prior = (await auth("get", ops)).body;
  expect((await config({ closedDates: ["2026-02-31"] })).status).toBe(400);
  expect((await config({ overdueMinutes: 2 })).status).toBe(200);
  expect(
    (
      await auth("put", ops).send({
        version: prior.version,
        changes: { overdueMinutes: 3 },
      })
    ).status,
  ).toBe(409);
  const r = (await auth("get", ops + "/requests")).body.requests[0];
  expect(
    (
      await auth("post", ops + `/requests/${r.id}/action`).send({
        status: "IN_PROGRESS",
        version: r.version,
      })
    ).status,
  ).toBe(409);
});
let menuToken: string, pickupAt: string, pickupOrder: any;
it('keeps an older unresolved request visible after more than 200 newer history entries',async()=>{
  const now=new Date(),older=new Date(now.getTime()-15*60000),id='older-open-'+randomUUID();
  await prisma.runAsTenant(restaurantId,tx=>tx.syncedEntity.createMany({data:[{externalId:id,createdAt:older,payload:{branchId:branch,tableId:'table-a',tableNumber:'TN1',typeId:'WATER',label:'Water',status:'OPEN',createdAt:older.toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString(),history:[]}},...Array.from({length:201},(_,n)=>({externalId:'history-'+randomUUID(),createdAt:now,payload:{branchId:branch,tableId:'table-a',tableNumber:'TN1',typeId:'WATER',label:'Water',status:'COMPLETED',createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString(),history:[]}}))].map(r=>({...r,restaurantId,entityType:'QR_SERVICE_REQUEST'}))}));
  expect((await auth('get',ops+'/requests')).body.requests.some((r:any)=>r.id===id&&r.status==='OPEN')).toBe(true);
  expect((await auth('get',ops+'/requests',adminB)).body.requests).toEqual([]);
});
it("serializes the final scheduled pickup slot and preserves metadata in the canonical order", async () => {
  await auth("put", "/api/v1/restaurant/qr/settings").send({
    menuOnlyEnabled: true,
  });
  const code = await auth("post", "/api/v1/restaurant/qr/menu-codes").send({
    branchId: branch,
    label: "Takeaway",
  });
  expect(code.status, JSON.stringify(code.body)).toBe(201);
  menuToken = code.body.url.split("/q/")[1];
  expect(
    (
      await config({
        pickupEnabled: true,
        leadMinutes: 5,
        cutoffMinutes: 5,
        slotCapacity: 1,
        pickupHours: Array.from({ length: 7 }, (_, day) => ({
          day,
          open: "00:00",
          close: "00:00",
        })),
      })
    ).status,
  ).toBe(200);
  const slots = await http().get(
    `/api/v1/public/qr/${menuToken}/operations/slots`,
  );
  expect(slots.status, JSON.stringify(slots.body)).toBe(200);
  pickupAt = slots.body.slots[0].at;
  const responses = await Promise.all(
    ["pickup-race-a", "pickup-race-b"].map((idempotencyKey) =>
      http()
        .post(`/api/v1/public/qr/${menuToken}/orders`)
        .send({ ...body(idempotencyKey), orderType: "TAKEAWAY", pickupAt }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  pickupOrder = responses.find((r) => r.status === 201)!.body;
  expect(pickupOrder.pickupAt).toBe(pickupAt);
  const canonical = await stored(pickupOrder.publicOrderId);
  expect((canonical.meta as any).pickupAt).toBe(pickupAt);
  expect(
    (
      await http().get(`/api/v1/public/qr/${menuToken}/operations/slots`)
    ).body.slots.some((s: any) => s.at === pickupAt),
  ).toBe(false);
  const second = new Date(Date.parse(pickupAt) + 1000).toISOString();
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${menuToken}/orders`)
        .send({
          ...body("second-bypass"),
          orderType: "TAKEAWAY",
          pickupAt: second,
        })
    ).status,
  ).toBe(409);
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${qr}/orders`)
        .send({ ...body("table-future"), pickupAt })
    ).status,
  ).toBe(409);
});
it("releases a cancelled slot, refuses ASAP when disabled, and applies closure dates", async () => {
  expect(
    (
      await action(
        pickupOrder.publicOrderId,
        "CANCELLED",
        admin,
        "Customer cancelled pickup",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await http().get(`/api/v1/public/qr/${menuToken}/operations/slots`)
    ).body.slots.some((s: any) => s.at === pickupAt),
  ).toBe(true);
  await config({ asapEnabled: false });
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${menuToken}/orders`)
        .send({ ...body("disabled-asap"), orderType: "TAKEAWAY" })
    ).status,
  ).toBe(400);
  const restaurant = await prisma.runAsTenant(restaurantId, (tx) =>
    tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
  );
  const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: restaurant.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(pickupAt)),
    p = (k: string) => parts.find((p) => p.type === k)!.value;
  await config({ closedDates: [`${p("year")}-${p("month")}-${p("day")}`] });
  expect(
    (
      await http().get(`/api/v1/public/qr/${menuToken}/operations/slots`)
    ).body.slots.some((s: any) => s.at === pickupAt),
  ).toBe(false);
});
it("holds capacity during an unresolved online attempt and refuses unsafe cancellation", async () => {
  await config({ closedDates: [], slotCapacity: 1 });
  const available = await http().get(
    `/api/v1/public/qr/${menuToken}/operations/slots`,
  );
  const at = available.body.slots[0].at;
  const pending = await http()
    .post(`/api/v1/public/qr/${menuToken}/orders`)
    .send({
      ...body("pickup-online-hold", true),
      orderType: "TAKEAWAY",
      pickupAt: at,
    });
  expect(pending.status, JSON.stringify(pending.body)).toBe(201);
  expect((await stored(pending.body.publicOrderId)).status).toBe("DRAFT");
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${menuToken}/orders`)
        .send({
          ...body("pickup-while-pending"),
          orderType: "TAKEAWAY",
          pickupAt: at,
        })
    ).status,
  ).toBe(409);
  expect(
    (
      await action(
        pending.body.publicOrderId,
        "CANCELLED",
        admin,
        "Abandoned pickup checkout",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await http().get(`/api/v1/public/qr/${menuToken}/operations/slots`)
    ).body.slots.some((s: any) => s.at === at),
  ).toBe(false);
});
it("uses the configured branch timezone for pickup slots and stored confirmation", async () => {
  const prior = await prisma.runAsTenant(restaurantId, (tx) =>
    tx.branch.findUniqueOrThrow({ where: { id: branch } }),
  );
  try {
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.branch.update({
        where: { id: branch },
        data: { timezone: "America/New_York" },
      }),
    );
    const slots = await http().get(
      `/api/v1/public/qr/${menuToken}/operations/slots`,
    );
    expect(slots.body.timezone).toBe("America/New_York");
    const placed = await http()
      .post(`/api/v1/public/qr/${menuToken}/orders`)
      .send({
        ...body("branch-clock-pickup"),
        orderType: "TAKEAWAY",
        pickupAt: slots.body.slots[0].at,
      });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body.pickupTimezone).toBe("America/New_York");
    expect((await stored(placed.body.publicOrderId)).meta).toMatchObject({
      pickupTimezone: "America/New_York",
    });
  } finally {
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.branch.update({
        where: { id: branch },
        data: { timezone: prior.timezone },
      }),
    );
  }
});
it("deduplicates observed item events, provides reporting without fabricated profit and enforces branch scope", async () => {
  const s = await session();
  for (let i = 0; i < 3; i++)
    expect(
      (
        await http()
          .post(`/api/v1/public/qr/${qr}/events`)
          .set("X-QR-Session", s)
          .send({ type: "QR_ITEM_VIEWED", itemId: "meal" })
      ).status,
    ).toBe(200);
  expect(
    (
      await http()
        .post(`/api/v1/public/qr/${qr}/events`)
        .set("X-QR-Session", s)
        .send({ type: "QR_ITEM_VIEWED", itemId: "missing" })
    ).status,
  ).toBe(400);
  const report = await auth("get", ops + "/analytics");
  expect(report.status, JSON.stringify(report.body)).toBe(200);
  expect(report.body.items.find((i: any) => i.id === "meal")).toMatchObject({
    views: 1,
    profitPaise: null,
    costPaise: null,
  });
  expect(report.body.costCoverage.available).toBe(0);
  expect((await auth("get", ops + "/analytics", adminB)).body.items).toEqual(
    [],
  );
  expect((await auth("get", ops + "/analytics?from=2026-02-31")).status).toBe(
    400,
  );
});
it("saves safe licensed branding and rejects executable images and unreadable backgrounds", async () => {
  expect(
    (
      await auth("put", "/api/v1/restaurant/qr/branding").send({
        layout: "COMPACT",
        backgroundColor: "#000000",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await auth("put", "/api/v1/restaurant/qr/branding").send({
        cover:
          "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await auth("put", "/api/v1/restaurant/qr/branding").send({
        layout: "COMPACT",
        contactMessage: "Ask our team",
        backgroundColor: "#FFFFFF",
      })
    ).status,
  ).toBe(200);
  expect(
    (await http().get(`/api/v1/public/qr/${qr}`)).body.branding,
  ).toMatchObject({ layout: "COMPACT", contactMessage: "Ask our team" });
  expect(
    (await auth("put", "/api/v1/restaurant/qr/branding").send({ reset: true }))
      .status,
  ).toBe(200);
  expect(
    (await http().get(`/api/v1/public/qr/${qr}`)).body.branding.layout,
  ).toBe("CARDS");
});

it("activates QR-only admin with existing owner credentials, rejects unrelated resources and binds the signed product", async () => {
  await prisma.runAsTenant(restaurantId, (tx) =>
    tx.applicationEntitlement.updateMany({
      where: { restaurantId, appCode: { in: ["POS_ADMIN", "KIOSK_ADMIN"] } },
      data: { enabled: false },
    }),
  );
  await config({ overdueMinutes: 3 });
  const restaurant = await prisma.runAsTenant(restaurantId, (tx) =>
    tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
  );
  const login = await http().post("/api/v1/tenant-auth/login-owner").send({
    restaurantId,
    password: "Owner-test-password-123!",
    deviceType: "POS_ADMIN",
    requestedProduct: "QR_ORDERING",
  });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  expect(login.body.requiresActivation).toBe(true);
  const key = await auth("post", "/api/v1/activation-keys", platform).send({
    restaurantId,
    branchId: branch,
    allowedDeviceType: "POS_ADMIN",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  expect(key.status, JSON.stringify(key.body)).toBe(201);
  await prisma.runAsTenant(restaurantId,tx=>tx.applicationEntitlement.updateMany({where:{restaurantId,appCode:'QR_ORDERING'},data:{enabled:false}}));
  const denied=await http().post('/api/v1/tenant-auth/activate-device').send({activationSessionToken:login.body.activationSessionToken,activationKey:key.body.code,deviceType:'POS_ADMIN'});
  expect(denied.status).toBe(403);
  await prisma.runAsTenant(restaurantId,tx=>tx.applicationEntitlement.updateMany({where:{restaurantId,appCode:'QR_ORDERING'},data:{enabled:true}}));
  const activate = await http()
    .post("/api/v1/tenant-auth/activate-device")
    .send({
      activationSessionToken: login.body.activationSessionToken,
      activationKey: key.body.code,
      deviceType: "POS_ADMIN",
      deviceName: "QR only admin",
    });
  expect(activate.status, JSON.stringify(activate.body)).toBe(200);
  const token = activate.body.deviceToken;
  expect((await auth('get',ops+'/health',token).set('x-admin-branch','all').set('x-owner-authorization',activate.body.accessToken)).status).toBe(200);
  expect((await auth('get',ops+'/health',token).set('x-admin-branch','all')).status).toBe(403);
  const configB=(await auth('get',ops,adminB)).body;
  expect((await auth('put',ops,adminB).send({version:configB.version,changes:{serviceEnabled:true}})).status).toBe(200);
  const requestB=await guestRequest(qrB,await session(),'owner-cross-branch');
  expect(requestB.status).toBe(201);
  expect((await auth('post',ops+`/requests/${requestB.body.id}/action`,token).set('x-admin-branch','all').set('x-owner-authorization',activate.body.accessToken).send({status:'ACKNOWLEDGED',version:requestB.body.version})).status).toBe(200);
  const staffB=(await auth('get',ops+'/requests',adminB)).body.requests.find((r:any)=>r.id===requestB.body.id);
  expect(staffB.assignedDeviceId).toBeUndefined();
  expect(staffB.history[0].actorId).toBe(activate.body.user.id);
  expect((await auth("get", ops + "/health", token)).status).toBe(200);
  expect((await auth("get", "/api/v1/menu/preview", token)).status).toBe(200);
  expect(
    (await auth("post", "/api/v1/menu/publish", token).send({})).status,
  ).toBe(201);
  expect(
    (await auth("get", "/api/v1/entity-sync/INVENTORY_ITEM", token)).status,
  ).toBe(403);
  expect(
    (await auth("get", "/api/v1/entity-sync/CUSTOMER", token)).status,
  ).toBe(403);
  expect(
    (
      await http().post("/api/v1/tenant-auth/activate-device").send({
        activationSessionToken: login.body.activationSessionToken,
        activationKey: key.body.code,
        deviceType: "POS_ADMIN",
      })
    ).status,
  ).toBe(409);
});
