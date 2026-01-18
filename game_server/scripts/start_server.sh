#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read configurable values
# SERVER_FOLDER_NAME
# START_SERVER_CMD
. "$SCRIPT_DIR/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# ---------------------------
# Check if screen session exists
# ---------------------------
SCREEN_SESSION="game_server"
if screen -list | grep -q "$SCREEN_SESSION"; then
    echo "Screen session '$SCREEN_SESSION' is already running."
    exit 1
fi

# ---------------------------
# Start server in detached screen session
# ---------------------------
# -L -> enable logging to default screenlog.0
# -d -m -> start detached
# -S -> session name
# Bash -c executes the command and keeps screen alive if game exits unexpectedly
screen -L -d -m -S "$SCREEN_SESSION" bash -c "
cd '$GAME_SERVER_DIR' || exit 1
# Run the game command
exec $START_SERVER_CMD
echo 'Game server exited.'
"

echo "Game server started in screen session '$SCREEN_SESSION'."
