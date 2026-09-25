-- Phase 5 (commercial catalog): QR becomes a real plan tier (JAMANVAAR QR, ₹9,000/yr) and
-- QR_ORDERING becomes a first-class AppCode with its own ApplicationEntitlement row, instead
-- of only the flat Plan.entitlements.qrTableOrdering flag. Additive only — no existing row's
-- tier or entitlements change as a result of this migration.
ALTER TYPE "PlanTier" ADD VALUE 'QR';
ALTER TYPE "AppCode" ADD VALUE 'QR_ORDERING';
