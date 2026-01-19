#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read configurable values
# SERVER_PORT_PROTOCOL "tcp" or "udp"
# SERVER_PORT_NUMBER
. "$SCRIPT_DIR/gnaws-script.conf"

PROTOCOL="t"
if [ "$SERVER_PORT_PROTOCOL" = "udp" ]; then
    PROTOCOL="u"
fi

if ss -ln$PROTOCOL | grep -q "[.:]$SERVER_PORT_NUMBER\b"; then
    # output "online\n" exactly to signal online
    echo "online"
else
    # output "offline\n" exactly to signal offline
    echo "offline"
fi
