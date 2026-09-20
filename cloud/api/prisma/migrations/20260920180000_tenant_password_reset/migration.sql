-- BUG-142: "forgot password" for restaurant users - an emailed one-time code (hash only), with expiry,
-- a wrong-guess counter and a resend cooldown.
ALTER TABLE "User" ADD COLUMN "passwordResetHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordResetSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0;
