-- BUG-064: a real notification store with per-person read state.
CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "restaurantId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "link" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformNotification_dedupeKey_key" ON "PlatformNotification"("dedupeKey");
CREATE INDEX "PlatformNotification_createdAt_idx" ON "PlatformNotification"("createdAt");
CREATE INDEX "PlatformNotification_type_idx" ON "PlatformNotification"("type");
CREATE INDEX "PlatformNotification_restaurantId_idx" ON "PlatformNotification"("restaurantId");
CREATE INDEX "PlatformNotification_userId_idx" ON "PlatformNotification"("userId");

CREATE TABLE "PlatformNotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformNotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);
CREATE INDEX "PlatformNotificationRead_userId_idx" ON "PlatformNotificationRead"("userId");
ALTER TABLE "PlatformNotificationRead" ADD CONSTRAINT "PlatformNotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PlatformNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
