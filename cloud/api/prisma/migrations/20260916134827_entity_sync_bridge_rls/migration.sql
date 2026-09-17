ALTER TABLE "SyncedEntity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncedEntity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncedEntity"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
