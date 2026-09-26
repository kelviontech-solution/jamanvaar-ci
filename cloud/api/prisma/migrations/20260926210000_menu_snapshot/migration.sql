-- Published menu snapshots: the menu a customer sees is a frozen, versioned copy made when the restaurant publishes.
-- The synced menu entities remain the editable draft; nothing here duplicates them at rest except at publish time.
CREATE TABLE "MenuSnapshot" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "note" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuSnapshot_restaurantId_version_key" ON "MenuSnapshot" ("restaurantId", "version");
ALTER TABLE "MenuSnapshot" ADD CONSTRAINT "MenuSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuSnapshot"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
