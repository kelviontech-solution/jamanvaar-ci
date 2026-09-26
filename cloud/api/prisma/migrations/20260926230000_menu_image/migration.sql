-- Dish, category and option pictures, stored once per restaurant and addressed by the SHA-256 of their bytes.
-- The published menu points at "img:<hash>" instead of carrying the picture, so a guest's menu stays small and every
-- picture is cached by the browser forever (the address changes when the picture changes).
CREATE TABLE "MenuImage" (
    "hash" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuImage_pkey" PRIMARY KEY ("restaurantId", "hash")
);
CREATE INDEX "MenuImage_hash_idx" ON "MenuImage" ("hash");
ALTER TABLE "MenuImage" ADD CONSTRAINT "MenuImage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuImage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuImage"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
