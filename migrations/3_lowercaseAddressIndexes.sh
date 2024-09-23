#!/bin/bash

# Get the database URL from the argument
DATABASE_URL=$1

echo "Database URL: $DATABASE_URL"

# Connect to the database and create the case-insensitive unique indexes
psql $DATABASE_URL <<EOF
-- Add a case-insensitive unique index on the 'account' column in the 'nonces' table
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_account_nonces ON nonces (LOWER(account));

-- Add a case-insensitive unique index on the 'account' and 'token' columns in the 'balances' table
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_account_token_balances ON balances (LOWER(account), LOWER(token));
EOF

echo "Case-insensitive unique indexes added successfully."
