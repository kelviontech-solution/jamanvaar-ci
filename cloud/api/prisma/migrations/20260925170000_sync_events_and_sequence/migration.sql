-- Sync redesign: exactly-once event application (ProcessedSyncEvent) and a monotonic per-branch
-- pull cursor (SyncSequence + SyncedOrder.seq). Additive only.

-- AlterTable
ALTER TABLE "SyncedOrder" ADD COLUMN "seq" INTEGER;

-- CreateTable
CREATE TABLE "ProcessedSyncEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncSequence" (
    "restaurantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncSequence_pkey" PRIMARY KEY ("restaurantId","scope")
);

-- CreateIndex
CREATE INDEX "SyncedOrder_restaurantId_branchId_seq_idx" ON "SyncedOrder"("restaurantId", "branchId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedSyncEvent_restaurantId_eventId_key" ON "ProcessedSyncEvent"("restaurantId", "eventId");

-- CreateIndex
CREATE INDEX "ProcessedSyncEvent_restaurantId_createdAt_idx" ON "ProcessedSyncEvent"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProcessedSyncEvent" ADD CONSTRAINT "ProcessedSyncEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncSequence" ADD CONSTRAINT "SyncSequence_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same policy as every other restaurant-scoped table.
ALTER TABLE "ProcessedSyncEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedSyncEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProcessedSyncEvent"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "SyncSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncSequence"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
