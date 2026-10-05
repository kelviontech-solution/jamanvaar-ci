-- CreateEnum
CREATE TYPE "BankVerificationStatus" AS ENUM ('NOT_ADDED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RestaurantPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'ON_HOLD', 'FAILED');


-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "payoutId" TEXT;

-- AlterTable
ALTER TABLE "RestaurantPaymentConnection" ADD COLUMN     "bankVerificationStatus" "BankVerificationStatus" NOT NULL DEFAULT 'NOT_ADDED',
ADD COLUMN     "bankVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "bankVerifiedByPlatformUserId" TEXT;

-- CreateTable
CREATE TABLE "RestaurantPayout" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "status" "RestaurantPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "grossAmount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "bankAccountMasked" TEXT,
    "bankIfsc" TEXT,
    "utr" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByPlatformUserId" TEXT,
    "holdReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantPayout_restaurantId_idx" ON "RestaurantPayout"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantPayout_status_idx" ON "RestaurantPayout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantPayout_restaurantId_businessDate_key" ON "RestaurantPayout"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "PaymentTransaction_payoutId_idx" ON "PaymentTransaction"("payoutId");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "RestaurantPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPayout" ADD CONSTRAINT "RestaurantPayout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

