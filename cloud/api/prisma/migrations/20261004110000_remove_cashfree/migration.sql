-- Razorpay is the only payment provider. Cashfree rows are re-tagged RAZORPAY (they were never paid in production); a paid
-- Cashfree payment stops the migration so it can be reconciled by hand first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentTransaction" WHERE "provider"::text = 'CASHFREE' AND "status" IN ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING')) THEN
    RAISE EXCEPTION 'Paid Cashfree payments exist; reconcile them before removing Cashfree';
  END IF;
END $$;

UPDATE "PaymentTransaction" SET "provider" = 'RAZORPAY' WHERE "provider"::text = 'CASHFREE';
UPDATE "RestaurantPaymentConnection" SET "provider" = 'RAZORPAY' WHERE "provider"::text = 'CASHFREE';
UPDATE "WebhookEvent" SET "provider" = 'RAZORPAY' WHERE "provider"::text = 'CASHFREE';

-- AlterEnum: PaymentProvider keeps only RAZORPAY
ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "RestaurantPaymentConnection" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "WebhookEvent" ALTER COLUMN "provider" DROP DEFAULT;
CREATE TYPE "PaymentProvider_new" AS ENUM ('RAZORPAY');
ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TABLE "RestaurantPaymentConnection" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TABLE "WebhookEvent" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "PaymentProvider_old";
ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';
ALTER TABLE "RestaurantPaymentConnection" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';
ALTER TABLE "WebhookEvent" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';

-- Settlement account type keeps its values and its stored data
ALTER TYPE "CashfreeAccountType" RENAME TO "PayoutAccountType";

-- Razorpay-only columns and tables
ALTER TABLE "PaymentTransaction" DROP COLUMN "paymentSessionId";
ALTER TABLE "RestaurantPaymentConnection" DROP COLUMN "cashfreeVendorId", DROP COLUMN "cashfreeVendorStatus";
DROP TABLE "ReconciliationException";
DROP TYPE "ReconciliationExceptionStatus";
DROP TYPE "ReconciliationExceptionType";
