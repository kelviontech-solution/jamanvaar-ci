-- BUG-008: a restaurant-wide default display size for its terminals, set from Restaurant Admin.
ALTER TABLE "Restaurant" ADD COLUMN "displayScalePercent" INTEGER NOT NULL DEFAULT 100;
