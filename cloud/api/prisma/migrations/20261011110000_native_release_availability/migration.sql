ALTER TABLE "AppRelease" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "AppRelease" ADD COLUMN "artifactVerifiedAt" TIMESTAMP(3);
ALTER TABLE "AppRelease" ADD CONSTRAINT "AppRelease_status_check" CHECK ("status" IN ('PUBLISHED', 'PAUSED'));
