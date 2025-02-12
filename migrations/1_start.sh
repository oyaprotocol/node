#!/bin/bash

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

echo "Creating tables..."
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF
-- Drop existing tables if any
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS bundles;
DROP TABLE IF EXISTS cids;
DROP TABLE IF EXISTS balances;
DROP TABLE IF EXISTS nonces;
DROP TABLE IF EXISTS proposers;

-- Create the blocks table
CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  block BYTEA NOT NULL,
  nonce INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  signature TEXT NOT NULL,
  ipfs_cid TEXT,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the cids table
CREATE TABLE IF NOT EXISTS cids (
  id SERIAL PRIMARY KEY,
  cid TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the balances table with specific precision/scale
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC(78, 18) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault, token)
);

-- Create the nonces table
CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault)
);

-- Create the proposers table
CREATE TABLE IF NOT EXISTS proposers (
  id SERIAL PRIMARY KEY,
  proposer TEXT NOT NULL UNIQUE,
  last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
EOF

echo "Tables 'blocks', 'cids', 'balances', 'nonces', and 'proposers' created successfully."

echo "Adding case-insensitive indexes and updating existing data to lowercase..."
# Create a unique index on nonces (lowercase vault)
heroku pg:psql --app "$APP_NAME" DATABASE_URL -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_nonces ON nonces (LOWER(vault));
"

# Create a unique index on balances (lowercase vault and token)
heroku pg:psql --app "$APP_NAME" DATABASE_URL -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_token_balances ON balances (LOWER(vault), LOWER(token));
"

# Update existing vault values in nonces to lowercase
heroku pg:psql --app "$APP_NAME" DATABASE_URL -c "
UPDATE nonces SET vault = LOWER(vault);
"

# Update existing vault and token values in balances to lowercase
heroku pg:psql --app "$APP_NAME" DATABASE_URL -c "
UPDATE balances SET vault = LOWER(vault), token = LOWER(token);
"

echo "Case-insensitive unique indexes added and existing vaults updated to lowercase."
