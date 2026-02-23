#!/bin/bash
set -eu

# This file is executed by the gnaws systemd service on stop
GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STDIN_FILE=$GNAWS_ROOT/server.stdin

. "$GNAWS_ROOT/gnaws-script.conf"

STOP_SERVER_CMD="${STOP_SERVER_CMD:-}"
# If there's a custom stop command, send to stdin and wait
# Otherwise, stop server with systemd
if [ -n "$STOP_SERVER_CMD" ]; then
    echo "$STOP_SERVER_CMD" > "$STDIN_FILE"
    TIMEOUT=60
    ELAPSED=0

    # Wait up to 3 minutes for the server to stop
    for i in $(seq 1 180); do
        ps -p $MAINPID > /dev/null || break
        sleep 1
    done
fi
