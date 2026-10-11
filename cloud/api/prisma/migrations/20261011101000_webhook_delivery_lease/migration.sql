ALTER TABLE "OutboundWebhookDelivery" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "OutboundWebhookDelivery" ADD COLUMN "leaseUntil" TIMESTAMP(3);
CREATE INDEX "OutboundWebhookDelivery_pending_lease_idx" ON "OutboundWebhookDelivery" ("nextAttemptAt", "leaseUntil") WHERE "status" = 'PENDING';
