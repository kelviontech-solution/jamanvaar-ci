CREATE TYPE "ReconciliationExceptionType" AS ENUM ('MISSING_AT_CASHFREE', 'AMOUNT_MISMATCH', 'SPLIT_MISMATCH', 'UNEXPECTED_STATUS');
CREATE TYPE "ReconciliationExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "ReconciliationExceptionType" NOT NULL,
    "details" JSONB NOT NULL,
    "status" "ReconciliationExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationException_restaurantId_idx" ON "ReconciliationException" ("restaurantId");
CREATE INDEX "ReconciliationException_status_idx" ON "ReconciliationException" ("status");
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationException" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReconciliationException"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
