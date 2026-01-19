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

IS_ONLINE="false"
if ss -ln$PROTOCOL | grep -q "[.:]$SERVER_PORT_NUMBER\b"; then
    IS_ONLINE="true"
fi

ACTIVE_PLAYERS=$(iptables -L INPUT -n -v -m recent --name GNAWS --rcheck --seconds 300 | grep GNAWS | wc -l)
CURRENT_STORAGE_GIB=$(df --output=used -h -B1 . | tail -n1)
MAX_STORAGE_GIB=$(df --output=size -h -B1 . | tail -n1)

cat <<EOF
{
  "is_online": $IS_ONLINE,
  "players_count": $ACTIVE_PLAYERS,
  "current_storage": $CURRENT_STORAGE_GIB,
  "max_storage": $MAX_STORAGE_GIB
}
EOF
