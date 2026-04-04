#!/bin/bash
set -eu

# This file is executed by the gnaws systemd service before start
GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STDIN_FILE="$GNAWS_ROOT/server.stdin"
SERVER_USER="gnaws-user"
GAME_CONFIG_FILE="$GNAWS_ROOT/gnaws-game.conf"

. "$GNAWS_ROOT/gnaws-script.conf"
GAME_SERVER_DIR=/opt/$SERVER_FOLDER_NAME

# Setup network rules to count active connections
iptables -N GNAWS_RULES 2>/dev/null || true
iptables -F GNAWS_RULES
iptables -A GNAWS_RULES -p "$SERVER_PORT_PROTOCOL" --dport "$SERVER_PORT_NUMBER" -m recent --name GNAWS --set -j ACCEPT
iptables -C INPUT -j GNAWS_RULES 2>/dev/null || iptables -A INPUT -j GNAWS_RULES

# Create server stdin file read and writable by server user
if [[ ! -p "$STDIN_FILE" ]]; then
    mkfifo "$STDIN_FILE"
    chown "$SERVER_USER":"$SERVER_USER" "$STDIN_FILE"
fi

if [[ -f "$GAME_CONFIG_FILE" ]]; then
    mv "$GAME_CONFIG_FILE" "$GAME_SERVER_DIR/gnaws-game.conf"
    chown "$SERVER_USER":"$SERVER_USER" "$GAME_SERVER_DIR/gnaws-game.conf"
fi
