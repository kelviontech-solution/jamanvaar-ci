-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "orderType" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'KIOSK',
ADD COLUMN     "tableLabel" TEXT;
