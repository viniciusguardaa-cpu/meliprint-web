#!/usr/bin/env bash
# test-migrations.sh — validate migrations against a disposable PostgreSQL.
#
# Scenarios:
#   1. Fresh install: apply every migration to an empty database.
#   2. Upgrade: seed a database with pre-0006 data (as a real deployment would
#      have), then apply all migrations and verify data is preserved.
#
# Usage:
#   ./server/scripts/test-migrations.sh
#   DATABASE_URL=postgres://... ./server/scripts/test-migrations.sh  # reuse a running PG
#
# Without DATABASE_URL it bootstraps a throwaway cluster with initdb/pg_ctl.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

WORKDIR="$(mktemp -d /tmp/labelgo-migrations-XXXXXX)"
PG_BIN="${PG_BIN:-}"
OWN_CLUSTER=0
PGDATA=""

cleanup() {
  if [ "$OWN_CLUSTER" = "1" ] && [ -n "$PGDATA" ]; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

find_pg_bin() {
  if [ -n "$PG_BIN" ]; then return; fi
  for candidate in \
    "$(dirname "$(command -v psql)")" \
    /opt/homebrew/opt/postgresql@*/bin \
    /usr/local/opt/postgresql@*/bin \
    /usr/lib/postgresql/*/bin; do
    if [ -x "$candidate/initdb" ]; then
      PG_BIN="$candidate"
      return
    fi
  done
  echo "ERROR: could not locate PostgreSQL binaries (initdb)." >&2
  exit 1
}

PORT=55432

if [ -z "${DATABASE_URL:-}" ]; then
  find_pg_bin
  PGDATA="$WORKDIR/pgdata"
  "$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
  "$PG_BIN/pg_ctl" -D "$PGDATA" -U postgres -o "-p $PORT -k $WORKDIR" -w -l "$WORKDIR/pg.log" start >/dev/null
  OWN_CLUSTER=1
  DATABASE_URL="postgres://postgres@localhost:$PORT/postgres"
  # socket dir override: use TCP explicitly
  export PGHOST=localhost PGPORT=$PORT PGUSER=postgres
fi

PSQL="$PG_BIN/psql"
[ -x "$PSQL" ] || PSQL="$(command -v psql)"

# Strip the database name from DATABASE_URL so we can target per-scenario DBs.
DB_BASE="${DATABASE_URL%/*}"

apply_all() {
  local db="$1"
  for f in "$MIGRATIONS_DIR"/*.sql; do
    "$PSQL" "$DB_BASE/$db" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
    "$PSQL" "$DB_BASE/$db" -q -c \
      "INSERT INTO schema_migrations (version) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING" >/dev/null
  done
}

createdb() { "$PSQL" "$DB_BASE/postgres" -q -c "CREATE DATABASE $1" >/dev/null; }
dropdb()   { "$PSQL" "$DB_BASE/postgres" -q -c "DROP DATABASE IF EXISTS $1" >/dev/null; }

echo "== Scenario 1: fresh install =="
dropdb mig_fresh; createdb mig_fresh
"$PSQL" "$DB_BASE/mig_fresh" -q -c \
  'CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" VARCHAR(255) PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)' >/dev/null
apply_all mig_fresh
"$PSQL" "$DB_BASE/mig_fresh" -v ON_ERROR_STOP=1 -q -c "
  DO \$\$ BEGIN
    PERFORM 1 FROM information_schema.tables WHERE table_name='checkout_sessions';
    IF NOT FOUND THEN RAISE EXCEPTION 'checkout_sessions missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='last_reconciled_at';
    IF NOT FOUND THEN RAISE EXCEPTION 'subscriptions.last_reconciled_at missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_name='ml_notifications' AND column_name='delivery_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'ml_notifications.delivery_key missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_name='print_queue' AND column_name='sent_to_printer_at';
    IF NOT FOUND THEN RAISE EXCEPTION 'print_queue.sent_to_printer_at missing'; END IF;
  END \$\$;" >/dev/null
echo "   fresh install OK"

echo "== Scenario 2: upgrade preserving data =="
dropdb mig_upgrade; createdb mig_upgrade
# Simulate a deployment that already ran 0001-0005: create baseline + seed rows,
# mark all previous migrations applied, then apply only what is pending.
"$PSQL" "$DB_BASE/mig_upgrade" -q -c \
  'CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" VARCHAR(255) PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)' >/dev/null
for f in "$MIGRATIONS_DIR"/000[1-5]*.sql; do
  "$PSQL" "$DB_BASE/mig_upgrade" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  "$PSQL" "$DB_BASE/mig_upgrade" -q -c \
    "INSERT INTO schema_migrations (version) VALUES ('$(basename "$f")')" >/dev/null
done
# Seed data that must survive the upgrade.
"$PSQL" "$DB_BASE/mig_upgrade" -v ON_ERROR_STOP=1 -q -c "
  INSERT INTO users (ml_user_id, nickname) VALUES (999001, 'legacy_seller');
  INSERT INTO subscriptions (user_id, mp_preapproval_id, status, plan_id, price)
    VALUES ((SELECT id FROM users WHERE ml_user_id=999001), 'pa_legacy_1', 'authorized', 'pro', 59.90);
  INSERT INTO print_queue (user_id, shipment_id, zpl, status)
    VALUES ((SELECT id FROM users WHERE ml_user_id=999001), 424242, '^XA^XZ', 'printed');
  INSERT INTO ml_notifications (topic, resource, user_id, processed)
    VALUES ('shipments', '/shipments/424242', 999001, true);
" >/dev/null
# Apply pending migrations (0006+).
for f in "$MIGRATIONS_DIR"/000[6-9]*.sql "$MIGRATIONS_DIR"/00[1-9][0-9]*.sql; do
  [ -e "$f" ] || continue
  "$PSQL" "$DB_BASE/mig_upgrade" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  "$PSQL" "$DB_BASE/mig_upgrade" -q -c \
    "INSERT INTO schema_migrations (version) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING" >/dev/null
done
"$PSQL" "$DB_BASE/mig_upgrade" -v ON_ERROR_STOP=1 -q -c "
  DO \$\$ DECLARE
    n INTEGER;
  BEGIN
    SELECT COUNT(*) INTO n FROM subscriptions WHERE mp_preapproval_id='pa_legacy_1' AND status='authorized';
    IF n <> 1 THEN RAISE EXCEPTION 'legacy subscription lost'; END IF;
    SELECT COUNT(*) INTO n FROM print_queue WHERE shipment_id='424242' AND status='printed';
    IF n <> 1 THEN RAISE EXCEPTION 'legacy print job lost'; END IF;
    -- shipment_id is TEXT after 0009 (provider-external ids); legacy row keeps provider='mercadolivre'
    SELECT COUNT(*) INTO n FROM print_queue WHERE provider='mercadolivre' AND content_type='zpl';
    IF n < 1 THEN RAISE EXCEPTION 'print_queue provider defaults missing'; END IF;
    -- legacy ML user got a backfilled marketplace account
    SELECT COUNT(*) INTO n FROM marketplace_accounts
      WHERE provider='mercadolivre' AND external_user_id='999001';
    IF n <> 1 THEN RAISE EXCEPTION 'legacy ML account not backfilled'; END IF;
    -- old dedup row coexists with a new delivery of the same shipment
    INSERT INTO ml_notifications (topic, resource, user_id, delivery_key, processed)
      VALUES ('shipments', '/shipments/424242', 999001, 'dlv_2', false);
  END \$\$;" >/dev/null
echo "   upgrade OK (data preserved, successive ML deliveries allowed)"

# Re-run all migrations against the fresh DB to prove idempotency.
echo "== Scenario 3: idempotent re-run =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  "$PSQL" "$DB_BASE/mig_fresh" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
echo "   idempotent re-run OK"

dropdb mig_fresh; dropdb mig_upgrade
echo "All migration checks passed."
