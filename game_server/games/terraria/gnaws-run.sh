#!/bin/bash
set -eu

# Modify server properties
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/serverConfig.txt"

# Setup game config file
cat <<EOF > "$CONFIG_FILE"
priority=1
secure=1
worldname=MyWorld
world=$SCRIPT_DIR/world.wld
EOF

if [[ -f "$SCRIPT_DIR/gnaws-game.conf" ]]; then
    . "$SCRIPT_DIR/gnaws-game.conf"
fi

set_property() {
    local key="$1"
    local config_var="$2"

    if [[ -n "${!config_var-}" ]]; then
        echo "$key=${!config_var}" >> "$CONFIG_FILE"
    fi
}

# Default world size to 1
CONFIG_worldSize="${CONFIG_worldSize:-1}"
set_property "autocreate" CONFIG_worldSize
set_property "difficulty" CONFIG_difficulty
set_property "password" CONFIG_password
set_property "seed" CONFIG_seed

# Start server
./Linux/TerrariaServer.bin.x86_64 -config "$CONFIG_FILE"
