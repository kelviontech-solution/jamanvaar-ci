-- Same tenant_isolation pattern as 20260909210000_payments_foundation:
-- FORCE is required because the app's DB role owns this table and Postgres
-- exempts owners from RLS by default.

ALTER TABLE "SyncedOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncedOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncedOrder"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
