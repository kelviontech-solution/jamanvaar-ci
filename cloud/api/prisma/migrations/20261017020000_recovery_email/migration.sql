-- AlterTable
ALTER TABLE "User" ADD COLUMN "recoveryEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryEmailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "recoveryEmailOtpHash" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryEmailOtpExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "recoveryEmailOtpSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "recoveryEmailOtpAttempts" INTEGER NOT NULL DEFAULT 0;
