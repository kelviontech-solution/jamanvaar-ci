-- Device commands: redelivery counter and idempotency key (a console retry never creates a second command).
ALTER TABLE "DeviceCommand" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeviceCommand" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "DeviceCommand_deviceId_idempotencyKey_key" ON "DeviceCommand"("deviceId", "idempotencyKey");
