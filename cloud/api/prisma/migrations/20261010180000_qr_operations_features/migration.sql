-- Extend the existing licensing catalog. Optional operations stay off until licensed and enabled.
INSERT INTO "Feature" ("id","code","name","description","categoryId","legacyEntitlementKey","dependsOnFeatureIds","updatedAt")
SELECT md5(v.code)::uuid::text,v.code,v.name,v.description,c.id,v.key,
 COALESCE((SELECT ARRAY[f.id] FROM "Feature" f WHERE f."appCode"='QR_ORDERING' LIMIT 1),ARRAY[]::TEXT[]),CURRENT_TIMESTAMP
FROM (VALUES
 ('QR_SERVICE_REQUESTS','QR service requests','Table requests managed by service staff','qrServiceRequests'),
 ('QR_SCHEDULED_PICKUP','Scheduled QR pickup','Capacity-safe future takeaway slots','qrScheduledPickup'),
 ('QR_MENU_ANALYTICS','QR menu performance','Canonical menu sales and observable funnel analytics','qrMenuAnalytics'),
 ('QR_BRANDING','Advanced QR branding','Reviewed restaurant presentation and cover imagery','qrBranding')
) AS v(code,name,description,key)
JOIN "FeatureCategory" c ON c.code='QR_ADVANCED'
ON CONFLICT ("code") DO NOTHING;

-- Server-owned QR operations reuse tenant RLS stores; index their scoped retrieval paths.
CREATE INDEX IF NOT EXISTS "SyncedEntity_qr_request_branch_time_idx"
 ON "SyncedEntity" ("restaurantId", ("payload" #> '{branchId}'), "createdAt" DESC)
 WHERE "entityType" = 'QR_SERVICE_REQUEST';
CREATE INDEX IF NOT EXISTS "SyncedEntity_qr_request_session_time_idx"
 ON "SyncedEntity" ("restaurantId", ("payload" #> '{browserSession}'), "createdAt" DESC)
 WHERE "entityType" = 'QR_SERVICE_REQUEST';
CREATE INDEX IF NOT EXISTS "SyncedOrder_qr_pickup_capacity_idx"
 ON "SyncedOrder" ("restaurantId", "branchId", ("meta" #> '{pickupAt}'))
 WHERE "source" = 'QR';
