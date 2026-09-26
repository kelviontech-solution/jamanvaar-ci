-- Shared, database-backed request counters (no Redis). One row per (key, one-minute window); increments are atomic
-- INSERT ... ON CONFLICT DO UPDATE, so every API instance sees the same count. Keys are opaque hashed identifiers,
-- not tenant data, so this table has no row-level security. Old windows are deleted by the limiter.
CREATE TABLE "RateCounter" (
    "key" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RateCounter_pkey" PRIMARY KEY ("key", "windowStart")
);
CREATE INDEX "RateCounter_windowStart_idx" ON "RateCounter" ("windowStart");
