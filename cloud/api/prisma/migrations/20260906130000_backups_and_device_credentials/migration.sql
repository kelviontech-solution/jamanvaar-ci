-- CreateEnum
CREATE TYPE "BackupMethod" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "deviceTokenHash" TEXT;

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "deviceId" TEXT,
    "method" "BackupMethod" NOT NULL DEFAULT 'MANUAL',
    "status" "BackupStatus" NOT NULL DEFAULT 'COMPLETED',
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_restaurantId_idx" ON "Backup"("restaurantId");

-- CreateIndex
CREATE INDEX "Backup_deviceId_idx" ON "Backup"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceTokenHash_key" ON "Device"("deviceTokenHash");

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: Backup rows are tenant-owned, same shape as every
-- other RLS-protected table (see 20260905092359_init/migration.sql). FORCE
-- is required or the app's own DB-role ownership would silently exempt it.
ALTER TABLE "Backup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Backup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Backup"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
