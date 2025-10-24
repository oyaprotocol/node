#!/bin/bash

# This script creates the 'vaults' table and a GIN index on the 'controllers' column.

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

echo "Creating 'vaults' table..."
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF
-- Create the vaults table
CREATE TABLE IF NOT EXISTS vaults (
  vault TEXT PRIMARY KEY,
  controllers TEXT[] NOT NULL,
  rules TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a GIN index on the controllers array for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vaults_controllers ON vaults USING GIN (controllers);
EOF

echo "Table 'vaults' created successfully with GIN index."
