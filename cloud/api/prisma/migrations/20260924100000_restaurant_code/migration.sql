-- Phase 1 (Restaurant Identity): adds the customer-facing Restaurant ID ("JM" + registered
-- mobile) alongside the existing internal UUID `id`, which stays the database primary key
-- and every foreign-key reference untouched. Nullable so this migration never fails on
-- existing rows; a follow-up backfill script (backfill-restaurant-codes.ts) fills every
-- existing restaurant's code in, flagging any that had no usable phone number on file.
ALTER TABLE "Restaurant" ADD COLUMN "mobile" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "restaurantCode" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "restaurantCodeIsFallback" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Restaurant_restaurantCode_key" ON "Restaurant"("restaurantCode");
