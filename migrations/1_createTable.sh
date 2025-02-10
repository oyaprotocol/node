#!/bin/bash

APP_NAME=""

# Function to display usage
usage() {
    echo "Usage: $0 --app-name oya-fullnode"
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

# Connect to the Heroku database and create the tables.
# Note the empty line immediately after <<EOF and explicit reference to DATABASE_URL.
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF

DROP TABLE IF EXISTS blocks;
CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  block JSONB,
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
  vault TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault, token)
);

DROP TABLE IF EXISTS nonces;
CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault)
);
EOF

echo "Tables 'blocks', 'cids', 'balances', and 'nonces' created successfully."
