ALTER TABLE "TenantRefreshToken" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "TenantRefreshToken_deviceId_idx" ON "TenantRefreshToken"("deviceId");
