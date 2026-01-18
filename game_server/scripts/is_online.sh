#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read configurable values
# SERVER_PORT_PROTOCOL "t" = TCP, "u" = UDP
# SERVER_PORT_NUMBER
. "$SCRIPT_DIR/gnaws-script.conf"

if ss -lpn$SERVER_PORT_PROTOCOL | grep -q "[.:]$SERVER_PORT_NUMBER\b"; then
    # output "online\n" exactly to signal online
    echo "online"
else
    # output "offline\n" exactly to signal offline
    echo "offline"
fi
