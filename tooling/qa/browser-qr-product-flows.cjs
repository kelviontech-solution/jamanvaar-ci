const { expect: baseExpect } = require("playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
module.exports = async ({
  q,
  base,
  browser,
  admin,
  guest,
  prisma,
  rid,
  branchId,
  qr,
  ad,
  rest,
  platform,
  check,
  errors,
}) => {
  const api = (method, path, body) =>
      q.mustApi(method, path, body, ad.deviceToken),
    ops = "/api/v1/restaurant/qr/operations";
  await api('PUT','/api/v1/restaurant/qr/settings',{allowCash:true});
  await prisma.runAsTenant(rid, (tx) =>
    tx.applicationEntitlement.updateMany({
      where: { restaurantId: rid, appCode: "QR_ORDERING" },
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
  let c = await api("GET", ops);
  await api("PUT", ops, {
    version: c.version,
    changes: {
      serviceEnabled: true,
      pickupEnabled: true,
      leadMinutes: 5,
      cutoffMinutes: 5,
      pickupHours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "00:00",
        close: "00:00",
      })),
    },
  });
  const product = await admin.context().newPage();
  const navigate = async name => {
    const button = product.getByRole('button', {name, exact:true});
    if (!(await button.isVisible())) await product.getByRole('button', {name:'Browse workspace',exact:true}).click();
    await button.click();
  };
  await guest.setViewportSize({width:390,height:844});
  product.on("pageerror", (e) => errors.push(e.message));
  const originalCheck = check;
  check = (name, run) =>
    originalCheck(name, async () => {
      try {
        return await run();
      } catch (e) {
        console.error('Overflow diagnostics: '+JSON.stringify(await product.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('*')].map(el=>({tag:el.tagName,class:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(r=>r.right>innerWidth+1||r.left < -1).slice(0,20)}))));
        console.error(
          "QR product: " +
            (await product.locator("body").innerText()).slice(-2200),
        );
        throw e;
      }
    });
  await check(
    "Public QR website and local demo work without credentials or order/payment traffic",
    async () => {
      const requests = [];
      product.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/"))
          requests.push(r.url());
      });
      await product.setViewportSize({ width: 1440, height: 960 });
      await product.goto(base + "/qr/");
      await expect(
        product.getByRole("heading", { name: /Every table/ }),
      ).toBeVisible();
      await product.mouse.wheel(0, 500);
      await expect.poll(()=>product.evaluate(()=>scrollY>0)).toBe(true);
      await product
        .getByRole("button", { name: "Customise dish", exact: true })
        .click();
      await product.getByLabel("Extra rotli").check();
      await product
        .getByRole("button", { name: "Add to demo cart", exact: true })
        .click();
      await product
        .getByRole("button", { name: "Customise dish", exact: true })
        .click();
      await product.getByLabel("Extra rotli").uncheck();
      await product
        .getByRole("button", { name: "Add to demo cart", exact: true })
        .click();
      await product
        .getByRole("button", { name: "Preview checkout", exact: true })
        .click();
      await expect(product.getByRole("status")).toContainText("618");
      expect(requests).toEqual([]);
      await product.screenshot({
        path: q.path.join(q.reportDir, "evidence/qr-product-desktop.png"),
        fullPage: true,
      });
      await product.setViewportSize({ width: 390, height: 844 });
      expect(
        await product.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      for (const width of [320, 768, 1920]) {
        await product.setViewportSize({ width, height: 960 });
        expect(
          await product.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
      await product.setViewportSize({ width: 1440, height: 960 });
      await product.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        scrollTo({ top: 0, behavior: "instant" });
      });
      await product.waitForFunction(() => scrollY === 0);
      await expect(product.getByRole('heading',{name:/Every table/})).toBeInViewport();
      await product.screenshot({
        path: q.path.join(q.reportDir, "evidence/qr-product-hero.png"),
      });
      await product.setViewportSize({ width: 390, height: 844 });
      await product.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(product.locator("#qr-site-nav")).toBeVisible();
      await product.screenshot({
        path: q.path.join(q.reportDir, "evidence/qr-product-mobile.png"),
        fullPage: true,
      });
      return { demoTotal: 618, productionRequests: 0, mobileFits: true };
    },
  );
  await check(
    "Dedicated QR login uses current owner credentials and keeps a safe destination",
    async () => {
      await product.goto(base + "/qr/login/?next=https://example.invalid/");
      await product
        .getByLabel("Restaurant ID or manager email")
        .fill(rest.restaurant.restaurantCode);
      await product
        .getByLabel("Password", { exact: true })
        .fill(q.state.ownerPassword);
      await product
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(product.getByTestId("qr-console")).toBeVisible({
        timeout: 60000,
      });
      expect(new URL(product.url()).pathname).toBe("/qr/admin/");
      await expect(
        product.getByRole("heading", {
          name: "Before your first guest",
          exact: true,
        }),
      ).toBeVisible();
      await product.screenshot({
        path: q.path.join(q.reportDir, "evidence/qr-product-setup-mobile.png"),
        fullPage: true,
      });
      return { safeRedirect: true, currentSession: true };
    },
  );
  await check(
    "Customer requests appear in QR Admin and durable completion returns to the customer",
    async () => {
      await guest.goto(base + "/q/" + qr);
      await guest
        .getByRole("button", {
          name: "Need something at your table?",
          exact: true,
        })
        .click();
      await guest.getByRole("button", { name: "Water", exact: true }).click();
      await expect(guest.locator(".service-panel")).toContainText(
        "Water · open",
      );
      await navigate('Service Requests');
      const inbox = product
        .locator("section")
        .filter({
          has: product.getByRole("heading", {
            name: "QR table service requests",
            exact: true,
          }),
        })
        .first();
      await expect(
        inbox.getByText("Table TN1 · Water", { exact: true }),
      ).toBeVisible();
      await inbox
        .getByRole("button", { name: "Acknowledge", exact: true })
        .click();
      await expect(guest.locator(".service-panel")).toContainText(
        "acknowledged",
      );
      await inbox
        .getByRole("button", { name: "Complete", exact: true })
        .click();
      await expect(guest.locator(".service-panel")).toContainText("completed");
      await guest.reload();
      await guest
        .getByRole("button", {
          name: "Need something at your table?",
          exact: true,
        })
        .click();
      await expect(guest.locator(".service-panel")).toContainText("completed");
      return { durable: true, status: "COMPLETED" };
    },
  );
  await check(
    "Brand preview saves safe settings to the real customer page and analytics exports CSV",
    async () => {
      await product.setViewportSize({ width: 1440, height: 960 });
      await navigate('Customer Branding');
      await product
        .getByLabel("Welcome heading", { exact: true })
        .fill("A warm welcome");
      await product
        .getByLabel("Contact / assistance message", { exact: true })
        .fill("Our team is here to help");
      await product
        .getByLabel("Menu presentation", { exact: true })
        .selectOption("COMPACT");
      await expect(
        product.getByText("A warm welcome", { exact: true }),
      ).toBeVisible();
      const saved = product.waitForResponse(
        (r) => r.url().endsWith("/branding") && r.request().method() === "PUT",
      );
      await product
        .getByRole("button", { name: "Save branding", exact: true })
        .click();
      const response = await saved;
      expect(response.status(), JSON.stringify(await response.json())).toBe(
        200,
      );
      await expect(
        product.getByTestId("qr-console").getByRole("status"),
      ).toContainText("Branding saved");
      await guest.reload();
      await expect(guest.locator(".name")).toContainText("A warm welcome");
      await expect(guest.locator(".app")).toHaveClass(/brand-COMPACT/);
      await guest.screenshot({
        path: q.path.join(q.reportDir, "evidence/qr-branded-guest.png"),
        fullPage: true,
      });
      await navigate('Menu Performance');
      await expect(
        product.getByText(
          "Historical ingredient costs are not stored on these orders.",
          { exact: false },
        ),
      ).toBeVisible();
      const download = product.waitForEvent("download");
      await product
        .getByRole("button", { name: "Export CSV", exact: true })
        .click();
      expect((await download).suggestedFilename()).toMatch(/\.csv$/);
      return { savedBranding: true, costsUnavailable: true, csv: true };
    },
  );
  await check(
    "QR-only console edits the shared catalog and publishes a new dish",
    async () => {
      await prisma.runAsTenant(rid, (tx) =>
        tx.applicationEntitlement.updateMany({
          where: { restaurantId: rid, appCode: "POS_ADMIN" },
          data: { enabled: false },
        }),
      );
      c = await api("GET", ops);
      await api("PUT", ops, {
        version: c.version,
        changes: { overdueMinutes: 3 },
      });
      await navigate('Menu & Availability');
      const csv =
        "sku,name,category,price,food_type,variant_name,variant_price,addon_name,addon_price\nCSV1,QA CSV Meal,Our meals,80,VEG,Regular,80,Extra rotli,20\nCSV1,QA CSV Meal,Our meals,80,VEG,Large,100,,\n";
      await product
        .locator("input[type=file][accept*=csv]")
        .setInputFiles({
          name: "qa-menu.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        });
      await product
        .getByRole("button", { name: "Import validated rows", exact: true })
        .click();
      await expect(
        product.getByTestId("qr-console").getByRole("status"),
      ).toContainText("1 dishes imported");
      await product
        .getByRole("button", { name: "Add dish", exact: true })
        .click();
      await product
        .getByLabel("Dish name", { exact: true })
        .fill("QA fresh meal");
      await product
        .getByLabel("Category", { exact: true })
        .selectOption("mains");
      await product.getByLabel("Price", { exact: true }).fill("120");
      await product
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(
        product.getByText("QA fresh meal", { exact: true }),
      ).toBeVisible();
      await product
        .getByRole("button", { name: "Publish shared menu", exact: true })
        .click();
      await expect(
        product.getByTestId("qr-console").getByRole("status"),
      ).toContainText("Menu published");
      await guest.reload();
      await expect(
        guest.getByText("QA fresh meal", { exact: true }),
      ).toBeVisible();
      const published = await q.mustApi(
        "GET",
        `/api/v1/public/qr/${qr}/menu`,
        undefined,
        "",
      );
      const imported = published.items.find((i) => i.name === "QA CSV Meal");
      expect(imported.modifierGroupIds).toHaveLength(2);
      expect(
        published.modifierGroups
          .flatMap((g) => g.options)
          .some((o) => o.name === "Large" && o.priceDelta === 20),
      ).toBe(true);
      return { posAdminLicenseRequired: false, sharedMenu: true };
    },
  );
  await check(
    "Scheduled takeaway pickup is selectable at customer checkout and appears in staff orders",
    async () => {
      await api("PUT", "/api/v1/restaurant/qr/settings", {
        menuOnlyEnabled: true,
      });
      const code = await api("POST", "/api/v1/restaurant/qr/menu-codes", {
          branchId,
          label: "QA pickup",
        }),
        token = code.url.split("/q/")[1];
      await guest.goto(base + "/q/" + token);
      await guest
        .getByRole("button", { name: "Add QA fresh meal", exact: true })
        .click();
      await guest.getByRole("button", { name: /View Cart/ }).click();
      await guest
        .getByRole("button", { name: "Checkout", exact: true })
        .click();
      await guest.getByText("Takeaway", { exact: true }).click();
      const slots = await q.mustApi(
        "GET",
        `/api/v1/public/qr/${token}/operations/slots`,
        undefined,
        "",
      );
      const at = slots.slots[0].at;
      await guest.getByLabel("Pickup time", { exact: true }).selectOption(at);
      await guest.getByRole("button", { name: /^Place order/ }).click();
      await expect(
        guest.getByRole("heading", { name: "Order confirmed", exact: true }),
      ).toBeVisible();
      await expect(guest.locator(".pickup-confirmation")).toBeVisible();
      const orders = await api("GET", "/api/v1/restaurant/qr/orders");
      expect(orders.some((o) => o.pickupAt === at)).toBe(true);
      await guest.screenshot({
        path: q.path.join(
          q.reportDir,
          "evidence/qr-scheduled-pickup-mobile.png",
        ),
        fullPage: true,
      });
      return { canonicalPickup: true, visibleOnCustomer: true };
    },
  );
  await check(
    "A fresh QR-only console activates securely and signs out without exposing its activation key",
    async () => {
      const key = await q.mustApi(
        "POST",
        "/api/v1/activation-keys",
        {
          restaurantId: rid,
          branchId,
          allowedDeviceType: "POS_ADMIN",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        platform,
      );
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith("/api/v1/"))
          return route.continue({ url: base + u.pathname + u.search });
        if (!["localhost", "127.0.0.1"].includes(u.hostname))
          return route.abort();
        return route.continue();
      });
      const fresh = await context.newPage();
      fresh.on("pageerror", (e) => errors.push(e.message));
      await fresh.goto(base + "/qr/activate/");
      await fresh
        .getByLabel("Restaurant ID or manager email")
        .fill(rest.restaurant.restaurantCode);
      await fresh
        .getByLabel("Password", { exact: true })
        .fill(q.state.ownerPassword);
      await fresh
        .getByLabel("Management activation key", { exact: true })
        .fill(key.code);
      await fresh
        .getByRole("button", { name: "Sign in & activate", exact: true })
        .click();
      await expect(fresh.getByTestId("qr-console")).toBeVisible({
        timeout: 60000,
      });
      expect(await fresh.locator("body").innerText()).not.toContain(key.code);
      expect(
        await fresh.evaluate(() =>
          Object.values(localStorage).some((v) => v.includes("JMV-")),
        ),
      ).toBe(false);
      await fresh
        .getByRole("button", { name: "Sign out", exact: true })
        .click();
      await expect(
        fresh.getByRole("heading", { name: "Welcome to QR Admin" }),
      ).toBeVisible();
      await context.close();
      return { qrOnlyActivation: true, keyHidden: true, signedOut: true };
    },
  );
  if(process.env.JAMANVAAR_QA_QR_UI==='1') await require('./browser-qr-ui-flows.cjs')({q,base,product,guest,check,api});
  await product.close();
};
