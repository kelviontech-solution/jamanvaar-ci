-- CreateTable
CREATE TABLE "SyncedOrder" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "deviceId" TEXT,
    "externalOrderId" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tableId" TEXT,
    "tableLabel" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncedOrder_restaurantId_updatedAt_idx" ON "SyncedOrder"("restaurantId", "updatedAt");

-- CreateIndex
CREATE INDEX "SyncedOrder_deviceId_idx" ON "SyncedOrder"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedOrder_restaurantId_externalOrderId_key" ON "SyncedOrder"("restaurantId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "SyncedOrder" ADD CONSTRAINT "SyncedOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedOrder" ADD CONSTRAINT "SyncedOrder_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
