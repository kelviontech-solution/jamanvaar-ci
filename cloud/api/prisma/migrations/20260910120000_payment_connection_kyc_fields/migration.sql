-- CreateEnum
CREATE TYPE "CashfreeAccountType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "RestaurantPaymentConnection"
  ADD COLUMN "accountType" "CashfreeAccountType",
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "pan" TEXT,
  ADD COLUMN "gst" TEXT,
  ADD COLUMN "cin" TEXT,
  ADD COLUMN "uidai" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "cashfreeVendorStatus" TEXT;
