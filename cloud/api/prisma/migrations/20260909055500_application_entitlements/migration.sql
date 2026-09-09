-- CreateEnum
CREATE TYPE "AppCode" AS ENUM ('POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivationKeyDeviceType" ADD VALUE 'POS_ADMIN';
ALTER TYPE "ActivationKeyDeviceType" ADD VALUE 'KIOSK_ADMIN';

-- AlterEnum
ALTER TYPE "DeviceType" ADD VALUE 'KIOSK_ADMIN';

-- CreateTable
CREATE TABLE "ApplicationEntitlement" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "appCode" "AppCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deviceQuota" INTEGER,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationEntitlement_restaurantId_idx" ON "ApplicationEntitlement"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEntitlement_subscriptionId_appCode_key" ON "ApplicationEntitlement"("subscriptionId", "appCode");

-- AddForeignKey
ALTER TABLE "ApplicationEntitlement" ADD CONSTRAINT "ApplicationEntitlement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEntitlement" ADD CONSTRAINT "ApplicationEntitlement_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: ApplicationEntitlement is tenant-owned (restaurantId-scoped), same
-- shape as every other tenant table in this schema (Subscription,
-- ActivationKey, Backup, ...). FORCE is required because the app's DB role
-- owns this table and Postgres exempts owners from RLS by default.
ALTER TABLE "ApplicationEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationEntitlement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApplicationEntitlement"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
