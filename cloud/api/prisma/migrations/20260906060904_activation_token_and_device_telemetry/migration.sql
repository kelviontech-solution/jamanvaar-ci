-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lastBackupAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "syncStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenHash" TEXT;
