-- BUG-055..058: JAMAN AI configuration, per-restaurant access and real usage live in the database.
CREATE TABLE "AiQuestion" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'sparkles',
    "intent" TEXT NOT NULL,
    "minPlanTier" TEXT NOT NULL DEFAULT 'PRO',
    "priorityScore" INTEGER NOT NULL DEFAULT 50,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "targetDomain" TEXT,
    "calculationType" TEXT,
    "filterField" TEXT,
    "filterValue" TEXT,
    "displayUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiQuestion_category_idx" ON "AiQuestion"("category");

CREATE TABLE "RestaurantAiAccess" (
    "restaurantId" TEXT NOT NULL,
    "state" TEXT,
    "dailyQueryLimit" INTEGER,
    "thresholdOverrides" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestaurantAiAccess_pkey" PRIMARY KEY ("restaurantId")
);
ALTER TABLE "RestaurantAiAccess" ADD CONSTRAINT "RestaurantAiAccess_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiUsageDaily" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "intent" TEXT NOT NULL,
    "queries" INTEGER NOT NULL DEFAULT 0,
    "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiUsageDaily_restaurantId_day_intent_key" ON "AiUsageDaily"("restaurantId", "day", "intent");
CREATE INDEX "AiUsageDaily_day_idx" ON "AiUsageDaily"("day");
ALTER TABLE "AiUsageDaily" ADD CONSTRAINT "AiUsageDaily_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, the same policy every restaurant-owned table has.
ALTER TABLE "RestaurantAiAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantAiAccess" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantAiAccess"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
ALTER TABLE "AiUsageDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsageDaily" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiUsageDaily"
  USING (current_setting('app.is_platform_context', true) = 'true' OR "restaurantId" = current_setting('app.current_restaurant_id', true));
