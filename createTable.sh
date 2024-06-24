#!/bin/bash

# Set the Heroku app name
HEROKU_APP_NAME="oya-api"

# Get the database URL from Heroku
DATABASE_URL=$(heroku config:get DATABASE_URL -a $HEROKU_APP_NAME)

echo "Database URL: $DATABASE_URL"

# Connect to the database and create the table
psql $DATABASE_URL <<EOF
CREATE TABLE bundles (
  id SERIAL PRIMARY KEY,
  intention JSONB,
  proof JSONB
);
EOF

echo "Table 'bundles' created successfully."
