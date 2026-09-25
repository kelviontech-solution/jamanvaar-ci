-- Number block leases: collision-free human order/KOT numbers across offline devices.
CREATE TABLE "NumberSequence" (
    "restaurantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("restaurantId","scope","kind","businessDate")
);

ALTER TABLE "NumberSequence" ADD CONSTRAINT "NumberSequence_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NumberSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NumberSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NumberSequence"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
