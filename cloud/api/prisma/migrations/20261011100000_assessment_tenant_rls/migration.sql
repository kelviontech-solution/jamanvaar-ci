-- Defense in depth: every tenant financial/integration table requires explicit context.
ALTER TABLE "WhatsAppChannelConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppChannelConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppChannelConnection" USING (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
) WITH CHECK (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
);
ALTER TABLE "OutboundWebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundWebhookDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboundWebhookDelivery" USING (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
) WITH CHECK (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
);
ALTER TABLE "RestaurantPayout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantPayout" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantPayout" USING (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
) WITH CHECK (
  current_setting('app.is_platform_context', true) = 'true'
  OR "restaurantId" = current_setting('app.current_restaurant_id', true)
);
