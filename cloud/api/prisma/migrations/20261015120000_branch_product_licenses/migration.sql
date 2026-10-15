CREATE TABLE "BranchProductLicense" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE,
 "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE CASCADE,
 "appCode" "AppCode" NOT NULL,
 "enabled" BOOLEAN NOT NULL,
 "deviceQuota" INTEGER CHECK ("deviceQuota" IS NULL OR "deviceQuota" >= 0),
 "disabledFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "effectiveAt" TIMESTAMP(3) NOT NULL,
 "expiresAt" TIMESTAMP(3),
 "revision" INTEGER NOT NULL CHECK ("revision" > 0),
 "cancelledAt" TIMESTAMP(3),
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("expiresAt" IS NULL OR "expiresAt" > "effectiveAt")
);
CREATE UNIQUE INDEX "BranchProductLicense_branchId_appCode_revision_key" ON "BranchProductLicense"("branchId","appCode","revision");
CREATE INDEX "BranchProductLicense_restaurantId_branchId_appCode_effectiveAt_idx" ON "BranchProductLicense"("restaurantId","branchId","appCode","effectiveAt");
ALTER TABLE "BranchProductLicense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchProductLicense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BranchProductLicense" USING (
 current_setting('app.is_platform_context', true) = 'true'
 OR "restaurantId" = current_setting('app.current_restaurant_id', true)
);
CREATE FUNCTION jv_branch_license_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Branch" WHERE "id"=NEW."branchId" AND "restaurantId"=NEW."restaurantId") THEN
  RAISE EXCEPTION 'Branch license restaurant mismatch';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER jv_branch_license_scope_check BEFORE INSERT OR UPDATE ON "BranchProductLicense" FOR EACH ROW EXECUTE FUNCTION jv_branch_license_scope();
