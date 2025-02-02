#!/bin/bash
# ./migrations/3_lowercaseAddressIndexes.sh --app-name oya-api

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

# Add the case-insensitive unique index for the 'nonces' table
heroku pg:psql --app "$APP_NAME" -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_nonces ON nonces (LOWER(vault));"

# Add the case-insensitive unique index for the 'balances' table
heroku pg:psql --app "$APP_NAME" -c "
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_token_balances ON balances (LOWER(vault), LOWER(token));"

# Update all existing vault values in 'nonces' to lowercase
heroku pg:psql --app "$APP_NAME" -c "
UPDATE nonces SET vault = LOWER(vault);"

# Update all existing vault values in 'balances' to lowercase
heroku pg:psql --app "$APP_NAME" -c "
UPDATE balances SET vault = LOWER(vault), token = LOWER(token);"

echo "Case-insensitive unique indexes added and existing vaults updated to lowercase."
