#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER="gnaws-user"
SCREEN_SESSION="game_server"

# Read configurable values
# SERVER_FOLDER_NAME
# STOP_SERVER_CMD
. "$SCRIPT_DIR/gnaws-script.conf"

# Check if screen session exists
if ! runuser -u "$USER" -- screen -list | grep -q "\.$SCREEN_SESSION"; then
    echo "Screen session '$SCREEN_SESSION' not found."
    exit 1
fi

# Send the stop command
runuser -u "$USER" -- screen -S "$SCREEN_SESSION" -X stuff "$STOP_SERVER_CMD"
echo "Game server stopped."
