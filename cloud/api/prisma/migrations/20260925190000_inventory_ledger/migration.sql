-- Inventory movement ledger: stock as signed per-branch movements, idempotent by movementId.
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "branchId" TEXT,
    "movementId" TEXT NOT NULL,
    "deviceId" TEXT,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "orderId" TEXT,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryMovement_restaurantId_movementId_key" ON "InventoryMovement"("restaurantId", "movementId");
CREATE INDEX "InventoryMovement_restaurantId_branchId_seq_idx" ON "InventoryMovement"("restaurantId", "branchId", "seq");
CREATE INDEX "InventoryMovement_restaurantId_branchId_itemId_idx" ON "InventoryMovement"("restaurantId", "branchId", "itemId");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryMovement"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
