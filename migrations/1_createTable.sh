#!/bin/bash

APP_NAME=""

# Function to display usage
usage() {
    echo "Usage: $0 --app-name oya-api"
    exit 1
}

# Parse named command line arguments
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

# Connect to the Heroku database and create the tables
heroku pg:psql --app "$APP_NAME" <<EOF
DROP TABLE IF EXISTS bundles;
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  bundle JSONB,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS cids;
CREATE TABLE IF NOT EXISTS cids (
  id SERIAL PRIMARY KEY,
  cid TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS balances;
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  account TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account, token)
);

DROP TABLE IF EXISTS nonces;
CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  account TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account)
);
EOF

echo "Tables 'bundles', 'cids', 'balances', and 'nonces' created successfully."
