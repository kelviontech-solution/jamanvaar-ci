-- BUG-048 / BUG-060: a key can be issued for a specific branch, labelled, and grouped into a batch.
ALTER TABLE "ActivationKey" ADD COLUMN "branchId" TEXT;
ALTER TABLE "ActivationKey" ADD COLUMN "label" TEXT;
ALTER TABLE "ActivationKey" ADD COLUMN "batchId" TEXT;

ALTER TABLE "ActivationKey" ADD CONSTRAINT "ActivationKey_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ActivationKey_branchId_idx" ON "ActivationKey"("branchId");
CREATE INDEX "ActivationKey_batchId_idx" ON "ActivationKey"("batchId");
