-- Phase 2 (multi-subscription entitlements): plans belong to a commercial product family.
-- Every existing plan defaults to RESTAURANT (the only family that has ever existed) — this
-- migration changes no restaurant's effective entitlements.
CREATE TYPE "ProductFamily" AS ENUM ('RESTAURANT', 'KIOSK');
ALTER TABLE "Plan" ADD COLUMN "productFamily" "ProductFamily" NOT NULL DEFAULT 'RESTAURANT';
