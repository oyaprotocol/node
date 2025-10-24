#!/bin/bash

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

echo "Adding Filecoin columns to bundles table..."
heroku pg:psql --app "$APP_NAME" DATABASE_URL <<EOF
-- Add Filecoin tracking columns to bundles table
ALTER TABLE bundles
ADD COLUMN IF NOT EXISTS filecoin_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS filecoin_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS filecoin_piece_cid TEXT,
ADD COLUMN IF NOT EXISTS filecoin_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS filecoin_error TEXT;

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_bundles_filecoin_status ON bundles(filecoin_status);

-- Create index for CID lookups
CREATE INDEX IF NOT EXISTS idx_bundles_ipfs_cid ON bundles(ipfs_cid);
EOF

echo "Filecoin columns added successfully to bundles table."
