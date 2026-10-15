-- Repair an absent page entry even when an older optional-feature migration ran
-- before QR_ADVANCED was present. Preserve existing activation/rollout decisions.
INSERT INTO "FeatureCategory" ("id","code","name","description","sortOrder","updatedAt")
VALUES (md5('qr_advanced_category')::uuid::text,'QR_ADVANCED','QR Advanced Features',
 'Optional QR capabilities using the shared licensing architecture',60,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Feature" ("id","code","name","description","categoryId","legacyEntitlementKey","dependsOnFeatureIds","updatedAt")
SELECT md5('QR_RESTAURANT_PAGE')::uuid::text,'QR_RESTAURANT_PAGE','Restaurant landing page & page builder',
 'Published restaurant website, mobile designs, branch contacts and live preview',c.id,'qrRestaurantPage',
 COALESCE((SELECT ARRAY[f.id] FROM "Feature" f WHERE f."appCode"='QR_ORDERING' LIMIT 1),ARRAY[]::TEXT[]),CURRENT_TIMESTAMP
FROM "FeatureCategory" c WHERE c.code='QR_ADVANCED'
ON CONFLICT ("code") DO UPDATE SET "legacyEntitlementKey"=EXCLUDED."legacyEntitlementKey";
