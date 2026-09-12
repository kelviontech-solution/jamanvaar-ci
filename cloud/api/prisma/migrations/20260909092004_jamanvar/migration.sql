/*
  Warnings:

  - A unique constraint covering the columns `[receiptNumber]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DeviceCommandType" AS ENUM ('LOCK', 'UNLOCK', 'FORCE_LOGOUT', 'REVOKE_SESSION', 'REVOKE_AUTH', 'REQUEST_SYNC', 'REQUEST_HEALTH', 'APP_UPDATE', 'RESTART_APP', 'CLEAR_CACHE', 'REQUEST_DIAGNOSTICS', 'DISABLE_DEVICE', 'ENABLE_DEVICE', 'WIPE_LOCAL_DATA');

-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Backup" ADD COLUMN     "retentionDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "verificationStatus" TEXT DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "macAddress" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "osPlatform" TEXT,
ADD COLUMN     "pendingSyncCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "syncError" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptNumber" TEXT;

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "commandType" "DeviceCommandType" NOT NULL,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterMenuCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterMenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterMenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "basePrice" INTEGER NOT NULL,
    "preparationTimeMinutes" INTEGER NOT NULL DEFAULT 15,
    "dietaryType" TEXT NOT NULL DEFAULT 'VEG',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "allergens" JSONB,
    "tags" JSONB,
    "taxRate" INTEGER NOT NULL DEFAULT 500,
    "hsnCode" TEXT DEFAULT '996331',
    "recipe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantMenuSyndication" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "masterItemId" TEXT NOT NULL,
    "customPrice" INTEGER,
    "customName" TEXT,
    "isCustomized" BOOLEAN NOT NULL DEFAULT false,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantMenuSyndication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEventLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "payloadSize" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "localVersion" JSONB NOT NULL,
    "cloudVersion" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineExtension" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT,
    "extensionDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "certificatePayload" TEXT NOT NULL,
    "certificateSignature" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSandbox" (
    "id" TEXT NOT NULL,
    "sourceRestaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environmentKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSandbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRestoreJob" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "previewSummary" JSONB,
    "errorMessage" TEXT,
    "initiatedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRestoreJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_restaurantId_idx" ON "DeviceCommand"("restaurantId");

-- CreateIndex
CREATE INDEX "DeviceCommand_status_idx" ON "DeviceCommand"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MasterMenuCategory_name_key" ON "MasterMenuCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MasterMenuCategory_slug_key" ON "MasterMenuCategory"("slug");

-- CreateIndex
CREATE INDEX "MasterMenuItem_categoryId_idx" ON "MasterMenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "RestaurantMenuSyndication_restaurantId_idx" ON "RestaurantMenuSyndication"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenuSyndication_restaurantId_masterItemId_key" ON "RestaurantMenuSyndication"("restaurantId", "masterItemId");

-- CreateIndex
CREATE INDEX "SyncEventLog_restaurantId_timestamp_idx" ON "SyncEventLog"("restaurantId", "timestamp");

-- CreateIndex
CREATE INDEX "SyncEventLog_status_idx" ON "SyncEventLog"("status");

-- CreateIndex
CREATE INDEX "SyncConflict_restaurantId_idx" ON "SyncConflict"("restaurantId");

-- CreateIndex
CREATE INDEX "SyncConflict_resolution_idx" ON "SyncConflict"("resolution");

-- CreateIndex
CREATE INDEX "OfflineExtension_restaurantId_idx" ON "OfflineExtension"("restaurantId");

-- CreateIndex
CREATE INDEX "OfflineExtension_deviceId_idx" ON "OfflineExtension"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSandbox_environmentKey_key" ON "RestaurantSandbox"("environmentKey");

-- CreateIndex
CREATE INDEX "RestaurantSandbox_sourceRestaurantId_idx" ON "RestaurantSandbox"("sourceRestaurantId");

-- CreateIndex
CREATE INDEX "BackupRestoreJob_restaurantId_idx" ON "BackupRestoreJob"("restaurantId");

-- CreateIndex
CREATE INDEX "BackupRestoreJob_backupId_idx" ON "BackupRestoreJob"("backupId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterMenuItem" ADD CONSTRAINT "MasterMenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MasterMenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuSyndication" ADD CONSTRAINT "RestaurantMenuSyndication_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuSyndication" ADD CONSTRAINT "RestaurantMenuSyndication_masterItemId_fkey" FOREIGN KEY ("masterItemId") REFERENCES "MasterMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncConflict" ADD CONSTRAINT "SyncConflict_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncConflict" ADD CONSTRAINT "SyncConflict_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineExtension" ADD CONSTRAINT "OfflineExtension_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineExtension" ADD CONSTRAINT "OfflineExtension_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSandbox" ADD CONSTRAINT "RestaurantSandbox_sourceRestaurantId_fkey" FOREIGN KEY ("sourceRestaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRestoreJob" ADD CONSTRAINT "BackupRestoreJob_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "Backup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRestoreJob" ADD CONSTRAINT "BackupRestoreJob_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
