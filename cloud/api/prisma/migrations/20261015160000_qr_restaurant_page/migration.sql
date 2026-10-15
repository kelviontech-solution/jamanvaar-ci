-- Optional; existing restaurants remain in direct-menu mode until explicitly licensed and published.
INSERT INTO "Feature" ("id","code","name","description","categoryId","legacyEntitlementKey","dependsOnFeatureIds","updatedAt")
SELECT md5('QR_RESTAURANT_PAGE')::uuid::text,'QR_RESTAURANT_PAGE','Restaurant website & page builder',
 'Published restaurant pages, mobile designs, branch contacts and live preview',c.id,'qrRestaurantPage',
 COALESCE((SELECT ARRAY[f.id] FROM "Feature" f WHERE f."appCode"='QR_ORDERING' LIMIT 1),ARRAY[]::TEXT[]),CURRENT_TIMESTAMP
FROM "FeatureCategory" c WHERE c.code='QR_ADVANCED'
ON CONFLICT ("code") DO NOTHING;
