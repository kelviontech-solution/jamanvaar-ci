-- Menu versioning: numbered publications and the version each device reports as applied.
ALTER TABLE "Device" ADD COLUMN "menuVersion" INTEGER;

CREATE TABLE "MenuPublication" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "watermark" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "publishedByDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuPublication_restaurantId_version_key" ON "MenuPublication"("restaurantId", "version");

ALTER TABLE "MenuPublication" ADD CONSTRAINT "MenuPublication_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuPublication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuPublication" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuPublication"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
