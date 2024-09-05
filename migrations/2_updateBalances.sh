#!/bin/bash

# Get the database URL from the argument
DATABASE_URL=$1

echo "Database URL: $DATABASE_URL"

# Connect to the database and create the tables
psql $DATABASE_URL <<EOF
DROP TABLE IF EXISTS balances;
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  account TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC(78, 18) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account, token)
);
EOF

echo "Balance table updated successfully to give specific precision and scale."
