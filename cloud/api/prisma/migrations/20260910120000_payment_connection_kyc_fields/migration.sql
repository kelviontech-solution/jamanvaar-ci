-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CashfreeAccountType" AS ENUM ('BUSINESS', 'INDIVIDUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "RestaurantPaymentConnection"
  ADD COLUMN IF NOT EXISTS "accountType" "CashfreeAccountType",
  ADD COLUMN IF NOT EXISTS "businessType" TEXT,
  ADD COLUMN IF NOT EXISTS "pan" TEXT,
  ADD COLUMN IF NOT EXISTS "gst" TEXT,
  ADD COLUMN IF NOT EXISTS "cin" TEXT,
  ADD COLUMN IF NOT EXISTS "uidai" TEXT,
  ADD COLUMN IF NOT EXISTS "contactName" TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "cashfreeVendorStatus" TEXT;
