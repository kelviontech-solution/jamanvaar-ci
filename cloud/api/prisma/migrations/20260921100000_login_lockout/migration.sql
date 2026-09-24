-- B2-030: neither login endpoint tracked failed attempts per account. The only brake was the
-- global per-IP throttle (120 req/min), which does nothing to stop a slow/distributed guesser
-- and actively backfires — enough rapid wrong guesses trip the IP throttle and lock the real
-- account owner out too, since it can't tell attacker requests from the owner's own retries.
-- These columns add a real per-account lockout (mirrors the existing passwordResetAttempts
-- pattern on User): a short-lived lock after too many wrong passwords in a row, independent of
-- which IP the requests came from.
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

ALTER TABLE "PlatformUser" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformUser" ADD COLUMN "lockedUntil" TIMESTAMP(3);
