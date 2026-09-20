-- BUG-048: orders carry the branch of the terminal that pushed them.
ALTER TABLE "SyncedOrder" ADD COLUMN "branchId" TEXT;
CREATE INDEX "SyncedOrder_branchId_idx" ON "SyncedOrder"("branchId");
