#!/bin/bash

APP_NAME=""

# Function to display usage
usage() {
    echo "Usage: $0 --app-name heroku-app-name"
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

# Add the case-insensitive unique index for the 'nonces' table
heroku pg:psql --app "$APP_NAME" -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_account_nonces ON nonces (LOWER(account));"

# Add the case-insensitive unique index for the 'balances' table
heroku pg:psql --app "$APP_NAME" -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_account_token_balances ON balances (LOWER(account), LOWER(token));"

# Update all existing account values in 'nonces' to lowercase
heroku pg:psql --app "$APP_NAME" -c "
UPDATE nonces SET account = LOWER(account);"

# Update all existing account values in 'balances' to lowercase
heroku pg:psql --app "$APP_NAME" -c "
UPDATE balances SET account = LOWER(account), token = LOWER(token);"

echo "Case-insensitive unique indexes added and existing accounts updated to lowercase."
