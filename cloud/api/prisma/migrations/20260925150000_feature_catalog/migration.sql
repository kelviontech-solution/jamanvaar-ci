-- Phase 10 (gap closure): replaces the idea of "describe a feature in a hardcoded TS constant"
-- with two real, queryable, Super-Admin-editable tables. Purely additive — no existing table
-- changes. legacyEntitlementKey bridges to the pre-existing Plan.entitlements JSON keys;
-- appCode bridges to the pre-existing AppCode/ApplicationEntitlement system. Both existing
-- systems keep working unchanged; nothing reads from these new tables yet.

-- CreateTable
CREATE TABLE "FeatureCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "appCode" "AppCode",
    "legacyEntitlementKey" TEXT,
    "dependsOnFeatureIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureCategory_code_key" ON "FeatureCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_code_key" ON "Feature"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_legacyEntitlementKey_key" ON "Feature"("legacyEntitlementKey");

-- CreateIndex
CREATE INDEX "Feature_categoryId_idx" ON "Feature"("categoryId");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FeatureCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
