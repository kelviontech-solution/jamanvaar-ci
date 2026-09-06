-- CreateTable
CREATE TABLE "TenantRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantRefreshToken_tokenHash_key" ON "TenantRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantRefreshToken_userId_idx" ON "TenantRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "TenantRefreshToken_restaurantId_idx" ON "TenantRefreshToken"("restaurantId");

-- AddForeignKey
ALTER TABLE "TenantRefreshToken" ADD CONSTRAINT "TenantRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: TenantRefreshToken is tenant-scoped (same policy shape as
-- Restaurant/Branch/User/Device/Subscription/ActivationKey in the init migration).
ALTER TABLE "TenantRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantRefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantRefreshToken"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
