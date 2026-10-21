-- Register Reservations for upgrades that apply migrations without running the demo/catalog seed.
-- Preserve existing platform activation, rollout and plan/subscription access decisions.
INSERT INTO "FeatureCategory" ("id","code","name","description","sortOrder","updatedAt")
VALUES (md5('qr_advanced_category')::uuid::text,'QR_ADVANCED','QR Advanced Features',
 'Optional QR capabilities using the shared licensing architecture',60,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Feature" ("id","code","name","description","categoryId","legacyEntitlementKey","dependsOnFeatureIds","updatedAt")
SELECT md5('QR_RESERVATIONS')::uuid::text,'QR_RESERVATIONS','QR Table Reservations',
 'Guest table booking requests from the restaurant website, with a staff inbox to confirm, decline or seat.',
 c.id,'qrReservations',
 COALESCE((SELECT ARRAY[f.id] FROM "Feature" f WHERE f."appCode"='QR_ORDERING' LIMIT 1),ARRAY[]::TEXT[]),CURRENT_TIMESTAMP
FROM "FeatureCategory" c WHERE c.code='QR_ADVANCED'
ON CONFLICT ("code") DO UPDATE SET "legacyEntitlementKey"=EXCLUDED."legacyEntitlementKey";
