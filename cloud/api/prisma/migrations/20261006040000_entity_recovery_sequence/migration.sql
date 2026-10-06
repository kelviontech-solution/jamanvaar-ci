BEGIN;
ALTER TABLE "SyncedEntity" ADD COLUMN "seq" INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION jv_entity_writer_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant TEXT := current_setting('app.current_restaurant_id', true);
BEGIN
  IF tenant IS NOT NULL AND tenant <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('entity:' || tenant));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER jv_entity_writer_lock_before_statement BEFORE INSERT OR UPDATE ON "SyncedEntity"
FOR EACH STATEMENT EXECUTE FUNCTION jv_entity_writer_lock();
-- Each entity writer receives a commit-ordered cursor, including admin/publication updates.
-- The counter lock is held through commit, so a reader never skips an uncommitted lower value.
CREATE FUNCTION jv_entity_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "SyncSequence" ("restaurantId", "scope", "value")
  VALUES (NEW."restaurantId", '_entities', 1)
  ON CONFLICT ("restaurantId", "scope") DO UPDATE SET "value" = "SyncSequence"."value" + 1
  RETURNING "value" INTO NEW."seq";
  RETURN NEW;
END;
$$;
CREATE TRIGGER jv_entity_sequence_before_write BEFORE INSERT OR UPDATE ON "SyncedEntity"
FOR EACH ROW EXECUTE FUNCTION jv_entity_sequence();
SET LOCAL app.is_platform_context = 'true';
UPDATE "SyncedEntity" SET "seq" = 0;
CREATE INDEX "SyncedEntity_restaurantId_entityType_seq_idx" ON "SyncedEntity" ("restaurantId", "entityType", "seq");
COMMIT;
