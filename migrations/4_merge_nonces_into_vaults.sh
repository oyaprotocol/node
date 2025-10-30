#!/bin/bash

# This script merges the nonces table into the vaults table by:
# 1) Adding a NOT NULL DEFAULT 0 nonce column to vaults
# 2) Enforcing non-empty controllers array via a CHECK constraint
# 3) Backfilling nonce values from the legacy nonces table

APP_NAME=""

# Function to display usage
usage() {
    echo "Usage: $0 --app-name oya-api"
    exit 1
}

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --app-name) APP_NAME="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; usage; exit 1 ;;
    esac
    shift
done

# Verify required arguments
if [ -z "$APP_NAME" ]; then
    usage
fi

echo "Merging nonces into vaults (app: $APP_NAME)..."
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF
-- 1) Add nonce column to vaults with NOT NULL DEFAULT 0 (safe & idempotent)
ALTER TABLE IF EXISTS vaults
  ADD COLUMN IF NOT EXISTS nonce INTEGER NOT NULL DEFAULT 0;

-- 2) Enforce non-empty controllers array (CHECK constraint)
DO
\$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vaults_controllers_nonempty'
  ) THEN
    ALTER TABLE vaults
      ADD CONSTRAINT vaults_controllers_nonempty
      CHECK (array_length(controllers, 1) IS NOT NULL AND array_length(controllers, 1) > 0);
  END IF;
END
\$\$;

-- 3) Backfill nonce from legacy nonces table if present
DO
\$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'nonces'
  ) THEN
    UPDATE vaults v
    SET nonce = n.nonce
    FROM nonces n
    WHERE v.vault = n.vault;
  END IF;
END
\$\$;
-- 4) Drop legacy index and table if they exist (cleanup)
DROP INDEX IF EXISTS unique_lower_vault_nonces;
DROP TABLE IF EXISTS nonces;
EOF

echo "Merge complete: vaults.nonce added, controllers non-empty enforced, nonces backfilled, legacy table dropped."


