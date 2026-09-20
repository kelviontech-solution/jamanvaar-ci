-- BUG-075: the API must not connect as a superuser or a BYPASSRLS role, because Postgres exempts those
-- from row-level security even when it is FORCED. Run this once as a superuser, then point DATABASE_URL at
-- the new role and run `prisma migrate deploy` as it (the role must OWN the tables: the init migration
-- relies on FORCE ROW LEVEL SECURITY to bind the owner).
--
--   psql -U postgres -d postgres -f prisma/setup-app-role.sql
--
-- Replace the password. For an existing database that a superuser created, either recreate it owned by
-- jamanvaar_app (recommended for a new install) or transfer ownership of every table, sequence and type.

CREATE ROLE jamanvaar_app LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- New install:
CREATE DATABASE jamanvaar OWNER jamanvaar_app;
CREATE DATABASE jamanvaar_test OWNER jamanvaar_app;
