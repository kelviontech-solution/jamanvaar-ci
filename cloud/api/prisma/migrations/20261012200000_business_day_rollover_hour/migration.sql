ALTER TABLE "Restaurant" ADD COLUMN "businessDayCutoffHour" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_businessDayCutoffHour_check" CHECK ("businessDayCutoffHour" BETWEEN 0 AND 23);
