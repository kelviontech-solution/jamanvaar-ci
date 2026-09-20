ALTER TABLE "PlatformRefreshToken"
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "sessionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "terminatedAt" TIMESTAMP(3),
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "ip" TEXT;

-- Existing tokens each become their own session.
UPDATE "PlatformRefreshToken" SET "sessionId" = "id", "sessionStartedAt" = "createdAt", "lastUsedAt" = "createdAt";
UPDATE "PlatformRefreshToken" SET "terminatedAt" = "revokedAt" WHERE "revokedAt" IS NOT NULL;

ALTER TABLE "PlatformRefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;
CREATE INDEX "PlatformRefreshToken_sessionId_idx" ON "PlatformRefreshToken"("sessionId");
