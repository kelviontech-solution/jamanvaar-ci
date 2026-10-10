-- Additive only: printed tokens, orders and existing settings remain intact.
ALTER TABLE "QrSettings" ADD COLUMN "rules" JSONB, ADD COLUMN "overrides" JSONB;
ALTER TABLE "QrBranding" ADD COLUMN "printDesign" JSONB;
CREATE INDEX "QrSettings_restaurant_branch_idx" ON "QrSettings" ("restaurantId", "branchId");
