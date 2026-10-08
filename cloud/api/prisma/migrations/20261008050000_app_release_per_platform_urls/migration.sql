-- A release can need a different file per platform (a Windows .exe vs an Android .apk for
-- the same app version) -- the old single downloadUrl column couldn't represent that.
-- Existing single-URL releases are assumed Windows (the only platform ever actually
-- published through the old form so far).
ALTER TABLE "AppRelease" ADD COLUMN "downloadUrls" JSONB;

UPDATE "AppRelease"
SET "downloadUrls" = jsonb_build_object('windows', "downloadUrl")
WHERE "downloadUrl" IS NOT NULL;

ALTER TABLE "AppRelease" DROP COLUMN "downloadUrl";
