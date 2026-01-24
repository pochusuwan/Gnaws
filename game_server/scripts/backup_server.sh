#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read configurable values
# BACKUP_DIR_TARGET relative to server root folder
. "$SCRIPT_DIR/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME
cd "$GAME_SERVER_DIR"

BUCKET_PATH="$1"

: "${BUCKET_PATH:?BUCKET_PATH is required}"

BACKUP_NAME="backup-$(date +%Y-%m-%d_%H-%M-%S)"
zip -q -r "gnaws-$BACKUP_NAME.zip" "$BACKUP_DIR_TARGET"
aws s3 cp "gnaws-$BACKUP_NAME.zip" "s3://$BUCKET_PATH/$BACKUP_NAME.zip" --quiet
rm "gnaws-$BACKUP_NAME.zip"

# output end with "Success\n" exactly to signal success
echo "Backed up $BACKUP_NAME to S3. Success"
