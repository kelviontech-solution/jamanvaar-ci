-- CreateEnum
CREATE TYPE "WhatsAppChannelConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'REVOKED');

-- NOTE: prisma migrate diff also proposed `DROP INDEX "TenantRefreshToken_deviceId_idx"`
-- here — pre-existing drift between schema.prisma (no @@index([deviceId]) on
-- TenantRefreshToken) and the live database (which has that index), unrelated to this
-- migration. Deliberately left out: this migration only adds the WhatsApp connector
-- table, and shouldn't silently drop a live index as a side effect. That drift is a
-- separate, pre-existing issue for whoever owns TenantRefreshToken to resolve deliberately.

-- CreateTable
CREATE TABLE "WhatsAppChannelConnection" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "WhatsAppChannelConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "prepTimeMinutes" INTEGER,
    "pausedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChannelConnection_restaurantId_key" ON "WhatsAppChannelConnection"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChannelConnection_keyHash_key" ON "WhatsAppChannelConnection"("keyHash");

-- CreateIndex
CREATE INDEX "WhatsAppChannelConnection_restaurantId_idx" ON "WhatsAppChannelConnection"("restaurantId");

-- AddForeignKey
ALTER TABLE "WhatsAppChannelConnection" ADD CONSTRAINT "WhatsAppChannelConnection_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
