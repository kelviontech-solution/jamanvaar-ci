-- QR_SERVICE_REQUESTS and QR_SCHEDULED_PICKUP (cloud/api/src/modules/application-entitlements/qr-capabilities.ts)
-- have been enforced on the backend since they were added, but no Feature row was ever seeded for
-- either code. resolveQrCapability requires a matching, isActive Feature row before it ever checks
-- the plan's limits -- with no row, the capability was unconditionally disabled for every restaurant
-- on every plan, with no Super Admin page able to grant it (Plan editor only renders checkboxes for
-- keys Super Admin's ENTITLEMENT_KEYS list already knows about, which never included these two).
-- Idempotent (ON CONFLICT DO NOTHING on the unique `code`), matching this project's established
-- upsert-by-code seeding pattern (see prisma/seed.ts's seedFeatureCatalog). A no-op, not an error,
-- if the qr_ordering FeatureCategory row itself doesn't exist yet (a from-scratch environment that
-- hasn't run the seed) -- it SELECTs that category's id rather than assuming it.
INSERT INTO "Feature" ("id", "code", "name", "description", "categoryId", "isActive", "dependsOnFeatureIds", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, v.description, fc."id", true, ARRAY[]::text[], now(), now()
FROM (VALUES
  ('QR_SERVICE_REQUESTS', 'QR Service Requests', 'Lets a guest ask their table for water, cutlery, napkins, assistance or the bill directly from the QR menu, routed to the floor team''s live request inbox.'),
  ('QR_SCHEDULED_PICKUP', 'QR Scheduled Pickup', 'Lets a guest schedule a QR order for pickup at a chosen time instead of immediate preparation.')
) AS v(code, name, description)
JOIN "FeatureCategory" fc ON fc."code" = 'qr_ordering'
ON CONFLICT ("code") DO NOTHING;
