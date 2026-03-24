#!/bin/bash
set -eu

GNAWS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read configurable values
# SERVER_PORT_PROTOCOL "tcp" or "udp"
# SERVER_PORT_NUMBER
# PLAYER_COUNT_UNSUPPORTED
. "$GNAWS_ROOT/gnaws-script.conf"

PROTOCOL="t"
if [ "$SERVER_PORT_PROTOCOL" = "udp" ]; then
    PROTOCOL="u"
fi

IS_RUNNING="false"
if systemctl is-active --quiet gnaws; then
    IS_RUNNING="true"
fi

IS_ONLINE="false"
if ss -ln$PROTOCOL | grep -q "[.:]$SERVER_PORT_NUMBER\b"; then
    IS_ONLINE="true"
fi

CURRENT_STORAGE_GIB=$(df --output=used -h -B1 . | tail -n1)
MAX_STORAGE_GIB=$(df --output=size -h -B1 . | tail -n1)

PLAYER_COUNT_FIELD=""
RECENT_ACTIVITY_FIELD=""
PLAYER_COUNT_UNSUPPORTED="${PLAYER_COUNT_UNSUPPORTED:-false}"
if [[ "$PLAYER_COUNT_UNSUPPORTED" == "false" && -f "/proc/net/xt_recent/GNAWS" ]] ; then
    # Use GNAWS rule setup during bootstrap. Player is connected if there's a packet within last 1 minutes
    NOW_JIFFIES=$(grep -m 1 "jiffies:" /proc/timer_list | awk '{print $2}')
    ACTIVE_PLAYERS=0
    MOST_RECENT_LAST_SEEN=0
    while read -r line; do
        [ -z "$line" ] && continue
        LAST_SEEN=$(echo "$line" | grep -o "last_seen: [0-9]*" | awk '{print $2}')

        # track most recent activity
        if (( LAST_SEEN > MOST_RECENT_LAST_SEEN )); then
            MOST_RECENT_LAST_SEEN=$LAST_SEEN
        fi

        SINCE_LAST_SEEN_SEC=$(((NOW_JIFFIES-LAST_SEEN)/1000))
        if ((SINCE_LAST_SEEN_SEC <= 60)); then
            ACTIVE_PLAYERS=$((ACTIVE_PLAYERS + 1))
        fi
    done < "/proc/net/xt_recent/GNAWS"
    PLAYER_COUNT_FIELD="\"players_count\": $ACTIVE_PLAYERS,"

    LAST_ACTIVITY_SEC=999999
    if (( MOST_RECENT_LAST_SEEN > 0 )); then
        LAST_ACTIVITY_SEC=$(((NOW_JIFFIES-MOST_RECENT_LAST_SEEN)/1000))
    fi
    RECENT_ACTIVITY_FIELD="\"last_activity_sec\": $LAST_ACTIVITY_SEC,"
fi

cat <<EOF
{
  "is_running": $IS_RUNNING,
  "is_online": $IS_ONLINE,
  $PLAYER_COUNT_FIELD
  $RECENT_ACTIVITY_FIELD
  "current_storage": $CURRENT_STORAGE_GIB,
  "max_storage": $MAX_STORAGE_GIB
}
EOF
