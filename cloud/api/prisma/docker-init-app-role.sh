#!/bin/sh
# Runs automatically, once, the first time the postgres container initializes its data
# directory (standard behavior of anything mounted into /docker-entrypoint-initdb.d/ on the
# official postgres image) -- creates the role the app actually connects as.
#
# Why this exists at all: the official postgres image's POSTGRES_USER (here, the bootstrap
# "postgres" superuser) is a real Postgres superuser by construction (that's what initdb
# does) -- connecting as it would make Row-Level Security decorative, not enforced (every
# tenant-isolation policy in this schema is bypassed by a superuser even when FORCED). See
# src/prisma/rls-role.ts: cloud/api refuses to boot in production if it detects exactly
# this. This script is the containerized version of prisma/setup-app-role.sql (the same
# thing documented there for a bare-metal Postgres install), adapted to read its password
# from an env var instead of a hand-edited placeholder.
set -e

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set (see .env) -- the app's own DB role needs a real password, not a default}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE jamanvaar_app LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  CREATE DATABASE jamanvaar OWNER jamanvaar_app;
EOSQL
