ALTER TABLE "Restaurant" ADD COLUMN "operatingProfile" JSONB, ADD COLUMN "brandingProfile" JSONB;
ALTER TABLE "Branch" ADD COLUMN "operatingProfile" JSONB;
ALTER TABLE "Device" ADD COLUMN "profileRevision" TEXT;
