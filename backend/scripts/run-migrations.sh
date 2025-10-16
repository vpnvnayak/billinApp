#!/usr/bin/env bash
# run-migrations.sh - Bash helper for non-Windows operators
# Usage: run from backend/ directory: ./scripts/run-migrations.sh
# It will create a backup (pg_dump), run the migration checker, prompt for confirmation, then run migrate.js

set -euo pipefail

FORCE=0
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -f|--force) FORCE=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set. Aborting." >&2
  exit 1
fi

mkdir -p backups
TS=$(date +%Y%m%d%H%M%S)
DUMPFILE="backups/pre_migrations_${TS}.dump"

echo "Creating DB backup to $DUMPFILE..."
if [ "$FORCE" -eq 0 ]; then
  read -p "About to run pg_dump. Press Enter to continue or Ctrl+C to abort"
fi
pg_dump "$DATABASE_URL" -Fc -f "$DUMPFILE"

echo "Backup complete. Scanning migrations for destructive SQL..."
node ./scripts/check-migrations.js || {
  echo "Destructive SQL detected in migrations. Review the flagged files." >&2
  if [ "$FORCE" -eq 0 ]; then
    read -p "Proceed anyway? Type 'yes' to continue: " RESP
    if [ "$RESP" != "yes" ]; then
      echo "Aborting as requested"
      exit 1
    fi
  fi
}

echo "Running migrations..."
node ./scripts/migrate.js

echo "Migrations complete."
