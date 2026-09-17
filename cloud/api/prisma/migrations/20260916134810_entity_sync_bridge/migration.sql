-- CreateTable
CREATE TABLE "SyncedEntity" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncedEntity_restaurantId_entityType_updatedAt_idx" ON "SyncedEntity"("restaurantId", "entityType", "updatedAt");

-- CreateIndex
CREATE INDEX "SyncedEntity_deviceId_idx" ON "SyncedEntity"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedEntity_restaurantId_entityType_externalId_key" ON "SyncedEntity"("restaurantId", "entityType", "externalId");

-- AddForeignKey
ALTER TABLE "SyncedEntity" ADD CONSTRAINT "SyncedEntity_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedEntity" ADD CONSTRAINT "SyncedEntity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
