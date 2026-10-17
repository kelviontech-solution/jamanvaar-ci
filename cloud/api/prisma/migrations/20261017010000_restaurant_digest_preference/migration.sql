-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "digestHour" INTEGER NOT NULL DEFAULT 9;
