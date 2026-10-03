#!/bin/sh
# Runs Prisma's pending migrations against whatever DATABASE_URL points at, then starts the
# real server -- same two-step `prisma migrate deploy` + start pattern Wrench's own
# entrypoint.sh already uses for Alembic, applied to Prisma. `migrate deploy` (not `dev`)
# is the non-interactive, production-safe command: it only applies migrations already
# committed to prisma/migrations, never generates a new one or prompts.
set -e

echo "Running Prisma migrations..."
# npm workspaces hoist node_modules to the repo root (/repo/node_modules), not
# cloud/api/node_modules -- `npm run` (unlike a bare `node_modules/.bin/prisma` path) adds
# every relevant ancestor's node_modules/.bin to PATH itself, so this finds the Prisma CLI
# correctly regardless of exactly where npm chose to hoist it.
npm run prisma:deploy

echo "Starting cloud/api..."
exec node dist/src/main.js
