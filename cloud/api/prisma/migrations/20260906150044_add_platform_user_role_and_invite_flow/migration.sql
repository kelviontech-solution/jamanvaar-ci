-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'SUPER_ADMIN', 'PLATFORM_OPS', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'READ_ONLY');

-- AlterEnum
ALTER TYPE "PlatformUserStatus" ADD VALUE 'PENDING_ACTIVATION';

-- AlterTable
ALTER TABLE "PlatformUser" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenHash" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "role" "PlatformRole" NOT NULL DEFAULT 'SUPER_ADMIN',
ALTER COLUMN "passwordHash" DROP NOT NULL;
