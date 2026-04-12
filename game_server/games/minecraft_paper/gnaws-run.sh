#!/bin/bash
set -eu

# Modify server properties
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROPERTIES_FILE="$SCRIPT_DIR/server.properties"

if [[ -f "$SCRIPT_DIR/gnaws-game.conf" ]]; then
    . "$SCRIPT_DIR/gnaws-game.conf"
fi

set_property() {
    local key="$1"
    local config_var="$2"

    local value="${!config_var:-}"
    [[ -z "$value" ]] && return

    local escaped_value
    escaped_value=$(printf '%s\n' "$value" | sed 's/[&/\]/\\&/g')

    if grep -q "^${key}=" "$PROPERTIES_FILE" 2>/dev/null; then
        sed -i "s/^${key}=.*/${key}=${escaped_value}/" "$PROPERTIES_FILE"
    else
        echo "${key}=${value}" >> "$PROPERTIES_FILE"
    fi
}

touch "$PROPERTIES_FILE"
set_property "level-seed" CONFIG_levelSeed
set_property "hardcore" CONFIG_isHardcore
set_property "view-distance" CONFIG_viewDistance
set_property "spawn-protection" CONFIG_spawnProtection

# Start server
OS_RESERVE_MB=450
TOTAL_MEM=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
MC_MEM=$(( TOTAL_MEM - OS_RESERVE_MB ))

JAVA_FLAGS=(
  -XX:+UseG1GC
  -XX:MaxGCPauseMillis=200
  -XX:+DisableExplicitGC
)

exec java "${JAVA_FLAGS[@]}" -Xms${MC_MEM}M -Xmx${MC_MEM}M -jar server.jar nogui
