-- Additive canonical allocation ledger. Existing gateway attempts and operational orders remain authoritative.
CREATE UNIQUE INDEX "SyncedOrder_restaurantId_id_key" ON "SyncedOrder" ("restaurantId", "id");
CREATE TABLE "OrderPaymentEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE,
  "orderId" TEXT NOT NULL,
  "branchId" TEXT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('COLLECTION', 'REFUND')),
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "method" TEXT NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "actorId" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPaymentEntry_tenant_order_fkey" FOREIGN KEY ("restaurantId", "orderId") REFERENCES "SyncedOrder"("restaurantId", "id") ON DELETE CASCADE
);
CREATE INDEX "OrderPaymentEntry_restaurantId_branchId_createdAt_idx" ON "OrderPaymentEntry" ("restaurantId", "branchId", "createdAt");
CREATE INDEX "OrderPaymentEntry_restaurantId_orderId_idx" ON "OrderPaymentEntry" ("restaurantId", "orderId");
ALTER TABLE "OrderPaymentEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderPaymentEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderPaymentEntry" USING (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
);
CREATE FUNCTION prevent_order_payment_entry_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Confirmed payment allocations are immutable; record a refund instead'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_payment_entry_immutable BEFORE UPDATE ON "OrderPaymentEntry" FOR EACH ROW EXECUTE FUNCTION prevent_order_payment_entry_update();

-- Optional features join the existing catalog and plan editor. No current plan is automatically upgraded.
INSERT INTO "FeatureCategory" ("id","code","name","description","sortOrder","updatedAt")
VALUES (md5('qr_advanced_category')::uuid::text,'QR_ADVANCED','QR Advanced Features','Optional QR capabilities using the shared licensing architecture',60,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Feature" ("id","code","name","description","categoryId","legacyEntitlementKey","dependsOnFeatureIds","updatedAt")
SELECT md5(v.code)::uuid::text, v.code, v.name, v.description, c.id, v.key,
  COALESCE((SELECT ARRAY[f.id] FROM "Feature" f WHERE f."appCode"='QR_ORDERING' LIMIT 1), ARRAY[]::TEXT[]), CURRENT_TIMESTAMP
FROM (VALUES
 ('QR_GROUP_ORDERING','Shared table ordering','Invite-only collaborative table sessions','qrGroupOrdering'),
 ('QR_KITCHEN_CAPACITY','Kitchen workload','Advanced shared kitchen load controls','qrKitchenCapacity'),
 ('QR_LOYALTY','QR loyalty','Verified customer loyalty and repeat ordering','qrLoyalty'),
 ('QR_MULTILINGUAL','Multilingual menus','Canonical menu text translations','qrMultilingual'),
 ('QR_PROMOTIONS','QR promotions','Coupons and configured recommendations','qrPromotions'),
 ('QR_MULTI_BRANCH','Advanced branch administration','Controlled central defaults and branch propagation','qrMultiBranch'),
 ('QR_FEEDBACK','Verified feedback','Private completed-order feedback','qrFeedback'),
 ('QR_SPLIT_PAYMENT','Split collections','Canonical partial payment allocations','qrSplitPayment'),
 ('QR_NOTIFICATIONS','Operational notifications','Recoverable branch-scoped order alerts','qrNotifications'),
 ('QR_ORDER_HISTORY','Guest order history','Secure browser-scoped order recovery','qrOrderHistory'),
 ('QR_USAGE_LIMITS','Advanced usage controls','Configured optional usage quotas','qrUsageLimits'),
 ('QR_INVENTORY_SYNC','Advanced inventory controls','Extended canonical inventory integration','qrInventorySync'),
 ('QR_ACCESSIBILITY','Low-bandwidth preferences','Additional customer presentation preferences','qrAccessibility')
) AS v(code,name,description,key)
JOIN "FeatureCategory" c ON c.code='QR_ADVANCED'
ON CONFLICT ("code") DO NOTHING;
