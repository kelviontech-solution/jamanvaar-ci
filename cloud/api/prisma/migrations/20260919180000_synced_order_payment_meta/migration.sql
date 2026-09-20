ALTER TABLE "SyncedOrder" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "SyncedOrder" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "SyncedOrder" ADD COLUMN "meta" JSONB;
