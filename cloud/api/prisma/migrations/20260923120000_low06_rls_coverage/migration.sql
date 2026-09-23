-- security-audit LOW-06: 6 tenant-linked tables (each with a required,
-- non-nullable restaurantId, same shape as every table already covered) had
-- no RLS at all — a defense-in-depth gap, not a live exploit (every current
-- read/write of these tables already runs inside runAsTenant/runAsPlatform,
-- so nothing changes for existing code; this is a second layer against a
-- *future* missed application-level filter). Same tenant_isolation pattern
-- used by every other table since the init migration.

ALTER TABLE "DeviceCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeviceCommand"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "RestaurantMenuSyndication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantMenuSyndication" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantMenuSyndication"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "SyncEventLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncEventLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncEventLog"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "SyncConflict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncConflict" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncConflict"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "OfflineExtension" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfflineExtension" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OfflineExtension"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "BackupRestoreJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackupRestoreJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BackupRestoreJob"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

-- SupportTicket.restaurantId is nullable (a platform-wide ticket not tied to
-- one restaurant) — a null restaurantId is visible under platform context
-- (matches existing application behaviour: tenant-support-tickets.service.ts
-- filters its own reads by restaurantId, so a null-restaurantId ticket was
-- never tenant-visible anyway) but not under a tenant context, since a null
-- can never equal a specific restaurant id.
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupportTicket"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

-- The three ticket child tables have no restaurantId column of their own —
-- they inherit their tenant boundary from the parent SupportTicket via
-- ticketId, so their policy checks the same thing through an EXISTS join.
ALTER TABLE "TicketComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketComment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TicketComment"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "SupportTicket" t
      WHERE t.id = "TicketComment"."ticketId"
        AND t."restaurantId" = current_setting('app.current_restaurant_id', true)
    )
  );

ALTER TABLE "TicketEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TicketEvent"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "SupportTicket" t
      WHERE t.id = "TicketEvent"."ticketId"
        AND t."restaurantId" = current_setting('app.current_restaurant_id', true)
    )
  );

ALTER TABLE "TicketAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketAttachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TicketAttachment"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "SupportTicket" t
      WHERE t.id = "TicketAttachment"."ticketId"
        AND t."restaurantId" = current_setting('app.current_restaurant_id', true)
    )
  );
