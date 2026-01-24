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

CURRENT_STORAGE_GIB=$(df --output=used -h -B1 . | tail -n1)
MAX_STORAGE_GIB=$(df --output=size -h -B1 . | tail -n1)

# Use GNAWS rule setup during bootstrap. Player is connected if there's a packet within last 5 minutes
NOW_JIFFIES=$(grep -m 1 "jiffies:" /proc/timer_list | awk '{print $2}')
ACTIVE_PLAYERS=0
while read -r line; do
    [ -z "$line" ] && continue
    LAST_SEEN=$(echo $line | grep -o "last_seen: [0-9]*" | cut -d" " -f2)
    SINCE_LAST_SEEN_SEC=$(((NOW_JIFFIES-LAST_SEEN)/1000))
    if ((SINCE_LAST_SEEN_SEC <= 60)); then
        ACTIVE_PLAYERS=$((ACTIVE_PLAYERS + 1))
    fi
done < "/proc/net/xt_recent/GNAWS"

cat <<EOF
{
  "is_online": $IS_ONLINE,
  "players_count": $ACTIVE_PLAYERS,
  "current_storage": $CURRENT_STORAGE_GIB,
  "max_storage": $MAX_STORAGE_GIB
}
EOF
