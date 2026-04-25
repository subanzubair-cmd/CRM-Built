#!/usr/bin/env bash
# Verify Umzug migrations + drift detection.
#
# Drops the shadow DB, runs `umzug up` against it from scratch, then dumps
# both the main DB and the freshly-migrated shadow DB and compares the
# structural schema (order-insensitive, ignoring bookkeeping tables and
# pg_dump randomization). Exits 0 if structurally identical.
#
# Usage: pnpm db:migrate:check
#
# Prereqs:
#   - docker compose up -d postgres postgres-shadow
#   - DATABASE_URL set for main DB (defaults shown below match docker-compose.yml)
set -euo pipefail

MAIN_URL="${DATABASE_URL:-postgresql://crm_user:crm_password@localhost:5432/rei_crm?schema=public}"
SHADOW_URL="${SHADOW_DATABASE_URL:-postgresql://crm_user:crm_password@localhost:5433/rei_crm_shadow?schema=public}"

# Use the npm-shipped pnpm if corepack is broken on this machine.
PNPM="$(command -v pnpm 2>/dev/null || true)"
if [ -z "$PNPM" ] || ! "$PNPM" --version >/dev/null 2>&1; then
  PNPM='node C:/Users/suban/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs'
fi

echo "▶ Resetting shadow DB"
docker exec rei-crm-db-shadow psql -U crm_user -d rei_crm_shadow -c \
  'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO crm_user; GRANT ALL ON SCHEMA public TO public;' \
  >/dev/null

echo "▶ Running Umzug up against shadow"
DATABASE_URL="$SHADOW_URL" $PNPM --filter @crm/database run db:migrate:sequelize:up

echo "▶ Dumping main + shadow schemas"
docker exec rei-crm-db pg_dump --schema-only --no-owner --no-privileges -U crm_user -d rei_crm > /tmp/main-schema.sql
docker exec rei-crm-db-shadow pg_dump --schema-only --no-owner --no-privileges -U crm_user -d rei_crm_shadow > /tmp/shadow-schema.sql

echo "▶ Comparing"
node packages/database/src/migrations-umzug/compare-schemas.mjs /tmp/main-schema.sql /tmp/shadow-schema.sql
