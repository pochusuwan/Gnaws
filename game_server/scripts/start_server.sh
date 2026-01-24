#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER="gnaws-user"
SCREEN_SESSION="game_server"

# Read configurable values
# SERVER_FOLDER_NAME
# START_SERVER_CMD
. "$SCRIPT_DIR/gnaws-script.conf"

GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Setup network rules to count active connections
iptables -N GNAWS_RULES 2>/dev/null || true
iptables -F GNAWS_RULES
iptables -A GNAWS_RULES -p $SERVER_PORT_PROTOCOL --dport $SERVER_PORT_NUMBER -m recent --name GNAWS --set -j ACCEPT
iptables -C INPUT -j GNAWS_RULES 2>/dev/null || sudo iptables -A INPUT -j GNAWS_RULES  

# Check if screen session exists
if runuser -u "$USER" -- screen -list | grep -q "\.${SCREEN_SESSION}"; then
    echo "Screen session '$SCREEN_SESSION' is already running."
    exit 1
fi

# Start server in detached screen session
# -L -> enable logging to default screenlog.0
# -d -m -> start detached
# -S -> session name
# Bash -c executes the command and keeps screen alive if game exits unexpectedly
runuser -u "$USER" -- screen -L -d -m -S "$SCREEN_SESSION" bash -c "
cd '$GAME_SERVER_DIR' || exit 1
# Run the game command
exec $START_SERVER_CMD
"

echo "Game server started in screen session '$SCREEN_SESSION'."
