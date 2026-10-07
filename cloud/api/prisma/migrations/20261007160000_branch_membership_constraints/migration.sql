-- Enforce tenant membership even if a future writer forgets an application check.
-- Null branch IDs remain valid for restaurant-wide and unassigned legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_restaurantId_id_key" ON "Branch" ("restaurantId", "id");
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Device','User','ActivationKey','SyncedOrder','Order','QrCode','QrSettings','InventoryMovement'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("restaurantId", "branchId") REFERENCES "Branch" ("restaurantId", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID', table_name, table_name || '_tenant_branch_fkey');
    -- Fail migration rather than silently reassigning existing corrupt records.
    EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', table_name, table_name || '_tenant_branch_fkey');
  END LOOP;
END $$;
