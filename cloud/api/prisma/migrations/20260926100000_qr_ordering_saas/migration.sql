-- QR ordering as a SaaS capability.
--  1. QrTableLink becomes QrCode: server-minted token, status, version, mode, revocation, one active code per table.
--  2. QrSettings (per restaurant, optionally per branch) and QrEvent (facts for analytics).
--  3. SyncedOrder gets a first-class source, a public reference and the code it came from.
--  4. Existing QR orders without a sync sequence are sequenced, so cursor-reading devices receive them.
--  5. Per-restaurant QR overrides move from PlatformSetting into the subscription's ApplicationEntitlement row
--     (one override mechanism, not two), and restaurants that had QR through the old PRO-tier fallback keep it.

-- 1. QrCode -----------------------------------------------------------------
ALTER TABLE "QrTableLink" RENAME TO "QrCode";
ALTER TABLE "QrCode" RENAME CONSTRAINT "QrTableLink_pkey" TO "QrCode_pkey";
ALTER TABLE "QrCode" RENAME CONSTRAINT "QrTableLink_restaurantId_fkey" TO "QrCode_restaurantId_fkey";
ALTER INDEX "QrTableLink_qrToken_key" RENAME TO "QrCode_publicToken_key";
ALTER INDEX "QrTableLink_restaurantId_idx" RENAME TO "QrCode_restaurantId_idx";
ALTER TABLE "QrCode" RENAME COLUMN "qrToken" TO "publicToken";

ALTER TABLE "QrCode"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'TABLE_ORDER',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "lastScannedAt" TIMESTAMP(3),
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "QrCode" ALTER COLUMN "tableId" DROP NOT NULL;
ALTER TABLE "QrCode" ALTER COLUMN "tableNumber" DROP NOT NULL;

UPDATE "QrCode" SET "status" = CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'DISABLED' END,
                    "metadata" = '{"legacy": true}'::jsonb;

-- An earlier code for a table that has a newer code was superseded, not merely switched off.
UPDATE "QrCode" c SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP
WHERE c."status" = 'DISABLED'
  AND EXISTS (SELECT 1 FROM "QrCode" d WHERE d."restaurantId" = c."restaurantId" AND d."tableId" = c."tableId" AND d."id" <> c."id" AND d."createdAt" > c."createdAt");

-- Exactly one active code per table: keep the newest, revoke any older duplicates.
UPDATE "QrCode" c SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP
WHERE c."status" = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM "QrCode" d WHERE d."restaurantId" = c."restaurantId" AND d."tableId" = c."tableId" AND d."status" = 'ACTIVE'
              AND (d."createdAt" > c."createdAt" OR (d."createdAt" = c."createdAt" AND d."id" > c."id")));

-- A code that never had a branch belongs to the restaurant's only branch, if it has exactly one.
-- With several branches the choice cannot be guessed: the code stays without a branch and is refused for
-- ordering until an administrator assigns one.
UPDATE "QrCode" c SET "branchId" = (SELECT b."id" FROM "Branch" b WHERE b."restaurantId" = c."restaurantId" LIMIT 1)
WHERE c."branchId" IS NULL AND (SELECT count(*) FROM "Branch" b WHERE b."restaurantId" = c."restaurantId") = 1;

ALTER TABLE "QrCode" DROP COLUMN "isActive";

CREATE UNIQUE INDEX "QrCode_one_active_per_table" ON "QrCode" ("restaurantId", "tableId") WHERE "status" = 'ACTIVE' AND "mode" = 'TABLE_ORDER' AND "tableId" IS NOT NULL;
CREATE INDEX "QrCode_restaurantId_branchId_idx" ON "QrCode" ("restaurantId", "branchId");
CREATE INDEX "QrCode_restaurantId_tableId_idx" ON "QrCode" ("restaurantId", "tableId");

-- 2. QrSettings, QrEvent ------------------------------------------------------
CREATE TABLE "QrSettings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "orderingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tableOrderingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "menuOnlyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowCustomerNotes" BOOLEAN NOT NULL DEFAULT true,
    "allowModifiers" BOOLEAN NOT NULL DEFAULT true,
    "allowCash" BOOLEAN NOT NULL DEFAULT true,
    "allowOnlinePayment" BOOLEAN NOT NULL DEFAULT false,
    "showOrderStatus" BOOLEAN NOT NULL DEFAULT true,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "requireCustomerName" BOOLEAN NOT NULL DEFAULT false,
    "requireCustomerPhone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QrSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QrSettings_restaurant_branch_key" ON "QrSettings" ("restaurantId", COALESCE("branchId", ''));
ALTER TABLE "QrSettings" ADD CONSTRAINT "QrSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QrEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "qrCodeId" TEXT,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QrEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QrEvent_restaurantId_type_createdAt_idx" ON "QrEvent" ("restaurantId", "type", "createdAt");
CREATE INDEX "QrEvent_restaurantId_branchId_createdAt_idx" ON "QrEvent" ("restaurantId", "branchId", "createdAt");
ALTER TABLE "QrEvent" ADD CONSTRAINT "QrEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QrSettings"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
ALTER TABLE "QrEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QrEvent"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));

-- 3. SyncedOrder: source, public reference, originating code -------------------
ALTER TABLE "SyncedOrder"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'POS',
  ADD COLUMN "publicOrderId" TEXT,
  ADD COLUMN "qrCodeId" TEXT;

UPDATE "SyncedOrder" o SET "source" = CASE
  WHEN o."meta"->>'sourceType' = 'QR_TABLE' THEN 'QR'
  WHEN o."meta"->>'sourceType' IN ('KIOSK', 'CAPTAIN', 'POS', 'ONLINE') THEN o."meta"->>'sourceType'
  WHEN (SELECT d."type"::text FROM "Device" d WHERE d."id" = o."deviceId") IN ('KIOSK', 'CAPTAIN') THEN (SELECT d."type"::text FROM "Device" d WHERE d."id" = o."deviceId")
  ELSE 'POS' END;

CREATE UNIQUE INDEX "SyncedOrder_publicOrderId_key" ON "SyncedOrder" ("publicOrderId");
CREATE INDEX "SyncedOrder_restaurantId_branchId_source_createdAt_idx" ON "SyncedOrder" ("restaurantId", "branchId", "source", "createdAt");

-- 4. QR orders written before this migration had no sequence number, so devices reading by cursor never saw them.
DO $$
DECLARE r RECORD; v INTEGER;
BEGIN
  FOR r IN SELECT "id", "restaurantId" FROM "SyncedOrder" WHERE "seq" IS NULL AND "source" = 'QR' ORDER BY "createdAt", "id" LOOP
    INSERT INTO "SyncSequence" ("restaurantId", "scope", "value") VALUES (r."restaurantId", '_', 1)
    ON CONFLICT ("restaurantId", "scope") DO UPDATE SET "value" = "SyncSequence"."value" + 1
    RETURNING "value" INTO v;
    UPDATE "SyncedOrder" SET "seq" = v, "syncVersion" = "syncVersion" + 1 WHERE "id" = r."id";
  END LOOP;
END $$;

-- 5. One override mechanism ---------------------------------------------------
-- Restaurants that reached QR through the old "PRO tier" fallback (no explicit plan flag) keep it.
UPDATE "ApplicationEntitlement" ae SET "enabled" = true
FROM "Subscription" s JOIN "Plan" p ON p."id" = s."planId"
WHERE ae."subscriptionId" = s."id" AND ae."appCode" = 'QR_ORDERING' AND ae."enabled" = false
  AND s."status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE') AND p."tier" = 'PRO'
  AND NOT (COALESCE(p."entitlements", '{}'::jsonb) ? 'qrTableOrdering');

-- Per-restaurant Super Admin overrides stored as PlatformSetting rows move onto the subscription's row.
UPDATE "ApplicationEntitlement" ae SET
  "enabled" = COALESCE((ps."value"->>'qrEntitled')::boolean, ae."enabled"),
  "config" = COALESCE(ae."config", '{}'::jsonb) || (ps."value" - 'qrEntitled')
FROM "PlatformSetting" ps
WHERE ps."key" = 'qr_ordering.entitlement.' || ae."restaurantId"
  AND ae."appCode" = 'QR_ORDERING'
  AND ae."subscriptionId" = (SELECT s."id" FROM "Subscription" s WHERE s."restaurantId" = ae."restaurantId" AND s."status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE') ORDER BY s."createdAt" DESC LIMIT 1);

-- 6. Guessable legacy tokens ---------------------------------------------------
-- The old Restaurant Admin derived a token from the table number and id for any table that had none
-- ("jv_qr_tbl_<n>_<id>"): predictable, so anyone could open another restaurant's table. Only the randomly generated
-- form (144 bits of hex) stays valid; those codes are revoked and the restaurant generates real ones.
UPDATE "QrCode" SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP
WHERE "status" <> 'REVOKED' AND "publicToken" LIKE 'jv\_qr\_tbl\_%'
  AND "publicToken" !~ '^jv_qr_tbl_[A-Za-z0-9]{1,10}_[a-f0-9]{32,64}$';
