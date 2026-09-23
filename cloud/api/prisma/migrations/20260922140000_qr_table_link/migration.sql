-- BUG-119: a table's QR ordering token gets its own indexed row, so a guest's phone (which knows only the
-- token printed on the table, not which restaurant) can be resolved in one indexed lookup instead of a
-- cross-tenant scan through SyncedEntity's JSON payloads.
CREATE TABLE "QrTableLink" (
    "id" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "tableId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrTableLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QrTableLink_qrToken_key" ON "QrTableLink"("qrToken");
CREATE INDEX "QrTableLink_restaurantId_idx" ON "QrTableLink"("restaurantId");

ALTER TABLE "QrTableLink" ADD CONSTRAINT "QrTableLink_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Resolving a token to its restaurant is the one lookup a request with no tenant context yet is allowed to
-- make (platform context); every other read/write on this table is tenant-scoped like the rest of the bridge.
ALTER TABLE "QrTableLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrTableLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QrTableLink"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

