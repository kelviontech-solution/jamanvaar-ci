-- The kitchen station a KDS screen serves ("Bar", "Tandoor"), assigned by the restaurant admin instead of typed at each screen.
ALTER TABLE "Device" ADD COLUMN "kitchenStation" TEXT;
