#!/bin/bash
set -eu

# This file is executed by the gnaws systemd service on start
GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STDIN_FILE=$GNAWS_ROOT/server.stdin

. "$GNAWS_ROOT/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Hold read and write end open
exec 3<>"$STDIN_FILE"

# Start server with read and write
cd "$GAME_SERVER_DIR"
exec ./gnaws-run.sh <&3
