-- What a guest sees at the top of the ordering page and how the restaurant words its buttons: the restaurant's own text,
-- colour and logo. Nothing here is a default supplied by the platform; a restaurant that sets nothing gets a plain page.
CREATE TABLE "QrBranding" (
    "restaurantId" TEXT NOT NULL,
    "welcomeTitle" TEXT,
    "welcomeMessage" TEXT,
    "footerMessage" TEXT,
    "orderButtonLabel" TEXT,
    "accentColor" TEXT,
    "logoRef" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QrBranding_pkey" PRIMARY KEY ("restaurantId")
);
ALTER TABLE "QrBranding" ADD CONSTRAINT "QrBranding_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrBranding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QrBranding"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
