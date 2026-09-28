-- A paid order is only "done" once the kiosk has created its token and KOT. fulfilledAt records that;
-- a SUCCESS payment with a null fulfilledAt after a few minutes is surfaced as needing attention.
ALTER TABLE "PaymentTransaction" ADD COLUMN "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "PaymentTransaction" ADD COLUMN "fulfilledByDeviceId" TEXT;
-- Payments that succeeded before this feature existed are already-served history, not attention items.
UPDATE "PaymentTransaction" SET "fulfilledAt" = COALESCE("paidAt", "createdAt") WHERE "status" IN (
'SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING');
CREATE INDEX "PaymentTransaction_status_fulfilledAt_idx" ON "PaymentTransaction" ("status", "fulfilledAt");
