#!/bin/bash

# Set the Heroku app name
HEROKU_APP_NAME="oya-api"

# Get the database URL from Heroku
DATABASE_URL=$(heroku config:get DATABASE_URL -a $HEROKU_APP_NAME)

echo "Database URL: $DATABASE_URL"

# Connect to the database and create the tables
psql $DATABASE_URL <<EOF
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  intention JSONB,
  proof JSONB
);

CREATE TABLE IF NOT EXISTS cids (
  id SERIAL PRIMARY KEY,
  cid TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
EOF

echo "Tables 'bundles' and 'cids' created successfully."
