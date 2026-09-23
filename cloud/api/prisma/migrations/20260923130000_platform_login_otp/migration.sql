-- Super Admin sign-in now requires a second factor: an emailed one-time code after the
-- password checks out (hash only), with expiry, a wrong-guess counter and a resend cooldown.
-- Same shape as User's password-reset OTP columns (20260920180000_tenant_password_reset).
ALTER TABLE "PlatformUser" ADD COLUMN "loginOtpHash" TEXT;
ALTER TABLE "PlatformUser" ADD COLUMN "loginOtpExpiresAt" TIMESTAMP(3);
ALTER TABLE "PlatformUser" ADD COLUMN "loginOtpSentAt" TIMESTAMP(3);
ALTER TABLE "PlatformUser" ADD COLUMN "loginOtpAttempts" INTEGER NOT NULL DEFAULT 0;
