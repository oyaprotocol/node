#!/bin/bash

# Get the database URL from the argument
DATABASE_URL=$1

echo "Database URL: $DATABASE_URL"

# Connect to the database and create the tables
psql $DATABASE_URL <<EOF
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
