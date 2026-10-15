-- Server-captured cost when a movement is first recorded. Legacy rows remain
-- unknown; never backfill historical costs using today's supplier price.
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCostPaise" INTEGER;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_unitCostPaise_nonnegative" CHECK ("unitCostPaise" IS NULL OR "unitCostPaise" >= 0);
