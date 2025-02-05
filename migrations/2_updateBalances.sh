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

# Connect to the Heroku database and update the balances table
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF

DROP TABLE IF EXISTS balances;
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC(78, 18) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault, token)
);
EOF

echo "Balance table updated successfully to give specific precision and scale."
